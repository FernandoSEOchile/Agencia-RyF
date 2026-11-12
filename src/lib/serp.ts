/**
 * Leer una página de resultados de Google tal como la devuelve DataForSEO.
 *
 * Está aparte de `dataforseo.ts` —que hace la llamada— para poder probarlo con
 * resultados de ejemplo sin gastar una consulta, y porque aquí es donde se
 * decide qué cuenta como «aparecer». Antes solo contaba el resultado orgánico
 * común, y con eso un cliente que ocupaba el fragmento destacado o salía en el
 * mapa figuraba «fuera»: Search Console decía puesto 6 y el panel, nada.
 */

export interface Sitio {
  d: string;
  u: string;
  p: number;
}

export interface LecturaSerp {
  /** Puesto entre los resultados orgánicos, contando el fragmento destacado. */
  puesto: number | null;
  url: string | null;
  /** «destacado» si el cliente es el fragmento destacado; «organico» si es un resultado normal. */
  tipo: "organico" | "destacado" | null;
  /** Puesto dentro del bloque del mapa (1 a 3), si el cliente sale ahí. */
  puestoMapa: number | null;
  urlMapa: string | null;
  /** Bloques no orgánicos por encima del resultado del cliente. */
  bloquesArriba: number | null;
  /**
   * Cuántos resultados orgánicos trajo la consulta. No siempre llegan cien:
   * a veces Google entrega doce. «No aparece» solo vale dentro de estos.
   */
  revisados: number;
  iaOverview: boolean;
  iaCitado: boolean;
  iaUrl: string | null;
  iaFuentes: string[];
  /** Los veinte primeros orgánicos, para comparar con rivales. */
  serp: Sitio[];
}

/** Quita protocolo, www, ruta y mayúsculas para poder comparar dominios. */
export function raiz(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
}

/**
 * Si un dominio es del cliente: el mismo, o un subdominio suyo
 * (tienda.cliente.cl, m.cliente.cl). Al revés no: que el cliente sea
 * tienda.cliente.cl no hace suyo todo cliente.cl.
 */
export function esDelCliente(dominio: string, objetivo: string): boolean {
  const d = raiz(dominio);
  const o = raiz(objetivo);
  if (!d || !o) return false;
  return d === o || d.endsWith("." + o);
}

/**
 * Quita de la URL lo que Google le pega al mostrarla.
 *
 * `srsltid` lo añade Google Shopping a casi toda URL de tienda; con él, la
 * misma página aparecía como una URL distinta en cada medición y la alerta de
 * «Google eligió otra página» saltaba sin motivo.
 */
export function limpiarUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("srsltid");
    const limpia = u.toString();
    return u.search === "" ? limpia.replace(/\?$/, "") : limpia;
  } catch {
    return url;
  }
}

type Item = Record<string, unknown>;

const ORGANICOS = new Set(["organic", "featured_snippet"]);

const esGoogle = (d: string) => /^google\.[a-z.]+$/.test(d);

/** Si la URL es una redirección de Google (google.cl/goto?url=…), no la del sitio. */
export function esRedireccionGoogle(url: string): boolean {
  return /^https?:\/\/(www\.)?google\.[a-z.]+\/(goto|url)\?/.test(url);
}

/**
 * El dominio de un resultado.
 *
 * Desde noviembre de 2026 el proveedor a veces entrega el enlace como una
 * redirección de Google, y el campo `domain` también dice google.cl. La ruta
 * que Google muestra bajo el título (`breadcrumb`, «https://fontus.cl › filtros»)
 * sigue siendo la del sitio, así que se lee de ahí.
 */
function dominioDe(item: Item): string {
  const d = raiz(String(item.domain ?? "") || String(item.url ?? ""));
  if (!esGoogle(d)) return d;
  const migas = String(item.breadcrumb ?? "").trim();
  const desdeMigas = raiz(migas.split(/\s*›\s*/)[0] ?? "");
  if (desdeMigas && !esGoogle(desdeMigas) && desdeMigas.includes(".")) return desdeMigas;
  return d;
}

/** La URL del resultado, salvo que sea una redirección de Google: esa no dice nada. */
function urlDe(item: Item): string {
  const u = String(item.url ?? "");
  return esRedireccionGoogle(u) ? "" : limpiarUrl(u);
}

