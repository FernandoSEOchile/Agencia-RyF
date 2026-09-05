/**
 * Operaciones sobre los clientes conectados.
 *
 * Concentra aquí el descifrado del secreto para que ningún otro módulo tenga
 * que tocarlo: cuantos menos sitios manipulen la credencial en claro, menos
 * probabilidades de que acabe en un registro o en una respuesta por error.
 */
import "server-only";
import { db } from "@/lib/db";
import { descifrar } from "@/lib/cifrado";
import { llamar, salud, type Credencial, type Salud } from "@/lib/conector";
import { tiendaDe, salud as saludShopify } from "@/lib/shopify";

/** Devuelve las credenciales listas para firmar, descifrando el secreto. */
export async function credencialDe(clienteId: string): Promise<Credencial> {
  const c = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { urlRest: true, keyId: true, secreto: true, activo: true },
  });

  if (!c) throw new Error("Ese cliente no existe.");
  if (!c.activo) throw new Error("Ese cliente está desactivado.");

  return { urlRest: c.urlRest, keyId: c.keyId, secreto: descifrar(c.secreto) };
}

/** Llamada al conector de un cliente, por id. */
export async function api<T = unknown>(
  clienteId: string,
  metodo: "GET" | "POST",
  ruta: string,
  cuerpo?: unknown
) {
  return llamar<T>(await credencialDe(clienteId), metodo, ruta, cuerpo);
}

/**
 * Consulta el estado de un cliente y guarda la foto en la base.
 *
 * Guardarla permite pintar el panel al instante y refrescar después, en vez de
 * dejar la página en blanco esperando a que respondan todos los sitios.
 */
export async function sondear(clienteId: string) {
  const ficha = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { plataforma: true, tienda: true, secreto: true },
  });

  // Una tienda Shopify no lleva conector, así que preguntarle por /health era
  // pedirle una ruta que no existe sobre una URL vacía. De ahí venía el
  // «Failed to parse URL from /health» que llevaba días marcándola como caída.
  if (ficha?.plataforma === "shopify") {
    return sondearShopify(clienteId, ficha);
  }

  let r;
  try {
    r = await salud(await credencialDe(clienteId));
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "error";
    await db.cliente.update({
      where: { id: clienteId },
      data: { ultimaSonda: new Date(), estadoSonda: mensaje.slice(0, 120) },
    });
    return { ok: false as const, mensaje };
  }

  const datos = r.datos as Salud | null;

  await db.cliente.update({
    where: { id: clienteId },
    data: {
      ultimaSonda: new Date(),
      estadoSonda: r.ok ? "ok" : r.codigo || `HTTP ${r.estado}`,
      version: r.ok ? datos?.conector : undefined,
      soloLectura: r.ok ? datos?.solo_lectura : undefined,
    },
  });

  return r.ok
    ? { ok: true as const, salud: datos }
    : { ok: false as const, mensaje: r.mensaje || r.codigo || `HTTP ${r.estado}` };
}

/**
 * El equivalente para una tienda Shopify.
 *
 * Se guarda la versión de la API en el mismo campo donde WordPress guarda la
 * del conector: no es lo mismo, pero responde a la misma pregunta —«¿con qué
 * estoy hablando?»— y tener dos campos para eso obligaría a distinguir en cada
 * pantalla que lo pinta.
 */
async function sondearShopify(
  clienteId: string,
  ficha: { tienda: string | null; secreto: string }
) {
  try {
    const s = await saludShopify(tiendaDe(ficha));

    await db.cliente.update({
      where: { id: clienteId },
      data: {
        ultimaSonda: new Date(),
        estadoSonda: "ok",
        version: s.version,
        // Shopify no tiene interruptor de solo lectura: lo que se puede hacer
        // lo decide el alcance que autorizó la tienda al instalar la app.
        soloLectura: false,
      },
    });

    return { ok: true as const, salud: null };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "error";
    await db.cliente.update({
      where: { id: clienteId },
      data: { ultimaSonda: new Date(), estadoSonda: mensaje.slice(0, 120) },
    });
    return { ok: false as const, mensaje };
  }
}

/** ¿Este rol ve la cartera completa sin necesitar asignaciones? */
export function veTodo(rol: string) {
  return rol === "ADMIN" || rol === "GESTOR";
}

/** Clientes visibles para un usuario, según su rol y sus accesos. */
export async function clientesDe(usuarioId: string, rol: string) {
  if (veTodo(rol)) {
    return db.cliente.findMany({ orderBy: { nombre: "asc" } });
  }

  return db.cliente.findMany({
    where: { accesos: { some: { usuarioId } } },
    orderBy: { nombre: "asc" },
  });
}

/** Anota en el registro del panel quién hizo qué. */
/**
 * Lo que el asistente sabe de un sitio.
 *
 * Siempre filtrado por cliente. No hay una versión de esto sin `clienteId`, y
 * es deliberado: el aislamiento entre dominios no debe depender de que quien
 * llame se acuerde de filtrar.
 */
export async function memoriasDe(clienteId: string) {
  return db.memoria.findMany({
    where: { clienteId },
    orderBy: { tocado: "desc" },
    take: 60,
    select: { titulo: true, nota: true },
  });
}

export async function anotar(datos: {
  usuarioId?: string;
  clienteId?: string;
  accion: string;
  resumen: string;
  resultado?: string;
  detalle?: string;
}) {
  await db.registro.create({
    data: {
      accion: datos.accion,
      resumen: datos.resumen.slice(0, 500),
      resultado: datos.resultado ?? "ok",
      detalle: datos.detalle?.slice(0, 20000),
      usuarioId: datos.usuarioId,
      clienteId: datos.clienteId,
    },
  });
}
