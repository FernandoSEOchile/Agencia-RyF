import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { credenciales, medir } from "@/lib/dataforseo";

/**
 * Seguimiento de posiciones.
 *
 * Medir va por petición del usuario y no en segundo plano porque cada consulta
 * cuesta dinero: que alguien pulse un botón deja claro quién lo gastó y por
 * qué. La medición programada llegará después, y esa sí irá por la cola barata
 * del proveedor.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** Cuántas consultas se miden como mucho en una sola pasada. */
const TOPE = 40;

/** Cuántas van en paralelo. Suficiente para no eternizarse, sin castigar al proveedor. */
const A_LA_VEZ = 5;

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

  const cred = await credenciales();
  if (!cred) {
    return Response.json(
      { error: "Falta configurar DataForSEO. Un administrador puede hacerlo en Ajustes." },
      { status: 400 }
    );
  }

  let keywords = await db.keyword.findMany({
    where: { clienteId: String(clienteId), activa: true },
    include: { posiciones: { orderBy: { medido: "desc" }, take: 1 } },
    orderBy: { creado: "asc" },
  });

  // Medir solo lo que nunca se midió es lo que se quiere justo después de
  // pegar una lista nueva, y evita pagar dos veces por lo que ya está al día.
  if (soloNuevas) keywords = keywords.filter((k) => k.posiciones.length === 0);

  const recortada = keywords.slice(0, TOPE);
  if (recortada.length === 0) {
    return Response.json({ ok: true, medidas: 0, fallos: 0, coste: 0, pendientes: 0 });
  }

  let medidas = 0;
  let coste = 0;
  const fallos: string[] = [];

  for (let i = 0; i < recortada.length; i += A_LA_VEZ) {
    const tanda = recortada.slice(i, i + A_LA_VEZ);

    await Promise.all(
      tanda.map(async (k) => {
        try {
          const r = await medir(cred, p.dominio, {
            termino: k.termino,
            ubicacion: k.ubicacion,
            idioma: k.idioma,
            dispositivo: k.dispositivo,
          });

          await db.posicion.create({
            data: {
              keywordId: k.id,
              puesto: r.puesto,
              url: r.url,
              bloquesArriba: r.bloquesArriba,
              coste: r.coste,
            },
          });

          medidas++;
          coste += r.coste ?? 0;
        } catch (e) {
          fallos.push(`${k.termino}: ${e instanceof Error ? e.message : "error"}`);
        }
      })
    );

    // Si falla todo de golpe —saldo agotado, credenciales malas— no tiene
    // sentido seguir quemando intentos contra el mismo muro.
    if (fallos.length >= 8 && medidas === 0) break;
  }

  await anotar({
    usuarioId: p.usuarioId,
    clienteId: String(clienteId),
    accion: "posiciones",
    resumen: `${medidas} consultas medidas · US$${coste.toFixed(4)}${
      fallos.length ? ` · ${fallos.length} con error` : ""
    }`,
    resultado: medidas > 0 ? "ok" : "error",
  });

  return Response.json({
    ok: true,
    medidas,
    fallos: fallos.length,
    detalleFallos: fallos.slice(0, 3),
    coste,
    pendientes: Math.max(0, keywords.length - recortada.length),
  });
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
