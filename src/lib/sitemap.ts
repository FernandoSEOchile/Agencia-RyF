import "server-only";

/**
 * Lectura del sitemap de un sitio.
 *
 * Es mejor fuente que preguntarle al conector: el sitemap trae todo lo que el
 * sitio declara como indexable, sin los topes de paginación de la API, y es
 * exactamente lo que Google ve. Si una sección de la arquitectura existe pero
 * no está en el sitemap, eso también es información útil.
 */

export interface UrlSitemap {
  url: string;
  ruta: string;
  segmento: string;
  modificado: string | null;
}

/** Rutas donde suele vivir el sitemap, en orden de probabilidad. */
const CANDIDATOS = ["/wp-sitemap.xml", "/sitemap_index.xml", "/sitemap.xml", "/sitemap-index.xml"];

/** Sitemaps que no aportan secciones: autores, etiquetas, imágenes. */
const IGNORAR = /(author|tag|etiqueta|image|media|attachment)/i;

function etiquetas(xml: string, nombre: string): string[] {
  const re = new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function primera(bloque: string, nombre: string): string {
  const m = new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`, "i").exec(bloque);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

async function bajar(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "AppSEO-Panel/1.0" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const t = await r.text();
    return t.includes("<urlset") || t.includes("<sitemapindex") ? t : null;
  } catch {
    return null;
  }
}

/**
 * Devuelve todas las URLs del sitemap, siguiendo los índices.
 *
 * Se limita el número de sub-sitemaps a la vez: un catálogo grande puede
 * declarar decenas, y pedirlos todos de golpe castiga al servidor del cliente.
 */
export async function leerSitemap(dominio: string): Promise<{
  urls: UrlSitemap[];
  origen: string | null;
  aviso: string | null;
}> {
  const base = `https://${dominio.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  let xml: string | null = null;
  let origen: string | null = null;

  for (const ruta of CANDIDATOS) {
    xml = await bajar(base + ruta);
    if (xml) {
      origen = base + ruta;
      break;
    }
  }

  if (!xml) {
    return { urls: [], origen: null, aviso: "No se encontró el sitemap del sitio." };
  }

  const vistas = new Set<string>();
  const urls: UrlSitemap[] = [];

  const anotar = (bloque: string) => {
    const loc = primera(bloque, "loc");
    if (!loc || vistas.has(loc)) return;
    vistas.add(loc);
    try {
      const u = new URL(loc);
      const partes = u.pathname.split("/").filter(Boolean);
      urls.push({
        url: loc,
        ruta: u.pathname,
        segmento: partes[partes.length - 1] ?? "",
        modificado: primera(bloque, "lastmod") || null,
      });
    } catch {
      /* una URL malformada en el sitemap no debe tumbar la lectura */
    }
  };

  if (xml.includes("<sitemapindex")) {
    const hijos = etiquetas(xml, "sitemap")
      .map((b) => primera(b, "loc"))
      .filter((u) => u && !IGNORAR.test(u))
      .slice(0, 30);

    for (const hijo of hijos) {
      const sub = await bajar(hijo);
      if (sub) etiquetas(sub, "url").forEach(anotar);
    }
  } else {
    etiquetas(xml, "url").forEach(anotar);
  }

  return {
    urls,
    origen,
    aviso: urls.length === 0 ? "El sitemap se leyó pero no contenía URLs." : null,
  };
}
