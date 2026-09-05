import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { explorarYGuardar, esFresca } from "@/lib/exploracion";

export const runtime = "nodejs";
export const maxDuration = 300;

async function quien() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  return { id: sesion.user.id, rol };
}

const limpio = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/** Devuelve la foto guardada, si la hay. Gratis. */
export async function GET(req: NextRequest) {
  const u = await quien();
  if (!u) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const dominio = limpio(req.nextUrl.searchParams.get("dominio") || "");
  const pais = Number(req.nextUrl.searchParams.get("pais")) || 2152;

  if (!dominio) {
    // Sin dominio, la lista de lo ya explorado: sirve de historial y evita
    // pagar otra vez por algo que se miró la semana pasada.
    const recientes = await db.exploracion.findMany({
      orderBy: { creado: "desc" },
      take: 24,
      select: { dominio: true, pais: true, creado: true },
    });
    return Response.json({ recientes });
  }

  const foto = await db.exploracion.findUnique({
    where: { dominio_pais: { dominio, pais } },
  });

  return Response.json({
    dominio,
    pais,
    medido: foto?.creado.toISOString() ?? null,
    coste: foto?.coste ?? null,
    fresca: foto ? esFresca(foto.creado) : false,
    panorama: foto ? JSON.parse(foto.datos) : null,
  });
}

/** Consulta al proveedor y guarda la foto. Cuesta dinero. */
export async function POST(req: NextRequest) {
  const u = await quien();
  if (!u) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });
  if (u.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden explorar dominios." }, { status: 403 });
  }

  const { dominio, pais } = await req.json();
  const objetivo = limpio(String(dominio || ""));
  const codigo = Number(pais) || 2152;

  let panorama;
  try {
    // Sin cliente: esto se usa sobre todo con dominios que todavía no lo son,
    // y el gasto de prospección es de la agencia, no de nadie en concreto.
    panorama = await explorarYGuardar({ dominio: objetivo, pais: codigo, usuarioId: u.id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo explorar el dominio." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, coste: panorama.coste, avisos: panorama.avisos });
}
