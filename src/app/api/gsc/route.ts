import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { aplicacion, propiedades, consultas } from "@/lib/gsc";

/**
 * Datos de Search Console para un cliente.
 *
 * Se piden desde el navegador al abrir la pestaña y no al pintar la ficha:
 * Google tarda un par de segundos y no tiene sentido que eso retrase también
 * al que solo viene a escribir en el chat.
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

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    include: { gscConexion: true },
  });
  if (!cliente) return { error: "Ese cliente no existe.", codigo: 404 as const };

  return { rol, cliente };
}

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const dias = Math.min(180, Math.max(7, Number(req.nextUrl.searchParams.get("dias")) || 28));

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const app = await aplicacion();

  // Las cuentas ya autorizadas se ofrecen siempre: quien gestiona diez sitios
  // bajo la misma cuenta de Google no debería pasar por Google diez veces.
  const cuentas = await db.conexionGoogle.findMany({
    select: { id: true, correo: true },
    orderBy: { creado: "asc" },
  });

  const base = {
    configurado: Boolean(app),
    cuentas,
    conexion: p.cliente.gscConexion
      ? { id: p.cliente.gscConexion.id, correo: p.cliente.gscConexion.correo }
      : null,
    propiedad: p.cliente.gscPropiedad,
  };

  if (!app || !p.cliente.gscConexionId) {
    return Response.json({ ...base, propiedades: [], filas: [] });
  }

  let disponibles;
  try {
    disponibles = await propiedades(p.cliente.gscConexionId);
  } catch (e) {
    return Response.json(
      { ...base, propiedades: [], filas: [], error: e instanceof Error ? e.message : "Error con Google." },
      { status: 502 }
    );
  }

  if (!p.cliente.gscPropiedad) {
    return Response.json({ ...base, propiedades: disponibles, filas: [] });
  }

  try {
    const filas = await consultas(p.cliente.gscConexionId, p.cliente.gscPropiedad, dias);
    return Response.json({ ...base, propiedades: disponibles, dias, filas });
  } catch (e) {
    return Response.json(
      {
        ...base,
        propiedades: disponibles,
        filas: [],
        error: e instanceof Error ? e.message : "No se pudieron leer los datos.",
      },
      { status: 502 }
    );
  }
}

/** Elige la propiedad, o reutiliza una cuenta ya autorizada. */
export async function PUT(req: NextRequest) {
  const { clienteId, propiedad, conexionId } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden cambiar esto." }, { status: 403 });
  }

  // Cambiar de cuenta invalida la propiedad elegida: la anterior puede no
  // existir para la cuenta nueva, y dejarla puesta daría un 403 confuso.
  if (conexionId !== undefined) {
    const id = String(conexionId || "");
    if (id && !(await db.conexionGoogle.findUnique({ where: { id } }))) {
      return Response.json({ error: "Esa cuenta de Google ya no existe." }, { status: 400 });
    }
    await db.cliente.update({
      where: { id: p.cliente.id },
      data: { gscConexionId: id || null, gscPropiedad: null },
    });
    return Response.json({ ok: true });
  }

  const valor = String(propiedad || "").trim();

  if (valor) {
    if (!p.cliente.gscConexionId) {
      return Response.json({ error: "Primero hay que conectar una cuenta de Google." }, { status: 400 });
    }
    const disponibles = await propiedades(p.cliente.gscConexionId);
    if (!disponibles.some((d) => d.url === valor)) {
      return Response.json(
        { error: "Esa propiedad no está entre las que ve esa cuenta de Google." },
        { status: 400 }
      );
    }
  }

  await db.cliente.update({ where: { id: p.cliente.id }, data: { gscPropiedad: valor || null } });
  return Response.json({ ok: true });
}
