import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { porDia, consultas } from "@/lib/gsc";
import { porMes, type Mes } from "@/lib/tramos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Todo lo que hace falta para el panorama de un cliente, en una sola llamada.
 *
 * Va junto y no en cinco endpoints porque la pantalla los necesita a la vez y
 * cinco peticiones desde el navegador serían cinco cascadas de latencia para
 * pintar una pantalla que se mira entera.
 *
 * Lo único que sale a la red es Search Console. El resto está en nuestra base,
 * así que abrir esta pestaña no cuesta dinero.
 */

/** Qué acciones del registro son trabajo visible y merecen una marca. */
const TRABAJO = [
  "contenido_crear",
  "contenido_editar",
  "producto_crear",
  "producto_escribir",
  "categoria_crear",
  "categoria_seo",
  "escribir_categoria",
  "crear_categoria",
  "escribir_producto",
  "crear_producto",
  "escribir_contenido",
  "crear_contenido",
];

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

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 180, 7), 760);

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { nombre: true, dominio: true, gscConexionId: true, gscPropiedad: true },
  });
  if (!cliente) return Response.json({ error: "Ese cliente no existe." }, { status: 404 });

  const desde = new Date(Date.now() - dias * 86_400_000);

  /* ---------------- Tráfico, de Search Console ---------------- */
  let trafico: Awaited<ReturnType<typeof porDia>> = [];
  let traficoAnterior: Awaited<ReturnType<typeof porDia>> = [];
  let avisoGsc: string | null = null;

  if (cliente.gscConexionId && cliente.gscPropiedad) {
    try {
      // Se pide el doble para comparar con el periodo anterior de verdad. Antes
      // la «variación» partía el mismo periodo por la mitad y decía «vs.
      // periodo anterior», que no era cierto.
      const todo = await porDia(cliente.gscConexionId, cliente.gscPropiedad, dias * 2);
      const corte = desde.toISOString().slice(0, 10);
      trafico = todo.filter((x) => x.fecha >= corte);
      traficoAnterior = todo.filter((x) => x.fecha < corte);
    } catch (e) {
      avisoGsc = e instanceof Error ? e.message : "No se pudo leer Search Console.";
    }
  } else {
    avisoGsc = "Este sitio no tiene Search Console conectado, así que no hay datos de tráfico.";
  }

  /* ---------------- Distribución real de posiciones, de Search Console -------
   *
   * Esta es la de verdad: son las consultas por las que el sitio SALIÓ, con la
   * posición media que tuvo. La de DataForSEO es una estimación de su base y
   * suele diferir; enseñar las dos y decir cuál es cuál vale más que discutir
   * cuál tiene razón.
   */
  const reparto = { top3: 0, top10: 0, top20: 0, top50: 0, resto: 0 };
  let consultasTotales = 0;

  if (cliente.gscConexionId && cliente.gscPropiedad && !avisoGsc) {
    try {
      const filas = await consultas(cliente.gscConexionId, cliente.gscPropiedad, dias);
      consultasTotales = filas.length;

      for (const f of filas) {
        if (f.posicion <= 3) reparto.top3++;
        else if (f.posicion <= 10) reparto.top10++;
        else if (f.posicion <= 20) reparto.top20++;
        else if (f.posicion <= 50) reparto.top50++;
        else reparto.resto++;
      }
    } catch {
      // Si esta falla no se pierde la pantalla: el resto ya está.
    }
  }

  /* ---------------- Los mismos tramos, pero mes a mes -------------------------
   *
   * Una llamada por mes, guardada: es la curva de Semrush con datos reales. Va
   * después del reparto y no en paralelo porque las dos hablan con Google y
   * lanzarlas juntas es la forma más rápida de que nos limite.
   */
  let tramosMes: Mes[] = [];

  if (cliente.gscConexionId && cliente.gscPropiedad && !avisoGsc) {
    try {
      tramosMes = await porMes(clienteId, cliente.gscConexionId, cliente.gscPropiedad, dias);
    } catch {
      tramosMes = [];
    }
  }

  /* ---------------- Posiciones medidas, por tramo y por día ---------------- */
  const medidas = await db.posicion.findMany({
    where: { keyword: { clienteId }, medido: { gte: desde } },
    select: { puesto: true, medido: true },
    orderBy: { medido: "asc" },
  });

  // Se agrupa por día y por tramo. Los tramos son los de siempre en SEO, y no
  // una escala lineal: la diferencia entre el 3 y el 4 vale mucho más que la
  // que hay entre el 40 y el 60.
  const porFecha = new Map<string, { top3: number; top10: number; top20: number; top100: number }>();

  for (const m of medidas) {
    const dia = m.medido.toISOString().slice(0, 10);
    const t = porFecha.get(dia) ?? { top3: 0, top10: 0, top20: 0, top100: 0 };

    if (m.puesto != null) {
      if (m.puesto <= 3) t.top3++;
      else if (m.puesto <= 10) t.top10++;
      else if (m.puesto <= 20) t.top20++;
      else if (m.puesto <= 100) t.top100++;
    }

    porFecha.set(dia, t);
  }

  const posiciones = [...porFecha.entries()]
    .map(([fecha, t]) => ({ fecha, ...t }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  /* ---------------- Trabajo hecho, para cruzarlo con el tráfico ---------------- */
  const registro = await db.registro.findMany({
    where: { clienteId, creado: { gte: desde }, accion: { in: TRABAJO }, resultado: "ok" },
    select: { creado: true },
  });

  const porDiaTrabajo = new Map<string, number>();
  for (const r of registro) {
    const dia = r.creado.toISOString().slice(0, 10);
    porDiaTrabajo.set(dia, (porDiaTrabajo.get(dia) ?? 0) + 1);
  }

  const trabajo = [...porDiaTrabajo.entries()]
    .map(([fecha, cuantos]) => ({ fecha, cuantos }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  /* ---------------- Estado técnico y enlaces, de lo ya guardado ---------------- */
  const [rastreo, enlaces, velocidad, keywords] = await Promise.all([
    db.rastreo.findFirst({
      where: { clienteId, estado: "terminado" },
      orderBy: { creado: "desc" },
      select: { id: true, hechas: true, creado: true },
    }),
    db.backlinks.findUnique({ where: { clienteId }, select: { datos: true, medido: true } }),
    db.medicionVelocidad.findMany({ where: { clienteId }, select: { nota: true } }),
    db.keyword.count({ where: { clienteId } }),
  ]);

  let tecnico: { paginas: number; rotas: number; noIndexables: number; medido: string } | null = null;

  if (rastreo) {
    const [rotas, noIndexables] = await Promise.all([
      db.pagina.count({
        where: { rastreoId: rastreo.id, OR: [{ estado: { gte: 400 } }, { estado: null }] },
      }),
      db.pagina.count({ where: { rastreoId: rastreo.id, noindex: true, destino: null } }),
    ]);

    tecnico = {
      paginas: rastreo.hechas,
      rotas,
      noIndexables,
      medido: rastreo.creado.toISOString().slice(0, 10),
    };
  }

  const conNota = velocidad.filter((v) => v.nota != null);

  /* ---------------- Histórico del dominio, de lo ya explorado ----------------
   *
   * Es la curva que enseña Semrush: cuántas palabras hay en cada tramo, mes a
   * mes, del dominio ENTERO y no solo de las que seguimos nosotros. Sale de la
   * exploración que ya se pagó alguna vez, así que abrir esta pestaña no cuesta
   * nada; si el dominio nunca se exploró, sencillamente no hay curva.
   */
  const limpio = cliente.dominio
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  const exploracion = await db.exploracion.findFirst({
    where: { dominio: limpio },
    orderBy: { creado: "desc" },
    select: { datos: true, creado: true },
  });

  let historico: unknown[] = [];
  let exploradoEl: string | null = null;

  if (exploracion) {
    try {
      const p = JSON.parse(exploracion.datos) as {
        historico?: { mes: string; keywords: number; trafico: number; tramos?: Record<string, number> }[];
      };

      // Las exploraciones anteriores a hoy guardaron el histórico sin los
      // tramos. Se descartan en vez de pintarlas a cero, que sería enseñar una
      // caída que no ocurrió.
      historico = (p.historico ?? []).filter((f) => f.tramos);
      exploradoEl = exploracion.creado.toISOString().slice(0, 10);
    } catch {
      historico = [];
    }
  }

  return Response.json({
    cliente: { nombre: cliente.nombre, dominio: cliente.dominio },
    dias,
    trafico,
    traficoAnterior,
    avisoGsc,
    posiciones,
    trabajo,
    tecnico,
    keywords,
    reparto,
    consultasTotales,
    tramosMes,
    historico,
    exploradoEl,
    velocidad: conNota.length
      ? Math.round(conNota.reduce((t, v) => t + (v.nota ?? 0), 0) / conNota.length)
      : null,
    enlaces: enlaces
      ? {
          medido: enlaces.medido.toISOString().slice(0, 10),
          resumen: (JSON.parse(enlaces.datos) as { resumen?: Record<string, number> }).resumen ?? null,
        }
      : null,
  });
}
