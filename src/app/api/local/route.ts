import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { buscarNegocio, arrancar, limpiarColgados } from "@/lib/local";
import { apuntar } from "@/lib/gasto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

  return { usuarioId: sesion.user.id, rol };
}

/** El último barrido con sus puntos, y la lista de los anteriores. */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const cual = req.nextUrl.searchParams.get("barrido") || "";

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  await limpiarColgados();

  const rejilla = await db.rejilla.findFirst({
    where: { clienteId, ...(cual ? { id: cual } : {}) },
    orderBy: { creado: "desc" },
    include: { puntos: { orderBy: [{ fila: "asc" }, { columna: "asc" }] } },
  });

  // El historial, para poder comparar el antes y el después. Es la mitad del
  // valor de esto: un mapa suelto es una foto, dos son una prueba.
  const anteriores = await db.rejilla.findMany({
    where: { clienteId, estado: "terminado" },
    orderBy: { creado: "desc" },
    take: 12,
    select: { id: true, keyword: true, creado: true, lado: true },
  });

  if (!rejilla) return Response.json({ rejilla: null, anteriores });

  const conPuesto = rejilla.puntos.filter((x) => x.puesto != null);
  const puestos = conPuesto.map((x) => x.puesto as number);

  return Response.json({
    rejilla: {
      id: rejilla.id,
      keyword: rejilla.keyword,
      negocio: rejilla.negocio,
      centroLat: rejilla.centroLat,
      centroLng: rejilla.centroLng,
      lado: rejilla.lado,
      separacion: rejilla.separacion,
      estado: rejilla.estado,
      total: rejilla.total,
      hechos: rejilla.hechos,
      coste: rejilla.coste,
      nota: rejilla.nota,
      creado: rejilla.creado.toISOString(),
      puntos: rejilla.puntos.map((x) => ({
        fila: x.fila,
        columna: x.columna,
        lat: x.lat,
        lng: x.lng,
        puesto: x.puesto,
        primero: x.primero,
      })),
      // La media solo sobre los puntos donde aparece: mezclar los que no
      // aparecen como si fueran un puesto 21 inventaría un número.
      media: puestos.length ? Number((puestos.reduce((t, v) => t + v, 0) / puestos.length).toFixed(1)) : null,
      visible: rejilla.puntos.length ? Math.round((conPuesto.length / rejilla.puntos.length) * 100) : 0,
      top3: puestos.filter((v) => v <= 3).length,
    },
    anteriores,
  });
}

/** Busca el negocio, o lanza un barrido. Las dos cosas cuestan dinero. */
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => ({}));
  const clienteId = String(cuerpo.clienteId || "");

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden lanzar barridos." }, { status: 403 });
  }

  /* ---- Buscar el negocio: una sola llamada, para elegir la ficha ---- */
  if (cuerpo.accion === "buscar") {
    const nombre = String(cuerpo.negocio || "").trim();
    if (!nombre) return Response.json({ error: "Falta el nombre del negocio." }, { status: 400 });

    try {
      const r = await buscarNegocio(nombre);

      await apuntar({
        usuarioId: p.usuarioId,
        clienteId,
        servicio: "dataforseo",
        concepto: "buscar ficha local",
        monto: r.coste,
        detalle: nombre,
      });

      return Response.json(r);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "No se pudo buscar." },
        { status: 502 }
      );
    }
  }

  /* ---- Lanzar el barrido ---- */
  const keyword = String(cuerpo.keyword || "").trim();
  const negocio = String(cuerpo.negocio || "").trim();
  const lat = Number(cuerpo.lat);
  const lng = Number(cuerpo.lng);
  const lado = [5, 7, 9, 11][[5, 7, 9, 11].indexOf(Number(cuerpo.lado))] ?? 9;
  const separacion = Math.min(Math.max(Number(cuerpo.separacion) || 1, 0.2), 10);

  if (!keyword || !negocio) {
    return Response.json({ error: "Falta la palabra clave o el negocio." }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "Faltan las coordenadas del negocio." }, { status: 400 });
  }

  try {
    const id = await arrancar({
      clienteId,
      usuarioId: p.usuarioId,
      keyword,
      negocio,
      cid: cuerpo.cid ? String(cuerpo.cid) : null,
      lat,
      lng,
      lado,
      separacion,
    });

    await anotar({
      usuarioId: p.usuarioId,
      clienteId,
      accion: "local",
      resumen: `Barrido de «${keyword}» · ${lado}×${lado} cada ${separacion} km`,
    });

    return Response.json({ ok: true, id, puntos: lado * lado });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo arrancar." },
      { status: 400 }
    );
  }
}
