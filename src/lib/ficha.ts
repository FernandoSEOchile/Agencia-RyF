import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { credenciales } from "@/lib/dataforseo";
import { claveApi, modelo, espacioTrabajo } from "@/lib/config";
import { apuntarClaude } from "@/lib/gasto";

/**
 * Auditoría de una ficha de Google Business.
 *
 * Dos mitades muy distintas, y conviene no mezclarlas:
 *
 * · **La nota la calcula el código**, con reglas escritas y umbrales fijos. Un
 *   número que cambia cada vez que se pide no es una nota, es una opinión, y
 *   con una opinión no se puede enseñar un antes y un después a un cliente.
 * · **El diagnóstico lo escribe Claude**, a partir de esos mismos números. Ahí
 *   sí aporta: ordenar cinco arreglos por impacto y explicarlos en dos líneas
 *   es exactamente lo que un modelo hace mejor que una plantilla.
 *
 * Los umbrales salen de lo que se sabe que mueve el paquete local: reseñas por
 * encima del competidor, nota sobre 4,5, descripción aprovechada, categoría
 * principal correcta y horarios completos. No son inventados, pero tampoco son
 * una ley: si algún día cambian, se cambian aquí y en un solo sitio.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const lista = (v: unknown) => (Array.isArray(v) ? v : []);

export interface DatosFicha {
  titulo: string;
  cid: string | null;
  descripcion: string | null;
  categoria: string | null;
  categoriasExtra: string[];
  direccion: string | null;
  telefono: string | null;
  web: string | null;
  reclamada: boolean;
  nota: number | null;
  resenas: number;
  reparto: Record<string, number>;
  fotos: number;
  atributos: string[];
  horarios: boolean;
  url: string | null;
}

/** Pide la ficha a DataForSEO. Acepta un cid o un nombre. */
export async function pedirFicha(
  referencia: string,
  pais = 2152
): Promise<{ ficha: DatosFicha | null; coste: number }> {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  const base = c.pruebas ? PRUEBAS : PRODUCCION;
  const cabecera = "Basic " + Buffer.from(`${c.login}:${c.clave}`).toString("base64");

  const r = await fetch(`${base}/v3/business_data/google/my_business_info/live`, {
    method: "POST",
    headers: { Authorization: cabecera, "Content-Type": "application/json" },
    body: JSON.stringify([{ keyword: referencia, location_code: pais, language_code: "es" }]),
    signal: AbortSignal.timeout(120000),
    cache: "no-store",
  });

  if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const tarea = j?.tasks?.[0];

  if (tarea?.status_code && tarea.status_code !== 20000) {
    throw new Error(tarea.status_message ?? `código ${tarea.status_code}`);
  }

  const coste = typeof j?.cost === "number" ? j.cost : 0;
  const item = obj(lista(tarea?.result?.[0]?.items)[0]);

  if (!item.title) return { ficha: null, coste };

  const rating = obj(item.rating);
  const atributos = obj(item.attributes);

  return {
    coste,
    ficha: {
      titulo: txt(item.title) ?? "",
      cid: txt(item.cid),
      descripcion: txt(item.description),
      categoria: txt(item.category),
      categoriasExtra: lista(item.additional_categories).filter((x): x is string => typeof x === "string"),
      direccion: txt(item.address),
      telefono: txt(item.phone),
      web: txt(item.url),
      // `is_claimed` es el campo que dice si alguien la reclamó. Sin reclamar,
      // ninguna otra mejora se puede aplicar: es el primer arreglo siempre.
      reclamada: item.is_claimed === true,
      nota: num(rating.value),
      resenas: num(rating.votes_count) ?? 0,
      reparto: obj(item.rating_distribution) as Record<string, number>,
      fotos: num(item.total_photos) ?? 0,
      atributos: lista(atributos.available_attributes ?? [])
        .flatMap((a) => (typeof a === "string" ? [a] : lista(obj(a).available_values).map((v) => txt(obj(v).value) ?? "")))
        .filter(Boolean)
        .slice(0, 40),
      horarios: Object.keys(obj(obj(item.work_time).work_hours)).length > 0,
      url: txt(item.url),
    },
  };
}

