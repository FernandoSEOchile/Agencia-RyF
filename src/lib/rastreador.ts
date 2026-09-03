import "server-only";
import { db } from "@/lib/db";
import { leerSitemap } from "@/lib/sitemap";

/**
 * Rastreo técnico de un sitio, al estilo de Screaming Frog.
 *
 * Complementa a la auditoría del conector en vez de repetirla. La auditoría lee
 * la base de WordPress y por eso ve borradores y el grafo de enlaces sin pedir
 * una sola página; lo que no puede ver es lo que solo existe al servir la web:
 * que un enlace devuelve 404, que hay tres redirecciones encadenadas, o que el
 * tema está escribiendo `noindex` en media sección.
 *
 * Y es lo único del panel que no cuesta dinero: son peticiones HTTP desde
 * nuestro propio servidor, sin proveedor de por medio.
 *
 * Dos reglas que no conviene tocar:
 *
 * 1. **Se va despacio.** Un rastreador rápido contra el hosting compartido de
 *    un cliente se parece demasiado a un ataque, y hay cortafuegos que
 *    responden bloqueando la IP. Media hora de rastreo es barata; quedarse
 *    fuera del sitio de un cliente, no.
 * 2. **Hay tope de URLs.** Un sitio mal configurado puede tener un sitemap con
 *    cientos de miles de entradas, y sin tope el rastreo no acaba nunca.
 */

/** Espera entre peticiones. Un poco menos de dos por segundo. */
const PAUSA = 600;

/** Cuántas URLs como mucho. Por encima de esto hay que hablarlo antes. */
const TOPE = 3000;

/** Cuánto se espera a una página antes de darla por perdida. */
const ESPERA = 20000;

/** Sin noticias durante este rato, una tanda se da por interrumpida. */
const ABANDONO = 10 * 60 * 1000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function texto(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m) return null;
  const v = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return v || null;
}

/** Lo que el HTML dice de sí mismo. */
function leer(html: string, base: URL) {
  const sinRuido = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const plano = sinRuido.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

  // El robots del documento. Se mira `noindex` en la meta general y en la de
  // Google, porque hay plugins que solo escriben una de las dos.
  const robots = [
    ...html.matchAll(/<meta[^>]+name=["'](?:robots|googlebot)["'][^>]*content=["']([^"']*)["']/gi),
  ]
    .map((m) => m[1].toLowerCase())
    .join(",");

  let internos = 0;
  let externos = 0;

  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;

    try {
      const u = new URL(href, base);
      if (u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "")) internos++;
      else externos++;
    } catch {
      // Un href que ni siquiera es una URL válida ya es un problema, pero no
      // uno que este contador deba resolver.
    }
  }

  // Una imagen sin alt o con el alt vacío. Se cuentan juntas porque para quien
  // usa un lector de pantalla son el mismo problema.
  const imagenes = [...html.matchAll(/<img\b[^>]*>/gi)];
  const sinAlt = imagenes.filter((m) => !/\balt\s*=\s*["'][^"']+["']/i.test(m[0])).length;

  return {
    titulo: texto(sinRuido, /<title[^>]*>([\s\S]*?)<\/title>/i),
    descripcion: (html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i
    )?.[1] ?? "").trim() || null,
    h1: texto(sinRuido, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    canonical:
      (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1] ?? "").trim() ||
      null,
    noindex: robots.includes("noindex"),
    palabras: plano ? plano.split(" ").length : 0,
    enlacesInternos: internos,
    enlacesExternos: externos,
    imagenesSinAlt: sinAlt,
  };
}

