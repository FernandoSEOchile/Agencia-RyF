import "server-only";
import { api } from "@/lib/clientes";
import { normalizar, parecido } from "@/lib/ast";

/**
 * Cotejo de la arquitectura contra lo que existe en el sitio.
 *
 * Va en dos pasos y ese orden importa: primero el cruce determinista por slug
 * y por nombre, que es instantáneo y gratis y resuelve la mayor parte; solo lo
 * que quede dudoso se lleva a la IA. Al revés sería pagar por comparar textos
 * idénticos.
 */

export interface Candidato {
  id: number;
  nombre: string;
  url: string;
  slug: string;
  tipo: "product_cat" | "page" | "post";
}

export interface Veredicto {
  estado: "creada" | "dudosa" | "falta";
  urlDestino: string | null;
  objetoId: number | null;
  tipoObjeto: string | null;
  confianza: number;
  comoSeCotejo: "slug" | "nombre" | null;
  nota: string | null;
}

/** Extrae el último segmento de una URL, que es lo comparable con un slug. */
function segmento(url: string): string {
  try {
    const partes = new URL(url).pathname.split("/").filter(Boolean);
    return partes[partes.length - 1] ?? "";
  } catch {
    return "";
  }
}

/**
 * Trae todo lo que puede corresponder a una sección de la arquitectura.
 *
 * Se piden categorías, páginas y entradas: una sección transaccional casi
 * siempre es una categoría, pero en muchos sitios está resuelta como página
 * de aterrizaje, y darla por inexistente sería falso.
 */
export async function candidatosDe(clienteId: string): Promise<Candidato[]> {
  const [terminos, contenido] = await Promise.all([
    api<{ terminos: { id: number; nombre: string; slug: string; url: string }[] }>(
      clienteId,
      "GET",
      "/terms?taxonomia=product_cat"
    ).catch(() => null),
    api<{ content: { id: number; titulo: string; url: string; tipo: string; estado: string }[] }>(
      clienteId,
      "GET",
      "/audit?por_pagina=300"
    ).catch(() => null),
  ]);

  const lista: Candidato[] = [];

  for (const t of terminos?.datos?.terminos ?? []) {
    lista.push({ id: t.id, nombre: t.nombre, url: t.url, slug: t.slug, tipo: "product_cat" });
  }

  for (const c of contenido?.datos?.content ?? []) {
    // Los borradores no cuentan como sección creada: no existen para nadie
    // salvo para quien entra al escritorio.
    if (c.estado !== "publish") continue;
    if (c.tipo !== "page" && c.tipo !== "post") continue;
    lista.push({
      id: c.id,
      nombre: c.titulo,
      url: c.url,
      slug: segmento(c.url),
      tipo: c.tipo,
    });
  }

  return lista;
}

/**
 * Decide si una sección de la arquitectura existe en el sitio.
 *
 * Devuelve «dudosa» a propósito cuando el parecido es alto pero no concluyente:
 * forzar cada sección a creada o falta convertiría en «falta» cosas que existen
 * con otro nombre, y en «creada» coincidencias que no lo son.
 */
export function cotejar(
  slug: string,
  nombre: string,
  candidatos: Candidato[]
): Veredicto & { alternativas: Candidato[] } {
  const objetivo = slug.replace(/^\//, "").replace(/\/$/, "");
  const ultimoTramo = objetivo.split("/").filter(Boolean).pop() ?? objetivo;

  // 1 · Slug idéntico. Es la señal más fuerte que hay.
  const porSlug = candidatos.find((c) => c.slug && c.slug === ultimoTramo);
  if (porSlug) {
    return {
      estado: "creada",
      urlDestino: porSlug.url,
      objetoId: porSlug.id,
      tipoObjeto: porSlug.tipo,
      confianza: 100,
      comoSeCotejo: "slug",
      nota: null,
      alternativas: [],
    };
  }

  // 2 · Parecido por nombre, sobre el nombre de la sección y sobre su slug.
  const puntuados = candidatos
    .map((c) => ({
      c,
      punto: Math.max(
        parecido(nombre, c.nombre),
        parecido(ultimoTramo.replace(/-/g, " "), c.nombre),
        parecido(ultimoTramo, c.slug.replace(/-/g, " "))
      ),
    }))
    .filter((x) => x.punto > 0.4)
    .sort((a, b) => b.punto - a.punto);

  const mejor = puntuados[0];

  if (mejor && mejor.punto >= 0.85) {
    return {
      estado: "creada",
      urlDestino: mejor.c.url,
      objetoId: mejor.c.id,
      tipoObjeto: mejor.c.tipo,
      confianza: Math.round(mejor.punto * 100),
      comoSeCotejo: "nombre",
      nota: `Coincide por nombre con «${mejor.c.nombre}», no por slug.`,
      alternativas: [],
    };
  }

  if (mejor) {
    return {
      estado: "dudosa",
      urlDestino: mejor.c.url,
      objetoId: mejor.c.id,
      tipoObjeto: mejor.c.tipo,
      confianza: Math.round(mejor.punto * 100),
      comoSeCotejo: "nombre",
      nota: `Se parece a «${mejor.c.nombre}», pero no lo suficiente para darlo por hecho.`,
      alternativas: puntuados.slice(0, 4).map((x) => x.c),
    };
  }

  return {
    estado: "falta",
    urlDestino: null,
    objetoId: null,
    tipoObjeto: null,
    confianza: 0,
    comoSeCotejo: null,
    nota: null,
    alternativas: [],
  };
}

/** Resumen de un cotejo, para la cabecera de la pantalla. */
export function resumir(estados: string[]) {
  const cuenta = (e: string) => estados.filter((x) => x === e).length;
  return {
    total: estados.length,
    creadas: cuenta("creada"),
    dudosas: cuenta("dudosa"),
    faltan: cuenta("falta"),
  };
}

/** Normalizador expuesto para que la interfaz muestre lo mismo que se comparó. */
export { normalizar };