export interface Bloque {
  id: string;
  etiqueta: string;
  puntos: number;
  tope: number;
  detalle: string;
}

export interface Hallazgo {
  que: string;
  estado: "critico" | "mejorar" | "ok";
  porque: string;
}

/**
 * La nota, con sus cuatro bloques.
 *
 * Los topes suman 100 y están repartidos por lo que de verdad mueve el paquete
 * local: las reseñas pesan más que ninguna otra cosa, y por eso se llevan 30.
 */
export function puntuar(f: DatosFicha) {
  const bloques: Bloque[] = [];
  const hallazgos: Hallazgo[] = [];

  const anotar = (que: string, estado: Hallazgo["estado"], porque: string) =>
    hallazgos.push({ que, estado, porque });

  /* ---------------- Señales de la ficha · 35 ---------------- */
  let señales = 0;

  if (f.reclamada) {
    señales += 8;
    anotar("Ficha reclamada", "ok", "El negocio controla su ficha y puede editarla.");
  } else {
    anotar(
      "Ficha sin reclamar",
      "critico",
      "Sin reclamarla no se puede cambiar nada, y cualquiera puede sugerir ediciones. Es lo primero."
    );
  }

  if (f.categoria) {
    señales += 6;
    anotar(`Categoría principal: ${f.categoria}`, "ok", "Es la señal que más pesa para decidir en qué búsquedas sale.");
  } else {
    anotar("Sin categoría principal", "critico", "Google no sabe a qué se dedica el negocio.");
  }

  const extra = f.categoriasExtra.length;
  señales += Math.min(extra, 5);
  if (extra === 0) {
    anotar("Sin categorías secundarias", "mejorar", "Cada categoría extra abre búsquedas nuevas sin quitar relevancia a la principal.");
  } else if (extra > 8) {
    anotar(`${extra} categorías secundarias`, "mejorar", "Demasiadas diluyen la relevancia. Por encima de ocho suele restar.");
  }

  if (f.horarios) señales += 5;
  else anotar("Sin horarios", "critico", "Una ficha sin horario pierde el «abierto ahora», que es la mitad de las búsquedas locales.");

  if (f.telefono) señales += 4;
  else anotar("Sin teléfono", "critico", "Corta la vía de contacto más usada desde el móvil.");

  if (f.web) señales += 4;
  else anotar("Sin web enlazada", "mejorar", "La ficha y el sitio se refuerzan; sin enlace se pierde esa relación.");

  if (f.direccion) señales += 3;

  const atrib = f.atributos.length;
  señales += Math.min(Math.floor(atrib / 4), 5);
  if (atrib < 5) {
    anotar(
      `Solo ${atrib} atributos`,
      "mejorar",
      "Accesibilidad, formas de pago, servicios: cada uno es un filtro más por el que aparecer."
    );
  }

  bloques.push({
    id: "senales",
    etiqueta: "Señales de la ficha",
    puntos: Math.min(señales, 35),
    tope: 35,
    detalle: `${f.categoria ?? "sin categoría"}${extra ? ` y ${extra} más` : ""} · ${atrib} atributos · ${f.horarios ? "con" : "sin"} horarios`,
  });

  /* ---------------- Reseñas y reputación · 30 ---------------- */
  let resenas = 0;

  // Los tramos no son lineales: el salto de 0 a 25 reseñas cambia todo, y el
  // de 200 a 300 casi nada. Por eso se puntúa por escalones.
  if (f.resenas >= 200) resenas += 15;
  else if (f.resenas >= 100) resenas += 13;
  else if (f.resenas >= 50) resenas += 10;
  else if (f.resenas >= 25) resenas += 7;
  else if (f.resenas >= 10) resenas += 4;
  else if (f.resenas > 0) resenas += 2;

  if (f.resenas < 25) {
    anotar(
      `Solo ${f.resenas} reseñas`,
      f.resenas < 10 ? "critico" : "mejorar",
      "Es lo que más pesa en el paquete local y donde más se gana. Por debajo de 25 se compite en desventaja con cualquiera."
    );
  }

  const nota = f.nota ?? 0;
  if (nota >= 4.7) resenas += 12;
  else if (nota >= 4.5) resenas += 10;
  else if (nota >= 4.2) resenas += 7;
  else if (nota >= 4.0) resenas += 4;
  else if (nota > 0) resenas += 1;

  if (nota > 0 && nota < 4.5) {
    anotar(
      `Nota ${nota.toFixed(1)}`,
      nota < 4 ? "critico" : "mejorar",
      "Por debajo de 4,5 la gente compara y elige a otro. Cada reseña buena nueva sube la media más de lo que parece."
    );
  }

  const malas = (Number(f.reparto["1"] ?? 0) + Number(f.reparto["2"] ?? 0));
  if (f.resenas > 0) {
    const porcentaje = (malas / f.resenas) * 100;
    if (porcentaje < 5) resenas += 3;
    else if (porcentaje < 15) resenas += 1;
    else
      anotar(
        `${malas} reseñas de 1 y 2 estrellas`,
        "mejorar",
        "Responder a todas cambia lo que percibe quien las lee, aunque no cambie la nota."
      );
  }

  bloques.push({
    id: "resenas",
    etiqueta: "Reseñas y reputación",
    puntos: Math.min(resenas, 30),
    tope: 30,
    detalle: `${f.resenas} reseñas${f.nota ? ` · ${f.nota.toFixed(1)} de nota` : ""}`,
  });

  /* ---------------- Relevancia y contenido · 20 ---------------- */
  let contenido = 0;
  const largo = f.descripcion?.length ?? 0;

  // Google da 750 caracteres. Usar 168 es dejar el 78% del espacio vacío.
  if (largo >= 600) contenido += 12;
  else if (largo >= 400) contenido += 9;
  else if (largo >= 200) contenido += 5;
  else if (largo > 0) contenido += 2;

  if (largo < 400) {
    anotar(
      largo === 0 ? "Sin descripción" : `Descripción de ${largo} caracteres`,
      largo === 0 ? "critico" : "mejorar",
      `Google permite 750. Ampliarla a 600 o más es contenido indexable gratis, y hoy se está usando el ${Math.round((largo / 750) * 100)}%.`
    );
  }

  if (f.categoria && f.titulo.toLowerCase().includes(f.categoria.toLowerCase())) {
    contenido += 2;
  }

  // Nombre con relleno: es un factor negativo conocido, no una mejora pendiente.
  const relleno = /(online|barato|mejor|24h|low cost|el mejor|profesional)/i.test(f.titulo);
  if (relleno) {
    anotar(
      "El nombre lleva palabras de más",
      "critico",
      "Meter términos que no están en el rótulo del local es motivo de penalización, y basta con un cambio en el panel para quitarlo."
    );
  } else {
    contenido += 3;
  }

  if (f.fotos >= 50) contenido += 3;
  else if (f.fotos >= 20) contenido += 2;
  else if (f.fotos > 0) contenido += 1;

  bloques.push({
    id: "contenido",
    etiqueta: "Relevancia y contenido",
    puntos: Math.min(contenido, 20),
    tope: 20,
    detalle: `${largo} caracteres de descripción · ${f.fotos} fotos`,
  });

  /* ---------------- Prominencia · 15 ---------------- */
  let prominencia = 0;

  if (f.fotos >= 100) prominencia += 8;
  else if (f.fotos >= 50) prominencia += 6;
  else if (f.fotos >= 20) prominencia += 4;
  else if (f.fotos >= 5) prominencia += 2;

  if (f.fotos < 20) {
    anotar(
      `${f.fotos} fotos`,
      "mejorar",
      "Las fichas con más fotos reciben más clics y más peticiones de indicaciones. Es de lo más barato de arreglar."
    );
  }

  if (f.resenas >= 100) prominencia += 7;
  else if (f.resenas >= 50) prominencia += 5;
  else if (f.resenas >= 20) prominencia += 3;
  else if (f.resenas > 0) prominencia += 1;

  bloques.push({
    id: "prominencia",
    etiqueta: "Prominencia y autoridad",
    puntos: Math.min(prominencia, 15),
    tope: 15,
    detalle: `${f.fotos} fotos · ${f.resenas} reseñas`,
  });

  const total = bloques.reduce((t, b) => t + b.puntos, 0);

  return { total, bloques, hallazgos };
}

