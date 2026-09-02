import "server-only";
import { descifrar } from "@/lib/cifrado";

/**
 * Adaptador de Shopify.
 *
 * A diferencia de WordPress, aquí no hay plugin que instalar: Shopify no lo
 * permite. El dueño de la tienda autoriza la app desde fuera y Shopify entrega
 * un token con el que el panel habla con la API de administración.
 *
 * Se usa GraphQL y no REST porque Shopify está retirando REST, y porque en una
 * sola petición se traen producto, SEO y colecciones —con REST harían falta
 * tres, y su límite de llamadas es estrecho.
 */

/** Versión de la API. Shopify obliga a fijarla y a subirla cada cierto tiempo. */
const VERSION = "2026-07";

export interface Tienda {
  dominio: string;
  token: string;
}

export interface ProductoShopify {
  id: string;
  titulo: string;
  handle: string;
  estado: string;
  descripcionHtml: string | null;
  seoTitulo: string | null;
  seoDescripcion: string | null;
  url: string;
}

export interface ColeccionShopify {
  id: string;
  titulo: string;
  handle: string;
  productos: number;
  descripcionHtml: string | null;
  seoTitulo: string | null;
  seoDescripcion: string | null;
  url: string;
}

/** Descifra lo guardado y deja la tienda lista para llamar. */
export function tiendaDe(cliente: { tienda: string | null; secreto: string }): Tienda {
  if (!cliente.tienda) throw new Error("A este cliente le falta el dominio de la tienda.");
  return { dominio: cliente.tienda, token: descifrar(cliente.secreto) };
}

interface RespuestaGraphQL<T> {
  data?: T;
  errors?: { message: string }[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number } } };
}

/**
 * Una consulta a la API de administración.
 *
 * Shopify devuelve 200 con los errores dentro del cuerpo, así que mirar solo
 * el código HTTP daría por buena una petición que falló. Y sus errores de
 * usuario van en otro sitio distinto de los de sintaxis, por eso se revisan
 * los dos.
 */
export async function consultar<T>(
  t: Tienda,
  consulta: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const r = await fetch(`https://${t.dominio}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": t.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: consulta, variables }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });

  if (r.status === 401 || r.status === 403) {
    throw new Error("Shopify rechazó el token. Revisa que la app siga instalada y tenga los permisos.");
  }
  if (r.status === 429) {
    throw new Error("Shopify pidió esperar: demasiadas peticiones seguidas. Prueba en unos segundos.");
  }
  if (!r.ok) throw new Error(`Shopify respondió ${r.status}.`);

  const j = (await r.json()) as RespuestaGraphQL<T>;

  if (j.errors?.length) throw new Error(`Shopify: ${j.errors.map((e) => e.message).join(" · ")}`);
  if (!j.data) throw new Error("Shopify no devolvió datos.");

  return j.data;
}

/** Los errores de negocio de Shopify viajan aparte de los de sintaxis. */
function comprobarErrores(x: unknown) {
  const e = (x as { userErrors?: { field?: string[]; message: string }[] })?.userErrors;
  if (e?.length) {
    throw new Error(e.map((u) => `${u.field?.join(".") ?? ""} ${u.message}`.trim()).join(" · "));
  }
}

/** Comprueba el token y devuelve de qué tienda es. */
export async function salud(t: Tienda) {
  const d = await consultar<{
    shop: { name: string; myshopifyDomain: string; primaryDomain: { url: string }; currencyCode: string };
  }>(
    t,
    `{ shop { name myshopifyDomain primaryDomain { url } currencyCode } }`
  );

  return {
    nombre: d.shop.name,
    tienda: d.shop.myshopifyDomain,
    url: d.shop.primaryDomain.url,
    moneda: d.shop.currencyCode,
    version: VERSION,
  };
}

const CAMPOS_PRODUCTO = `
  id
  title
  handle
  status
  descriptionHtml
  seo { title description }
`;

export async function listarProductos(
  t: Tienda,
  opciones: { buscar?: string; limite?: number; cursor?: string } = {}
) {
  const d = await consultar<{
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Record<string, unknown>[];
    };
  }>(
    t,
    `query($n: Int!, $q: String, $desde: String) {
       products(first: $n, query: $q, after: $desde, sortKey: UPDATED_AT, reverse: true) {
         pageInfo { hasNextPage endCursor }
         nodes { ${CAMPOS_PRODUCTO} }
       }
     }`,
    { n: Math.min(opciones.limite ?? 25, 100), q: opciones.buscar || null, desde: opciones.cursor || null }
  );

  return {
    hayMas: d.products.pageInfo.hasNextPage,
    cursor: d.products.pageInfo.endCursor,
    productos: d.products.nodes.map((p) => normalizarProducto(p, t.dominio)),
  };
}

function normalizarProducto(p: Record<string, unknown>, dominio: string): ProductoShopify {
  const seo = (p.seo ?? {}) as { title?: string; description?: string };
  return {
    id: String(p.id ?? ""),
    titulo: String(p.title ?? ""),
    handle: String(p.handle ?? ""),
    estado: String(p.status ?? ""),
    descripcionHtml: (p.descriptionHtml as string) || null,
    seoTitulo: seo.title || null,
    seoDescripcion: seo.description || null,
    url: `https://${dominio}/products/${p.handle}`,
  };
}

