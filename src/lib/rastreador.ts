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

/**
 * Cuántas páginas se piden a la vez, y cuánto se espera entre tandas.
 *
 * De una en una con 600 ms de pausa el primer sitio real dio casi cuatro horas
 * para 2.777 URLs: el freno no era la pausa sino que el propio sitio tardaba
 * segundo y medio en contestar, y esperábamos parados. De tres en tres queda en
 * media hora larga.
 *
 * Tres a la vez sigue siendo educado —cualquier hosting aguanta más, y
 * Googlebot pide bastante más que eso—, pero no tanto como para que un
 * cortafuegos lo confunda con un ataque. Si algún día un cliente se queja,
 * este es el número que hay que bajar.
 */
const A_LA_VEZ = 3;
const PAUSA = 400;

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

  let externos = 0;

  // Los destinos internos van en un conjunto: tres enlaces a la misma página
  // desde el mismo sitio son un enlace a efectos de si esa página está
  // enlazada o no, que es la pregunta que se quiere responder.
  const internos = new Set<string>();

  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;

    try {
      const u = new URL(href, base);
      if (u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "")) {
        internos.add(normalizar(u));
      } else {
        externos++;
      }
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
    h1s: [...sinRuido.matchAll(/<h1[\s>]/gi)].length,
    ...estructurados(html),
    lang: (html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? "").trim().slice(0, 20) || null,
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    charset: /<meta[^>]+charset=/i.test(html),
    palabras: plano ? plano.split(" ").length : 0,
    enlacesInternos: internos.size,
    enlacesExternos: externos,
    imagenesSinAlt: sinAlt,
    salientes: [...internos],
  };
}

/**
 * Qué datos estructurados declara la página.
 *
 * Se distingue «no tiene» de «tiene y está roto», que es peor: el sitio cree
 * que le está contando a Google que eso es un producto con su precio, y Google
 * descarta el bloque entero sin avisar a nadie.
 *
 * Se recorren todos los bloques porque es normal tener varios —uno para la
 * organización, otro para las migas, otro para el producto— y basta con que
 * uno esté mal para perderlo.
 */
function estructurados(html: string) {
  const bloques = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  const tipos = new Set<string>();
  let roto = false;

  for (const b of bloques) {
    try {
      const dato = JSON.parse(b[1].trim());

      // Un bloque puede ser un objeto, una lista, o un @graph con todo dentro.
      const nodos = Array.isArray(dato)
        ? dato
        : Array.isArray(dato?.["@graph"])
          ? dato["@graph"]
          : [dato];

      for (const n of nodos) {
        const t = n?.["@type"];
        if (typeof t === "string") tipos.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && tipos.add(x));
      }
    } catch {
      roto = true;
    }
  }

  return { tipos: JSON.stringify([...tipos]), ldRoto: roto };
}

/**
 * La forma canónica de una URL para compararla con otra.
 *
 * Sin esto, «/tienda» y «/tienda/» serían páginas distintas y media web
 * aparecería como huérfana por un carácter. Se quita también el fragmento y el
 * www, que no cambian a dónde lleva el enlace.
 */
