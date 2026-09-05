import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { comparativa } from "@/lib/competidores";
import { explorarYGuardar, limpioDominio, costeMedioExploracion } from "@/lib/exploracion";
import { tomar, soltar } from "@/lib/candado";

/**
 * Los rivales de un cliente y la comparativa.
 *
 * Leer la comparativa no cuesta nada: cruza lo que ya se pagó. Explorar un
 * rival por primera vez sí, y lo lanza una persona con el coste a la vista.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_RIVALES = 6;

async function permiso(clienteId: string) {
  const sesion = await auth();
  if (!sesion?.user?.id) return { error: "Sesión no iniciada.", codigo: 401 as const };
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { id: true, dominio: true } });
  if (!cliente) return { error: "Ese cliente no existe.", codigo: 404 as const };

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return { error: "Sin acceso a este cliente.", codigo: 403 as const };
  }
  return { usuarioId: sesion.user.id, rol, cliente };
}

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const [datos, costeExploracion] = await Promise.all([comparativa(clienteId), costeMedioExploracion()]);
  return Response.json({ ...datos, costeExploracion });
}

export async function POST(req: NextRequest) {
  const { clienteId, dominio } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") return Response.json({ error: "Los lectores no pueden editar." }, { status: 403 });

  const d = limpioDominio(String(dominio || ""));
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
    return Response.json({ error: "Escribe un dominio válido, como rival.cl." }, { status: 400 });
  }
  if (d === limpioDominio(p.cliente.dominio)) {
    return Response.json({ error: "Ese es el dominio del propio cliente." }, { status: 400 });
  }

  const cuantos = await db.competidor.count({ where: { clienteId: p.cliente.id } });
  if (cuantos >= MAX_RIVALES) {
    return Response.json({ error: `Hasta ${MAX_RIVALES} rivales por cliente: más no se comparan, se amontonan.` }, { status: 400 });
  }

  await db.competidor.upsert({
    where: { clienteId_dominio: { clienteId: p.cliente.id, dominio: d } },
    update: {},
    create: { clienteId: p.cliente.id, dominio: d },
  });
  await anotar({ usuarioId: p.usuarioId, clienteId: p.cliente.id, accion: "competidor", resumen: `${d} añadido como rival` });
  return Response.json({ ok: true, dominio: d });
}

/** Explorar un dominio —el cliente o un rival— y guardar la foto. Cuesta. */
export async function PATCH(req: NextRequest) {
  const { clienteId, dominio } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") return Response.json({ error: "Los lectores no pueden explorar." }, { status: 403 });

  const d = limpioDominio(String(dominio || ""));
  const rival = await db.competidor.findUnique({ where: { clienteId_dominio: { clienteId: p.cliente.id, dominio: d } } });
  if (!rival && d !== limpioDominio(p.cliente.dominio)) {
    return Response.json({ error: "Ese dominio no es el cliente ni uno de sus rivales." }, { status: 400 });
  }

  const candado = `exploracion:${d}`;
  if (!tomar(candado)) return Response.json({ error: "Ya se está explorando ese dominio." }, { status: 409 });
  try {
    const panorama = await explorarYGuardar({ dominio: d, usuarioId: p.usuarioId, clienteId: p.cliente.id, concepto: "competidores" });
    return Response.json({ ok: true, coste: panorama.coste, keywords: panorama.resumen.keywords });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo explorar." }, { status: 502 });
  } finally {
    soltar(candado);
  }
}

export async function DELETE(req: NextRequest) {
  const { clienteId, competidorId } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") return Response.json({ error: "Los lectores no pueden editar." }, { status: 403 });

  await db.competidor.deleteMany({ where: { id: String(competidorId), clienteId: p.cliente.id } });
  return Response.json({ ok: true });
}