export async function leerProducto(t: Tienda, id: string) {
  const d = await consultar<{ product: Record<string, unknown> | null }>(
    t,
    `query($id: ID!) { product(id: $id) { ${CAMPOS_PRODUCTO} } }`,
    { id }
  );
  if (!d.product) throw new Error("No existe ese producto.");
  return normalizarProducto(d.product, t.dominio);
}

/**
 * Escribe un producto y devuelve cómo estaba antes.
 *
 * Lo anterior se lee primero a propósito: es lo que permite deshacer, y sin
 * eso dejar que un modelo escriba en la tienda de un cliente sería temerario.
 */
export async function escribirProducto(
  t: Tienda,
  id: string,
  cambios: { descripcionHtml?: string; seoTitulo?: string; seoDescripcion?: string }
) {
  const antes = await leerProducto(t, id);

  const entrada: Record<string, unknown> = { id };
  if (cambios.descripcionHtml !== undefined) entrada.descriptionHtml = cambios.descripcionHtml;
  if (cambios.seoTitulo !== undefined || cambios.seoDescripcion !== undefined) {
    entrada.seo = {
      ...(cambios.seoTitulo !== undefined ? { title: cambios.seoTitulo } : {}),
      ...(cambios.seoDescripcion !== undefined ? { description: cambios.seoDescripcion } : {}),
    };
  }

  const d = await consultar<{ productUpdate: { product: Record<string, unknown> | null; userErrors: unknown[] } }>(
    t,
    `mutation($p: ProductInput!) {
       productUpdate(product: $p) {
         product { ${CAMPOS_PRODUCTO} }
         userErrors { field message }
       }
     }`,
    { p: entrada }
  );

  comprobarErrores(d.productUpdate);
  if (!d.productUpdate.product) throw new Error("Shopify no devolvió el producto actualizado.");

  return { antes, despues: normalizarProducto(d.productUpdate.product, t.dominio) };
}

const CAMPOS_COLECCION = `
  id
  title
  handle
  descriptionHtml
  seo { title description }
  productsCount { count }
`;

function normalizarColeccion(c: Record<string, unknown>, dominio: string): ColeccionShopify {
  const seo = (c.seo ?? {}) as { title?: string; description?: string };
  const cuenta = (c.productsCount ?? {}) as { count?: number };
  return {
    id: String(c.id ?? ""),
    titulo: String(c.title ?? ""),
    handle: String(c.handle ?? ""),
    productos: cuenta.count ?? 0,
    descripcionHtml: (c.descriptionHtml as string) || null,
    seoTitulo: seo.title || null,
    seoDescripcion: seo.description || null,
    url: `https://${dominio}/collections/${c.handle}`,
  };
}

/** Las colecciones de Shopify son lo que en WooCommerce son las categorías. */
export async function listarColecciones(t: Tienda, limite = 100) {
  const d = await consultar<{ collections: { nodes: Record<string, unknown>[] } }>(
    t,
    `query($n: Int!) { collections(first: $n, sortKey: TITLE) { nodes { ${CAMPOS_COLECCION} } } }`,
    { n: Math.min(limite, 250) }
  );

  return d.collections.nodes.map((c) => normalizarColeccion(c, t.dominio));
}

export async function escribirColeccion(
  t: Tienda,
  id: string,
  cambios: { descripcionHtml?: string; seoTitulo?: string; seoDescripcion?: string }
) {
  const previa = await consultar<{ collection: Record<string, unknown> | null }>(
    t,
    `query($id: ID!) { collection(id: $id) { ${CAMPOS_COLECCION} } }`,
    { id }
  );
  if (!previa.collection) throw new Error("No existe esa colección.");

  const entrada: Record<string, unknown> = { id };
  if (cambios.descripcionHtml !== undefined) entrada.descriptionHtml = cambios.descripcionHtml;
  if (cambios.seoTitulo !== undefined || cambios.seoDescripcion !== undefined) {
    entrada.seo = {
      ...(cambios.seoTitulo !== undefined ? { title: cambios.seoTitulo } : {}),
      ...(cambios.seoDescripcion !== undefined ? { description: cambios.seoDescripcion } : {}),
    };
  }

  const d = await consultar<{
    collectionUpdate: { collection: Record<string, unknown> | null; userErrors: unknown[] };
  }>(
    t,
    `mutation($c: CollectionInput!) {
       collectionUpdate(input: $c) {
         collection { ${CAMPOS_COLECCION} }
         userErrors { field message }
       }
     }`,
    { c: entrada }
  );

  comprobarErrores(d.collectionUpdate);
  if (!d.collectionUpdate.collection) throw new Error("Shopify no devolvió la colección actualizada.");

  return {
    antes: normalizarColeccion(previa.collection, t.dominio),
    despues: normalizarColeccion(d.collectionUpdate.collection, t.dominio),
  };
}
