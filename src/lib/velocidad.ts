import "server-only";

/**
 * Velocidad y Core Web Vitals, con PageSpeed Insights de Google.
 *
 * **Hace falta una `PAGESPEED_API_KEY`** en el entorno del servidor. La API
 * admite llamadas sin clave, pero esa cuota es anónima y compartida entre todo
 * el mundo, así que en la práctica está agotada siempre y devuelve 429. La
 * clave es gratis —Google Cloud, mismo proyecto que Search Console— y da 25.000
 * mediciones al día.
 *
 * Aquí está la razón de que esto NO forme parte del rastreo: cada medición
 * tarda entre quince y cuarenta segundos porque Google carga la página de
 * verdad en un navegador real. Medir 2.777 URLs serían casi veinte horas. Se
 * miden unas pocas páginas representativas —la portada, una categoría, una
 * ficha— que es también como se hace a mano.
 *
 * Y se mide el móvil por defecto porque es lo que Google usa para decidir
 * posiciones desde hace años. El escritorio casi siempre sale mejor y engaña.
 */

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface Medicion {
  url: string;
  dispositivo: "mobile" | "desktop";
  /** Nota de 0 a 100 del informe de rendimiento. */
  nota: number | null;
  /** Largest Contentful Paint, en segundos. Lo que tarda en verse lo principal. */
  lcp: number | null;
  /** Cumulative Layout Shift. Cuánto baila la página mientras carga. */
  cls: number | null;
  /** Interaction to Next Paint, en milisegundos. Cuánto tarda en responder. */
  inp: number | null;
  /** Tiempo hasta el primer byte, en milisegundos. Es culpa del hosting. */
  ttfb: number | null;
  /** Si los datos vienen de usuarios reales o de una simulación de laboratorio. */
  reales: boolean;
  error: string | null;
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Una medición. Tarda lo suyo: Google carga la página en un navegador real. */
export async function medir(
  url: string,
  dispositivo: "mobile" | "desktop" = "mobile"
): Promise<Medicion> {
  const vacia: Medicion = {
    url,
    dispositivo,
    nota: null,
    lcp: null,
    cls: null,
    inp: null,
    ttfb: null,
    reales: false,
    error: null,
  };

  const parametros = new URLSearchParams({ url, strategy: dispositivo, category: "performance" });
  if (process.env.PAGESPEED_API_KEY) parametros.set("key", process.env.PAGESPEED_API_KEY);

  try {
    const r = await fetch(`${API}?${parametros}`, {
      signal: AbortSignal.timeout(90000),
      cache: "no-store",
    });

    // El 429 sin clave no es «espera un rato»: la cuota anónima de PageSpeed es
    // compartida entre todo el mundo y está agotada casi siempre. El mensaje
    // dice qué hay que hacer, porque «reintenta» no arregla nada aquí.
    if (r.status === 429) {
      return {
        ...vacia,
        error: process.env.PAGESPEED_API_KEY
          ? "Se agotó la cuota diaria de la clave de PageSpeed. Vuelve mañana."
          : "PageSpeed no tiene clave configurada y la cuota gratuita compartida está agotada. Hace falta una PAGESPEED_API_KEY: se saca gratis en Google Cloud y da 25.000 mediciones al día.",
      };
    }

    if (r.status === 400) {
      return { ...vacia, error: "Google no pudo cargar esa página para medirla." };
    }

    if (!r.ok) return { ...vacia, error: `PageSpeed respondió ${r.status}.` };

    const j = await r.json();

    // Dos fuentes distintas, y conviene saber cuál se está mirando: `loadingExperience`
    // son usuarios reales de los últimos 28 días, y solo existe si el sitio tiene
    // bastante tráfico. `lighthouseResult` es una simulación, siempre disponible.
    const campo = obj(obj(j).loadingExperience).metrics;
    const reales = Object.keys(obj(campo)).length > 0;
    const dato = (k: string) => num(obj(obj(campo)[k]).percentile);

    const faros = obj(obj(j.lighthouseResult).audits);
    const deFaro = (k: string) => num(obj(faros[k]).numericValue);

    return {
      url,
      dispositivo,
      nota: (() => {
        const c = obj(obj(obj(j.lighthouseResult).categories).performance).score;
        return typeof c === "number" ? Math.round(c * 100) : null;
      })(),
      lcp: reales
        ? (dato("LARGEST_CONTENTFUL_PAINT_MS") ?? 0) / 1000 || null
        : (deFaro("largest-contentful-paint") ?? 0) / 1000 || null,
      cls: reales
        ? (dato("CUMULATIVE_LAYOUT_SHIFT_SCORE") ?? 0) / 100 || null
        : deFaro("cumulative-layout-shift"),
      inp: reales ? dato("INTERACTION_TO_NEXT_PAINT") : null,
      ttfb: reales ? dato("EXPERIMENTAL_TIME_TO_FIRST_BYTE") : deFaro("server-response-time"),
      reales,
      error: null,
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return {
      ...vacia,
      error: m.includes("timeout") || m.includes("abort") ? "La medición tardó demasiado." : m.slice(0, 160),
    };
  }
}
