import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo } from "@/lib/clientes";
import { porDia } from "@/lib/gsc";

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
  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 180, 28), 480);

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
  let avisoGsc: string | null = null;

  if (cliente.gscConexionId && cliente.gscPropiedad) {
    try {
      trafico = await porDia(cliente.gscConexionId, cliente.gscPropiedad, dias);
    } catch (e) {
      avisoGsc = e instanceof Error ? e.message : "No se pudo leer Search Console.";
    }
  } else {
    avisoGsc = "Este sitio no tiene Search Console conectado, así que no hay datos de tráfico.";
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

  return Response.json({
    cliente: { nombre: cliente.nombre, dominio: cliente.dominio },
    dias,
    trafico,
    avisoGsc,
    posiciones,
    trabajo,
    tecnico,
    keywords,
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
