import "server-only";
import { credenciales } from "@/lib/dataforseo";

/**
 * Investigación de palabras clave a partir de una semilla.
 *
 * Usa la familia Labs de DataForSEO, que son consultas a su base de datos y no
 * rastreos en vivo. Esa es toda la diferencia de precio: una búsqueda aquí
 * cuesta céntimos, la misma información sacada del SERP costaría cien veces
 * más.
 *
 * Dos decisiones que abaratan de verdad:
 *
 * 1. Se pide SIEMPRE el máximo de resultados. Una petición que devuelve mil
 *    palabras cuesta prácticamente lo mismo que una que devuelve diez, así que
 *    pedir de a poco es tirar dinero.
 * 2. La dificultad no se pide aquí. Es lo único que se paga por palabra, y
 *    calcularla sobre mil cuando vas a usar veinte no tiene sentido: va aparte,
 *    sobre las que alguien ya eligió.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

/** Chile. El mismo que usa el resto del panel. */
export const CHILE = 2152;

/** Cuántas se piden por endpoint. Es el techo que admite la API. */
const TOPE = 1000;

export interface Sugerencia {
  keyword: string;
  volumen: number;
  /** Cuánto ha cambiado el volumen respecto al año pasado, en porcentaje. */
  tendencia: number | null;
  cpc: number | null;
  competencia: number | null;
  /** «informational», «commercial», «transactional» o «navigational». */
  intencion: string | null;
  palabras: number;
  /** De qué endpoint salió: «contiene» o «relacionada». */
  origen: string;
}

export interface Investigacion {
  semilla: string;
  pais: number;
  sugerencias: Sugerencia[];
  coste: number;
  avisos: string[];
}

function cabecera(login: string, clave: string) {
  return "Basic " + Buffer.from(`${login}:${clave}`).toString("base64");
}

async function pedir(
  c: { login: string; clave: string; pruebas?: boolean },
  ruta: string,
  cuerpo: Record<string, unknown>
): Promise<{ filas: unknown[]; coste: number; aviso?: string }> {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;

  try {
    const r = await fetch(`${base}/v3/dataforseo_labs/google/${ruta}/live`, {
      method: "POST",
      headers: { Authorization: cabecera(c.login, c.clave), "Content-Type": "application/json" },
      body: JSON.stringify([cuerpo]),
      signal: AbortSignal.timeout(120000),
      cache: "no-store",
    });

    if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
    if (!r.ok) throw new Error(`respondió ${r.status}`);

    const j = await r.json();
    const tarea = j?.tasks?.[0];

    if (tarea?.status_code && tarea.status_code !== 20000) {
      return { filas: [], coste: 0, aviso: `${ruta}: ${tarea.status_message ?? tarea.status_code}` };
    }

    return {
      filas: tarea?.result?.[0]?.items ?? [],
      // El coste real que cobra el proveedor, no uno calculado por nosotros.
      coste: typeof j?.cost === "number" ? j.cost : 0,
    };
  } catch (e) {
    return { filas: [], coste: 0, aviso: `${ruta}: ${e instanceof Error ? e.message : "error"}` };
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * Cuánto ha subido o bajado el volumen respecto al mismo mes del año pasado.
 *
 * Se compara con hace doce meses y no con el mes anterior porque casi todo lo
 * que se vende tiene estacionalidad: diciembre contra noviembre dice que todo
 * sube, y eso no informa de nada.
 */
function tendencia(serie: unknown): number | null {
  if (!Array.isArray(serie) || serie.length < 12) return null;

  const ahora = num(obj(serie[0]).search_volume);
  const hace12 = num(obj(serie[11]).search_volume);

  if (!ahora || !hace12) return null;
  return Math.round(((ahora - hace12) / hace12) * 100);
}

/** Aplana una fila de la API, que anida las métricas de formas distintas. */
function fila(x: unknown, origen: string): Sugerencia | null {
  const d = obj(x);
  const keyword = typeof d.keyword === "string" ? d.keyword.trim() : "";
  if (!keyword) return null;

  const info = obj(d.keyword_info);
  const propiedades = obj(d.keyword_properties);
  const intenciones = obj(d.search_intent_info);

  return {
    keyword,
    volumen: num(info.search_volume) ?? 0,
    tendencia: tendencia(info.monthly_searches),
    cpc: num(info.cpc),
    competencia: num(info.competition),
    intencion: typeof intenciones.main_intent === "string" ? intenciones.main_intent : null,
    palabras:
      num(propiedades.keyword_length) ?? keyword.split(/\s+/).filter(Boolean).length,
    origen,
  };
}

/**
 * Busca palabras relacionadas con una semilla.
 *
 * Se combinan dos endpoints porque responden a preguntas distintas y por
 * separado dejan agujeros: `keyword_suggestions` da la cola larga que CONTIENE
 * la frase, y `related_keywords` da los vecinos que no la contienen —
 * «merchandising empresarial» para «regalos corporativos»—, que suelen ser los
 * que descubren una categoría que no se te había ocurrido.
 */
export async function investigar(semilla: string, pais = CHILE): Promise<Investigacion> {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  const limpia = semilla.trim().toLowerCase();
  if (!limpia) throw new Error("Hace falta una palabra para buscar.");

  const comun = {
    keyword: limpia,
    location_code: pais,
    language_code: "es",
    include_serp_info: false,
    limit: TOPE,
    order_by: ["keyword_info.search_volume,desc"],
  };

  const [sugeridas, relacionadas] = await Promise.all([
    pedir(c, "keyword_suggestions", comun),
    // `related_keywords` explora un grafo de términos vecinos; la profundidad 2
    // es la que da variedad sin dispararse. Con 3 el resultado se llena de
    // términos que ya no tienen nada que ver con la semilla.
    pedir(c, "related_keywords", { ...comun, depth: 2 }),
  ]);

  const vistas = new Map<string, Sugerencia>();

  for (const [filas, origen] of [
    [sugeridas.filas, "contiene"] as const,
    [relacionadas.filas, "relacionada"] as const,
  ]) {
    for (const bruta of filas) {
      // `related_keywords` envuelve cada fila en keyword_data; el otro no.
      const d = obj(bruta);
      const f = fila(d.keyword_data ?? d, origen);

      // Si una palabra sale por los dos caminos se queda la primera: «contiene»
      // va antes y es la etiqueta más informativa de las dos.
      if (f && !vistas.has(f.keyword)) vistas.set(f.keyword, f);
    }
  }

  const sugerencias = [...vistas.values()].sort((a, b) => b.volumen - a.volumen);

  return {
    semilla: limpia,
    pais,
    sugerencias,
    coste: sugeridas.coste + relacionadas.coste,
    avisos: [sugeridas.aviso, relacionadas.aviso].filter((x): x is string => !!x),
  };
}
