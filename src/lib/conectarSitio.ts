"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cifrar } from "@/lib/cifrado";
import { leerCadena, dominioDe, salud } from "@/lib/conector";
import { anotar } from "@/lib/clientes";

/**
 * Conectar un WordPress con su cadena, o reconectarlo.
 *
 * Vivía dentro de la página de alta y solo se podía usar desde ahí: quien
 * acababa de regenerar la cadena estaba mirando la ficha del cliente y tenía
 * que irse a otra pantalla. Con «volver» se vuelve a la ficha con el aviso.
 * Si el dominio ya existe, se actualiza la credencial y no se pierde nada.
 */
export async function conectarSitio(datos: FormData) {
  const volver = String(datos.get("volver") || "");
  // Declarada como función y con `never` a la vista: así TypeScript entiende que
  // después de fallo() no se sigue, y no pide comprobar `cfg` otra vez.
  function fallo(msg: string): never {
    redirect(volver ? `${volver}?aviso=${encodeURIComponent(msg)}` : "/panel/clientes/nuevo?error=" + encodeURIComponent(msg));
  }

  const s = await auth();
  const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
  if (!s?.user?.id || (rolAccion !== "ADMIN" && rolAccion !== "GESTOR")) redirect("/entrar");

  const cadena = String(datos.get("cadena") || "");
  const nombre = String(datos.get("nombre") || "").trim();

  let cfg;
  try {
    cfg = leerCadena(cadena);
  } catch (e) {
    fallo((e as Error).message);
  }

  // Se comprueba contra el sitio ANTES de guardar. Un cliente que aparece en
  // la lista pero cuya credencial no sirve es peor que no tenerlo.
  const prueba = await salud({ urlRest: cfg.rest, keyId: cfg.key_id, secreto: cfg.secret });
  if (!prueba.ok) {
    fallo("El sitio no aceptó la credencial: " + (prueba.mensaje || prueba.codigo || `HTTP ${prueba.estado}`));
  }

  const dominio = dominioDe(cfg.site);

  const cliente = await db.cliente.upsert({
    where: { dominio },
    update: {
      // Un cliente dado de alta solo por dominio pasa a WordPress al pegar la cadena.
      plataforma: "wordpress",
      urlRest: cfg.rest,
      keyId: cfg.key_id,
      secreto: cifrar(cfg.secret),
      activo: true,
      version: prueba.datos?.conector,
      soloLectura: prueba.datos?.solo_lectura,
      ultimaSonda: new Date(),
      estadoSonda: "ok",
    },
    create: {
      nombre: nombre || dominio,
      dominio,
      plataforma: "wordpress",
      urlRest: cfg.rest,
      keyId: cfg.key_id,
      secreto: cifrar(cfg.secret),
      version: prueba.datos?.conector,
      soloLectura: prueba.datos?.solo_lectura,
      ultimaSonda: new Date(),
      estadoSonda: "ok",
    },
  });

  await anotar({
    usuarioId: s.user.id,
    clienteId: cliente.id,
    accion: "cliente_conectar",
    resumen: `${dominio} conectado · conector v${prueba.datos?.conector}`,
  });

  redirect(`/panel/clientes/${cliente.id}`);
}

/**
 * Dar de alta un cliente solo por su dominio, sin plugin ni Shopify.
 *
 * La mitad del panel no necesita conector: posiciones, Search Console, IA,
 * rastreo técnico, backlinks, SEO local, bitácora. Hasta ahora nada de eso se
 * podía usar sin instalar algo en el sitio del cliente, y eso dejaba fuera a
 * los prospectos y a los sitios que no son WordPress ni Shopify. El asistente
 * queda en solo lectura de lo público; pegar una cadena más adelante lo
 * convierte en un cliente completo sin perder nada.
 */
export async function crearSoloDominio(datos: FormData) {
  const s = await auth();
  const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
  if (!s?.user?.id || (rolAccion !== "ADMIN" && rolAccion !== "GESTOR")) redirect("/entrar");

  const nombre = String(datos.get("nombre") || "").trim().slice(0, 80);
  const dominio = String(datos.get("dominio") || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) {
    redirect("/panel/clientes/nuevo?error=" + encodeURIComponent("Escribe un dominio válido, como ejemplo.cl."));
  }

  const existente = await db.cliente.findUnique({ where: { dominio }, select: { id: true } });
  if (existente) redirect(`/panel/clientes/${existente.id}`);

  const cliente = await db.cliente.create({
    data: {
      nombre: nombre || dominio,
      dominio,
      plataforma: "dominio",
      secreto: "",
      soloLectura: true,
    },
  });

  await anotar({
    usuarioId: s.user.id,
    clienteId: cliente.id,
    accion: "cliente_dominio",
    resumen: `${dominio} dado de alta solo por dominio`,
  });

  redirect(`/panel/clientes/${cliente.id}`);
}
