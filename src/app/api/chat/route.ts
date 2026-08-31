/**
 * Turno de conversación sobre un cliente.
 *
 * Devuelve un flujo de líneas JSON —una por evento— en vez de esperar a la
 * respuesta completa: una tanda con varias herramientas puede tardar minutos, y
 * dejar la pantalla en blanco todo ese rato es inaceptable.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversar, instrucciones, type Turno } from "@/lib/asistente";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return Response.json({ error: "Sesión no iniciada." }, { status: 401 });
  }

  const { clienteId, conversacionId, mensaje } = await req.json();

  if (!clienteId || !mensaje?.trim()) {
    return Response.json({ error: "Faltan datos." }, { status: 400 });
  }

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const usuarioId = sesion.user.id;

  const cliente = await db.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente || !cliente.activo) {
    return Response.json({ error: "Cliente no disponible." }, { status: 404 });
  }

  if (rol !== "ADMIN") {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId, clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso a este cliente." }, { status: 403 });
  }

  // Un LECTOR nunca escribe, aunque el sitio lo permita. Y si el sitio está en
  // solo lectura, tampoco escribe nadie: manda el ajuste del cliente.
  const puedeEscribir = rol !== "LECTOR" && cliente.soloLectura === false;

  // Conversación: se reutiliza la que venga, o se abre una nueva.
  const conversacion = conversacionId
    ? await db.conversacion.findUnique({ where: { id: conversacionId } })
    : await db.conversacion.create({
        data: {
          clienteId,
          usuarioId,
          titulo: mensaje.trim().slice(0, 60),
        },
      });

  if (!conversacion || conversacion.clienteId !== clienteId) {
    return Response.json({ error: "Conversación no válida." }, { status: 400 });
  }

  const previos = await db.mensaje.findMany({
    where: { conversacionId: conversacion.id },
    orderBy: { creado: "asc" },
    // Se recortan los turnos más antiguos: el historial completo de una
    // conversación larga se paga entero en cada mensaje nuevo.
    take: 40,
  });

  await db.mensaje.create({
    data: { conversacionId: conversacion.id, rol: "user", contenido: mensaje },
  });

  const historial: Turno[] = [
    ...previos.map((m) => ({ rol: m.rol as "user" | "assistant", contenido: m.contenido })),
    { rol: "user" as const, contenido: mensaje },
  ];

  const sistema = instrucciones({
    nombre: cliente.nombre,
    dominio: cliente.dominio,
    version: cliente.version,
    puedeEscribir,
  });

  const codificador = new TextEncoder();
  const usadas: string[] = [];

  const flujo = new ReadableStream({
    async start(control) {
      const enviar = (e: Record<string, unknown>) =>
        control.enqueue(codificador.encode(JSON.stringify(e) + "\n"));

      enviar({ tipo: "inicio", conversacionId: conversacion.id });

      try {
        const r = await conversar(
          { clienteId, usuarioId, puedeEscribir },
          sistema,
          historial,
          (e) => {
            if (e.tipo === "herramienta") usadas.push(String(e.nombre));
            enviar(e);
          }
        );

        await db.mensaje.create({
          data: {
            conversacionId: conversacion.id,
            rol: "assistant",
            contenido: r.texto,
            usadas: usadas.length ? JSON.stringify(usadas) : null,
            entrada: r.entrada,
            salida: r.salida,
          },
        });

        // El coste se muestra al terminar: es la única forma de que quien usa
        // el panel sepa lo que va gastando antes de que llegue la factura.
        enviar({
          tipo: "fin",
          entrada: r.entrada,
          salida: r.salida,
          coste: (r.entrada * 5 + r.salida * 25) / 1e6,
        });
      } catch (e) {
        const mensajeError = e instanceof Error ? e.message : "Error desconocido";
        enviar({ tipo: "error", mensaje: mensajeError });
      } finally {
        control.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
