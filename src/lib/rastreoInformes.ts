import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Qué se considera un problema en un rastreo, y cuántas páginas lo tienen.
 *
 * Vivía dentro de la ruta del rastreo. Está aparte para que el asistente
 * pueda leer el mismo diagnóstico que ve la persona: antes, desde Técnico se
 * veía el problema y el asistente ni siquiera sabía que había un rastreo.
 */
export const PROPIA: Prisma.PaginaWhereInput = { estado: { lt: 400 }, destino: null };

/**
 * Qué se considera un problema, en un solo sitio.
 *
 * Los contadores y las listas salen de aquí para que no puedan discrepar: si el
 * cuadro dice 40 y la lista enseña 37, nadie vuelve a fiarse de la pantalla.
 *
 * Los umbrales no son caprichosos: 300 palabras es el mínimo por debajo del
 * cual una página rara vez tiene bastante que decir para competir por nada, y
 * tres clics es donde Google empieza a repartir bastante menos autoridad.
 */
export const FILTROS: Record<string, Prisma.PaginaWhereInput> = {
  rotas: { OR: [{ estado: { gte: 400 } }, { estado: null }] },
  noIndexables: { noindex: true, destino: null },
  huerfanas: { ...PROPIA, entrantes: 0 },
  redirigidas: { destino: { not: null } },
  sinTitulo: { ...PROPIA, titulo: null },
  sinDescripcion: { ...PROPIA, descripcion: null },
  sinH1: { ...PROPIA, h1s: 0 },
  variosH1: { ...PROPIA, h1s: { gt: 1 } },
  contenidoPobre: { ...PROPIA, palabras: { lt: 300, gt: 0 } },
  sinEnlacesSalientes: { ...PROPIA, enlacesInternos: 0 },
  sinDatos: { ...PROPIA, tipos: "[]" },
  datosRotos: { ...PROPIA, ldRoto: true },
  canonicalAjeno: { ...PROPIA, canonical: { not: null } },
  sinCanonical: { ...PROPIA, canonical: null },
  profundas: { ...PROPIA, profundidad: { gt: 3 } },
  sinLang: { ...PROPIA, lang: null },
  sinViewport: { ...PROPIA, viewport: false },
  // El tiempo sí es suyo aunque redirija: lo que tardó, tardó.
  lentas: { ms: { gte: 3000 } },
  sinAlt: { ...PROPIA, imagenesSinAlt: { gt: 0 } },
};

/**
 * Si Google puede indexar esta página, y por qué no cuando no puede.
 *
 * Se decide aquí y no en la pantalla porque son cuatro razones distintas que
 * conviene no repetir en dos sitios: una URL que redirige no se indexa ella
 * —se indexa su destino—, y una que apunta su canonical a otra tampoco, aunque
 * responda 200 y se vea perfecta. Esas dos son las que más despistan.
 *
 * No mira el robots.txt: eso bloquea el rastreo, no la indexación, y sus reglas
 * son del sitio entero. Sale aparte, en el aviso de arriba.
 */

/** Cuántas páginas tiene cada problema en un rastreo terminado. */
export async function problemasDe(rastreoId: string): Promise<Record<string, number>> {
  const de = { rastreoId };
  const claves = Object.keys(FILTROS) as (keyof typeof FILTROS)[];

  const cuentas = await Promise.all(
    claves.map((k) => db.pagina.count({ where: { ...de, ...FILTROS[k] } }))
  );

  const problemas: Record<string, number> = {};
  claves.forEach((k, i) => (problemas[k] = cuentas[i]));

  const [titulos, descripciones] = await Promise.all([
    db.pagina.groupBy({
      by: ["titulo"],
      where: { ...de, ...PROPIA, titulo: { not: null } },
      _count: { titulo: true },
      having: { titulo: { _count: { gt: 1 } } },
    }),
    db.pagina.groupBy({
      by: ["descripcion"],
      where: { ...de, ...PROPIA, descripcion: { not: null } },
      _count: { descripcion: true },
      having: { descripcion: { _count: { gt: 1 } } },
    }),
  ]);

  const conCanonical = await db.pagina.findMany({
    where: { ...de, ...PROPIA, canonical: { not: null } },
    select: { url: true, canonical: true },
  });

  const mismaPagina = (a: string, b: string) => {
    const l = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
    return l(a) === l(b);
  };

  problemas.canonicalAjeno = conCanonical.filter((x) => x.canonical && !mismaPagina(x.url, x.canonical)).length;
  problemas.tituloRepetido = titulos.reduce((t, r) => t + r._count.titulo, 0);
  problemas.descripcionRepetida = descripciones.reduce((t, r) => t + r._count.descripcion, 0);

  const hayGrafo = await db.enlace.findFirst({ where: { rastreoId }, select: { id: true } });
  if (!hayGrafo) delete problemas.huerfanas;

  return problemas;
}

/** Las páginas de un problema, para que el asistente sepa por dónde empezar. */
export async function paginasDe(rastreoId: string, problema: string, cuantas = 20) {
  const donde = FILTROS[problema];
  if (!donde) return [];
  return db.pagina.findMany({
    where: { rastreoId, ...donde },
    orderBy: { url: "asc" },
    take: cuantas,
    select: { url: true, estado: true, titulo: true, palabras: true, imagenesSinAlt: true },
  });
}
