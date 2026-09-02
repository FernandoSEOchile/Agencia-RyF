import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { claveApi, modelo, espacioTrabajo } from "@/lib/config";
import { apuntarClaude } from "@/lib/gasto";

/**
 * La bitácora mensual de un cliente.
 *
 * Existe para enseñársela a quien paga, y eso condiciona todo lo demás. El
 * registro técnico ya está lleno de «arquitectura», «sondeo», «escribir_css»:
 * exacto e ilegible para un cliente. Aquí van frases enteras, sin jerga y
 * agrupadas por mes.
 */

export const CATEGORIAS = [
  ["contenido", "Contenido"],
  ["arquitectura", "Arquitectura"],
  ["tecnico", "Técnico"],
  ["diseno", "Diseño"],
  ["analisis", "Análisis"],
  ["otro", "Otro"],
] as const;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «2026-09» → «Septiembre de 2026». */
export function mesLegible(mes: string): string {
  const [a, m] = mes.split("-");
  const nombre = MESES[Number(m) - 1] ?? mes;
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} de ${a}`;
}

/** El mes de una fecha, en el formato que se guarda. */
export function mesDe(f: Date): string {
  return f.toISOString().slice(0, 7);
}

const Entrada = z.object({
  categoria: z
    .enum(["contenido", "arquitectura", "tecnico", "diseno", "analisis", "otro"])
    .describe("A qué tipo de trabajo corresponde."),
  titulo: z
    .string()
    .describe("Una frase que entienda el cliente, sin jerga y sin punto final. Con cifras cuando las haya."),
  detalle: z.string().nullable().describe("Una frase más de contexto, o null si el título ya se basta."),
});

const Respuesta = z.object({
  entradas: z.array(Entrada),
});

async function cliente() {
  const apiKey = await claveApi();
  if (!apiKey) throw new Error("No hay clave de la API configurada.");
  const espacio = await espacioTrabajo();
  return new Anthropic({
    apiKey,
    defaultHeaders: espacio ? { "anthropic-workspace-id": espacio } : undefined,
  });
}

/**
 * Redacta la bitácora de un mes a partir del registro técnico.
 *
 * Se agrupa deliberadamente: veinte líneas de «producto actualizado» no son
 * veinte logros, son uno —«optimización de veinte fichas de producto»— y así
 * es como lo entiende un cliente. Un informe con cien viñetas repetidas se
 * lee como relleno, aunque el trabajo sea real.
 */
export async function redactarMes(
  clienteId: string,
  mes: string,
  usuarioId?: string
): Promise<number> {
  const desde = new Date(`${mes}-01T00:00:00Z`);
  const hasta = new Date(desde);
  hasta.setUTCMonth(hasta.getUTCMonth() + 1);

  const registro = await db.registro.findMany({
    where: { clienteId, creado: { gte: desde, lt: hasta } },
    orderBy: { creado: "asc" },
    select: { accion: true, resumen: true, resultado: true, creado: true },
    take: 500,
  });

  if (registro.length === 0) {
    throw new Error("No hay actividad registrada en ese mes.");
  }

  const yaEscritas = await db.bitacora.findMany({
    where: { clienteId, mes },
    select: { titulo: true },
  });

  const anthropic = await cliente();
  const m = await modelo();

  const texto = [
    `Registro técnico de ${mes}:`,
    ...registro.map(
      (r) =>
        `${r.creado.toISOString().slice(0, 10)} · ${r.accion}${
          r.resultado !== "ok" ? " (falló)" : ""
        } · ${r.resumen}`
    ),
    yaEscritas.length
      ? `\nYa hay estas entradas en la bitácora, no las repitas:\n${yaEscritas
          .map((e) => `- ${e.titulo}`)
          .join("\n")}`
      : "",
  ].join("\n");

  const r = await anthropic.messages.parse({
    model: m,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: `Redactas la bitácora mensual que una agencia SEO le entrega a su cliente.

Recibes el registro técnico de un mes: las operaciones que el panel ejecutó sobre el sitio. Tu trabajo es convertirlo en una lista corta que el cliente entienda y valore.

Cómo hacerlo:
- AGRUPA. Veinte líneas de «producto actualizado» no son veinte logros, son uno: «Optimización de contenido en 20 fichas de producto». Un informe con cien viñetas repetidas se lee como relleno aunque el trabajo sea real.
- Escribe en el lenguaje del cliente, no en el de la herramienta. Nada de «escribir_css», «sondeo» ni «cotejo». Di qué se consiguió, no qué función se llamó.
- Incluye las cifras cuando las haya: cuántas páginas, cuántas categorías, cuántas consultas. Son lo que hace creíble el informe.
- Entre seis y doce entradas para un mes con trabajo. Si el mes tuvo poco, dos o tres; no lo infles.
- Nada de promesas ni de resultados que no estén en el registro. Si solo se analizó, di que se analizó; no digas que se mejoró el posicionamiento.
- Las operaciones que fallaron no van: no son trabajo entregado.
- No cuentes lo puramente interno —conectar el sitio al panel, cambiar una clave— salvo que fuera el trabajo del mes.

Sin punto final en los títulos.`,
    messages: [{ role: "user", content: texto }],
    output_config: { format: zodOutputFormat(Respuesta) },
  });

  await apuntarClaude({
    clienteId,
    usuarioId,
    concepto: "bitacora",
    modelo: m,
    entrada: r.usage?.input_tokens ?? 0,
    salida: r.usage?.output_tokens ?? 0,
  });

  const entradas = r.parsed_output?.entradas ?? [];
  if (entradas.length === 0) throw new Error("El modelo no devolvió ninguna entrada.");

  await db.bitacora.createMany({
    data: entradas.map((e) => ({
      clienteId,
      mes,
      categoria: e.categoria,
      titulo: e.titulo.replace(/\.$/, ""),
      detalle: e.detalle,
      automatico: true,
    })),
  });

  return entradas.length;
}
