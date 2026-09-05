import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { analizarEnlaces } from "@/lib/backlinks";
import { apuntar } from "@/lib/gasto";

export const runtime = "nodejs";
export const maxDuration = 300;

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

/** La última foto guardada. No consulta al proveedor, así que es gratis. */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const foto = await db.backlinks.findUnique({ where: { clienteId } });

  return Response.json({
    dominio: p.cliente.dominio,
    medido: foto?.medido.toISOString() ?? null,
    coste: foto?.coste ?? null,
    perfil: foto ? JSON.parse(foto.datos) : null,
  });
}

/** Vuelve a consultar el proveedor y guarda la foto nueva. */
export async function POST(req: NextRequest) {
  const { clienteId } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden consultar backlinks." }, { status: 403 });
  }

  let perfil;
  try {
    perfil = await analizarEnlaces(p.cliente.dominio);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo consultar el perfil de enlaces." },
      { status: 502 }
    );
  }

  // Cada consulta pisaba la anterior y no se veía qué cambió. Antes de pisar
  // se comparan los dominios: los que entraron y los que ya no enlazan.
  const previo = await db.backlinks.findUnique({
    where: { clienteId: p.cliente.id },
    select: { datos: true, medido: true },
  });
  let cambios: { desde: string; nuevos: string[]; perdidos: string[] } | null = null;
  if (previo) {
    try {
      const antes = new Set(((JSON.parse(previo.datos) as { dominios?: { dominio: string }[] }).dominios ?? []).map((d) => d.dominio));
      const ahora = new Set(perfil.dominios.map((d) => d.dominio));
      cambios = {
        desde: previo.medido.toISOString(),
        nuevos: [...ahora].filter((d) => !antes.has(d)).slice(0, 200),
        perdidos: [...antes].filter((d) => !ahora.has(d)).slice(0, 200),
      };
    } catch {
      cambios = null;
    }
  }
  const guardado = JSON.stringify({ ...perfil, cambios });

  await db.backlinks.upsert({
    where: { clienteId: p.cliente.id },
    update: { datos: guardado, coste: perfil.coste, medido: new Date() },
    create: {
      clienteId: p.cliente.id,
      datos: guardado,
      coste: perfil.coste,
    },
  });

  await apuntar({
    clienteId: p.cliente.id,
    usuarioId: p.usuarioId,
    servicio: "dataforseo",
    concepto: "backlinks",
    monto: perfil.coste,
    detalle: `${perfil.resumen.dominiosEnlazantes} dominios enlazantes`,
  });

  await anotar({
    usuarioId: p.usuarioId,
    clienteId: p.cliente.id,
    accion: "backlinks",
    resumen: `Perfil de enlaces consultado · ${perfil.resumen.dominiosEnlazantes} dominios · US$${perfil.coste.toFixed(4)}`,
  });

  return Response.json({ ok: true, coste: perfil.coste, avisos: perfil.avisos });
}
