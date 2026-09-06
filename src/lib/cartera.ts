import "server-only";
import { db } from "@/lib/db";
import { ultimas } from "@/lib/vigia";
import { inicioDeMes } from "@/lib/formato";

/**
 * La cartera: una fila de cifras por cliente, para la portada.
 *
 * Todo sale de lo que ya está guardado —posiciones medidas, los tramos de
 * Search Console de cada mes, las respuestas de la IA, el último rastreo, el
 * perfil de enlaces, el gasto—, así que abrir la portada no cuesta dinero ni
 * habla con nadie. Cada cifra lleva su variación contra la medición anterior
 * cuando la hay: sin ella un número suelto no dice si el cliente va bien o mal.
 *
 * Las variaciones se calculan solo sobre lo que ya tenía medición anterior:
 * si no, dar de alta diez palabras que entran en el top 10 pintaría una
 * subida que no ocurrió.
 *
 * Se calcula en tandas por lote, no cliente a cliente: con cuarenta clientes,
 * cuarenta veces seis consultas es lo que hace lenta una portada.
 */

export interface FilaCartera {
  id: string;
  nombre: string;
  dominio: string;
  plataforma: string;
  estado: { nivel: "ok" | "aviso" | "conector" | "caido" | "neutro"; texto: string; detalle: string };
  /**
   * La portada pública no respondió en la última revisión del vigía. Se cuenta
   * aparte del conector: la web puede estar caída con el conector respondiendo
   * y al revés, y es la caída lo que le importa al cliente.
   */
  webCaida: boolean;
  /** Última vez que se sondeó el conector; nulo si nunca. */
  ultimaSonda: string | null;
  seguidas: number;
  /** Palabras seguidas en el top 10 en la última medición; nulo si nunca se midió. */
  top10: number | null;
  top10Delta: number | null;
  /** Consultas por las que salió el sitio en el último mes cerrado de Search Console. */
  gsc: { consultas: number; delta: number | null; mes: string } | null;
  /** Preguntas de IA activas; la celda solo se llena cuando alguna se lanzó. */
  preguntasIa: number;
  /** Preguntas en las que la IA nombra o cita al cliente, de las que se lanzaron. */
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
  escrituraBloqueada: boolean;
  estadoSonda: string | null;
  ultimaSonda: Date | null;
  tarifa: number | null;
}

