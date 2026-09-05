import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";

/**
 * Anotaciones a mano sobre los gráficos.
 *
 * Las marcas del Panorama salían solo del registro automático: lo que hizo
 * el asistente. Una migración, un core update de Google o un cambio de tema
 * hecho fuera del panel no se podían señalar, y son justo lo que explica un
 * salto en la curva.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function permiso(clienteId: string) {
  const sesion = await auth();
  if (!sesion?.user?.id) return { error: "Sesión no iniciada.", codigo: 401 as const };
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (rol === "LECTOR") return { error: "Los lectores no anotan.", codigo: 403 as const };

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return { error: "Sin acceso a este cliente.", codigo: 403 as const };
  }
  return { usuarioId: sesion.user.id };
}

export async function POST(req: NextRequest) {
  const { clienteId, fecha, texto } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const dia = new Date(String(fecha));
  const t = String(texto ?? "").trim().slice(0, 200);
  if (Number.isNaN(dia.getTime()) || !t) {
    return Response.json({ error: "Hace falta una fecha y un texto." }, { status: 400 });
  }

  const a = await db.anotacion.create({
    data: { clienteId: String(clienteId), fecha: dia, texto: t, usuarioId: p.usuarioId },
  });
  await anotar({ usuarioId: p.usuarioId, clienteId: String(clienteId), accion: "anotacion", resumen: `Anotado: ${t}` });

  return Response.json({ ok: true, anotacion: { id: a.id, fecha: a.fecha.toISOString().slice(0, 10), texto: a.texto } });
}

export async function DELETE(req: NextRequest) {
  const { clienteId, id } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  // Con clienteId en el where: nadie borra la anotación de otro cliente por id.
  await db.anotacion.deleteMany({ where: { id: String(id), clienteId: String(clienteId) } });
  return Response.json({ ok: true });
}
