import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { apuntarClaude, costeClaude } from "@/lib/gasto";
import { modelo as modeloActual } from "@/lib/config";
import { mensajeDeError } from "@/lib/asistente";
import {
  conversarArquitectura,
  instruccionesArquitectura,
} from "@/lib/arquitecturaChat";

/**
 * Chat para corregir una arquitectura.
 *
 * No guarda historial en la base como el chat de cliente: esta conversación
 * es de usar y tirar —se arregla lo que esté mal y se cierra—, así que el
 * historial vive en el navegador y llega entero en cada envío.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { arquitecturaId, historial } = await req.json();

  const sesion = await auth();
  if (!sesion?.user?.id) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden modificar la arquitectura." }, { status: 403 });
  }

  const a = await db.arquitectura.findUnique({
    where: { id: String(arquitecturaId || "") },
    include: { cliente: true },
  });
  if (!a) return Response.json({ error: "No existe esa arquitectura." }, { status: 404 });

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId: a.clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso a este cliente." }, { status: 403 });
  }

  const turnos = (Array.isArray(historial) ? historial : [])
    .filter((t) => t && (t.rol === "user" || t.rol === "assistant") && typeof t.contenido === "string")
    .slice(-24)
    .map((t) => ({ rol: t.rol as "user" | "assistant", contenido: String(t.contenido).slice(0, 20000) }));

  if (turnos.length === 0) {
    return Response.json({ error: "No había ningún mensaje." }, { status: 400 });
  }

  const sistema = instruccionesArquitectura(a.cliente.nombre, a.cliente.dominio);
  const codificador = new TextEncoder();
  const usadas: string[] = [];

  const flujo = new ReadableStream({
    async start(control) {
      const enviar = (e: Record<string, unknown>) =>
        control.enqueue(codificador.encode(JSON.stringify(e) + "\n"));

      enviar({ tipo: "inicio" });

      try {
        const r = await conversarArquitectura(
          { arquitecturaId: a.id, clienteId: a.clienteId, usuarioId: sesion.user!.id! },
          sistema,
          turnos,
          (e) => {
            if (e.tipo === "herramienta") usadas.push(String(e.nombre));
            enviar(e);
          }
        );

        // Solo se anota si tocó algo: una conversación de consulta no es un
        // cambio y llenar el registro de ruido lo vuelve inútil.
        const cambios = usadas.filter((u) =>
          ["releer_con_otro_esquema", "editar_seccion", "crear_seccion", "borrar_seccion", "recotejar"].includes(u)
        );

        if (cambios.length) {
          await anotar({
            usuarioId: sesion.user!.id!,
            clienteId: a.clienteId,
            accion: "arquitectura",
            resumen: `Corregida desde el chat: ${[...new Set(cambios)].join(", ")}`,
          });
        }

        const m = await modeloActual();
        await apuntarClaude({
          clienteId: a.clienteId,
          usuarioId: sesion.user!.id!,
          concepto: "arquitectura",
          modelo: m,
          entrada: r.entrada,
          salida: r.salida,
        });

        enviar({
          tipo: "fin",
          cambios: cambios.length > 0,
          coste: costeClaude(m, r.entrada, r.salida),
        });
      } catch (e) {
        enviar({ tipo: "error", mensaje: mensajeDeError(e) });
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
