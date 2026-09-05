import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { arrancar, limpiarColgados } from "@/lib/rastreador";
import { FILTROS, PROPIA, problemasDe } from "@/lib/rastreoInformes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Una página que existe por sí misma.
 *
 * Cuando una URL redirige, lo que se descargó fue el HTML del DESTINO: su
 * título, su descripción, sus datos estructurados. Contarla en las
 * comprobaciones de contenido produce fantasmas —la más llamativa, decenas de
 * «títulos repetidos» que en realidad son la misma página vista desde sus URLs
 * viejas—. Una redirección es un problema de otra clase y tiene su propio
 * informe.
 */
function indexabilidad(p: {
  estado: number | null;
  destino: string | null;
  noindex: boolean;
  canonical: string | null;
  url: string;
}) {
  if (p.estado === null) return { indexable: false, motivo: "no responde" };
  if (p.estado >= 400) return { indexable: false, motivo: `error ${p.estado}` };
  if (p.destino) return { indexable: false, motivo: "redirige" };
  if (p.noindex) return { indexable: false, motivo: "noindex" };

  if (p.canonical) {
    const l = (u: string) =>
      u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
    if (l(p.canonical) !== l(p.url)) {
      return { indexable: false, motivo: "canonical a otra" };
    }
  }

  return { indexable: true, motivo: null };
}

/** La fila tal como la espera la pantalla. */
function aFila(p: {
  url: string;
  estado: number | null;
  ms: number | null;
  destino: string | null;
  titulo: string | null;
  palabras: number;
  imagenesSinAlt: number;
  error: string | null;
  noindex: boolean;
  canonical: string | null;
}) {
  return {
    url: p.url,
    estado: p.estado,
    ms: p.ms,
    destino: p.destino,
    titulo: p.titulo,
    palabras: p.palabras,
    imagenesSinAlt: p.imagenesSinAlt,
    error: p.error,
    ...indexabilidad(p),
  };
}

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
              where: { ...de, ...PROPIA, titulo: { not: null } },
              _count: { titulo: true },
              having: { titulo: { _count: { gt: 1 } } },
            })
          )
            .map((g) => g.titulo)
            .filter((v): v is string => v !== null)
        : (
            await db.pagina.groupBy({
              by: ["descripcion"],
              where: { ...de, ...PROPIA, descripcion: { not: null } },
              _count: { descripcion: true },
              having: { descripcion: { _count: { gt: 1 } } },
            })
          )
            .map((g) => g.descripcion)
            .filter((v): v is string => v !== null);

      const paginas = await db.pagina.findMany({
        where: porTitulo
          ? { ...de, ...PROPIA, titulo: { in: valores } }
          : { ...de, ...PROPIA, descripcion: { in: valores } },
        orderBy: porTitulo ? [{ titulo: "asc" }, { url: "asc" }] : [{ descripcion: "asc" }, { url: "asc" }],
        take: 300,
      });

      return Response.json({ problema, paginas: paginas.map(aFila) });
    }

    const donde = FILTROS[problema];

    if (!donde) return Response.json({ error: "Ese informe no existe." }, { status: 400 });

    let paginas = await db.pagina.findMany({
      where: { ...de, ...donde },
      orderBy: { url: "asc" },
      take: problema === "canonicalAjeno" ? 3000 : 300,
    });

    if (problema === "canonicalAjeno") {
      const l = (u: string) =>
        u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
      paginas = paginas.filter((x) => x.canonical && l(x.url) !== l(x.canonical)).slice(0, 300);
    }

    return Response.json({ problema, paginas: paginas.map(aFila) });
  }

  const problemas = await problemasDe(rastreo.id);

  // El rastreo anterior terminado, para decir qué cambió desde entonces: qué se
  // arregló y qué apareció. Sin esto cada tanda era una foto suelta.
  const previo = await db.rastreo.findFirst({
    where: { clienteId, estado: "terminado", creado: { lt: rastreo.creado } },
    orderBy: { creado: "desc" },
    select: { id: true, creado: true },
  });
  const anterior = previo ? { creado: previo.creado.toISOString(), problemas: await problemasDe(previo.id) } : null;

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
    anterior,
    sitio: rastreo.sitio ? JSON.parse(rastreo.sitio) : null,
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
