import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { refrescar, POR_TANDA } from "@/lib/terminos";
import { apuntar } from "@/lib/gasto";
import { anotar } from "@/lib/clientes";
import { CHILE } from "@/lib/keywords";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Cuántas se devuelven de una vez. Más no cabe en pantalla ni hace falta. */
const TOPE = 500;

async function quien() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  return { id: sesion.user.id, rol };
}

/** Consulta el almacén. Gratis: son datos que ya se pagaron. */
export async function GET(req: NextRequest) {
  const u = await quien();
  if (!u) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const pais = Number(q.get("pais")) || CHILE;
  const texto = (q.get("busca") || "").trim().toLowerCase();
  const minimo = Number(q.get("minimo")) || 0;
  const maxPalabras = Number(q.get("maxPalabras")) || 0;
  const origen = (q.get("origen") || "").trim();
  const viejasDe = Number(q.get("viejasDe")) || 0;

  const donde: Prisma.TerminoWhereInput = { pais };

  if (texto) donde.keyword = { contains: texto, mode: "insensitive" };
  if (minimo) donde.volumen = { gte: minimo };
  if (maxPalabras) donde.palabras = { lte: maxPalabras };
  if (origen) donde.origenes = { contains: origen };

  // «Enséñame lo que lleva más de N días sin refrescar»: es la consulta que
  // decide qué merece la pena volver a pagar.
  if (viejasDe) {
    donde.actualizado = { lt: new Date(Date.now() - viejasDe * 86_400_000) };
  }

  const [terminos, total] = await Promise.all([
    db.termino.findMany({
      where: donde,
      orderBy: { volumen: "desc" },
      take: TOPE,
    }),
    db.termino.count({ where: donde }),
  ]);

  return Response.json({
    total,
    mostradas: terminos.length,
    terminos: terminos.map((t) => ({
      keyword: t.keyword,
      volumen: t.volumen,
      cpc: t.cpc,
      competencia: t.competencia,
      intencion: t.intencion,
      tendencia: t.tendencia,
      palabras: t.palabras,
      veces: t.veces,
      origenes: JSON.parse(t.origenes) as string[],
      actualizado: t.actualizado.toISOString(),
    })),
  });
}

/** Vuelve a pedir los volúmenes. Cuesta dinero, así que lo pulsa una persona. */
export async function POST(req: NextRequest) {
  const u = await quien();
  if (!u) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });
  if (u.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden lanzar consultas de pago." }, { status: 403 });
  }

  const cuerpo = await req.json().catch(() => ({}));
  const pais = Number(cuerpo.pais) || CHILE;
  const pedidas: string[] = Array.isArray(cuerpo.keywords) ? cuerpo.keywords : [];

  if (pedidas.length === 0) {
    return Response.json({ error: "No indicaste qué palabras actualizar." }, { status: 400 });
  }

  // El tope no es del código, es del proveedor: `keyword_overview` admite 700
  // por petición. Se corta aquí para que el aviso lo dé el panel y no un 400
  // de DataForSEO cobrado a medias.
  if (pedidas.length > POR_TANDA * 4) {
    return Response.json(
      { error: `Demasiadas de una vez. El máximo por tanda es ${POR_TANDA * 4}. Filtra un poco más.` },
      { status: 400 }
    );
  }

  let r;
  try {
    r = await refrescar(pedidas, pais);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo actualizar." },
      { status: 502 }
    );
  }

  await apuntar({
    usuarioId: u.id,
    servicio: "dataforseo",
    concepto: "actualizar volumenes",
    monto: r.coste,
    detalle: `${r.tocadas} palabras`,
  });

  await anotar({
    usuarioId: u.id,
    accion: "keywords_actualizar",
    resumen: `${r.tocadas} de ${r.pedidas} palabras actualizadas · US$${r.coste.toFixed(4)}`,
  });

  return Response.json({ ok: true, ...r });
}
