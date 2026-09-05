import "server-only";
import { db } from "@/lib/db";
import { credenciales, medir } from "@/lib/dataforseo";
import { apuntar } from "@/lib/gasto";
import { anotar } from "@/lib/clientes";

/**
 * Medir las posiciones de un cliente.
 *
 * Vivía dentro de la ruta y solo se podía lanzar pulsando «Medir». Está
 * aparte para que lo use también la pasada programada, que es la misma
 * medición con otro llamante. El dinero se apunta igual en los dos casos;
 * la programada la activó una persona en la ficha, sabiendo lo que cuesta.
 */

/** Cuántas consultas van a la vez a DataForSEO. */
const A_LA_VEZ = 4;

export interface Cambio {
  termino: string;
  antes: number | null;
  ahora: number | null;
  url: string | null;
}

export async function medirPosiciones(o: {
  clienteId: string;
  dominio: string;
  usuarioId?: string | null;
  soloNuevas?: boolean;
  /** Cuántas como mucho en esta pasada. Desde el panel, 40; programada, más. */
  tope?: number;
  concepto?: string;
}) {
  const cred = await credenciales();
  if (!cred) throw new Error("Falta configurar DataForSEO. Un administrador puede hacerlo en Ajustes.");

  let keywords = await db.keyword.findMany({
    where: { clienteId: o.clienteId, activa: true },
    include: { posiciones: { orderBy: { medido: "desc" }, take: 1 } },
    orderBy: { creado: "asc" },
  });

  if (o.soloNuevas) keywords = keywords.filter((k) => k.posiciones.length === 0);

  const recortada = keywords.slice(0, o.tope ?? 40);
  const cambios: Cambio[] = [];
  const fallos: string[] = [];
  let medidas = 0;
  let coste = 0;

  if (recortada.length === 0) {
    return { medidas, coste, fallos, pendientes: 0, cambios };
  }

  for (let i = 0; i < recortada.length; i += A_LA_VEZ) {
    const tanda = recortada.slice(i, i + A_LA_VEZ);

    await Promise.all(
      tanda.map(async (k) => {
        try {
          const r = await medir(cred, o.dominio, {
            termino: k.termino,
            ubicacion: k.ubicacion,
            idioma: k.idioma,
            dispositivo: k.dispositivo,
          });

          await db.posicion.create({
            data: {
              keywordId: k.id,
              puesto: r.puesto,
              url: r.url,
              bloquesArriba: r.bloquesArriba,
              coste: r.coste,
              iaOverview: r.iaOverview,
              iaCitado: r.iaCitado,
              iaUrl: r.iaUrl,
              iaFuentes: JSON.stringify(r.iaFuentes),
            },
          });

          cambios.push({ termino: k.termino, antes: k.posiciones[0]?.puesto ?? null, ahora: r.puesto, url: r.url });
          medidas++;
          coste += r.coste ?? 0;
        } catch (e) {
          fallos.push(`${k.termino}: ${e instanceof Error ? e.message : "error"}`);
        }
      })
    );

    // Ocho fallos seguidos sin ninguna medida es la cuenta sin saldo o la
    // clave mal: no vale la pena seguir intentando.
    if (fallos.length >= 8 && medidas === 0) break;
  }

  await apuntar({
    clienteId: o.clienteId,
    usuarioId: o.usuarioId ?? undefined,
    servicio: "dataforseo",
    concepto: o.concepto ?? "posiciones",
    monto: coste,
    detalle: `${medidas} consultas medidas`,
  });

  await anotar({
    usuarioId: o.usuarioId ?? undefined,
    clienteId: o.clienteId,
    accion: o.concepto ?? "posiciones",
    resumen: `${medidas} consultas medidas · US$${coste.toFixed(4)}${fallos.length ? ` · ${fallos.length} con error` : ""}`,
    resultado: medidas > 0 ? "ok" : "error",
  });

  return { medidas, coste, fallos, pendientes: Math.max(0, keywords.length - recortada.length), cambios };
}

/**
 * Las que cayeron de verdad: estaban en el top 10 y bajaron cinco puestos o
 * salieron del todo. Un vaivén de 3 a 4 no es noticia.
 */
export function caidas(cambios: Cambio[]): Cambio[] {
  return cambios.filter(
    (x) => x.antes !== null && x.antes <= 10 && (x.ahora === null || x.ahora - x.antes >= 5)
  );
}
