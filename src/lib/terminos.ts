import "server-only";
import { db } from "@/lib/db";
import { credenciales } from "@/lib/dataforseo";

/**
 * El almacén de palabras clave de la agencia.
 *
 * Se llena solo, desde los dos sitios donde se pagan datos: la investigación de
 * una semilla y la exploración de un dominio. La idea es que nada de lo que se
 * paga se quede enterrado en un JSON que solo sirve para no pagarlo dos veces.
 *
 * Todo lo que entra aquí trae fecha, y esa fecha se enseña siempre. Un volumen
 * sin fecha invita a decidir con una cifra de hace ocho meses creyéndola de hoy,
 * y eso es peor que no tener el dato.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

/** Cuántas admite `keyword_overview` en una sola petición. */
export const POR_TANDA = 700;

export interface Entrante {
  keyword: string;
  volumen: number;
  cpc?: number | null;
  competencia?: number | null;
  intencion?: string | null;
  tendencia?: number | null;
}

/**
 * Vuelca palabras en el almacén.
 *
 * Se hace de una en una y no con `createMany` porque cada palabra puede existir
 * ya y hay que fundir lo nuevo con lo viejo: sumar el contador, añadir el
 * origen sin repetirlo y quedarse con el dato más reciente. Son unos cientos de
 * escrituras y ocurre después de una llamada a la API que tardó segundos, así
 * que el coste no se nota.
 *
 * @param origen De dónde vienen: «semilla:regalos corporativos» o «dominio:x.cl».
 */
export async function guardar(lista: Entrante[], origen: string, pais: number) {
  let nuevas = 0;
  let actualizadas = 0;

  for (const t of lista) {
    const keyword = t.keyword.trim().toLowerCase();
    if (!keyword) continue;

    const existente = await db.termino.findUnique({
      where: { keyword_pais: { keyword, pais } },
      select: { id: true, origenes: true, veces: true },
    });

    if (!existente) {
      await db.termino.create({
        data: {
          keyword,
          pais,
          volumen: t.volumen ?? 0,
          cpc: t.cpc ?? null,
          competencia: t.competencia ?? null,
          intencion: t.intencion ?? null,
          tendencia: t.tendencia ?? null,
          palabras: keyword.split(/\s+/).filter(Boolean).length,
          origenes: JSON.stringify([origen]),
        },
      });
      nuevas++;
      continue;
    }

    let origenes: string[] = [];
    try {
      origenes = JSON.parse(existente.origenes);
    } catch {
      origenes = [];
    }

    // Se topan los orígenes: una palabra que salió en cincuenta exploraciones
    // no necesita cincuenta líneas para contarlo, y el JSON no debe crecer sin
    // freno dentro de una columna.
    if (!origenes.includes(origen)) origenes = [origen, ...origenes].slice(0, 20);

    await db.termino.update({
      where: { id: existente.id },
      data: {
        volumen: t.volumen ?? 0,
        cpc: t.cpc ?? null,
        competencia: t.competencia ?? null,
        // Lo que no venga en esta fuente no se borra: la exploración de un
        // dominio no trae intención, y perderla porque la última vez vino de
        // ahí sería tirar un dato bueno.
        ...(t.intencion ? { intencion: t.intencion } : {}),
        ...(t.tendencia != null ? { tendencia: t.tendencia } : {}),
        origenes: JSON.stringify(origenes),
        veces: existente.veces + 1,
        actualizado: new Date(),
      },
    });
    actualizadas++;
  }

  return { nuevas, actualizadas };
}

function cabecera(login: string, clave: string) {
  return "Basic " + Buffer.from(`${login}:${clave}`).toString("base64");
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * Vuelve a pedir el volumen de unas palabras concretas.
 *
 * Esto es lo que hay detrás del botón de actualizar, y es la operación barata
 * del sistema: `keyword_overview` cobra prácticamente por petición, no por
 * palabra, y admite 700 de golpe. Refrescar setecientas cuesta casi lo mismo
 * que refrescar una, así que nunca se manda una sola.
 */
export async function refrescar(keywords: string[], pais: number) {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  const limpias = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  if (limpias.length === 0) throw new Error("No hay palabras que actualizar.");

  const base = c.pruebas ? PRUEBAS : PRODUCCION;
  let coste = 0;
  let tocadas = 0;

  for (let i = 0; i < limpias.length; i += POR_TANDA) {
    const tanda = limpias.slice(i, i + POR_TANDA);

    const r = await fetch(`${base}/v3/dataforseo_labs/google/keyword_overview/live`, {
      method: "POST",
      headers: { Authorization: cabecera(c.login, c.clave), "Content-Type": "application/json" },
      body: JSON.stringify([{ keywords: tanda, location_code: pais, language_code: "es" }]),
      signal: AbortSignal.timeout(120000),
      cache: "no-store",
    });

    if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
    if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}`);

    const j = await r.json();
    coste += typeof j?.cost === "number" ? j.cost : 0;

    const tarea = j?.tasks?.[0];
    if (tarea?.status_code && tarea.status_code !== 20000) {
      throw new Error(tarea.status_message ?? `código ${tarea.status_code}`);
    }

    for (const bruta of tarea?.result?.[0]?.items ?? []) {
      const d = obj(bruta);
      const keyword = typeof d.keyword === "string" ? d.keyword.trim().toLowerCase() : "";
      if (!keyword) continue;

      const info = obj(d.keyword_info);
      const tendencias = obj(info.search_volume_trend);
      const intenciones = obj(d.search_intent_info);

      await db.termino.updateMany({
        where: { keyword, pais },
        data: {
          volumen: num(info.search_volume) ?? 0,
          cpc: num(info.cpc),
          competencia: num(info.competition),
          tendencia: num(tendencias.yearly),
          ...(typeof intenciones.main_intent === "string"
            ? { intencion: intenciones.main_intent }
            : {}),
          actualizado: new Date(),
        },
      });
      tocadas++;
    }
  }

  return { coste, tocadas, pedidas: limpias.length };
}
