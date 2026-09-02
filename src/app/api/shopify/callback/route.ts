import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";
import { anotar } from "@/lib/clientes";
import { appShopify, tiendaValida, firmaValida, canjear } from "@/lib/shopifyOauth";
import { salud } from "@/lib/shopify";
import { dominioDe } from "@/lib/conector";

/** Vuelta de Shopify con el código. Aquí se recibe el token y se guarda. */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tienda = (params.get("shop") || "").toLowerCase().trim();
  const codigo = params.get("code");
  const estado = params.get("state");

  const fallar = (m: string) =>
    redirect("/panel/clientes/nuevo?error=" + encodeURIComponent(m));

  const app = appShopify();
  if (!app) fallar("Shopify no está configurado en el servidor.");
  if (!tiendaValida(tienda) || !codigo) fallar("La vuelta de Shopify llegó incompleta.");

  // Sin firma válida no se sigue: sin esta comprobación cualquiera podría
  // llamar aquí con una tienda inventada.
  if (!firmaValida(app!, params)) {
    console.error("[shopify] firma inválida en la vuelta", tienda);
    fallar("La firma de Shopify no cuadra. No se conectó nada.");
  }

  let usuarioId: string | null = null;
  try {
    if (estado) usuarioId = JSON.parse(descifrar(estado)).usuarioId ?? null;
  } catch {
    /* el estado es una comodidad, no una credencial: si no se puede leer, se sigue */
  }

  let token: string;
  try {
    token = (await canjear(app!, tienda, codigo!)).token;
  } catch (e) {
    console.error("[shopify] falló el canje:", e);
    fallar(e instanceof Error ? e.message : "Shopify no entregó el token.");
  }

  let info;
  try {
    info = await salud({ dominio: tienda, token: token! });
  } catch (e) {
    fallar(e instanceof Error ? e.message : "El token llegó pero la tienda no respondió.");
  }

  // El dominio público es el que ve Google y con el que se cotejan las URLs;
  // el .myshopify.com es solo la puerta de la API.
  const publico = dominioDe(info!.url);

  const cliente = await db.cliente.upsert({
    where: { dominio: publico },
    update: {
      plataforma: "shopify",
      tienda,
      secreto: cifrar(token!),
      activo: true,
      version: info!.version,
      soloLectura: false,
      ultimaSonda: new Date(),
      estadoSonda: "ok",
    },
    create: {
      nombre: info!.nombre || publico,
      dominio: publico,
      plataforma: "shopify",
      tienda,
      secreto: cifrar(token!),
      version: info!.version,
      soloLectura: false,
      ultimaSonda: new Date(),
      estadoSonda: "ok",
    },
  });

  await anotar({
    usuarioId: usuarioId ?? undefined,
    clienteId: cliente.id,
    accion: "cliente_conectar",
    resumen: `${publico} conectado · Shopify (${tienda})`,
  });

  redirect(`/panel/clientes/${cliente.id}?ok=` + encodeURIComponent(`${info!.nombre} conectada.`));
}
