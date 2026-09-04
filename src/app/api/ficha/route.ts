import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { pedirFicha, puntuar, redactar } from "@/lib/ficha";
import { apuntar } from "@/lib/gasto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

  return { usuarioId: sesion.user.id, rol };
}

/** Las auditorías guardadas. Gratis: ya se pagaron. */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const filas = await db.auditoriaFicha.findMany({
    where: { clienteId },
    orderBy: { creado: "desc" },
    take: 12,
  });

  return Response.json({
    auditorias: filas.map((a) => ({
      id: a.id,
      negocio: a.negocio,
      nota: a.nota,
      creado: a.creado.toISOString(),
      coste: a.coste,
      bloques: JSON.parse(a.bloques),
      hallazgos: JSON.parse(a.hallazgos),
      informe: a.informe ? JSON.parse(a.informe) : null,
      datos: JSON.parse(a.datos),
    })),
  });
}

/** Audita la ficha. Cuesta la consulta a DataForSEO más la redacción. */
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => ({}));
  const clienteId = String(cuerpo.clienteId || "");
  const referencia = String(cuerpo.referencia || "").trim();

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden lanzar auditorías." }, { status: 403 });
  }
  if (!referencia) {
    return Response.json({ error: "Falta el negocio o su identificador." }, { status: 400 });
  }

  let ficha, coste;
  try {
    const r = await pedirFicha(referencia);
    ficha = r.ficha;
    coste = r.coste;
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo leer la ficha." },
      { status: 502 }
    );
  }

  await apuntar({
    usuarioId: p.usuarioId,
    clienteId,
    servicio: "dataforseo",
    concepto: "ficha de Google Business",
    monto: coste,
    detalle: referencia,
  });

  if (!ficha) {
    return Response.json(
      { error: "Google no devolvió ninguna ficha con esa referencia." },
      { status: 404 }
    );
  }

  const puntos = puntuar(ficha);

  // La redacción es lo único que puede fallar sin que se pierda el análisis:
  // la nota y los hallazgos ya están, así que se guardan igual.
  let informe = null;
  try {
    informe = await redactar(ficha, puntos, p.usuarioId, clienteId);
  } catch {
    informe = null;
  }

  const guardada = await db.auditoriaFicha.create({
    data: {
      clienteId,
      negocio: ficha.titulo,
      cid: ficha.cid,
      nota: puntos.total,
      bloques: JSON.stringify(puntos.bloques),
      hallazgos: JSON.stringify(puntos.hallazgos),
      informe: informe ? JSON.stringify(informe) : null,
      datos: JSON.stringify(ficha),
      coste,
    },
  });

  await anotar({
    usuarioId: p.usuarioId,
    clienteId,
    accion: "ficha_local",
    resumen: `${ficha.titulo} · ${puntos.total}/100`,
  });

  return Response.json({
    ok: true,
    auditoria: {
      id: guardada.id,
      negocio: ficha.titulo,
      nota: puntos.total,
      creado: guardada.creado.toISOString(),
      coste,
      bloques: puntos.bloques,
      hallazgos: puntos.hallazgos,
      informe,
      datos: ficha,
    },
  });
}