function estadoDe(
  c: ClienteBase,
  revision: { webOk: boolean; detalle: string | null } | undefined,
  versionConector: string | null
): FilaCartera["estado"] {
  if (revision && !revision.webOk) {
    return { nivel: "caido", texto: "Web caída", detalle: revision.detalle ?? "La portada no responde." };
  }
  if (c.estadoSonda && c.estadoSonda !== "ok") {
    // Sin plugin, lo que falló en el sondeo fue la portada, no un conector.
    if (c.plataforma === "dominio") return { nivel: "caido", texto: "Web caída", detalle: c.estadoSonda };
    return {
      nivel: "conector",
      texto: c.plataforma === "shopify" ? "Shopify no responde" : "Conector falla",
      detalle: c.estadoSonda,
    };
  }
  if (c.plataforma === "dominio") {
    return { nivel: "neutro", texto: "Solo medición", detalle: "Sin plugin ni Shopify: se mide todo, no se escribe nada." };
  }
  // Solo WordPress lleva conector con versión: Shopify guarda ahí la fecha de
  // su API, que no se compara con nada. Y la referencia es el ZIP publicado,
  // no el cliente más avanzado: si nadie actualizó, nadie está al día.
  if (c.plataforma === "wordpress" && c.version && versionConector && c.version !== versionConector) {
    return { nivel: "aviso", texto: `v${c.version} · actualizar`, detalle: `El conector va por la v${versionConector}.` };
  }
  return {
    nivel: "ok",
    texto: c.soloLectura === false && !c.escrituraBloqueada ? "Escritura" : "Solo lectura",
    detalle: c.escrituraBloqueada ? "Escritura bloqueada desde Ajustes." : c.version ? `Conector v${c.version}` : "Conectado",
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

export async function cartera(clientes: ClienteBase[], versionConector: string | null): Promise<FilaCartera[]> {
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return [];

  // El mes en curso también está guardado en TramoMes (se recalcula al abrir
  // el Panorama), pero va a medias: contra un mes cerrado daría siempre una
  // bajada falsa. Misma convención UTC que usa porMes para su mes en curso.
  const mesEnCurso = new Date().toISOString().slice(0, 7);

  const [keywords, tramos, prompts, rastreos, backlinks, gastos, revisiones] = await Promise.all([
    db.keyword.findMany({
      where: { clienteId: { in: ids } },
      select: { clienteId: true, posiciones: { orderBy: { medido: "desc" }, take: 2, select: { puesto: true } } },
    }),
    db.tramoMes.findMany({
      where: { clienteId: { in: ids }, mes: { lt: mesEnCurso } },
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
      where: { clienteId: { in: ids }, creado: { gte: inicioDeMes() } },
      _sum: { monto: true },
    }),
    ultimas(ids),
  ]);

  /* ---- Posiciones: top 10 ahora, y la variación sobre lo que ya se había medido ---- */
  const posiciones = new Map<string, { seguidas: number; medidas: number; ahora: number; conAntes: number; ahoraConAntes: number; antes: number }>();
  for (const k of keywords) {
    const p = posiciones.get(k.clienteId) ?? { seguidas: 0, medidas: 0, ahora: 0, conAntes: 0, ahoraConAntes: 0, antes: 0 };
    p.seguidas++;
    const [ultima, previa] = k.posiciones;
    const enTop = ultima != null && ultima.puesto != null && ultima.puesto <= 10;
    if (ultima) {
      p.medidas++;
      if (enTop) p.ahora++;
    }
    if (previa) {
      p.conAntes++;
      if (enTop) p.ahoraConAntes++;
      if (previa.puesto != null && previa.puesto <= 10) p.antes++;
    }
    posiciones.set(k.clienteId, p);
  }

  /* ---- Search Console: los dos últimos meses cerrados ---- */
  const meses = agrupar(tramos, 2);

  /* ---- IA: en cuántas preguntas sale, y la variación sobre las que ya tenían ronda anterior ---- */
  const ia = new Map<string, { total: number; medidas: number; ahora: number; conAntes: number; ahoraConAntes: number; antes: number }>();
  for (const pr of prompts) {
    const v = ia.get(pr.clienteId) ?? { total: 0, medidas: 0, ahora: 0, conAntes: 0, ahoraConAntes: 0, antes: 0 };
    v.total++;
    const ultimaPor = new Map<string, boolean>();
    const previaPor = new Map<string, boolean>();
    for (const r of pr.respuestas) {
      if (!ultimaPor.has(r.plataforma)) ultimaPor.set(r.plataforma, r.aparece);
      else if (!previaPor.has(r.plataforma)) previaPor.set(r.plataforma, r.aparece);
    }
    const sale = [...ultimaPor.values()].some(Boolean);
    if (ultimaPor.size > 0) {
      v.medidas++;
      if (sale) v.ahora++;
    }
    if (previaPor.size > 0) {
      v.conAntes++;
      if (sale) v.ahoraConAntes++;
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
      estado: estadoDe(c, rev, versionConector),
      webCaida: rev ? !rev.webOk : false,
      ultimaSonda: c.ultimaSonda?.toISOString() ?? null,
      seguidas: p?.seguidas ?? 0,
      top10: p && p.medidas > 0 ? p.ahora : null,
      top10Delta: p && p.conAntes > 0 ? p.ahoraConAntes - p.antes : null,
      gsc: m[0]
        ? { consultas: m[0].consultas, delta: m[1] ? m[0].consultas - m[1].consultas : null, mes: m[0].mes }
        : null,
      preguntasIa: v?.total ?? 0,
      ia: v && v.medidas > 0 ? { visibles: v.ahora, total: v.medidas, delta: v.conAntes > 0 ? v.ahoraConAntes - v.antes : null } : null,
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
