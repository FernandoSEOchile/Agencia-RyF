import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { arrancar, limpiarColgados } from "@/lib/rastreador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Qué se considera un problema, en un solo sitio.
 *
 * Los contadores y las listas salen de aquí para que no puedan discrepar: si el
 * cuadro dice 40 y la lista enseña 37, nadie vuelve a fiarse de la pantalla.
 *
 * Los umbrales no son caprichosos. 60 caracteres es donde Google empieza a
 * recortar el título en el resultado; 160 donde recorta la descripción; 300
 * palabras es el mínimo por debajo del cual una página rara vez tiene bastante
 * que decir para competir por nada.
 */
const FILTROS: Record<string, Prisma.PaginaWhereInput> = {
  rotas: { OR: [{ estado: { gte: 400 } }, { estado: null }] },
  noIndexables: { noindex: true },
  huerfanas: { entrantes: 0, estado: { lt: 400 } },
  redirigidas: { destino: { not: null } },
  sinTitulo: { titulo: null, estado: { lt: 400 } },
  sinDescripcion: { descripcion: null, estado: { lt: 400 } },
  sinH1: { h1s: 0, estado: { lt: 400 } },
  variosH1: { h1s: { gt: 1 } },
  contenidoPobre: { palabras: { lt: 300, gt: 0 }, estado: { lt: 400 } },
  sinEnlacesSalientes: { enlacesInternos: 0, estado: { lt: 400 } },
  lentas: { ms: { gte: 3000 } },
  sinAlt: { imagenesSinAlt: { gt: 0 } },
};

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
    // Los repetidos no salen de un filtro sino de un agrupado, así que van
    // aparte: primero se averigua qué títulos se repiten y luego se piden las
    // páginas que los llevan, ordenadas por título para que queden juntas.
    if (problema === "tituloRepetido" || problema === "descripcionRepetida") {
      const porTitulo = problema === "tituloRepetido";

      // Los dos casos van escritos por separado, sin campo variable: el
      // agrupado de Prisma quiere saber en tiempo de compilación por qué
      // columna agrupa, y forzarlo con un índice dinámico pierde el tipado
      // justo donde más ayuda.
      const valores = porTitulo
        ? (
            await db.pagina.groupBy({
              by: ["titulo"],
              where: { ...de, titulo: { not: null }, estado: { lt: 400 } },
              _count: { titulo: true },
              having: { titulo: { _count: { gt: 1 } } },
            })
          )
            .map((g) => g.titulo)
            .filter((v): v is string => v !== null)
        : (
            await db.pagina.groupBy({
              by: ["descripcion"],
              where: { ...de, descripcion: { not: null }, estado: { lt: 400 } },
              _count: { descripcion: true },
              having: { descripcion: { _count: { gt: 1 } } },
            })
          )
            .map((g) => g.descripcion)
            .filter((v): v is string => v !== null);

      const paginas = await db.pagina.findMany({
        where: porTitulo ? { ...de, titulo: { in: valores } } : { ...de, descripcion: { in: valores } },
        orderBy: porTitulo ? [{ titulo: "asc" }, { url: "asc" }] : [{ descripcion: "asc" }, { url: "asc" }],
        take: 300,
      });

      return Response.json({
        problema,
        paginas: paginas.map((x) => ({
          url: x.url,
          estado: x.estado,
          ms: x.ms,
          destino: x.destino,
          titulo: x.titulo,
          palabras: x.palabras,
          imagenesSinAlt: x.imagenesSinAlt,
          error: x.error,
        })),
      });
    }

    const donde = FILTROS[problema];

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

  const claves = Object.keys(FILTROS) as (keyof typeof FILTROS)[];

  const cuentas = await Promise.all(
    claves.map((k) => db.pagina.count({ where: { ...de, ...FILTROS[k] } }))
  );

  const problemas: Record<string, number> = {};
  claves.forEach((k, i) => (problemas[k] = cuentas[i]));

  // Repetidos: dos páginas con el mismo título compiten entre ellas por la
  // misma búsqueda, y en catálogos grandes es de los fallos más comunes. Sale
  // de un agrupado y no de un filtro, por eso va aparte.
  const [titulos, descripciones] = await Promise.all([
    db.pagina.groupBy({
      by: ["titulo"],
      where: { ...de, titulo: { not: null }, estado: { lt: 400 } },
      _count: { titulo: true },
      having: { titulo: { _count: { gt: 1 } } },
    }),
    db.pagina.groupBy({
      by: ["descripcion"],
      where: { ...de, descripcion: { not: null }, estado: { lt: 400 } },
      _count: { descripcion: true },
      having: { descripcion: { _count: { gt: 1 } } },
    }),
  ]);

  problemas.tituloRepetido = titulos.reduce((t, r) => t + r._count.titulo, 0);
  problemas.descripcionRepetida = descripciones.reduce((t, r) => t + r._count.descripcion, 0);

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
    problemas,
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
