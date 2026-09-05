import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { tomar, soltar } from "@/lib/candado";
import { medirIa, PLATAFORMAS, type Plataforma } from "@/lib/ia";
import { sugerirPrompts } from "@/lib/promptsIa";

/**
 * Visibilidad en IA: prompts por cliente, sus respuestas y la medición.
 *
 * Como en posiciones, lo que cuesta dinero —medir, pedir sugerencias— lo
 * lanza una persona; leer lo guardado no cuesta nada.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function permiso(clienteId: string) {
  const sesion = await auth();
  if (!sesion?.user?.id) return { error: "Sesión no iniciada.", codigo: 401 as const };
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nombre: true, dominio: true, marca: true },
  });
  if (!cliente) return { error: "Ese cliente no existe.", codigo: 404 as const };

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return { error: "Sin acceso a este cliente.", codigo: 403 as const };
  }
  return { usuarioId: sesion.user.id, rol, cliente };
}

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") || "";
  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });

  const prompts = await db.promptIa.findMany({
    where: { clienteId },
    orderBy: { creado: "asc" },
    include: { respuestas: { orderBy: { medido: "desc" }, take: 24 } },
  });

  // La última respuesta por plataforma, y el histórico de apariciones para
  // los puntitos: las ocho últimas pasadas de cada una.
  const filas = prompts.map((pr) => {
    const porPlataforma: Record<string, unknown> = {};
    for (const pl of PLATAFORMAS) {
      const de = pr.respuestas.filter((r) => r.plataforma === pl);
      const ultima = de[0];
      porPlataforma[pl] = ultima
        ? {
            aparece: ultima.aparece,
            citado: ultima.citado,
            posicion: ultima.posicion,
            url: ultima.url,
            medido: ultima.medido.toISOString(),
            dominios: JSON.parse(ultima.dominios) as string[],
            texto: ultima.texto,
            historial: de.slice(0, 8).reverse().map((r) => r.aparece),
          }
        : null;
    }
    return { id: pr.id, texto: pr.texto, activo: pr.activo, plataformas: porPlataforma };
  });

  // Quién sale cuando el cliente no: los dominios más citados en las últimas
  // respuestas, que es la lista de a quién le está ganando la IA.
  const cuenta = new Map<string, number>();
  const objetivo = p.cliente.dominio.replace(/^www\./, "").toLowerCase();
  for (const pr of prompts) {
    for (const pl of PLATAFORMAS) {
      const ultima = pr.respuestas.find((r) => r.plataforma === pl);
      if (!ultima) continue;
      for (const d of JSON.parse(ultima.dominios) as string[]) {
        if (d === objetivo) continue;
        cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
      }
    }
  }
  const competidores = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([dominio, veces]) => ({ dominio, veces }));

  const resumen: Record<string, { aparece: number; citado: number; total: number }> = {};
  for (const pl of PLATAFORMAS) {
    const con = filas.map((f) => f.plataformas[pl] as { aparece: boolean; citado: boolean } | null).filter(Boolean) as { aparece: boolean; citado: boolean }[];
    resumen[pl] = { aparece: con.filter((x) => x.aparece).length, citado: con.filter((x) => x.citado).length, total: con.length };
  }

  // Lo que dice Google en su propio bloque de IA, de las palabras seguidas.
  const keywords = await db.keyword.findMany({
    where: { clienteId, activa: true },
    select: { termino: true, posiciones: { orderBy: { medido: "desc" }, take: 1, select: { iaOverview: true, iaCitado: true, iaFuentes: true } } },
  });
  const conDato = keywords.filter((k) => k.posiciones[0]?.iaOverview !== null && k.posiciones[0]?.iaOverview !== undefined);
  const fuentesOverview = new Map<string, number>();
  for (const k of conDato) {
    for (const d of JSON.parse(k.posiciones[0]?.iaFuentes ?? "[]") as string[]) {
      if (d === objetivo) continue;
      fuentesOverview.set(d, (fuentesOverview.get(d) ?? 0) + 1);
    }
  }
  const overview = {
    medidas: conDato.length,
    conBloque: conDato.filter((k) => k.posiciones[0]?.iaOverview).length,
    citadas: conDato.filter((k) => k.posiciones[0]?.iaCitado).length,
    fuentes: [...fuentesOverview.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([dominio, veces]) => ({ dominio, veces })),
  };

  return Response.json({
    marca: p.cliente.marca?.trim() || p.cliente.nombre,
    prompts: filas,
    resumen,
    competidores,
    overview,
  });
}

export async function POST(req: NextRequest) {
  const { clienteId, accion, textos, marca } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") return Response.json({ error: "Los lectores no pueden editar." }, { status: 403 });

  if (accion === "marca") {
    const m = String(marca ?? "").trim().slice(0, 80);
    await db.cliente.update({ where: { id: p.cliente.id }, data: { marca: m || null } });
    return Response.json({ ok: true, marca: m || p.cliente.nombre });
  }

  if (accion === "sugerir") {
    const propuestas = await sugerirPrompts(p.cliente.id, p.usuarioId);
    return Response.json({ ok: true, propuestas });
  }

  // Añadir: una por línea, sin repetir las que ya están.
  const lineas = String(textos ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 8 && l.length <= 300);
  if (lineas.length === 0) return Response.json({ error: "Escribe al menos una pregunta." }, { status: 400 });

  const existentes = new Set(
    (await db.promptIa.findMany({ where: { clienteId: p.cliente.id }, select: { texto: true } })).map((x) => x.texto.toLowerCase())
  );
  const nuevas = [...new Set(lineas)].filter((l) => !existentes.has(l.toLowerCase())).slice(0, 50);
  if (nuevas.length) {
    await db.promptIa.createMany({ data: nuevas.map((texto) => ({ clienteId: p.cliente.id, texto })) });
  }
  await anotar({ usuarioId: p.usuarioId, clienteId: p.cliente.id, accion: "ia_prompts", resumen: `${nuevas.length} preguntas de IA añadidas` });
  return Response.json({ ok: true, añadidas: nuevas.length, recibidas: lineas.length });
}

export async function PATCH(req: NextRequest) {
  const { clienteId, plataformas } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") return Response.json({ error: "Los lectores no pueden medir." }, { status: 403 });

  const pedidas = (Array.isArray(plataformas) ? plataformas : []).filter((x): x is Plataforma => PLATAFORMAS.includes(x));

  const candado = `ia:${p.cliente.id}`;
  if (!tomar(candado)) {
    return Response.json({ error: "Ya hay una medición de IA en curso para este cliente." }, { status: 409 });
  }
  try {
    const r = await medirIa({ clienteId: p.cliente.id, usuarioId: p.usuarioId, plataformas: pedidas });
    if (r.hechas === 0 && r.fallos.length > 0) {
      return Response.json({ error: r.fallos[0] }, { status: 502 });
    }
    return Response.json({ ok: true, hechas: r.hechas, coste: r.coste, fallos: r.fallos.length, detalleFallos: r.fallos.slice(0, 3) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo medir." }, { status: 500 });
  } finally {
    soltar(candado);
  }
}

export async function DELETE(req: NextRequest) {
  const { clienteId, promptId } = await req.json();
  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") return Response.json({ error: "Los lectores no pueden editar." }, { status: 403 });

  // Con clienteId en el where: nadie borra la pregunta de otro cliente por id.
  await db.promptIa.deleteMany({ where: { id: String(promptId), clienteId: p.cliente.id } });
  return Response.json({ ok: true });
}
