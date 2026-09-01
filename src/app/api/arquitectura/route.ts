import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { parseArquitectura, aplanar } from "@/lib/ast";
import { candidatosDe, cotejar } from "@/lib/cotejo";
import { cotejarConIA, type Pendiente } from "@/lib/cotejoIA";

/**
 * Sube un Excel de arquitectura, lo lee y lo cruza contra el sitio.
 *
 * El cotejo se hace aquí mismo, al subir, y no bajo demanda: leer el catálogo
 * entero de un cliente tarda unos segundos y no tiene sentido repetirlo cada
 * vez que alguien abre la pestaña. Para volver a cruzarlo está el botón de
 * recotejar.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

async function permiso(clienteId: string) {
  const sesion = await auth();
  if (!sesion?.user?.id) return { error: "Sesión no iniciada.", codigo: 401 as const };

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (rol === "LECTOR") return { error: "Los lectores no pueden subir archivos.", codigo: 403 as const };

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return { error: "Sin acceso a este cliente.", codigo: 403 as const };
  }

  const cliente = await db.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return { error: "Ese cliente no existe.", codigo: 404 as const };
  if (!cliente.betaArquitectura) {
    return { error: "Este cliente no tiene activada la función de arquitectura.", codigo: 403 as const };
  }

  return { usuarioId: sesion.user.id, dominio: cliente.dominio };
}

export async function POST(req: NextRequest) {
  const datos = await req.formData();
  const clienteId = String(datos.get("cliente") || "");
  const archivo = datos.get("archivo");

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  if (!(archivo instanceof File)) {
    return Response.json({ error: "Falta el archivo." }, { status: 400 });
  }
  if (archivo.size > 15_000_000) {
    return Response.json({ error: "El archivo pesa más de 15 MB." }, { status: 413 });
  }

  let arbol;
  try {
    arbol = await parseArquitectura(Buffer.from(await archivo.arrayBuffer()));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el Excel." },
      { status: 400 }
    );
  }

  const planos = aplanar(arbol);
  if (planos.length === 0) {
    return Response.json(
      { error: "El archivo se leyó pero no contenía ninguna sección. ¿Tiene la hoja «AST» con slugs que empiecen por «/»?" },
      { status: 400 }
    );
  }

  const candidatos = await candidatosDe(clienteId, p.dominio);

  const arquitectura = await db.arquitectura.create({
    data: {
      clienteId,
      nombre: archivo.name.replace(/\.[^.]+$/, ""),
      archivo: archivo.name,
      subidoPor: p.usuarioId,
      cotejado: new Date(),
      nodos: {
        create: planos.map((n) => {
          const v = cotejar(n.slug, n.nombre, candidatos);
          return {
            slug: n.slug,
            nombre: n.nombre,
            nivel: n.nivel,
            orden: n.orden,
            keywords: JSON.stringify(n.keywords),
            volumen: n.volumen,
            estado: v.estado,
            urlDestino: v.urlDestino,
            objetoId: v.objetoId,
            tipoObjeto: v.tipoObjeto,
            confianza: v.confianza,
            comoSeCotejo: v.comoSeCotejo,
            nota: v.nota,
          };
        }),
      },
    },
    include: { nodos: true },
  });

  // El cruce determinista resolvió lo evidente; lo demás lo decide el modelo,
  // que entiende que «/mochilas-notebook» y «Mochilas Porta Notebook» son la
  // misma sección aunque las cadenas no se parezcan.
  await resolverConIA(arquitectura.id, candidatos);

  const finales = await db.nodoArquitectura.findMany({
    where: { arquitecturaId: arquitectura.id },
    select: { estado: true },
  });
  const creadas = finales.filter((n) => n.estado === "creada").length;
  const faltan = finales.filter((n) => n.estado === "falta").length;

  await anotar({
    usuarioId: p.usuarioId,
    clienteId,
    accion: "arquitectura",
    resumen: `${archivo.name} · ${planos.length} secciones · ${creadas} creadas, ${faltan} por crear`,
  });

  return Response.json({
    id: arquitectura.id,
    secciones: planos.length,
    candidatos: candidatos.length,
  });
}

/** Vuelve a cruzar una arquitectura ya subida contra el estado actual del sitio. */
export async function PATCH(req: NextRequest) {
  const { arquitecturaId } = await req.json();

  const a = await db.arquitectura.findUnique({
    where: { id: String(arquitecturaId || "") },
    include: { nodos: true },
  });
  if (!a) return Response.json({ error: "No existe esa arquitectura." }, { status: 404 });

  const p = await permiso(a.clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const candidatos = await candidatosDe(a.clienteId, p.dominio);

  for (const n of a.nodos) {
    const v = cotejar(n.slug, n.nombre, candidatos);
    await db.nodoArquitectura.update({
      where: { id: n.id },
      data: {
        estado: v.estado,
        urlDestino: v.urlDestino,
        objetoId: v.objetoId,
        tipoObjeto: v.tipoObjeto,
        confianza: v.confianza,
        comoSeCotejo: v.comoSeCotejo,
        nota: v.nota,
      },
    });
  }

  await resolverConIA(a.id, candidatos);
  await db.arquitectura.update({ where: { id: a.id }, data: { cotejado: new Date() } });

  return Response.json({ ok: true, secciones: a.nodos.length });
}

/**
 * Pasa por el modelo las secciones que el cruce automático no resolvió.
 *
 * Un fallo aquí no invalida el trabajo hecho: lo determinista ya está guardado
 * y esas secciones se quedan como estaban, así que se registra el problema y
 * se sigue en vez de tirar todo abajo.
 */
async function resolverConIA(arquitecturaId: string, candidatos: Awaited<ReturnType<typeof candidatosDe>>) {
  const dudosos = await db.nodoArquitectura.findMany({
    where: { arquitecturaId, estado: { in: ["dudosa", "falta"] } },
  });
  if (dudosos.length === 0) return;

  const pendientes: Pendiente[] = dudosos.map((n) => ({
    slug: n.slug,
    nombre: n.nombre,
    keywords: (JSON.parse(n.keywords) as { keyword: string }[]).map((k) => k.keyword),
  }));

  let resultados;
  try {
    resultados = await cotejarConIA(pendientes, candidatos);
  } catch (e) {
    console.error("cotejo con IA falló:", e instanceof Error ? e.message : e);
    return;
  }

  for (const r of resultados) {
    const nodo = dudosos.find((n) => n.slug === r.slug);
    if (!nodo) continue;

    if (r.candidato && r.confianza >= 60) {
      await db.nodoArquitectura.update({
        where: { id: nodo.id },
        data: {
          estado: r.confianza >= 80 ? "creada" : "dudosa",
          urlDestino: r.candidato.url,
          objetoId: r.candidato.id || null,
          tipoObjeto: r.candidato.tipo,
          confianza: r.confianza,
          comoSeCotejo: "ia",
          nota: r.motivo,
        },
      });
    } else {
      await db.nodoArquitectura.update({
        where: { id: nodo.id },
        data: {
          estado: "falta",
          urlDestino: null,
          objetoId: null,
          tipoObjeto: null,
          confianza: r.confianza,
          comoSeCotejo: "ia",
          nota: r.motivo,
        },
      });
    }
  }
}

/** Asignación manual de una URL a una sección. */
export async function PUT(req: NextRequest) {
  const { nodoId, url } = await req.json();

  const nodo = await db.nodoArquitectura.findUnique({
    where: { id: String(nodoId || "") },
    include: { arquitectura: true },
  });
  if (!nodo) return Response.json({ error: "No existe esa sección." }, { status: 404 });

  const p = await permiso(nodo.arquitectura.clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const limpia = String(url || "").trim();

  // Sin URL, la sección vuelve a estar por crear: es la forma de deshacer una
  // asignación equivocada.
  if (!limpia) {
    await db.nodoArquitectura.update({
      where: { id: nodo.id },
      data: { estado: "falta", urlDestino: null, objetoId: null, tipoObjeto: null, confianza: 0, comoSeCotejo: null, nota: null },
    });
    return Response.json({ ok: true, estado: "falta" });
  }

  if (!/^https?:\/\//.test(limpia)) {
    return Response.json({ error: "La URL debe empezar por http:// o https://" }, { status: 400 });
  }

  await db.nodoArquitectura.update({
    where: { id: nodo.id },
    data: {
      estado: "creada",
      urlDestino: limpia,
      confianza: 100,
      comoSeCotejo: "manual",
      nota: "Asignada a mano.",
    },
  });

  return Response.json({ ok: true, estado: "creada" });
}

/**
 * URLs del sitio para el selector manual.
 *
 * Va aparte de la subida porque solo hace falta cuando alguien abre el selector
 * de una sección concreta: leer el sitemap entero cada vez que se pinta la
 * pestaña sería castigar al sitio del cliente sin motivo.
 */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const candidatos = await candidatosDe(clienteId, p.dominio);

  return Response.json({
    urls: candidatos.map((c) => ({ url: c.url, nombre: c.nombre, tipo: c.tipo })),
  });
}
