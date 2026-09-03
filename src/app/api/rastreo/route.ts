import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { arrancar, limpiarColgados } from "@/lib/rastreador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * El último rastreo y lo que encontró.
 *
 * Los problemas se cuentan aquí y no en el navegador porque son consultas sobre
 * miles de filas: mandarlas todas para que el cliente las cuente sería mover
 * megas por cada recarga.
 */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  await limpiarColgados();

  const rastreo = await db.rastreo.findFirst({
    where: { clienteId },
    orderBy: { creado: "desc" },
  });

  if (!rastreo) return Response.json({ rastreo: null });

  // Mientras corre no se calculan informes: cambiarían en cada recarga y
  // costarían una consulta pesada por cada vistazo a una barra de progreso.
  if (rastreo.estado === "corriendo") {
    return Response.json({
      rastreo: {
        id: rastreo.id,
        estado: rastreo.estado,
        total: rastreo.total,
        hechas: rastreo.hechas,
        creado: rastreo.creado.toISOString(),
        nota: rastreo.nota,
      },
    });
  }

  const de = { rastreoId: rastreo.id };

  // Pinchar un contador pide aquí las URLs de ese problema. Van aparte del
  // resumen porque son cientos de filas y casi siempre se mira una sola lista.
  const problema = req.nextUrl.searchParams.get("problema");

  if (problema) {
    const donde = {
      rotas: { OR: [{ estado: { gte: 400 } }, { estado: null }] },
      redirigidas: { destino: { not: null } },
      lentas: { ms: { gte: 3000 } },
      sinTitulo: { titulo: null, estado: { lt: 400 } },
      sinDescripcion: { descripcion: null, estado: { lt: 400 } },
      sinH1: { h1: null, estado: { lt: 400 } },
      noIndexables: { noindex: true },
      sinAlt: { imagenesSinAlt: { gt: 0 } },
      huerfanas: { enlacesInternos: 0, estado: { lt: 400 } },
    }[problema] as Record<string, unknown> | undefined;

    if (!donde) return Response.json({ error: "Ese informe no existe." }, { status: 400 });

    const paginas = await db.pagina.findMany({
      where: { ...de, ...donde },
      orderBy: { url: "asc" },
      take: 300,
    });

    return Response.json({
      problema,
      paginas: paginas.map((p) => ({
        url: p.url,
        estado: p.estado,
        ms: p.ms,
        destino: p.destino,
        titulo: p.titulo,
        palabras: p.palabras,
        imagenesSinAlt: p.imagenesSinAlt,
        error: p.error,
      })),
    });
  }

  const [rotas, redirigidas, lentas, sinTitulo, sinDescripcion, sinH1, noIndexables, sinAlt, huerfanas] =
    await Promise.all([
      db.pagina.count({ where: { ...de, OR: [{ estado: { gte: 400 } }, { estado: null }] } }),
      db.pagina.count({ where: { ...de, destino: { not: null } } }),
      db.pagina.count({ where: { ...de, ms: { gte: 3000 } } }),
      db.pagina.count({ where: { ...de, titulo: null, estado: { lt: 400 } } }),
      db.pagina.count({ where: { ...de, descripcion: null, estado: { lt: 400 } } }),
      db.pagina.count({ where: { ...de, h1: null, estado: { lt: 400 } } }),
      db.pagina.count({ where: { ...de, noindex: true } }),
      db.pagina.count({ where: { ...de, imagenesSinAlt: { gt: 0 } } }),
      db.pagina.count({ where: { ...de, enlacesInternos: 0, estado: { lt: 400 } } }),
    ]);

  // Títulos repetidos: dos páginas con el mismo título compiten entre ellas en
  // Google, y es de los fallos que más se repiten en catálogos grandes.
  const repetidos = await db.pagina.groupBy({
    by: ["titulo"],
    where: { ...de, titulo: { not: null }, estado: { lt: 400 } },
    _count: { titulo: true },
    having: { titulo: { _count: { gt: 1 } } },
  });

  return Response.json({
    rastreo: {
      id: rastreo.id,
      estado: rastreo.estado,
      total: rastreo.total,
      hechas: rastreo.hechas,
      creado: rastreo.creado.toISOString(),
      acabado: rastreo.acabado?.toISOString() ?? null,
      nota: rastreo.nota,
    },
    problemas: {
      rotas,
      redirigidas,
      lentas,
      sinTitulo,
      sinDescripcion,
      sinH1,
      noIndexables,
      sinAlt,
      huerfanas,
      tituloRepetido: repetidos.reduce((s, r) => s + r._count.titulo, 0),
    },
  });
}

/** Lanza un rastreo. No cuesta dinero, pero sí tiempo del servidor. */
export async function POST(req: NextRequest) {
  const { clienteId } = (await req.json().catch(() => ({}))) as { clienteId?: string };
  if (!clienteId) return Response.json({ error: "Falta el cliente." }, { status: 400 });

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden lanzar rastreos." }, { status: 403 });
  }

  try {
    const id = await arrancar(clienteId);

    await anotar({
      usuarioId: p.usuarioId,
      clienteId,
      accion: "rastreo",
      resumen: "Rastreo técnico lanzado",
    });

    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo arrancar." },
      { status: 400 }
    );
  }
}
