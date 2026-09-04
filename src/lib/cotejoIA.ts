import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claveApi, modelo, espacioTrabajo } from "@/lib/config";
import type { Candidato } from "@/lib/cotejo";

/**
 * Cotejo asistido por el modelo.
 *
 * El cruce por slug resuelve lo evidente, pero una arquitectura real casi
 * nunca nombra las secciones igual que el sitio: «/mochilas-notebook» puede
 * estar atacada por «Mochilas Porta Notebook» o por una página llamada
 * «Mochilas para computador». Eso lo entiende un modelo y no una comparación
 * de cadenas.
 *
 * Se envía en lotes y con los candidatos ya recortados a los más plausibles:
 * mandar 2000 URLs por cada sección multiplicaría el coste sin mejorar la
 * respuesta.
 */

const Asignacion = z.object({
  slug: z.string().describe("El slug de la sección de la arquitectura, tal cual se recibió."),
  indice: z
    .number()
    .int()
    .describe("Posición de la URL elegida en la lista de candidatos, o -1 si ninguna sirve."),
  confianza: z.number().int().min(0).max(100).describe("Certeza de la elección, de 0 a 100."),
  motivo: z.string().describe("Una frase breve explicando por qué esa URL ataca esa sección, o por qué falta."),
});

const Respuesta = z.object({
  asignaciones: z.array(Asignacion),
});

export interface Pendiente {
  slug: string;
  nombre: string;
  keywords: string[];
}

export interface ResultadoIA {
  slug: string;
  candidato: Candidato | null;
  confianza: number;
  motivo: string;
}

/** Cuántas secciones se resuelven por llamada. */
const LOTE = 25;

/** Cuántos candidatos se ofrecen por sección. */
const CANDIDATOS_POR_SECCION = 12;

/**
 * Recorta los candidatos a los que tienen alguna posibilidad.
 *
 * Sin esto, cada llamada llevaría el catálogo entero y el coste crecería con
 * el tamaño del sitio en vez de con el trabajo real.
 */
function plausibles(p: Pendiente, todos: Candidato[]): Candidato[] {
  const palabras = new Set(
    (p.slug + " " + p.nombre + " " + p.keywords.join(" "))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((x) => x.length > 2)
      .map((x) => (x.endsWith("s") ? x.slice(0, -1) : x))
  );

  return todos
    .map((c) => {
      const texto = (c.nombre + " " + c.slug).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      let puntos = 0;
      for (const w of palabras) if (texto.includes(w)) puntos++;
      return { c, puntos };
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, CANDIDATOS_POR_SECCION)
    .map((x) => x.c);
}

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
 * Pide al modelo que empareje secciones con URLs.
 *
 * Devuelve solo lo que pudo resolver; lo que el modelo marque como sin
 * correspondencia se queda como falta, que es la respuesta correcta.
 */
export async function cotejarConIA(
  pendientes: Pendiente[],
  candidatos: Candidato[]
): Promise<ResultadoIA[]> {
  if (pendientes.length === 0) return [];

  const anthropic = await cliente();
  const m = await modelo("redaccion");
  const salida: ResultadoIA[] = [];

  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE);

    // Cada sección lleva su propia lista de candidatos, y se guarda el mapa
    // para traducir el índice que devuelva el modelo.
    const mapas = lote.map((p) => plausibles(p, candidatos));

    const texto = lote
      .map((p, j) => {
        const lista = mapas[j]
          .map((c, k) => `      [${k}] ${c.nombre}  ·  ${c.url}  ·  ${c.tipo}`)
          .join("\n");
        return [
          `SECCIÓN: ${p.slug}`,
          `  nombre previsto: ${p.nombre}`,
          p.keywords.length ? `  keywords objetivo: ${p.keywords.slice(0, 8).join(", ")}` : "",
          `  URLs candidatas:`,
          lista || "      (ninguna candidata)",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const r = await anthropic.messages.parse({
      model: m,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: `Eres un especialista SEO cotejando la arquitectura prevista de un sitio contra las URLs que existen de verdad.

Para cada SECCIÓN, elige de sus URLs candidatas la que realmente ataca esa sección, y devuelve su índice.

Cómo decidir:
- Lo que importa es la intención de búsqueda, no que los textos se parezcan. Una sección «/mochilas-notebook» está atacada por una categoría «Mochilas Porta Notebook» aunque el nombre no coincida.
- Una sección está atacada por la URL cuyo contenido cubre esas keywords, no por una que las mencione de pasada.
- Prefiere una categoría sobre una entrada de blog cuando la sección es transaccional: una guía que habla del tema no es lo mismo que la página que vende.
- Una URL más específica gana a una más general. «/mochilas» no ataca a «/mochilas-notebook» si existe algo más concreto.

Devuelve indice -1 cuando ninguna candidata corresponde de verdad. Marcar como creada una sección que no existe es peor que dejarla como pendiente de crear: alguien tomará la decisión de no crearla basándose en tu respuesta.

Responde una asignación por cada sección recibida, con su slug exacto.`,
      messages: [{ role: "user", content: texto }],
      output_config: { format: zodOutputFormat(Respuesta) },
    });

    for (const a of r.parsed_output?.asignaciones ?? []) {
      const j = lote.findIndex((p) => p.slug === a.slug);
      if (j < 0) continue;
      const elegido = a.indice >= 0 ? mapas[j][a.indice] ?? null : null;
      salida.push({
        slug: a.slug,
        candidato: elegido,
        confianza: a.confianza,
        motivo: a.motivo,
      });
    }
  }

  return salida;
}
