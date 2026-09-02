import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { resumenGasto } from "@/lib/gasto";

/** Lo que costó operar un cliente en un periodo. */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const desdeTxt = req.nextUrl.searchParams.get("desde");
  const hastaTxt = req.nextUrl.searchParams.get("hasta");

  const sesion = await auth();
  if (!sesion?.user?.id) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso a este cliente." }, { status: 403 });
  }

  // Por defecto, los últimos 28 días: el mismo periodo que usa Search Console,
  // para poder comparar gasto y resultado sin traducir fechas.
  const hasta = hastaTxt ? new Date(`${hastaTxt}T23:59:59`) : new Date();
  const desde = desdeTxt
    ? new Date(`${desdeTxt}T00:00:00`)
    : new Date(Date.now() - 28 * 86_400_000);

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return Response.json({ error: "Fechas no válidas." }, { status: 400 });
  }

  const resumen = await resumenGasto(clienteId, desde, hasta);

  return Response.json({
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
    ...resumen,
  });
}
