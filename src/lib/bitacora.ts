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
  reemplaza: z
    .string()
    .nullable()
    .describe(
      "Si esto amplía una entrada que ya existe —por ejemplo se optimizaron más fichas de las que decía—, el título EXACTO de esa entrada, para actualizarla en vez de duplicarla. Si es algo nuevo, null."
    ),
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
export type ModoBitacora = "nuevo" | "actualizar" | "rehacer";

export async function redactarMes(
  clienteId: string,
  mes: string,
  usuarioId?: string,
  modo: ModoBitacora = "nuevo"
): Promise<{ nuevas: number; actualizadas: number; borradas: number }> {
  const inicioMes = new Date(`${mes}-01T00:00:00Z`);
  const finMes = new Date(inicioMes);
  finMes.setUTCMonth(finMes.getUTCMonth() + 1);

  const corte = await db.corteBitacora.findUnique({
    where: { clienteId_mes: { clienteId, mes } },
  });

  // Rehacer borra lo que escribió el modelo y respeta lo que puso una persona:
  // si alguien se molestó en anotarlo a mano, sabe algo que el registro no
  // contiene.
  let borradas = 0;
  if (modo === "rehacer") {
    const r = await db.bitacora.deleteMany({ where: { clienteId, mes, automatico: true } });
    borradas = r.count;
  }

  // Al actualizar solo interesa lo ocurrido desde la última vez. Releer el mes
  // entero es lo que hacía que el modelo repitiera o concluyera que no había
  // nada nuevo.
  const desde = modo === "actualizar" && corte ? corte.hasta : inicioMes;

  const registro = await db.registro.findMany({
    where: { clienteId, creado: { gte: desde, lt: finMes } },
    orderBy: { creado: "asc" },
    select: { accion: true, resumen: true, resultado: true, creado: true },
    take: 500,
  });

  if (registro.length === 0) {
    throw new Error(
      modo === "actualizar"
        ? "No ha pasado nada nuevo en este mes desde la última vez."
        : "No hay actividad registrada en ese mes."
    );
  }

  const yaEscritas = await db.bitacora.findMany({
    where: { clienteId, mes },
    select: { titulo: true },
  });

  const anthropic = await cliente();
  const m = await modelo();

  const texto = [
    modo === "actualizar"
      ? `Registro técnico de ${mes} POSTERIOR a lo ya contado (desde ${desde.toISOString().slice(0, 16).replace("T", " ")}):`
      : `Registro técnico de ${mes}:`,
    ...registro.map(
      (r) =>
        `${r.creado.toISOString().slice(0, 10)} · ${r.accion}${
          r.resultado !== "ok" ? " (falló)" : ""
        } · ${r.resumen}`
    ),
    yaEscritas.length
      ? `\nEntradas que YA están en la bitácora de este mes:\n${yaEscritas
          .map((e) => `- ${e.titulo}`)
          .join("\n")}\n\nNo las repitas. Si algo del registro nuevo AMPLÍA una de ellas —más páginas del mismo trabajo—, devuelve una entrada con el total acumulado y pon su título exacto en «reemplaza».`
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

  let nuevas = 0;
  let actualizadas = 0;

  for (const e of entradas) {
    const titulo = e.titulo.replace(/\.$/, "");

    if (e.reemplaza) {
      const previa = await db.bitacora.findFirst({
        where: { clienteId, mes, titulo: e.reemplaza },
      });
      if (previa) {
        await db.bitacora.update({
          where: { id: previa.id },
          data: { titulo, detalle: e.detalle, categoria: e.categoria },
        });
        actualizadas++;
        continue;
      }
    }

    await db.bitacora.create({
      data: { clienteId, mes, categoria: e.categoria, titulo, detalle: e.detalle, automatico: true },
    });
    nuevas++;
  }

  // La marca se mueve al final y no antes: si algo falla a mitad, la próxima
  // vez se vuelve a intentar en vez de dar por contado lo que no se contó.
  const ultimo = registro[registro.length - 1].creado;
  await db.corteBitacora.upsert({
    where: { clienteId_mes: { clienteId, mes } },
    update: { hasta: ultimo },
    create: { clienteId, mes, hasta: ultimo },
  });

  return { nuevas, actualizadas, borradas };
}
