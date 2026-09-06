import "server-only";
import { db } from "@/lib/db";

/**
 * La cartera local: cómo va cada cliente en el SEO local, en una fila.
 *
 * Junta lo que ya se pagó en dos sitios distintos —la auditoría de la ficha
 * de Google Business y el último barrido de la cuadrícula— para verlo de
 * todos los clientes a la vez. Abrir esta pantalla no habla con nadie.
 *
 * Las variaciones solo comparan lo comparable: la ficha con la auditoría
 * anterior del mismo negocio, y el barrido con el anterior de la misma
 * búsqueda, el mismo negocio y la misma cuadrícula. Dos búsquedas distintas
 * no son un antes y un después.
 */

export interface FilaLocal {
  id: string;
  nombre: string;
  dominio: string;
  ficha: { negocio: string; nota: number; delta: number | null; creado: string } | null;
  barrido: {
    keyword: string;
    negocio: string;
    /** Porcentaje de los puntos con datos en los que aparece. */
    visible: number;
    /** Porcentaje de los puntos con datos en los que está entre los tres primeros: el paquete que la gente ve. */
    enTop3: number;
    deltaTop3: number | null;
    media: number | null;
    /** Quién sale primero donde no somos nosotros, el que más se repite. */
    rival: string | null;
    medidos: number;
    creado: string;
  } | null;
}

function resumir(puntos: { puesto: number | null; resultados: number; primero: string | null }[]) {
  // Los puntos donde Google no devolvió nada no cuentan: no son «no aparece»,
  // son «no se sabe», igual que en la pantalla del cliente.
  const conDatos = puntos.filter((x) => x.resultados > 0);
  const conPuesto = conDatos.filter((x) => x.puesto != null);
  const puestos = conPuesto.map((x) => x.puesto as number);
  const top3 = puestos.filter((v) => v <= 3).length;

  const cuenta = new Map<string, number>();
  for (const x of conDatos) {
    if (x.puesto === 1 || !x.primero) continue;
    cuenta.set(x.primero, (cuenta.get(x.primero) ?? 0) + 1);
  }
  const rival = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    medidos: conDatos.length,
    visible: conDatos.length ? Math.round((conPuesto.length / conDatos.length) * 100) : 0,
    enTop3: conDatos.length ? Math.round((top3 / conDatos.length) * 100) : 0,
    media: puestos.length ? Number((puestos.reduce((t, v) => t + v, 0) / puestos.length).toFixed(1)) : null,
    rival,
  };
}

/** Todas las filas de cada cliente, en el orden en que llegaron. */
function porCliente<T extends { clienteId: string }>(filas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) m.set(f.clienteId, [...(m.get(f.clienteId) ?? []), f]);
  return m;
}

/** Con qué se identifica un negocio: el cid de Google si lo hay, y si no, su nombre. */
const quien = (x: { cid: string | null; negocio: string }) => x.cid ?? x.negocio;

export async function carteraLocal(clientes: { id: string; nombre: string; dominio: string }[]): Promise<FilaLocal[]> {
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return [];

  const [auditorias, rejillas] = await Promise.all([
    db.auditoriaFicha.findMany({
      where: { clienteId: { in: ids } },
      orderBy: { creado: "desc" },
      select: { clienteId: true, negocio: true, cid: true, nota: true, creado: true },
    }),
    db.rejilla.findMany({
      where: { clienteId: { in: ids }, estado: "terminado" },
      orderBy: { creado: "desc" },
      select: { id: true, clienteId: true, keyword: true, negocio: true, cid: true, lado: true, separacion: true, creado: true },
    }),
  ]);

  const auditoriasPor = porCliente(auditorias);
  const rejillasPor = porCliente(rejillas);

  // De cada cliente, el último barrido y el anterior comparable con él.
  const pares = new Map<string, { actual: (typeof rejillas)[number]; previo: (typeof rejillas)[number] | null }>();
  for (const [clienteId, lista] of rejillasPor) {
    const [actual, ...resto] = lista;
    const previo =
      resto.find(
        (r) => r.keyword === actual.keyword && quien(r) === quien(actual) && r.lado === actual.lado && r.separacion === actual.separacion
      ) ?? null;
    pares.set(clienteId, { actual, previo });
  }

  const rejillaIds = [...pares.values()].flatMap((p) => (p.previo ? [p.actual.id, p.previo.id] : [p.actual.id]));
  const puntos = rejillaIds.length
    ? await db.puntoRejilla.findMany({
        where: { rejillaId: { in: rejillaIds } },
        select: { rejillaId: true, puesto: true, resultados: true, primero: true },
      })
    : [];
  const puntosPor = new Map<string, typeof puntos>();
  for (const x of puntos) puntosPor.set(x.rejillaId, [...(puntosPor.get(x.rejillaId) ?? []), x]);

  return clientes.map((c) => {
    const [a, ...aResto] = auditoriasPor.get(c.id) ?? [];
    const aAntes = a ? aResto.find((x) => quien(x) === quien(a)) : undefined;
    const par = pares.get(c.id);
    const actual = par ? resumir(puntosPor.get(par.actual.id) ?? []) : null;
    const previo = par?.previo ? resumir(puntosPor.get(par.previo.id) ?? []) : null;

    return {
      id: c.id,
      nombre: c.nombre,
      dominio: c.dominio,
      ficha: a ? { negocio: a.negocio, nota: a.nota, delta: aAntes ? a.nota - aAntes.nota : null, creado: a.creado.toISOString() } : null,
      barrido:
        par && actual
          ? {
              keyword: par.actual.keyword,
              negocio: par.actual.negocio,
              visible: actual.visible,
              enTop3: actual.enTop3,
              deltaTop3: previo ? actual.enTop3 - previo.enTop3 : null,
              media: actual.media,
              rival: actual.rival,
              medidos: actual.medidos,
              creado: par.actual.creado.toISOString(),
            }
          : null,
    };
  });
}
