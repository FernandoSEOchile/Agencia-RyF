import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { porMes } from "@/lib/tramos";

/**
 * La curva mensual de Search Console: cuántas consultas hay en cada tramo de
 * posición, mes a mes, para el último año.
 *
 * Va en su propia ruta y no dentro de /api/gsc porque la primera vez puede
 * tardar —cada mes que no esté guardado es una llamada a Google— y la tabla
 * de consultas no tiene por qué esperar a la curva.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";

  const sesion = await auth();
  if (!sesion?.user?.id) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso a este cliente." }, { status: 403 });
  }

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { gscConexionId: true, gscPropiedad: true },
  });
  if (!cliente) return Response.json({ error: "Ese cliente no existe." }, { status: 404 });
  if (!cliente.gscConexionId || !cliente.gscPropiedad) return Response.json({ meses: [] });

  try {
    const meses = await porMes(clienteId, cliente.gscConexionId, cliente.gscPropiedad, 365);
    return Response.json({ meses });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo leer Search Console." }, { status: 502 });
  }
}
