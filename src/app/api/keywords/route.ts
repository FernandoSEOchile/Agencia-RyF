import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { investigar, CHILE } from "@/lib/keywords";
import { apuntar } from "@/lib/gasto";
import { anotar } from "@/lib/clientes";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Cuánto vale una investigación antes de que convenga pagar otra. */
const DIAS_FRESCA = 30;

async function quien() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  return { id: sesion.user.id, rol };
}

const limpia = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Lo que ya está pagado. Gratis. */
export async function GET(req: NextRequest) {
  const u = await quien();
  if (!u) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const semilla = limpia(req.nextUrl.searchParams.get("semilla") || "");
  const pais = Number(req.nextUrl.searchParams.get("pais")) || CHILE;

  if (!semilla) {
    // Sin semilla, el historial: evita pagar otra vez por algo que ya se buscó.
    const recientes = await db.investigacion.findMany({
      orderBy: { creado: "desc" },
      take: 24,
      select: { semilla: true, pais: true, cuantas: true, creado: true },
    });
    return Response.json({ recientes });
  }

  const guardada = await db.investigacion.findUnique({
    where: { semilla_pais: { semilla, pais } },
  });

  return Response.json({
    semilla,
    pais,
    medida: guardada?.creado.toISOString() ?? null,
    coste: guardada?.coste ?? null,
    fresca: guardada ? Date.now() - guardada.creado.getTime() < DIAS_FRESCA * 86_400_000 : false,
    sugerencias: guardada ? JSON.parse(guardada.datos) : null,
  });
}

/** Consulta al proveedor. Cuesta dinero, así que lo lanza una persona. */
export async function POST(req: NextRequest) {
  const u = await quien();
  if (!u) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });
  if (u.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden lanzar búsquedas de pago." }, { status: 403 });
  }

  const cuerpo = await req.json().catch(() => ({}));
  const semilla = limpia(String(cuerpo.semilla || ""));
  const pais = Number(cuerpo.pais) || CHILE;

  if (!semilla) return Response.json({ error: "Falta la palabra a buscar." }, { status: 400 });

  let r;
  try {
    r = await investigar(semilla, pais);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo consultar." },
      { status: 502 }
    );
  }

  await db.investigacion.upsert({
    where: { semilla_pais: { semilla, pais } },
    update: {
      datos: JSON.stringify(r.sugerencias),
      cuantas: r.sugerencias.length,
      coste: r.coste,
      usuarioId: u.id,
      creado: new Date(),
    },
    create: {
      semilla,
      pais,
      datos: JSON.stringify(r.sugerencias),
      cuantas: r.sugerencias.length,
      coste: r.coste,
      usuarioId: u.id,
    },
  });

  // Sin cliente, igual que la exploración de dominios: se investiga tanto para
  // clientes como para propuestas, y separarlo obligaría a elegir antes de
  // buscar.
  await apuntar({
    usuarioId: u.id,
    servicio: "dataforseo",
    concepto: "investigacion de keywords",
    monto: r.coste,
    detalle: semilla,
  });

  await anotar({
    usuarioId: u.id,
    accion: "keywords",
    resumen: `«${semilla}» · ${r.sugerencias.length} palabras · US$${r.coste.toFixed(4)}`,
  });

  return Response.json({
    ok: true,
    coste: r.coste,
    cuantas: r.sugerencias.length,
    sugerencias: r.sugerencias,
    avisos: r.avisos,
  });
}
