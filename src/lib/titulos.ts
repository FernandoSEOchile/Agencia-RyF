import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { claveApi, espacioTrabajo, modelo } from "@/lib/config";
import { apuntarClaude } from "@/lib/gasto";

/**
 * Pone título a un hilo recién abierto.
 *
 * Sin esto el título eran los primeros sesenta caracteres del primer
 * mensaje, y cinco hilos que empezaban por «Creame una landing en Elementor
 * para esta keyword…» se llamaban exactamente igual. Es una línea con el
 * modelo barato; cuesta una fracción de centavo y se apunta como todo.
 */
export async function titular(conversacionId: string, pregunta: string, respuesta: string) {
  const apiKey = await claveApi();
  if (!apiKey) return;

  const espacio = await espacioTrabajo();
  const anthropic = new Anthropic({
    apiKey,
    defaultHeaders: espacio ? { "anthropic-workspace-id": espacio } : undefined,
  });

  const m = await modelo("mecanica");

  const r = await anthropic.messages.create({
    model: m,
    max_tokens: 40,
    system:
      "Resume en un título de 3 a 7 palabras, en español de Chile, sin comillas ni punto final, qué se pidió en esta conversación. Solo el título.",
    messages: [
      {
        role: "user",
        content: `Petición: ${pregunta.slice(0, 600)}\n\nRespuesta (inicio): ${respuesta.slice(0, 400)}`,
      },
    ],
  });

  const texto = r.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["«]|["»]$/g, "")
    .slice(0, 60);

  if (texto) {
    await db.conversacion.update({ where: { id: conversacionId }, data: { titulo: texto } });
  }

  const conv = await db.conversacion.findUnique({
    where: { id: conversacionId },
    select: { clienteId: true, usuarioId: true },
  });
  await apuntarClaude({
    clienteId: conv?.clienteId,
    usuarioId: conv?.usuarioId,
    concepto: "titulo",
    modelo: m,
    entrada: r.usage.input_tokens,
    salida: r.usage.output_tokens,
  });
}
