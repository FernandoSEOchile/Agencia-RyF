import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { arrancar, limpiarColgados } from "@/lib/rastreador";

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
const PROPIA: Prisma.PaginaWhereInput = { estado: { lt: 400 }, destino: null };

/**
 * Qué se considera un problema, en un solo sitio.
 *
 * Los contadores y las listas salen de aquí para que no puedan discrepar: si el
 * cuadro dice 40 y la lista enseña 37, nadie vuelve a fiarse de la pantalla.
 *
 * Los umbrales no son caprichosos: 300 palabras es el mínimo por debajo del
 * cual una página rara vez tiene bastante que decir para competir por nada, y
 * tres clics es donde Google empieza a repartir bastante menos autoridad.
 */
const FILTROS: Record<string, Prisma.PaginaWhereInput> = {
  rotas: { OR: [{ estado: { gte: 400 } }, { estado: null }] },
  noIndexables: { noindex: true, destino: null },
  huerfanas: { ...PROPIA, entrantes: 0 },
  redirigidas: { destino: { not: null } },
  sinTitulo: { ...PROPIA, titulo: null },
  sinDescripcion: { ...PROPIA, descripcion: null },
  sinH1: { ...PROPIA, h1s: 0 },
  variosH1: { ...PROPIA, h1s: { gt: 1 } },
  contenidoPobre: { ...PROPIA, palabras: { lt: 300, gt: 0 } },
  sinEnlacesSalientes: { ...PROPIA, enlacesInternos: 0 },
  sinDatos: { ...PROPIA, tipos: "[]" },
  datosRotos: { ...PROPIA, ldRoto: true },
  canonicalAjeno: { ...PROPIA, canonical: { not: null } },
  sinCanonical: { ...PROPIA, canonical: null },
  profundas: { ...PROPIA, profundidad: { gt: 3 } },
  sinLang: { ...PROPIA, lang: null },
  sinViewport: { ...PROPIA, viewport: false },
  // El tiempo sí es suyo aunque redirija: lo que tardó, tardó.
  lentas: { ms: { gte: 3000 } },
  sinAlt: { ...PROPIA, imagenesSinAlt: { gt: 0 } },
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
      where: { ...de, ...PROPIA, titulo: { not: null } },
      _count: { titulo: true },
      having: { titulo: { _count: { gt: 1 } } },
    }),
    db.pagina.groupBy({
      by: ["descripcion"],
      where: { ...de, ...PROPIA, descripcion: { not: null } },
      _count: { descripcion: true },
      having: { descripcion: { _count: { gt: 1 } } },
    }),
  ]);

  // «Canonical a otra página» compara dos columnas entre sí, y eso Prisma no lo
  // sabe hacer con un filtro: se cuenta a mano sobre las que declaran uno.
  const conCanonical = await db.pagina.findMany({
    where: { ...de, ...PROPIA, canonical: { not: null } },
    select: { url: true, canonical: true },
  });

  const mismaPagina = (a: string, b: string) => {
    const l = (u: string) =>
      u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
    return l(a) === l(b);
  };

  problemas.canonicalAjeno = conCanonical.filter(
    (x) => x.canonical && !mismaPagina(x.url, x.canonical)
  ).length;

  problemas.tituloRepetido = titulos.reduce((t, r) => t + r._count.titulo, 0);
  problemas.descripcionRepetida = descripciones.reduce((t, r) => t + r._count.descripcion, 0);

  // Un rastreo anterior al grafo de enlaces no guardó ninguno, y entonces todas
  // sus páginas tienen cero entrantes y saldrían como huérfanas. Antes que
  // enseñar un número falso, se quita el informe: quien lo quiera, que vuelva a
  // rastrear.
  const hayGrafo = await db.enlace.findFirst({ where: { rastreoId: rastreo.id }, select: { id: true } });
  if (!hayGrafo) delete problemas.huerfanas;

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