function normalizar(u: URL) {
  const host = u.hostname.replace(/^www\./, "");
  const ruta = u.pathname.replace(/\/+$/, "") || "/";
  return `https://${host}${ruta}${u.search}`;
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

    const leido = esHtml
      ? leer(html, new URL(url))
      : {
          titulo: null,
          descripcion: null,
          h1: null,
          canonical: null,
          noindex: false,
          h1s: 0,
          tipos: "[]",
          ldRoto: false,
          lang: null,
          viewport: false,
          charset: false,
          palabras: 0,
          enlacesInternos: 0,
          enlacesExternos: 0,
          imagenesSinAlt: 0,
          salientes: [] as string[],
        };

    const { salientes, ...campos } = leido;

    return {
      fila: { rastreoId, url, estado: r.status, ms, destino: r.url !== url ? r.url : null, ...campos, error: null },
      salientes,
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return {
      fila: {
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
        h1s: 0,
        tipos: "[]",
        ldRoto: false,
        lang: null,
        viewport: false,
        charset: false,
        palabras: 0,
        enlacesInternos: 0,
        enlacesExternos: 0,
        imagenesSinAlt: 0,
        error: m.includes("timeout") || m.includes("abort") ? "No contestó a tiempo." : m.slice(0, 200),
      },
      salientes: [] as string[],
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

  for (let i = 0; i < urls.length; i += A_LA_VEZ) {
    const tanda = urls.slice(i, i + A_LA_VEZ);
    const visitas = await Promise.all(tanda.map((u) => visitar(u, rastreoId)));

    await db.pagina.createMany({ data: visitas.map((v) => v.fila) });

    const enlaces = visitas.flatMap((v) =>
      v.salientes.map((hacia) => ({ rastreoId, desde: v.fila.url, hacia }))
    );
    if (enlaces.length > 0) await db.enlace.createMany({ data: enlaces });

    hechas += visitas.length;

    // El avance se guarda por tandas y no por página: escribir en la fila del
    // rastreo mil veces solo para mover un contador es ruido en la base.
    await db.rastreo.update({ where: { id: rastreoId }, data: { hechas } });

    await dormir(PAUSA);
  }

  await contarEntrantes(rastreoId);
  await medirProfundidad(rastreoId, dominio);

  await db.rastreo.update({
    where: { id: rastreoId },
    data: {
      estado: "terminado",
      hechas,
      acabado: new Date(),
      sitio: JSON.stringify(await mirarRobots(dominio)),
    },
  });
}

/**
 * A cuántos clics de la portada está cada página.
 *
 * Se calcula en memoria y no en SQL porque es un recorrido por anchura, y eso
 * en SQL es una consulta recursiva que nadie que venga después va a querer
 * tocar. Cien mil enlaces caben de sobra en memoria.
 *
 * Importa porque Google reparte menos autoridad cuanto más hondo está algo, y
 * una ficha a seis clics de la portada es, en la práctica, una ficha que nadie
 * encuentra.
 */
async function medirProfundidad(rastreoId: string, dominio: string) {
  const [paginas, enlaces] = await Promise.all([
    db.pagina.findMany({ where: { rastreoId }, select: { id: true, url: true } }),
    db.enlace.findMany({ where: { rastreoId }, select: { desde: true, hacia: true } }),
  ]);

  const clave = (u: string) => {
    try {
      return normalizar(new URL(u));
    } catch {
      return u;
    }
  };

  const salidas = new Map<string, string[]>();
  for (const e of enlaces) {
    const d = clave(e.desde);
    const lista = salidas.get(d);
    if (lista) lista.push(e.hacia);
    else salidas.set(d, [e.hacia]);
  }

  const limpio = dominio.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const portada = `https://${limpio}/`;

  const nivel = new Map<string, number>([[normalizar(new URL(portada)), 0]]);
  let frente = [normalizar(new URL(portada))];
  let d = 0;

  while (frente.length > 0) {
    d++;
    const siguiente: string[] = [];

    for (const u of frente) {
      for (const v of salidas.get(u) ?? []) {
        if (!nivel.has(v)) {
          nivel.set(v, d);
          siguiente.push(v);
        }
      }
    }

    frente = siguiente;
  }

  // Se agrupan por nivel para actualizar de una vez por nivel en vez de una vez
  // por página: son media docena de consultas en lugar de tres mil.
  const porNivel = new Map<number, string[]>();
  for (const p of paginas) {
    const n = nivel.get(clave(p.url));
    if (n === undefined) continue;
    const lista = porNivel.get(n);
    if (lista) lista.push(p.id);
    else porNivel.set(n, [p.id]);
  }

  for (const [n, ids] of porNivel) {
    await db.pagina.updateMany({ where: { id: { in: ids } }, data: { profundidad: n } });
  }
}

/**
 * Qué dice el robots.txt del sitio.
 *
 * Se mira una vez por rastreo, no por página. Lo que interesa es lo que puede
 * dejar una sección entera fuera de Google sin que nadie se entere: un
 * `Disallow: /` olvidado tras una migración es el clásico.
 */
async function mirarRobots(dominio: string) {
  const limpio = dominio.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  try {
    const r = await fetch(`https://${limpio}/robots.txt`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "AppSEO-Rastreador/1.0" },
      cache: "no-store",
    });

    if (!r.ok) return { robots: false, estado: r.status };

    const texto = await r.text();
    const lineas = texto.split(/\r?\n/).map((l) => l.trim());

    const bloqueos = lineas
      .filter((l) => /^disallow:/i.test(l))
      .map((l) => l.replace(/^disallow:\s*/i, "").trim())
      .filter(Boolean);

    return {
      robots: true,
      estado: r.status,
      // Un «Disallow: /» a secas cierra el sitio entero a los buscadores.
      cierraTodo: bloqueos.includes("/"),
      bloqueos: bloqueos.slice(0, 30),
      declaraSitemap: /^sitemap:/im.test(texto),
      bytes: texto.length,
    };
  } catch (e) {
    return { robots: false, error: e instanceof Error ? e.message.slice(0, 120) : "error" };
  }
}

/**
 * Cuenta cuántos enlaces internos apunta cada página.
 *
 * Solo se puede hacer al final: mientras se rastrea, una página puede parecer
 * huérfana simplemente porque quien la enlaza todavía no se ha visitado.
 *
 * Va en SQL de una sola pasada y no página por página porque son miles de
 * filas contra cientos de miles de enlaces, y hacerlo en bucle tardaría más
 * que el rastreo entero.
 */
async function contarEntrantes(rastreoId: string) {
  await db.$executeRaw`
    UPDATE "Pagina" p
    SET "entrantes" = COALESCE(e.cuantos, 0)
    FROM (
      SELECT "hacia", COUNT(DISTINCT "desde") AS cuantos
      FROM "Enlace"
      WHERE "rastreoId" = ${rastreoId}
      GROUP BY "hacia"
    ) e
    WHERE p."rastreoId" = ${rastreoId}
      AND regexp_replace(regexp_replace(p."url", '^https?://(www\.)?', 'https://'), '/+$', '') = e."hacia"
  `;
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