/** Pide una URL y devuelve la fila lista para guardar. */
async function visitar(url: string, rastreoId: string) {
  const arranque = Date.now();

  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "AppSEO-Rastreador/1.0 (+https://panel.agenciaryf.com)" },
      signal: AbortSignal.timeout(ESPERA),
      cache: "no-store",
    });

    const html = await r.text();
    const ms = Date.now() - arranque;

    // Solo se analiza HTML: un PDF o una imagen en el sitemap no tienen título
    // ni H1, y sacarles conclusiones sería inventarse problemas.
    const esHtml = (r.headers.get("content-type") ?? "").includes("text/html");

    return {
      rastreoId,
      url,
      estado: r.status,
      ms,
      destino: r.url !== url ? r.url : null,
      ...(esHtml
        ? leer(html, new URL(url))
        : {
            titulo: null,
            descripcion: null,
            h1: null,
            canonical: null,
            noindex: false,
            palabras: 0,
            enlacesInternos: 0,
            enlacesExternos: 0,
            imagenesSinAlt: 0,
          }),
      error: null,
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return {
      rastreoId,
      url,
      estado: null,
      ms: Date.now() - arranque,
      destino: null,
      titulo: null,
      descripcion: null,
      h1: null,
      canonical: null,
      noindex: false,
      palabras: 0,
      enlacesInternos: 0,
      enlacesExternos: 0,
      imagenesSinAlt: 0,
      error: m.includes("timeout") || m.includes("abort") ? "No contestó a tiempo." : m.slice(0, 200),
    };
  }
}

/**
 * Arranca un rastreo y devuelve su id enseguida.
 *
 * El trabajo sigue en segundo plano: dos mil URLs a este ritmo son veinte
 * minutos, y ninguna petición HTTP aguanta eso. El avance se va escribiendo en
 * la tanda para que la pantalla lo pueda ir preguntando.
 */
export async function arrancar(clienteId: string) {
  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { dominio: true, plataforma: true, activo: true },
  });

  if (!cliente || !cliente.activo) throw new Error("Ese cliente no existe o está desactivado.");

  const enCurso = await db.rastreo.findFirst({
    where: { clienteId, estado: "corriendo", tocado: { gt: new Date(Date.now() - ABANDONO) } },
  });
  if (enCurso) throw new Error("Ya hay un rastreo en marcha para este sitio.");

  const rastreo = await db.rastreo.create({ data: { clienteId } });

  // A propósito sin `await`: la respuesta sale ya y el rastreo sigue solo.
  correr(rastreo.id, cliente.dominio, cliente.plataforma).catch(async (e) => {
    await db.rastreo.update({
      where: { id: rastreo.id },
      data: {
        estado: "error",
        nota: e instanceof Error ? e.message.slice(0, 300) : "error desconocido",
        acabado: new Date(),
      },
    });
  });

  return rastreo.id;
}

async function correr(rastreoId: string, dominio: string, plataforma: string) {
  const sitemap = await leerSitemap(dominio, plataforma);
  const todas = [...new Set(sitemap.urls.map((u) => u.url))];
  const urls = todas.slice(0, TOPE);

  if (urls.length === 0) {
    await db.rastreo.update({
      where: { id: rastreoId },
      data: {
        estado: "error",
        nota: "El sitemap no devolvió ninguna URL.",
        acabado: new Date(),
      },
    });
    return;
  }

  await db.rastreo.update({
    where: { id: rastreoId },
    data: {
      total: urls.length,
      nota:
        todas.length > TOPE
          ? `El sitio tiene ${todas.length} URLs; se rastrearon las primeras ${TOPE}.`
          : null,
    },
  });

  let hechas = 0;

  for (const url of urls) {
    const fila = await visitar(url, rastreoId);
    await db.pagina.create({ data: fila });

    hechas++;

    // Se guarda el avance de vez en cuando, no en cada página: escribir en la
    // tanda mil veces solo para mover un contador es ruido en la base.
    if (hechas % 10 === 0 || hechas === urls.length) {
      await db.rastreo.update({ where: { id: rastreoId }, data: { hechas } });
    }

    await dormir(PAUSA);
  }

  await db.rastreo.update({
    where: { id: rastreoId },
    data: { estado: "terminado", hechas, acabado: new Date() },
  });
}

/**
 * Marca como interrumpidas las tandas que se quedaron colgadas.
 *
 * Si el contenedor se reinicia a mitad de un rastreo no queda nadie para
 * cerrarlo, y sin esto la tanda diría «corriendo» para siempre y bloquearía
 * los siguientes.
 */
export async function limpiarColgados() {
  await db.rastreo.updateMany({
    where: { estado: "corriendo", tocado: { lt: new Date(Date.now() - ABANDONO) } },
    data: { estado: "interrumpido", nota: "Se cortó a mitad, seguramente por un reinicio del panel." },
  });
}
