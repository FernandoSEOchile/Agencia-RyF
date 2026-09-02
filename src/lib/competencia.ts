import "server-only";
import { credenciales } from "@/lib/dataforseo";

/**
 * Qué hay hoy en la primera página de Google para una consulta.
 *
 * Sin esto, pedirle al modelo «escribe algo que supere a los tres primeros»
 * es pedirle que se los invente. Aquí se traen de verdad: el SERP desde
 * DataForSEO y el contenido de cada página desde el propio sitio.
 *
 * Lo que se devuelve no es el texto entero de la competencia —eso llenaría la
 * conversación de ruido y costaría dinero en cada turno posterior— sino su
 * anatomía: extensión, encabezados, vocabulario y qué preguntas responden. Es
 * lo que hace falta para escribir algo mejor.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

export interface Rival {
  puesto: number;
  url: string;
  titulo: string;
  descripcion: string;
  palabras: number | null;
  h1: string | null;
  encabezados: string[];
  preguntas: string[];
  error?: string;
}

export interface Radiografia {
  consulta: string;
  ubicacion: number;
  rivales: Rival[];
  /** Bloques de Google en el SERP: anuncios, «otras preguntas», mapa. */
  bloques: string[];
  /** Preguntas que Google muestra en «Otras preguntas de los usuarios». */
  preguntasSerp: string[];
  palabrasObjetivo: number | null;
  vocabulario: { termino: string; enCuantos: number }[];
  coste: number | null;
}

/** Quita etiquetas, scripts y adornos, y deja texto legible. */
function aTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function etiquetas(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  return [...html.matchAll(re)].map((m) => aTexto(m[1])).filter((t) => t.length > 1 && t.length < 200);
}

const VACIAS = new Set(
  ("de la el los las un una unos unas y o en para con por que se su sus del al lo es son " +
    "como más muy este esta estos estas te tu nos si no sin sobre entre desde hasta cuando " +
    "donde quien cual todo toda todos todas otro otra ya hay ser estar tiene tienen puede " +
    "pueden hacer nuestra nuestro tus mi le les da dar cada")
    .split(" ")
);

/** Términos que se repiten en las páginas que ya rankean. */
function vocabulario(textos: string[], tope = 25): { termino: string; enCuantos: number }[] {
  const cuenta = new Map<string, number>();

  for (const t of textos) {
    const vistos = new Set(
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9ñ]+/)
        .filter((p) => p.length > 3 && !VACIAS.has(p))
    );
    for (const p of vistos) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  }

  return [...cuenta.entries()]
    .filter(([, n]) => n >= 2) // solo lo que comparten al menos dos rivales
    .sort((a, b) => b[1] - a[1])
    .slice(0, tope)
    .map(([termino, enCuantos]) => ({ termino, enCuantos }));
}

/** Descarga una página de la competencia y la desarma. */
async function radiografiar(url: string, puesto: number, titulo: string, descripcion: string): Promise<Rival> {
  const base: Rival = {
    puesto,
    url,
    titulo,
    descripcion,
    palabras: null,
    h1: null,
    encabezados: [],
    preguntas: [],
  };

  try {
    const r = await fetch(url, {
      headers: {
        // Se anuncia como navegador porque muchos sitios devuelven 403 a un
        // agente desconocido, y quedarse sin datos por eso sería absurdo.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept-Language": "es-CL,es;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    if (!r.ok) return { ...base, error: `respondió ${r.status}` };

    const html = await r.text();
    const cuerpo = html.replace(/[\s\S]*?<body[^>]*>/i, "");
    const texto = aTexto(cuerpo);

    const h2 = etiquetas(html, "h2");
    const h3 = etiquetas(html, "h3");

    return {
      ...base,
      palabras: texto.split(/\s+/).filter(Boolean).length,
      h1: etiquetas(html, "h1")[0] ?? null,
      encabezados: [...h2, ...h3].slice(0, 30),
      // Un encabezado interrogativo es una duda real del comprador, y suele
      // ser lo que Google premia en los fragmentos destacados.
      preguntas: [...h2, ...h3].filter((t) => t.includes("?") || /^(qué|cómo|cuánto|cuál|por qué|dónde|cuándo)/i.test(t)).slice(0, 12),
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "no se pudo abrir" };
  }
}

/**
 * Trae los primeros resultados de Google y los analiza.
 *
 * Cuesta una consulta de SERP; las descargas de las páginas son gratis. Por
 * eso el tope de rivales es bajo: pasado el tercero, lo que se aprende ya no
 * compensa el tiempo de espera.
 */
export async function analizarCompetencia(
  consulta: string,
  ubicacion = 2152,
  cuantos = 3
): Promise<Radiografia> {
  const cred = await credenciales();
  if (!cred) throw new Error("Falta configurar DataForSEO en Ajustes para poder ver el SERP.");

  const base = cred.pruebas ? PRUEBAS : PRODUCCION;
  const auth = "Basic " + Buffer.from(`${cred.login}:${cred.clave}`).toString("base64");

  const r = await fetch(`${base}/v3/serp/google/organic/live/regular`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify([
      { keyword: consulta, location_code: ubicacion, language_code: "es", device: "desktop", depth: 20 },
    ]),
    signal: AbortSignal.timeout(90000),
    cache: "no-store",
  });

  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const tarea = j?.tasks?.[0];
  if (tarea?.status_code && tarea.status_code !== 20000) {
    throw new Error(`DataForSEO: ${tarea.status_message ?? tarea.status_code}`);
  }

  const items: Array<Record<string, unknown>> = tarea?.result?.[0]?.items ?? [];

  const bloques = [...new Set(items.map((i) => String(i.type)).filter((t) => t !== "organic"))];

  // Las «otras preguntas» del SERP son literalmente lo que Google cree que el
  // usuario quiere saber. Van directas al contenido.
  const preguntasSerp: string[] = [];
  for (const i of items) {
    if (i.type === "people_also_ask") {
      for (const p of (i.items as Array<{ title?: string }>) ?? []) {
        if (p.title) preguntasSerp.push(p.title);
      }
    }
  }

  const organicos = items.filter((i) => i.type === "organic").slice(0, cuantos);

  const rivales = await Promise.all(
    organicos.map((i, n) =>
      radiografiar(String(i.url ?? ""), n + 1, String(i.title ?? ""), String(i.description ?? ""))
    )
  );

  const conTexto = rivales.filter((x) => x.palabras && x.palabras > 200);

  // La mediana y no la media: una página con diez mil palabras de comentarios
  // arrastraría la media y haría escribir de más sin motivo.
  const largos = conTexto.map((x) => x.palabras!).sort((a, b) => a - b);
  const palabrasObjetivo = largos.length
    ? Math.round(largos[Math.floor(largos.length / 2)] * 1.15)
    : null;

  return {
    consulta,
    ubicacion,
    rivales,
    bloques,
    preguntasSerp: [...new Set(preguntasSerp)].slice(0, 12),
    palabrasObjetivo,
    vocabulario: vocabulario(conTexto.map((x) => [x.titulo, x.h1 ?? "", ...x.encabezados].join(" "))),
    coste: typeof j?.cost === "number" ? j.cost : null,
  };
}