export function leerSerp(items: Item[], dominioCliente: string): LecturaSerp {
  const objetivo = raiz(dominioCliente);

  // El bloque de IA: sus fuentes vienen arriba (`references`) y dentro de cada
  // trozo de texto (`items[].references`). Se juntan todas.
  const ai = items.find((i) => String(i.type ?? "") === "ai_overview") as
    | { references?: { domain?: string; url?: string }[]; items?: { references?: { domain?: string; url?: string }[] }[] }
    | undefined;
  const fuentes: string[] = [];
  let iaUrl: string | null = null;
  if (ai) {
    const refs = [...(ai.references ?? []), ...(ai.items ?? []).flatMap((x) => x.references ?? [])];
    for (const ref of refs) {
      const d = raiz(String(ref.domain ?? "") || String(ref.url ?? ""));
      if (!d) continue;
      if (esDelCliente(d, objetivo) && !iaUrl) iaUrl = String(ref.url ?? "") || null;
      if (!fuentes.includes(d)) fuentes.push(d);
    }
  }

  let organicos = 0;
  let noOrganicos = 0;
  let enMapa = 0;
  const serp: Sitio[] = [];
  const lectura: LecturaSerp = {
    puesto: null,
    url: null,
    tipo: null,
    puestoMapa: null,
    urlMapa: null,
    bloquesArriba: null,
    revisados: 0,
    iaOverview: Boolean(ai),
    iaCitado: fuentes.some((f) => esDelCliente(f, objetivo)),
    iaUrl,
    iaFuentes: fuentes.slice(0, 20),
    serp,
  };

  for (const item of items) {
    const tipo = String(item.type ?? "");

    if (tipo === "local_pack") {
      // El mapa no es un puesto orgánico, pero es donde un negocio local recibe
      // las visitas: se guarda aparte, nunca mezclado con el puesto.
      enMapa++;
      if (lectura.puestoMapa === null && esDelCliente(dominioDe(item), objetivo)) {
        lectura.puestoMapa = enMapa;
        lectura.urlMapa = urlDe(item) || null;
      }
      // DataForSEO entrega cada negocio del mapa como un elemento; para quien
      // busca es un solo bloque.
      if (enMapa === 1) noOrganicos++;
      continue;
    }

    if (!ORGANICOS.has(tipo)) {
      noOrganicos++;
      continue;
    }

    // El fragmento destacado ocupa un puesto: es lo primero que ve quien busca,
    // y Google no repite esa URL más abajo.
    organicos++;
    const url = urlDe(item);
    const d = dominioDe(item);
    if (organicos <= 20) serp.push({ d, u: url, p: organicos });

    if (lectura.puesto === null && esDelCliente(d, objetivo)) {
      lectura.puesto = organicos;
      lectura.url = url || null;
      lectura.tipo = tipo === "featured_snippet" ? "destacado" : "organico";
      lectura.bloquesArriba = noOrganicos;
    }
  }

  // Si los orgánicos vienen como enlaces de Google (google.cl/goto?url=…) no
  // se sabe de qué sitio es cada uno, y guardar «no está» sería inventar. Se
  // rechaza la medición: queda como fallo, a la vista, y no como dato.
  const deGoogle = serp.filter((s) => esGoogle(s.d)).length;
  if (serp.length > 0 && deGoogle > serp.length / 2) {
    // Queda en el registro del contenedor la forma del primer orgánico, para
    // ver de dónde sacar el sitio si el proveedor vuelve a cambiar. Son datos
    // públicos de Google: nada de credenciales.
    const primero = items.find((i) => ORGANICOS.has(String(i.type ?? "")));
    if (primero) {
      const corto = Object.fromEntries(
        Object.entries(primero).map(([c, v]) => [c, typeof v === "string" ? v.slice(0, 120) : Array.isArray(v) ? `[${v.length}]` : v && typeof v === "object" ? "{…}" : v])
      );
      console.error("[serp] orgánico con enlace de Google:", JSON.stringify(corto));
    }
    throw new Error("El proveedor devolvió enlaces de Google en vez de las URLs de los sitios; no se puede leer el puesto.");
  }

  lectura.revisados = organicos;
  return lectura;
}
