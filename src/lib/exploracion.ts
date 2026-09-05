import "server-only";
import { db } from "@/lib/db";
import { explorarDominio, type PanoramaDominio } from "@/lib/labs";
import { apuntar } from "@/lib/gasto";
import { anotar } from "@/lib/clientes";
import { guardar } from "@/lib/terminos";

/**
 * Explorar un dominio y guardar la foto.
 *
 * Vivía dentro de la ruta de Explorar y solo servía desde esa pantalla. Está
 * aparte porque los competidores de un cliente se exploran con la misma
 * llamada: la única diferencia es a quién se le apunta el gasto —a la
 * prospección si el dominio no es de nadie, al cliente si es su rival.
 */
export const limpioDominio = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function explorarYGuardar(o: {
  dominio: string;
  pais?: number;
  usuarioId: string;
  clienteId?: string;
  concepto?: string;
}): Promise<PanoramaDominio> {
  const objetivo = limpioDominio(o.dominio);
  const pais = o.pais ?? 2152;

  const panorama = await explorarDominio(objetivo, pais);

  await db.exploracion.upsert({
    where: { dominio_pais: { dominio: objetivo, pais } },
    update: { datos: JSON.stringify(panorama), coste: panorama.coste, usuarioId: o.usuarioId, creado: new Date() },
    create: { dominio: objetivo, pais, datos: JSON.stringify(panorama), coste: panorama.coste, usuarioId: o.usuarioId },
  });

  // Las palabras por las que posiciona el dominio son datos pagados: van al
  // almacén igual que las de una investigación.
  await guardar(
    panorama.keywords.map((k) => ({ keyword: k.keyword, volumen: k.volumen, cpc: k.cpc })),
    `dominio:${objetivo}`,
    pais
  );

  await apuntar({
    usuarioId: o.usuarioId,
    clienteId: o.clienteId,
    servicio: "dataforseo",
    concepto: o.concepto ?? "exploracion de dominio",
    monto: panorama.coste,
    detalle: objetivo,
  });

  await anotar({
    usuarioId: o.usuarioId,
    clienteId: o.clienteId,
    accion: "exploracion",
    resumen: `${objetivo} explorado · ${panorama.resumen.keywords} keywords · US$${panorama.coste.toFixed(4)}`,
  });

  return panorama;
}

/** La foto guardada de un dominio, si la hay. Gratis. */
export async function fotoDe(dominio: string, pais = 2152) {
  const fila = await db.exploracion.findUnique({ where: { dominio_pais: { dominio: limpioDominio(dominio), pais } } });
  if (!fila) return null;
  try {
    return { creado: fila.creado, coste: fila.coste, panorama: JSON.parse(fila.datos) as PanoramaDominio };
  } catch {
    return null;
  }
}

/** Lo que costó de media explorar un dominio últimamente, para decirlo antes de pulsar. */
export async function costeMedioExploracion(): Promise<number> {
  const ultimas = await db.gasto.findMany({
    where: { concepto: { in: ["exploracion de dominio", "competidores"] }, monto: { gt: 0 } },
    orderBy: { creado: "desc" },
    take: 8,
    select: { monto: true },
  });
  if (!ultimas.length) return 0.15;
  return ultimas.reduce((t, g) => t + g.monto, 0) / ultimas.length;
}
