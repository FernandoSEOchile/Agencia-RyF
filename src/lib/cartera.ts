import "server-only";
import { db } from "@/lib/db";
import { ultimas } from "@/lib/vigia";

/**
 * La cartera: una fila de cifras por cliente, para la portada.
 *
 * Todo sale de lo que ya está guardado —posiciones medidas, los tramos de
 * Search Console de cada mes, las respuestas de la IA, el último rastreo, el
 * perfil de enlaces, el gasto—, así que abrir la portada no cuesta dinero ni
 * habla con nadie. Cada cifra lleva su variación contra la medición anterior
 * cuando la hay: sin ella un número suelto no dice si el cliente va bien o mal.
 *
 * Se calcula en tandas por lote, no cliente a cliente: con cuarenta clientes,
 * cuarenta veces seis consultas es lo que hace lenta una portada.
 */

export interface FilaCartera {
  id: string;
  nombre: string;
  dominio: string;
  plataforma: string;
  estado: { nivel: "ok" | "aviso" | "caido" | "neutro"; texto: string; detalle: string };
  seguidas: number;
  /** Palabras seguidas en el top 10 en la última medición; nulo si nunca se midió. */
  top10: number | null;
  top10Delta: number | null;
  /** Consultas por las que salió el sitio en el último mes leído de Search Console. */
  gsc: { consultas: number; delta: number | null; mes: string } | null;
  /** Preguntas en las que la IA nombra o cita al cliente, de las que se siguen. */
  ia: { visibles: number; total: number; delta: number | null } | null;
  /** Páginas rotas en el último rastreo terminado. */
  tecnico: { rotas: number; paginas: number; delta: number | null; medido: string } | null;
  enlaces: { dominios: number; medido: string } | null;
  gastoMes: number;
  tarifa: number | null;
}

interface ClienteBase {
  id: string;
  nombre: string;
  dominio: string;
  plataforma: string;
  version: string | null;
  soloLectura: boolean | null;
  estadoSonda: string | null;
  tarifa: number | null;
}

function estadoDe(
  c: ClienteBase,
  revision: { webOk: boolean; detalle: string | null } | undefined,
  ultimaVersion: string | undefined
): FilaCartera["estado"] {
  if (revision && !revision.webOk) {
    return { nivel: "caido", texto: "Web caída", detalle: revision.detalle ?? "La portada no responde." };
  }
  if (c.estadoSonda && c.estadoSonda !== "ok") {
    return { nivel: "caido", texto: "Conector falla", detalle: c.estadoSonda };
  }
  if (c.plataforma === "dominio") {
    return { nivel: "neutro", texto: "Solo medición", detalle: "Sin plugin ni Shopify: se mide todo, no se escribe nada." };
  }
  if (c.version && ultimaVersion && c.version !== ultimaVersion) {
    return { nivel: "aviso", texto: `v${c.version} · actualizar`, detalle: `El conector va por la v${ultimaVersion}.` };
  }
  return {
    nivel: "ok",
    texto: c.soloLectura === false ? "Escritura" : "Solo lectura",
    detalle: c.version ? `Conector v${c.version}` : "Conectado",
  };
}

/** Las N primeras filas de cada cliente, de una lista ya ordenada. */
function agrupar<T extends { clienteId: string }>(filas: T[], tope: number): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const lista = m.get(f.clienteId) ?? [];
    if (lista.length < tope) lista.push(f);
    m.set(f.clienteId, lista);
  }
  return m;
}

