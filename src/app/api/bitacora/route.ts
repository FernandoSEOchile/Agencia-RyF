import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { redactarMes, type ModoBitacora } from "@/lib/bitacora";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  return { usuarioId: sesion.user.id, rol, cliente };
}

/** Las entradas de un cliente, y qué meses tienen algo. */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const entradas = await db.bitacora.findMany({
    where: { clienteId },
    orderBy: [{ mes: "desc" }, { creado: "asc" }],
    select: {
      id: true,
      mes: true,
      categoria: true,
      titulo: true,
      detalle: true,
      automatico: true,
    },
  });

  // Los meses con actividad técnica, aunque todavía no tengan bitácora: son
  // los que se pueden redactar.
  const registro = await db.registro.findMany({
    where: { clienteId },
    select: { creado: true },
    orderBy: { creado: "desc" },
    take: 2000,
  });

  const mesesConActividad = [...new Set(registro.map((r) => r.creado.toISOString().slice(0, 7)))];

  return Response.json({
    cliente: p.cliente.nombre,
    dominio: p.cliente.dominio,
    entradas,
    mesesConActividad,
  });
}

/** Añade una entrada a mano. */
export async function POST(req: NextRequest) {
  const { clienteId, mes, categoria, titulo, detalle } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden escribir." }, { status: 403 });
  }

  const t = String(titulo || "").trim();
  if (!t) return Response.json({ error: "Falta el texto de la entrada." }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(String(mes))) {
    return Response.json({ error: "El mes debe venir como 2026-09." }, { status: 400 });
  }

  const entrada = await db.bitacora.create({
    data: {
      clienteId: String(clienteId),
      mes: String(mes),
      categoria: String(categoria || "otro"),
      titulo: t.replace(/\.$/, ""),
      detalle: String(detalle || "").trim() || null,
      automatico: false,
    },
  });

  return Response.json({ ok: true, id: entrada.id });
}

/** Redacta un mes a partir del registro técnico. */
export async function PATCH(req: NextRequest) {
  const { clienteId, mes, modo } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden redactar." }, { status: 403 });
  }

  if (!/^\d{4}-\d{2}$/.test(String(mes))) {
    return Response.json({ error: "El mes debe venir como 2026-09." }, { status: 400 });
  }

  const cual: ModoBitacora =
    modo === "actualizar" || modo === "rehacer" ? modo : "nuevo";

  try {
    const r = await redactarMes(String(clienteId), String(mes), p.usuarioId, cual);

    await anotar({
      usuarioId: p.usuarioId,
      clienteId: String(clienteId),
      accion: "bitacora",
      resumen:
        cual === "rehacer"
          ? `Bitácora de ${mes} rehecha: ${r.nuevas} entradas`
          : `Bitácora de ${mes}: ${r.nuevas} nuevas, ${r.actualizadas} actualizadas`,
    });

    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo redactar el mes." },
      { status: 400 }
    );
  }
}

/** Quita una entrada. */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();

  const entrada = await db.bitacora.findUnique({ where: { id: String(id || "") } });
  if (!entrada) return Response.json({ error: "No existe esa entrada." }, { status: 404 });

  const p = await permiso(entrada.clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden borrar." }, { status: 403 });
  }

  await db.bitacora.delete({ where: { id: entrada.id } });
  return Response.json({ ok: true });
}
