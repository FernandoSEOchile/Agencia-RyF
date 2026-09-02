import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { veTodo } from "@/lib/clientes";
import { resumenGlobal } from "@/lib/gasto";

/** El gasto de toda la agencia. Solo para quien ve la cartera entera. */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sesion = await auth();
  if (!sesion?.user?.id) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (!veTodo(rol)) {
    return Response.json({ error: "Solo la administración ve el gasto global." }, { status: 403 });
  }

  const desdeTxt = req.nextUrl.searchParams.get("desde");
  const hastaTxt = req.nextUrl.searchParams.get("hasta");

  const hasta = hastaTxt ? new Date(`${hastaTxt}T23:59:59`) : new Date();
  const desde = desdeTxt ? new Date(`${desdeTxt}T00:00:00`) : new Date(Date.now() - 28 * 86_400_000);

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return Response.json({ error: "Fechas no válidas." }, { status: 400 });
  }

  return Response.json(await resumenGlobal(desde, hasta));
}
