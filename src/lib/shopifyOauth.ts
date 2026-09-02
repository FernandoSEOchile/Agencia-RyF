import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cifrar } from "@/lib/cifrado";

/**
 * Instalación de la app en una tienda Shopify.
 *
 * Shopify retiró las «apps personalizadas», donde el admin te enseñaba un
 * token para copiar. En el modelo nuevo el token se entrega UNA vez, durante
 * la instalación, a la URL declarada por la app. O la recibe el panel, o se
 * pierde.
 *
 * Eso obliga a que el panel sea el backend de la app, y de paso lo mejora:
 * el cliente pulsa instalar y queda conectado, sin copiar credenciales a mano.
 */

export const ALCANCES = "read_products,write_products,read_content,write_content,read_themes";

export interface AppShopify {
  id: string;
  secreto: string;
}

/** Las credenciales de la app viven en el entorno: son del producto, no de un cliente. */
export function appShopify(): AppShopify | null {
  const id = process.env.SHOPIFY_CLIENT_ID?.trim();
  const secreto = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!id || !secreto) return null;
  return { id, secreto };
}

function base(): string {
  return (process.env.NEXTAUTH_URL || process.env.APPSEO_URL || "").replace(/\/$/, "");
}

export const urlVuelta = () => `${base()}/api/shopify/callback`;

/** Solo dominios de Shopify: aceptar cualquiera sería abrir una redirección a donde sea. */
export function tiendaValida(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

/**
 * Comprueba que la petición viene de Shopify y no de cualquiera.
 *
 * Se firman todos los parámetros menos el propio hmac, ordenados. Sin esta
 * comprobación, cualquiera podría llamar a la vuelta con un «shop» inventado y
 * hacernos hablar con una tienda que no es.
 */
export function firmaValida(app: AppShopify, params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const partes: string[] = [];
  for (const [k, v] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (k === "hmac" || k === "signature") continue;
    partes.push(`${k}=${v}`);
  }

  const esperado = createHmac("sha256", app.secreto).update(partes.join("&")).digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Estado firmado, para reconocer la vuelta y saber quién la inició. */
export function crearEstado(usuarioId: string | null): string {
  return cifrar(JSON.stringify({ usuarioId, exp: Date.now() + 15 * 60_000 }));
}

export function urlAutorizacion(app: AppShopify, tienda: string, estado: string): string {
  const p = new URLSearchParams({
    client_id: app.id,
    scope: ALCANCES,
    redirect_uri: urlVuelta(),
    state: estado,
  });
  return `https://${tienda}/admin/oauth/authorize?${p}`;
}

/** Canjea el código por el token permanente de esa tienda. */
export async function canjear(app: AppShopify, tienda: string, codigo: string) {
  const r = await fetch(`https://${tienda}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: app.id, client_secret: app.secreto, code: codigo }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok || !j.access_token) {
    throw new Error(
      j.error_description || j.error || `Shopify no entregó el token (HTTP ${r.status}).`
    );
  }

  return { token: String(j.access_token), alcances: String(j.scope ?? "") };
}