export async function cartera(clientes: ClienteBase[]): Promise<FilaCartera[]> {
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return [];

  const versiones = [...new Set(clientes.map((c) => c.version).filter(Boolean))].sort((a, b) =>
    String(b).localeCompare(String(a), undefined, { numeric: true })
  );
  const ultimaVersion = versiones[0] ?? undefined;

  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);

  const [keywords, tramos, prompts, rastreos, backlinks, gastos, revisiones] = await Promise.all([
    db.keyword.findMany({
      where: { clienteId: { in: ids } },
      select: { clienteId: true, posiciones: { orderBy: { medido: "desc" }, take: 2, select: { puesto: true } } },
    }),
    db.tramoMes.findMany({
      where: { clienteId: { in: ids } },
      orderBy: { mes: "desc" },
      select: { clienteId: true, mes: true, consultas: true },
    }),
    db.promptIa.findMany({
      where: { clienteId: { in: ids }, activo: true },
      select: {
        clienteId: true,
        // Dos plataformas por dos rondas: la actual y la anterior.
        respuestas: { orderBy: { medido: "desc" }, take: 4, select: { plataforma: true, aparece: true } },
      },
    }),
    db.rastreo.findMany({
      where: { clienteId: { in: ids }, estado: "terminado" },
      orderBy: { creado: "desc" },
      select: { id: true, clienteId: true, hechas: true, creado: true },
    }),
    db.backlinks.findMany({ where: { clienteId: { in: ids } }, select: { clienteId: true, datos: true, medido: true } }),
    db.gasto.groupBy({
      by: ["clienteId"],
      where: { clienteId: { in: ids }, creado: { gte: inicioMes } },
      _sum: { monto: true },
    }),
    ultimas(ids),
  ]);

  /* ---- Posiciones: top 10 ahora y en la medición anterior ---- */
  const posiciones = new Map<string, { seguidas: number; ahora: number; antes: number; medidas: number; conAntes: number }>();
  for (const k of keywords) {
    const p = posiciones.get(k.clienteId) ?? { seguidas: 0, ahora: 0, antes: 0, medidas: 0, conAntes: 0 };
    p.seguidas++;
    const [ultima, previa] = k.posiciones;
    if (ultima) {
      p.medidas++;
      if (ultima.puesto != null && ultima.puesto <= 10) p.ahora++;
    }
    if (previa) {
      p.conAntes++;
      if (previa.puesto != null && previa.puesto <= 10) p.antes++;
    }
    posiciones.set(k.clienteId, p);
  }

  /* ---- Search Console: el último mes leído y el anterior ---- */
  const meses = agrupar(tramos, 2);

  /* ---- IA: en cuántas preguntas sale, ahora y en la ronda anterior ---- */
  const ia = new Map<string, { total: number; ahora: number; antes: number; conAntes: number }>();
  for (const pr of prompts) {
    const v = ia.get(pr.clienteId) ?? { total: 0, ahora: 0, antes: 0, conAntes: 0 };
    v.total++;
    const ultimaPor = new Map<string, boolean>();
    const previaPor = new Map<string, boolean>();
    for (const r of pr.respuestas) {
      if (!ultimaPor.has(r.plataforma)) ultimaPor.set(r.plataforma, r.aparece);
      else if (!previaPor.has(r.plataforma)) previaPor.set(r.plataforma, r.aparece);
    }
    if ([...ultimaPor.values()].some(Boolean)) v.ahora++;
    if (previaPor.size > 0) {
      v.conAntes++;
      if ([...previaPor.values()].some(Boolean)) v.antes++;
    }
    ia.set(pr.clienteId, v);
  }

  /* ---- Técnico: páginas rotas del último rastreo y del anterior ---- */
  const porCliente = agrupar(rastreos, 2);
  const rastreoIds = [...porCliente.values()].flat().map((r) => r.id);
  const rotasPor = new Map<string, number>();
  if (rastreoIds.length) {
    const rotas = await db.pagina.groupBy({
      by: ["rastreoId"],
      where: { rastreoId: { in: rastreoIds }, OR: [{ estado: { gte: 400 } }, { estado: null }] },
      _count: { _all: true },
    });
    for (const r of rotas) rotasPor.set(r.rastreoId, r._count._all);
  }

  /* ---- Enlaces y gasto ---- */
  const enlacesPor = new Map<string, { dominios: number; medido: string }>();
  for (const b of backlinks) {
    try {
      const d = JSON.parse(b.datos) as { resumen?: { dominiosEnlazantes?: number } };
      enlacesPor.set(b.clienteId, { dominios: d.resumen?.dominiosEnlazantes ?? 0, medido: b.medido.toISOString() });
    } catch {
      // Una foto ilegible no tumba la portada: esa celda queda en blanco.
    }
  }
  const gastoPor = new Map(gastos.map((g) => [g.clienteId ?? "", g._sum.monto ?? 0]));

  return clientes.map((c) => {
    const p = posiciones.get(c.id);
    const m = meses.get(c.id) ?? [];
    const v = ia.get(c.id);
    const r = porCliente.get(c.id) ?? [];
    const rev = revisiones.get(c.id);

    return {
      id: c.id,
      nombre: c.nombre,
      dominio: c.dominio,
      plataforma: c.plataforma,
      estado: estadoDe(c, rev, ultimaVersion),
      seguidas: p?.seguidas ?? 0,
      top10: p && p.medidas > 0 ? p.ahora : null,
      top10Delta: p && p.conAntes > 0 ? p.ahora - p.antes : null,
      gsc: m[0]
        ? { consultas: m[0].consultas, delta: m[1] ? m[0].consultas - m[1].consultas : null, mes: m[0].mes }
        : null,
      ia: v && v.total > 0 ? { visibles: v.ahora, total: v.total, delta: v.conAntes > 0 ? v.ahora - v.antes : null } : null,
      tecnico: r[0]
        ? {
            rotas: rotasPor.get(r[0].id) ?? 0,
            paginas: r[0].hechas,
            delta: r[1] ? (rotasPor.get(r[0].id) ?? 0) - (rotasPor.get(r[1].id) ?? 0) : null,
            medido: r[0].creado.toISOString(),
          }
        : null,
      enlaces: enlacesPor.get(c.id) ?? null,
      gastoMes: gastoPor.get(c.id) ?? 0,
      tarifa: c.tarifa,
    };
  });
}
