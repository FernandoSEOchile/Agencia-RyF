import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, veTodo, anotar } from "@/lib/clientes";

/**
 * Pide a un sitio que se ponga al día con el conector publicado.
 *
 * El panel no empuja el paquete: le dice al sitio que mire ahora en vez de
 * esperar a que caduque su caché, y es el sitio quien decide si lo instala.
 * Esa dirección importa —el sitio pregunta, el panel contesta— porque un panel
 * comprometido no debe poder meter código en la cartera entera.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const sesion = await auth();
  if (!sesion?.user?.id) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  // Un LECTOR mira; instalar un plugin en el sitio de un cliente no es mirar.
  if (rol === "LECTOR") {
    return Response.json({ error: "No tienes permiso para actualizar sitios." }, { status: 403 });
  }

  const { clienteId } = (await req.json().catch(() => ({}))) as { clienteId?: string };
  if (!clienteId) return Response.json({ error: "Falta el cliente." }, { status: 400 });

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso a este cliente." }, { status: 403 });
  }

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { nombre: true, plataforma: true },
  });
  if (!cliente) return Response.json({ error: "Ese cliente no existe." }, { status: 404 });

  if (cliente.plataforma === "shopify") {
    return Response.json(
      { error: "Las tiendas Shopify no llevan conector: se autorizan desde fuera." },
      { status: 409 }
    );
  }

  const r = await api<{
    instalada: string;
    disponible: string;
    actualizado: boolean;
    motivo: string;
    aviso?: string;
  }>(clienteId, "POST", "/actualizar");

  if (!r.ok) {
    // Un 404 aquí casi nunca es un fallo: es un sitio con un conector anterior
    // a esta ruta. Decir «no encontrado» mandaría a buscar el problema donde
    // no está, así que se nombra la causa real.
    const mensaje =
      r.estado === 404
        ? "Este sitio lleva una versión del conector anterior al botón. Actualízalo una vez desde su escritorio y a partir de ahí funcionará desde aquí."
        : r.mensaje || r.codigo || `El sitio respondió ${r.estado}.`;

    return Response.json({ error: mensaje }, { status: 502 });
  }

  const d = r.datos;

  if (d?.actualizado) {
    await anotar({
      usuarioId: sesion.user.id,
      clienteId,
      accion: "conector_actualizar",
      resumen: `${cliente.nombre} · v${d.instalada} → v${d.disponible}`,
    });
  }

  return Response.json(d);
}
