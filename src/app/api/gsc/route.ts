import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { cuenta, propiedades, consultas } from "@/lib/gsc";

/**
 * Datos de Search Console para un cliente.
 *
 * Se piden desde el navegador al abrir la pestaña y no en el servidor al
 * pintar la ficha: Google tarda un par de segundos y no tiene sentido que eso
 * retrase también al que solo viene a escribir en el chat.
 */
export const runtime = "nodejs";

async function permiso(clienteId: string) {
  const sesion = await auth();
  if (!sesion?.user?.id) return { error: "Sesión no iniciada.", codigo: 401 as const };

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return { error: "Sin acceso a este cliente.", codigo: 403 as const };
  }

  const cliente = await db.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return { error: "Ese cliente no existe.", codigo: 404 as const };

  return { rol, cliente };
}

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const dias = Math.min(180, Math.max(7, Number(req.nextUrl.searchParams.get("dias")) || 28));

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const c = await cuenta();
  if (!c) {
    return Response.json({ configurado: false, correo: null, propiedades: [], propiedad: null, filas: [] });
  }

  // Siempre se devuelve la lista de propiedades: es lo que permite elegir la
  // correcta cuando el cliente todavía no tiene ninguna asignada, y detectar
  // que la asignada dejó de estar disponible.
  let disponibles: { url: string; permiso: string }[] = [];
  try {
    disponibles = await propiedades(c);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo hablar con Search Console." },
      { status: 502 }
    );
  }

  const propiedad = p.cliente.gscPropiedad;
  if (!propiedad) {
    return Response.json({
      configurado: true,
      correo: c.client_email,
      propiedades: disponibles,
      propiedad: null,
      filas: [],
    });
  }

  try {
    const filas = await consultas(c, propiedad, dias);
    return Response.json({
      configurado: true,
      correo: c.client_email,
      propiedades: disponibles,
      propiedad,
      dias,
      filas,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudieron leer los datos." },
      { status: 502 }
    );
  }
}

/** Asigna a este cliente cuál de las propiedades de Search Console le corresponde. */
export async function PUT(req: NextRequest) {
  const { clienteId, propiedad } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden cambiar esto." }, { status: 403 });
  }

  const valor = String(propiedad || "").trim();

  // Se comprueba contra la lista real en vez de aceptar cualquier texto: una
  // propiedad mal escrita daría un 403 confuso cada vez que alguien abra la
  // pestaña.
  if (valor) {
    const c = await cuenta();
    if (!c) return Response.json({ error: "Search Console no está configurado." }, { status: 400 });

    const disponibles = await propiedades(c);
    if (!disponibles.some((d) => d.url === valor)) {
      return Response.json(
        { error: "Esa propiedad no está entre las que tiene acceso la cuenta de servicio." },
        { status: 400 }
      );
    }
  }

  await db.cliente.update({
    where: { id: p.cliente.id },
    data: { gscPropiedad: valor || null },
  });

  return Response.json({ ok: true });
}
