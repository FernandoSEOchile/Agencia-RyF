import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { claveApi, modelo, espacioTrabajo } from "@/lib/config";

/**
 * Reconocimiento del formato de un Excel de arquitectura.
 *
 * Se le pide al modelo que deduzca la PLANTILLA, no que transcriba los datos.
 * Es deliberado: si le pidiéramos las mil filas se pagaría una fortuna por
 * cada archivo, tardaría minutos y —lo peor— podría equivocarse copiando un
 * volumen. Deduciendo la plantilla trabaja sobre una muestra pequeña, y la
 * extracción la hace después código determinista, que no inventa.
 *
 * Y la plantilla es justo lo que merece guardarse: los archivos de un mismo
 * cliente, o de una misma agencia, se repiten. El segundo archivo del mismo
 * formato ya no le cuesta nada.
 */

const Nivel = z.object({
  nivel: z.number().int().min(1).max(6).describe("1 = categoría, 2 = subcategoría, 3 = producto…"),
  columnaNombre: z.number().int().min(1).describe("Columna donde va el nombre. La primera es la 1."),
  columnaVolumen: z
    .number()
    .int()
    .min(0)
    .describe("Columna del volumen de búsqueda de ese nivel, o 0 si no existe."),
});

const Esquema = z.object({
  hoja: z.string().describe("Nombre exacto de la hoja donde está la arquitectura."),
  filaInicio: z.number().int().min(1).describe("Primera fila con datos, saltándose cabeceras."),
  niveles: z.array(Nivel).min(1),
  marcaSeccion: z
    .enum(["sin_volumen", "empieza_por_barra", "todas"])
    .describe(
      "Cómo distinguir el nombre de una sección de una keyword suelta. «sin_volumen»: la sección es la fila que no lleva número al lado. «empieza_por_barra»: la sección es una ruta que empieza por «/». «todas»: cada valor de la columna es una sección."
    ),
  textosIgnorar: z
    .array(z.string())
    .describe("Textos de filas de resumen o cabecera que no son ni sección ni keyword, como «Total»."),
  descripcion: z.string().describe("Una frase describiendo la plantilla, para que un humano la reconozca."),
});

export type EsquemaAst = z.infer<typeof Esquema>;

/**
 * Texto plano de la hoja, con número de fila y de columna.
 *
 * Se dan las coordenadas explícitas porque el modelo tiene que responder con
 * números de columna, y contar celdas separadas por barras es justo el tipo de
 * cosa en la que se equivoca.
 */
export function rejilla(
  hojas: { nombre: string; filas: { n: number; celdas: { col: number; valor: string }[] }[] }[],
  tope = 70
): string {
  return hojas
    .map((h) => {
      const cuerpo = h.filas
        .slice(0, tope)
        .map((f) => `f${f.n}: ` + f.celdas.map((c) => `[c${c.col}] ${c.valor}`).join("  "))
        .join("\n");
      return `--- HOJA «${h.nombre}» (${h.filas.length} filas con contenido) ---\n${cuerpo}`;
    })
    .join("\n\n");
}

/** Identifica un formato por su cabecera, para reconocerlo la próxima vez. */
export function huellaDe(texto: string): string {
  return createHash("sha256").update(texto.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 32);
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

/** Plantillas ya conocidas, para enseñárselas al modelo como ejemplo. */
async function conocidas(limite = 4) {
  return db.plantillaAst.findMany({
    where: { acertado: true },
    orderBy: [{ usos: "desc" }, { creado: "desc" }],
    take: limite,
    select: { nombre: true, esquema: true, muestra: true },
  });
}

/**
 * Deduce cómo está montado el archivo.
 *
 * Las plantillas ya reconocidas van en el mensaje como ejemplos resueltos. No
 * es entrenar el modelo —eso no se puede hacer desde aquí— pero sí es que cada
 * archivo nuevo se lea con el contexto de todos los anteriores, que en la
 * práctica es lo que hace que acierte más con el tiempo.
 */
export async function detectarEsquema(muestra: string): Promise<EsquemaAst> {
  const anthropic = await cliente();
  const m = await modelo("redaccion");
  const ejemplos = await conocidas();

  const contexto = ejemplos.length
    ? "\n\nFORMATOS YA RECONOCIDOS EN OTROS ARCHIVOS (por si este se parece a alguno):\n" +
      ejemplos
        .map((e, i) => `${i + 1}) ${e.nombre}\n   esquema: ${e.esquema}\n   filas de ejemplo:\n${(e.muestra ?? "").split("\n").slice(0, 8).join("\n")}`)
        .join("\n\n")
    : "";

  const r = await anthropic.messages.parse({
    model: m,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: `Eres un especialista SEO leyendo el Excel de arquitectura de un sitio. Tu tarea es deducir CÓMO está montado el archivo, no extraer sus datos.

Estos archivos varían mucho entre agencias y entre proyectos. Lo que se repite es la idea: hay una jerarquía de secciones —categoría, subcategoría, a veces producto— y bajo cada sección van sus keywords objetivo con su volumen de búsqueda.

Cómo mirar el archivo:
- La jerarquía casi siempre se expresa por columnas: cuanto más a la derecha, más profundo. La cabecera suele decirlo («Categoría», «Subcategoría», «Producto»).
- El volumen suele ir en la columna inmediatamente a la derecha del nombre.
- Hay dos formas típicas de marcar dónde empieza una sección. En unas plantillas la sección es una ruta que empieza por «/». En otras, la sección es el nombre que NO lleva volumen al lado, y las filas siguientes con volumen son sus keywords. Mira los datos y decide cuál es.
- Las filas de «Total», «TOTAL», «#REF!» y las cabeceras no son ni secciones ni keywords: van en textosIgnorar.
- La primera columna suele ser la home del sitio, no una categoría. Inclúyela como nivel solo si de verdad contiene secciones.
- Si hay varias hojas, elige la de la arquitectura y no la de keyword research en bruto.

Devuelve el esquema que permita a un programa recorrer el archivo entero y sacar cada sección con sus keywords.`,
    messages: [{ role: "user", content: muestra + contexto }],
    output_config: { format: zodOutputFormat(Esquema) },
  });

  const e = r.parsed_output;
  if (!e) throw new Error("El modelo no devolvió un esquema utilizable.");
  return e;
}

/** Guarda el formato reconocido, o suma un uso si ya se conocía. */
export async function recordar(huella: string, esquema: EsquemaAst, muestra: string) {
  await db.plantillaAst.upsert({
    where: { huella },
    update: { usos: { increment: 1 } },
    create: {
      huella,
      nombre: esquema.descripcion.slice(0, 200),
      esquema: JSON.stringify(esquema),
      muestra: muestra.slice(0, 4000),
      usos: 1,
    },
  });
}

/** El formato guardado para esta huella, si ya se vio antes. */
export async function recordada(huella: string): Promise<EsquemaAst | null> {
  const fila = await db.plantillaAst.findUnique({ where: { huella } });
  if (!fila || !fila.acertado) return null;
  try {
    return Esquema.parse(JSON.parse(fila.esquema));
  } catch {
    return null;
  }
}
