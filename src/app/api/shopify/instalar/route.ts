import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { appShopify, tiendaValida, crearEstado, urlAutorizacion } from "@/lib/shopifyOauth";

/**
 * Entrada de la instalación.
 *
 * Aquí llega tanto quien pulsa «conectar» desde el panel como la propia
 * Shopify cuando alguien instala la app desde su admin. En los dos casos el
 * único dato imprescindible es qué tienda es.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tienda = (req.nextUrl.searchParams.get("shop") || "").toLowerCase().trim();

  const app = appShopify();
  if (!app) {
    redirect("/panel?error=" + encodeURIComponent("Shopify no está configurado en el servidor."));
  }

  if (!tiendaValida(tienda)) {
    redirect(
      "/panel/clientes/nuevo?error=" +
        encodeURIComponent("Falta el dominio de la tienda, o no es un .myshopify.com válido.")
    );
  }

  // La sesión puede no existir si la instalación arranca desde Shopify. No es
  // motivo para cortarla: se guarda quién fue si se sabe, y si no, la tienda
  // queda conectada igual.
  const sesion = await auth();

  redirect(urlAutorizacion(app, tienda, crearEstado(sesion?.user?.id ?? null)));
}
