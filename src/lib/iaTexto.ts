/**
 * Cómo se decide si una respuesta de IA «menciona» a un cliente.
 *
 * Puro a propósito —sin base ni red— para poder probarlo. Dos señales, y con
 * cualquiera basta: que el texto nombre la marca, o que entre las fuentes
 * citadas esté su dominio. Citar es más fuerte que nombrar: el modelo mandó
 * al lector a su sitio.
 */

/** Sin acentos, en minúsculas, con un solo espacio: para comparar sin sustos. */
export function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** «www.fontus.cl/algo?x=1» → «fontus.cl». */
export function raizDominio(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
}

export interface Anotacion {
  title?: string | null;
  url?: string | null;
}

/**
 * Los dominios citados, en el orden en que aparecen y sin repetir.
 *
 * Gemini no da la URL real sino un redireccionador de Google, y el dominio
 * viene en el título («mercadolibre.cl»); ChatGPT da la URL con un
 * `utm_source=openai` colgando. Se normaliza todo a la raíz del dominio.
 */
export function dominiosCitados(anotaciones: Anotacion[]): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const a of anotaciones) {
    const url = a.url ?? "";
    let dominio = raizDominio(url);
    if (/vertexaisearch\.cloud\.google\.com|google\.com\/url|grounding-api-redirect/.test(url)) {
      const t = (a.title ?? "").trim().toLowerCase();
      dominio = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(t) ? t.replace(/^www\./, "") : "";
    }
    if (!dominio || vistos.has(dominio)) continue;
    vistos.add(dominio);
    salida.push(dominio);
  }
  return salida;
}

/** ¿El texto nombra la marca? Palabra entera, sin acentos ni mayúsculas. */
export function nombraMarca(texto: string, marca: string): boolean {
  const m = normalizar(marca);
  if (m.length < 3) return false;
  const t = normalizar(texto);
  const escapada = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapada}([^a-z0-9]|$)`).test(t);
}

export interface Deteccion {
  aparece: boolean;
  citado: boolean;
  /** Puesto del dominio entre los citados, empezando en 1. */
  posicion: number | null;
  url: string | null;
  dominios: string[];
}

export function detectar(
  texto: string,
  anotaciones: Anotacion[],
  cliente: { dominio: string; marca: string }
): Deteccion {
  const objetivo = raizDominio(cliente.dominio);
  const dominios = dominiosCitados(anotaciones);
  const indice = dominios.indexOf(objetivo);
  const citado = indice >= 0;
  const url = citado
    ? (anotaciones.find((a) => raizDominio(a.url ?? "") === objetivo || (a.title ?? "").toLowerCase().includes(objetivo))?.url ?? null)
    : null;
  return {
    aparece: citado || nombraMarca(texto, cliente.marca) || nombraMarca(texto, objetivo),
    citado,
    posicion: citado ? indice + 1 : null,
    url,
    dominios,
  };
}