/* ---------------- La redacción, con Claude ---------------- */

const Informe = z.object({
  resumen: z
    .string()
    .describe("Dos o tres frases sobre en qué estado está la ficha y qué la limita. Sin adornos."),
  rapidos: z
    .array(
      z.object({
        titulo: z.string().describe("La acción, en imperativo y concreta."),
        porque: z.string().describe("Una frase: qué gana el negocio con eso."),
      })
    )
    .min(3)
    .max(6)
    .describe("Arreglos de menos de una hora, ordenados por lo que más mueve la aguja."),
  fuertes: z
    .array(z.string())
    .max(5)
    .describe("Lo que ya está bien y conviene no tocar. Vacío si no hay nada destacable."),
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
 * Escribe el diagnóstico sobre los números que ya calculó el código.
 *
 * Se le pasan los hallazgos ya detectados, no los datos en bruto: si tuviera
 * que deducir él qué está mal, cada ejecución encontraría cosas distintas y la
 * nota y el texto acabarían contradiciéndose.
 */
export async function redactar(
  f: DatosFicha,
  puntos: ReturnType<typeof puntuar>,
  usuarioId: string,
  clienteId: string
) {
  const anthropic = await cliente();
  const m = await modelo("redaccion");

  const r = await anthropic.messages.parse({
    model: m,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: `Eres un consultor de SEO local escribiendo para el dueño de un negocio chileno, no para otro SEO.

Te dan una ficha de Google Business ya analizada: su nota, sus bloques y los problemas que detectó el análisis. Tu trabajo NO es volver a analizar, es explicar y ordenar.

Cómo escribir:
- Español de Chile, directo, sin jerga. «Reseñas», no «reviews». «Ficha», no «GBP».
- Los arreglos rápidos van en imperativo y son cosas que alguien puede hacer hoy desde el panel de Google, en menos de una hora cada una.
- Ordénalos por lo que más mueve el resultado, no por lo más fácil.
- No inventes datos que no estén en lo que te dan. Si no sabes cuántas fotos hay, no lo digas.
- Nada de promesas de posiciones. Se dice qué mejora y por qué, no cuánto va a subir.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          negocio: f.titulo,
          categoria: f.categoria,
          categoriasExtra: f.categoriasExtra,
          reclamada: f.reclamada,
          descripcion: f.descripcion,
          largoDescripcion: f.descripcion?.length ?? 0,
          resenas: f.resenas,
          nota: f.nota,
          reparto: f.reparto,
          fotos: f.fotos,
          atributos: f.atributos,
          horarios: f.horarios,
          notaTotal: puntos.total,
          bloques: puntos.bloques,
          hallazgos: puntos.hallazgos,
        }),
      },
    ],
    output_config: { format: zodOutputFormat(Informe) },
  });

  await apuntarClaude({
    usuarioId,
    clienteId,
    modelo: m,
    entrada: r.usage?.input_tokens ?? 0,
    salida: r.usage?.output_tokens ?? 0,
    concepto: "auditoría de ficha local",
  });

  return r.parsed_output;
}
