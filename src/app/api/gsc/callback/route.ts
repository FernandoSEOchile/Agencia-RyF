import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { anotar } from "@/lib/clientes";
import { aplicacion, leerEstado, canjear, guardarConexion } from "@/lib/gsc";

/** Vuelta desde Google tras autorizar. */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const codigo = params.get("code");
  const estado = params.get("estado") || params.get("state");
  const rechazo = params.get("error");

  const destino = (clienteId: string, q: string) =>
    clienteId ? `/panel/clientes/${clienteId}?${q}` : `/panel?${q}`;

  const datos = estado ? leerEstado(estado) : null;
  const clienteId = datos?.clienteId ?? "";

  if (rechazo) {
    redirect(destino(clienteId, "error=" + encodeURIComponent("Autorización cancelada.")));
  }

  // Sin estado válido no se sabe a qué ficha volver, y podría ser una vuelta
  // provocada desde fuera: se corta sin tocar nada.
  if (!datos || !codigo) {
    redirect(destino("", "error=" + encodeURIComponent("La autorización caducó. Vuelve a intentarlo.")));
  }

  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const app = await aplicacion();
  if (!app) {
    redirect(destino(clienteId, "error=" + encodeURIComponent("Search Console no está configurado.")));
  }

  let conexionId: string;
  let correo: string;

  try {
    const r = await canjear(app, codigo);
    correo = r.correo;
    const conexion = await guardarConexion(r.correo, r.refresco, sesion.user.id);
    conexionId = conexion.id;
  } catch (e) {
    redirect(
      destino(
        clienteId,
        "error=" + encodeURIComponent(e instanceof Error ? e.message : "No se pudo completar la conexión.")
      )
    );
  }

  // La ficha queda apuntando a la cuenta recién autorizada. La propiedad
  // concreta se elige después, cuando ya sabemos cuáles ve esa cuenta.
  await db.cliente.update({ where: { id: clienteId }, data: { gscConexionId: conexionId } });

  await anotar({
    usuarioId: sesion.user.id,
    clienteId,
    accion: "search console",
    resumen: `Cuenta de Google conectada: ${correo}`,
  });

  redirect(destino(clienteId, "ok=" + encodeURIComponent(`Conectado como ${correo}.`)));
}
