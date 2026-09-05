import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { claveApi, espacioTrabajo, modelo } from "@/lib/config";
import { apuntarClaude } from "@/lib/gasto";

/**
 * Propone prompts de IA para un cliente.
 *
 * Escribir a mano «lo que la gente le pregunta a ChatGPT» es difícil de
 * imaginar en frío. El modelo lo hace a partir de lo que ya sabemos del
 * cliente: las palabras que sigue, por qué búsquedas aparece en Google y a
 * qué se dedica. Devuelve propuestas; guardar es decisión de la persona.
 */
export async function sugerirPrompts(clienteId: string, usuarioId: string, cuantos = 10): Promise<string[]> {
  const apiKey = await claveApi();
  if (!apiKey) throw new Error("No hay clave de la API configurada.");

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { nombre: true, dominio: true, instrucciones: true, marca: true },
  });
  if (!cliente) throw new Error("Ese cliente no existe.");

  const [keywords, existentes] = await Promise.all([
    db.keyword.findMany({ where: { clienteId, activa: true }, select: { termino: true }, take: 40 }),
    db.promptIa.findMany({ where: { clienteId }, select: { texto: true } }),
  ]);

  const espacio = await espacioTrabajo();
  const anthropic = new Anthropic({
    apiKey,
    defaultHeaders: espacio ? { "anthropic-workspace-id": espacio } : undefined,
  });
  const m = await modelo("redaccion");

  const r = await anthropic.messages.create({
    model: m,
    max_tokens: 800,
    system:
      "Propones preguntas que una persona real en Chile le haría a ChatGPT o Gemini y cuya respuesta podría recomendar a un negocio concreto. Español de Chile, natural, como se escribe en un chat: con contexto (ciudad, presupuesto, situación), no como palabras clave. Una por línea, sin numerar, sin comillas, sin explicaciones. Nunca nombres al negocio en la pregunta: se quiere saber si la IA lo recomienda sola.",
    messages: [
      {
        role: "user",
        content: `Negocio: ${cliente.nombre} (${cliente.dominio}).${cliente.instrucciones ? `\nLo que sabemos de él: ${cliente.instrucciones.slice(0, 800)}` : ""}${
          keywords.length ? `\nPalabras que sigue en Google: ${keywords.map((k) => k.termino).join(", ")}` : ""
        }${existentes.length ? `\nYa tiene estas preguntas (no las repitas): ${existentes.map((p) => p.texto).join(" | ")}` : ""}\n\nEscribe ${cuantos} preguntas distintas, variadas en intención: comprar, comparar, elegir, precio, dónde, para quién.`,
      },
    ],
  });

  await apuntarClaude({
    clienteId,
    usuarioId,
    concepto: "ia_prompts",
    modelo: m,
    entrada: r.usage.input_tokens,
    salida: r.usage.output_tokens,
  });

  return r.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").replace(/^["«]|["»]$/g, "").trim())
    .filter((l) => l.length > 12 && l.length <= 300)
    .slice(0, cuantos);
}
