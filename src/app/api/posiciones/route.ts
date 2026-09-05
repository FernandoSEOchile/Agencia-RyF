import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";

import { tomar, soltar } from "@/lib/candado";
import { medirPosiciones } from "@/lib/medicion";

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

  const cliente = await db.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return { error: "Ese cliente no existe.", codigo: 404 as const };

  return { usuarioId: sesion.user.id, rol, dominio: cliente.dominio };
}

/** Añade consultas al seguimiento. Acepta varias líneas de una vez. */
export async function POST(req: NextRequest) {
  const { clienteId, terminos, ubicacion, idioma, dispositivo } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden añadir consultas." }, { status: 403 });
  }

  // Se admite un pegote de varias líneas porque así es como llega una lista de
  // keywords: de una hoja de cálculo, no escrita a mano una por una.
  const lista = [
    ...new Set(
      String(terminos || "")
        .split(/[\n;]+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 1 && t.length < 200)
    ),
  ];

  if (lista.length === 0) {
    return Response.json({ error: "No había ninguna consulta que añadir." }, { status: 400 });
  }
  if (lista.length > 200) {
    return Response.json({ error: "Máximo 200 consultas de una vez." }, { status: 400 });
  }

  const datos = lista.map((termino) => ({
    clienteId: String(clienteId),
    termino,
    ubicacion: Number(ubicacion) || 2152,
    idioma: String(idioma || "es"),
    dispositivo: dispositivo === "mobile" ? "mobile" : "desktop",
  }));

  // Las repetidas se ignoran en silencio: reañadir una lista que ya estaba
  // dentro es lo normal, y no es un error que merezca detener el resto.
  const { count } = await db.keyword.createMany({ data: datos, skipDuplicates: true });

  return Response.json({ ok: true, añadidas: count, recibidas: lista.length });
}

/** Mide las consultas pendientes y guarda el resultado. */
export async function PATCH(req: NextRequest) {
  const { clienteId, soloNuevas } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden medir." }, { status: 403 });
  }

  // Dos personas —o dos pestañas— pulsando «Medir» a la vez pagaban la
  // medición dos veces. Una a la vez por cliente.
  const candado = `posiciones:${String(clienteId)}`;
  if (!tomar(candado)) {
    return Response.json(
      { error: "Ya hay una medición en curso para este cliente. Espera a que termine." },
      { status: 409 }
    );
  }

  try {
  const r = await medirPosiciones({
    clienteId: String(clienteId),
    dominio: p.dominio,
    usuarioId: p.usuarioId,
    soloNuevas: Boolean(soloNuevas),
    tope: 40,
  });
  const { medidas, coste, fallos, pendientes } = r;

  return Response.json({
    ok: true,
    medidas,
    fallos: fallos.length,
    detalleFallos: fallos.slice(0, 3),
    coste,
    pendientes,
  });
  } finally {
    soltar(candado);
  }
}

/** Quita una consulta del seguimiento, con todo su histórico. */
export async function DELETE(req: NextRequest) {
  const { keywordId } = await req.json();

  const k = await db.keyword.findUnique({ where: { id: String(keywordId || "") } });
  if (!k) return Response.json({ error: "Esa consulta no existe." }, { status: 404 });

  const p = await permiso(k.clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden borrar." }, { status: 403 });
  }

  await db.keyword.delete({ where: { id: k.id } });
  return Response.json({ ok: true });
}

/**
 * Activar o quitar la medición automática.
 *
 * Es la única forma de que el panel gaste sin que alguien pulse en ese
 * momento, así que la decisión la toma una persona desde la ficha, con el
 * coste por pasada a la vista, y queda anotada con su nombre.
 */
export async function PUT(req: NextRequest) {
  const { clienteId, medirCada } = await req.json();

  const p = await permiso(String(clienteId || ""));
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden programar mediciones." }, { status: 403 });
  }

  const dias = medirCada === null || medirCada === "" ? null : Number(medirCada);
  if (dias !== null && ![7, 14, 30].includes(dias)) {
    return Response.json({ error: "Cada 7, 14 o 30 días." }, { status: 400 });
  }

  await db.cliente.update({ where: { id: String(clienteId) }, data: { medirCada: dias } });
  await anotar({
    usuarioId: p.usuarioId,
    clienteId: String(clienteId),
    accion: "posiciones_programar",
    resumen: dias ? `Medición automática cada ${dias} días` : "Medición automática desactivada",
  });

  return Response.json({ ok: true, medirCada: dias });
}
