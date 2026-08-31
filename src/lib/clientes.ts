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

/** Clientes visibles para un usuario, según su rol y sus accesos. */
export async function clientesDe(usuarioId: string, rol: string) {
  if (rol === "ADMIN") {
    return db.cliente.findMany({ orderBy: { nombre: "asc" } });
  }

  return db.cliente.findMany({
    where: { accesos: { some: { usuarioId } } },
    orderBy: { nombre: "asc" },
  });
}

/** Anota en el registro del panel quién hizo qué. */
export async function anotar(datos: {
  usuarioId?: string;
  clienteId?: string;
  accion: string;
  resumen: string;
  resultado?: string;
}) {
  await db.registro.create({
    data: {
      accion: datos.accion,
      resumen: datos.resumen.slice(0, 500),
      resultado: datos.resultado ?? "ok",
      usuarioId: datos.usuarioId,
      clienteId: datos.clienteId,
    },
  });
}
