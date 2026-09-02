import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { explorarDominio } from "@/lib/labs";
import { apuntar } from "@/lib/gasto";
import { anotar } from "@/lib/clientes";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Cuánto vale una foto antes de que convenga pagar otra. */
const DIAS_FRESCA = 14;

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
    fresca: foto ? Date.now() - foto.creado.getTime() < DIAS_FRESCA * 86_400_000 : false,
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
    panorama = await explorarDominio(objetivo, codigo);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo explorar el dominio." },
      { status: 502 }
    );
  }

  await db.exploracion.upsert({
    where: { dominio_pais: { dominio: objetivo, pais: codigo } },
    update: {
      datos: JSON.stringify(panorama),
      coste: panorama.coste,
      usuarioId: u.id,
      creado: new Date(),
    },
    create: {
      dominio: objetivo,
      pais: codigo,
      datos: JSON.stringify(panorama),
      coste: panorama.coste,
      usuarioId: u.id,
    },
  });

  // Sin cliente: esto se usa sobre todo con dominios que todavía no lo son, y
  // el gasto de prospección es un gasto de la agencia, no de nadie en concreto.
  await apuntar({
    usuarioId: u.id,
    servicio: "dataforseo",
    concepto: "exploracion de dominio",
    monto: panorama.coste,
    detalle: objetivo,
  });

  await anotar({
    usuarioId: u.id,
    accion: "exploracion",
    resumen: `${objetivo} explorado · ${panorama.resumen.keywords} keywords · US$${panorama.coste.toFixed(4)}`,
  });

  return Response.json({ ok: true, coste: panorama.coste, avisos: panorama.avisos });
}
