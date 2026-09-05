import "server-only";
import { db } from "@/lib/db";
import { fotoDe, limpioDominio } from "@/lib/exploracion";
import { raizDominio } from "@/lib/iaTexto";

/**
 * Comparar al cliente con sus rivales.
 *
 * Tres fuentes, y las tres ya estaban pagadas: la SERP de cada palabra
 * seguida (trae a todos los que posicionan, no solo al cliente), las citas
 * de la IA, y las exploraciones de dominio de DataForSEO. Aquí se cruzan por
 * dominio para responder lo que un cliente pregunta —«¿y contra ellos cómo
 * voy?»— sin gastar nada más. Solo explorar un rival por primera vez cuesta.
 */

export interface FilaSerp {
  d: string;
  u: string;
  p: number;
}

export interface Dominio {
  dominio: string;
  esCliente: boolean;
  /** En las palabras seguidas del cliente, con SERP guardada. */
  serp: { top3: number; top10: number; top20: number; media: number | null; medidas: number };
  /** Veces citado en respuestas de IA (última por prompt y plataforma) y en bloques de IA de Google. */
  ia: { respuestas: number; overviews: number };
  /** La foto de DataForSEO, si se exploró. */
  labs: { keywords: number; trafico: number; valor: number; top10: number; creado: string } | null;
}

export interface Brecha {
  keyword: string;
  volumen: number;
  rival: string;
  posicionRival: number;
  posicionCliente: number | null;
  url: string | null;
}

