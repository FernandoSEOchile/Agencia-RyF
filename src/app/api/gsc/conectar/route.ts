import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { aplicacion, crearEstado, urlAutorizacion } from "@/lib/gsc";

/** Manda al usuario a Google para que autorice el acceso a Search Console. */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";

  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (rol === "LECTOR") redirect(`/panel/clientes/${clienteId}`);

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) redirect("/panel");
  }

  const app = await aplicacion();
  if (!app) {
    redirect(
      `/panel/clientes/${clienteId}?error=` +
        encodeURIComponent("Search Console no está configurado en el panel. Avisa a un administrador.")
    );
  }

  redirect(urlAutorizacion(app, crearEstado(clienteId)));
}