export async function comparativa(clienteId: string) {
  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { dominio: true, nombre: true } });
  if (!cliente) throw new Error("Ese cliente no existe.");
  const objetivo = raizDominio(cliente.dominio);

  const rivales = await db.competidor.findMany({ where: { clienteId }, orderBy: { creado: "asc" } });

  const keywords = await db.keyword.findMany({
    where: { clienteId, activa: true },
    select: {
      id: true,
      termino: true,
      dispositivo: true,
      posiciones: { orderBy: { medido: "desc" }, take: 1, select: { serp: true, puesto: true, iaFuentes: true, medido: true } },
    },
    orderBy: { creado: "asc" },
  });

  const prompts = await db.promptIa.findMany({
    where: { clienteId, activo: true },
    select: { respuestas: { orderBy: { medido: "desc" }, take: 4, select: { plataforma: true, dominios: true } } },
  });

  // Por palabra: el puesto de cada dominio, sacado de la SERP guardada.
  const porPalabra = keywords.map((k) => {
    const serp = ((): FilaSerp[] => {
      try {
        return k.posiciones[0]?.serp ? (JSON.parse(k.posiciones[0].serp) as FilaSerp[]) : [];
      } catch {
        return [];
      }
    })();
    const puesto = new Map<string, number>();
    for (const f of serp) if (!puesto.has(f.d)) puesto.set(f.d, f.p);
    return { termino: k.termino, dispositivo: k.dispositivo, medido: k.posiciones[0]?.medido ?? null, conSerp: serp.length > 0, puesto, serp };
  });
  const conSerp = porPalabra.filter((x) => x.conSerp);

  // Citas de IA: la última respuesta de cada prompt en cada plataforma.
  const citasIa = new Map<string, number>();
  for (const p of prompts) {
    const vistas = new Set<string>();
    for (const r of p.respuestas) {
      if (vistas.has(r.plataforma)) continue;
      vistas.add(r.plataforma);
      for (const d of JSON.parse(r.dominios) as string[]) citasIa.set(d, (citasIa.get(d) ?? 0) + 1);
    }
  }
  const citasOverview = new Map<string, number>();
  for (const k of keywords) {
    try {
      for (const d of JSON.parse(k.posiciones[0]?.iaFuentes ?? "[]") as string[]) citasOverview.set(d, (citasOverview.get(d) ?? 0) + 1);
    } catch {
      /* sin fuentes */
    }
  }

  async function dominioDe(d: string, esCliente: boolean): Promise<Dominio> {
    const puestos = conSerp.map((x) => x.puesto.get(d) ?? null);
    const con = puestos.filter((p): p is number => p !== null);
    const foto = await fotoDe(d);
    return {
      dominio: d,
      esCliente,
      serp: {
        top3: con.filter((p) => p <= 3).length,
        top10: con.filter((p) => p <= 10).length,
        top20: con.filter((p) => p <= 20).length,
        media: con.length ? Math.round((con.reduce((t, p) => t + p, 0) / con.length) * 10) / 10 : null,
        medidas: conSerp.length,
      },
      ia: { respuestas: citasIa.get(d) ?? 0, overviews: citasOverview.get(d) ?? 0 },
      labs: foto
        ? {
            keywords: foto.panorama.resumen.keywords,
            trafico: foto.panorama.resumen.trafico,
            valor: foto.panorama.resumen.valor,
            top10: foto.panorama.resumen.tramos.pos1 + foto.panorama.resumen.tramos.pos2a3 + foto.panorama.resumen.tramos.pos4a10,
            creado: foto.creado.toISOString(),
          }
        : null,
    };
  }

  const dominios = [await dominioDe(objetivo, true), ...(await Promise.all(rivales.map((r) => dominioDe(r.dominio, false))))];

  // Sugeridos: quien más aparece en las SERP de las palabras seguidas, en la
  // IA y en la exploración del propio cliente, quitando al cliente y a los
  // que ya son rivales. El orden es por veces; la decisión es de la persona.
  const yaEstan = new Set([objetivo, ...rivales.map((r) => r.dominio)]);
  const cuenta = new Map<string, { serp: number; ia: number; labs: number }>();
  const suma = (d: string, campo: "serp" | "ia" | "labs", n = 1) => {
    if (!d || yaEstan.has(d) || /^(google\.|youtube\.|facebook\.|instagram\.|wikipedia\.|tiktok\.)/.test(d)) return;
    const c = cuenta.get(d) ?? { serp: 0, ia: 0, labs: 0 };
    c[campo] += n;
    cuenta.set(d, c);
  };
  for (const x of conSerp) for (const f of x.serp) if (f.p <= 10) suma(f.d, "serp");
  for (const [d, n] of citasIa) suma(d, "ia", n);
  for (const [d, n] of citasOverview) suma(d, "ia", n);
  const fotoCliente = await fotoDe(objetivo);
  for (const c of fotoCliente?.panorama.competidores ?? []) suma(limpioDominio(c.dominio), "labs", c.coincidencias);
  const sugeridos = [...cuenta.entries()]
    .map(([dominio, c]) => ({ dominio, serp: c.serp, ia: c.ia, labs: c.labs, peso: c.serp * 3 + c.ia * 2 + Math.min(c.labs, 30) / 10 }))
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 10);

  // Brecha: palabras donde un rival está en el top 20 y el cliente no la
  // sigue ni (si se exploró) posiciona en el top 20.
  const seguidas = new Set(keywords.map((k) => k.termino.toLowerCase()));
  const posCliente = new Map<string, number>();
  for (const k of fotoCliente?.panorama.keywords ?? []) posCliente.set(k.keyword.toLowerCase(), k.posicion);
  const brecha: Brecha[] = [];
  const vistasBrecha = new Set<string>();
  for (const r of rivales) {
    const foto = await fotoDe(r.dominio);
    for (const k of foto?.panorama.keywords ?? []) {
      const kw = k.keyword.toLowerCase();
      if (k.posicion > 20 || seguidas.has(kw) || vistasBrecha.has(kw)) continue;
      const pc = posCliente.get(kw) ?? null;
      if (pc !== null && pc <= 20) continue;
      vistasBrecha.add(kw);
      brecha.push({ keyword: k.keyword, volumen: k.volumen, rival: r.dominio, posicionRival: k.posicion, posicionCliente: pc, url: k.url });
    }
  }
  brecha.sort((a, b) => b.volumen - a.volumen);

  return {
    cliente: { dominio: objetivo, nombre: cliente.nombre },
    rivales: rivales.map((r) => ({ id: r.id, dominio: r.dominio })),
    dominios,
    porPalabra: porPalabra.map((x) => ({
      termino: x.termino,
      dispositivo: x.dispositivo,
      medido: x.medido?.toISOString() ?? null,
      conSerp: x.conSerp,
      puestos: Object.fromEntries(dominios.map((d) => [d.dominio, x.puesto.get(d.dominio) ?? null])),
    })),
    sugeridos,
    brecha: brecha.slice(0, 60),
    sinSerp: porPalabra.length - conSerp.length,
  };
}
