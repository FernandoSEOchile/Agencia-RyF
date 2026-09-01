/**
 * El asistente que conversa sobre un sitio concreto.
 *
 * Usa el tool runner del SDK con streaming: el bucle de llamar herramienta,
 * devolver resultado y seguir lo lleva el SDK, y nosotros solo emitimos al
 * navegador lo que va pasando.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { herramientasDe, type Contexto } from "@/lib/herramientas";
import { CRITERIO_DISENO } from "@/lib/diseno";
import { claveApi, modelo } from "@/lib/config";

/**
 * Cliente de la API, con la clave que mande el panel.
 *
 * Es asíncrono porque la clave puede venir de la base: se cambia desde la
 * pantalla de ajustes sin tocar el servidor ni reiniciar nada.
 */
async function cliente() {
  const apiKey = await claveApi();
  if (!apiKey) {
    throw new Error(
      "No hay clave de la API configurada. Un administrador puede ponerla en Ajustes del panel."
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * Instrucciones del asistente.
 *
 * Se construyen con los datos del cliente para que no tenga que preguntarlos, y
 * se mantienen estables entre turnos: el contenido volátil iría después del
 * punto de caché y encarecería cada mensaje.
 */
export function instrucciones(datos: {
  nombre: string;
  dominio: string;
  version: string | null;
  puedeEscribir: boolean;
  /** Se añade el criterio de diseño solo si el encargo lo pide: son ~900
   *  palabras que se pagarían en cada turno de cualquier conversación. */
  conDiseno?: boolean;
}) {
  return `Eres el asistente de AppSEO para el sitio ${datos.nombre} (${datos.dominio}), un WordPress con el conector AppSEO RyF v${datos.version ?? "?"}.

Trabajas para una agencia SEO chilena. Escribes en español de Chile, sin tecnicismos innecesarios.

QUÉ PUEDES HACER
Tienes herramientas que leen y ${datos.puedeEscribir ? "escriben" : "leen (la escritura está desactivada en este sitio)"} directamente en ese WordPress. No devuelves texto para que alguien lo copie: lo aplicas tú.

CÓMO TRABAJAS
- Antes de reescribir algo, léelo. Nunca escribas encima de un texto que no has visto.
- Antes de escribir CSS, usa reconocer_tema. Cada tienda monta sus fichas distinto y un CSS escrito a ciegas no engancha con nada.
- Después de escribir, comprueba el resultado en vez de darlo por hecho. Las escrituras devuelven el estado anterior: guárdalo por si hay que deshacer.
- En tandas grandes, empieza por una y enséñala antes de seguir con el resto.
- Si algo falla, dilo con el error concreto. No lo suavices.

QUÉ NO INVENTAS
No te inventes especificaciones de producto —materiales, medidas, plazos de entrega, garantías— que no estén en los datos. Un dato inventado en una tienda real es una promesa que alguien tendrá que cumplir. Si el nombre del producto dice «400 cc», puedes usarlo; si no dice el material, no lo menciones.

SOBRE EL COSTE
Cada mensaje cuesta dinero real. Trae solo los datos que necesitas: listar_productos devuelve metadatos, no descripciones completas, y leer_producto es para cuando de verdad vas a trabajar sobre ese producto.

Cuando termines algo, resume en una o dos frases qué cambió y dónde verlo.

${datos.conDiseno ? CRITERIO_DISENO : ""}`;
}

/**
 * Traduce un fallo de la API a algo que se pueda leer y accionar.
 *
 * Sin esto, quien usa el panel recibe el JSON crudo de Anthropic: técnicamente
 * exacto e inútil para decidir qué hacer. Los tres casos que de verdad ocurren
 * —sin saldo, clave mala, demasiadas peticiones— tienen cada uno una salida
 * distinta, y conviene nombrarla.
 */
export function mensajeDeError(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e);

  if (e instanceof Anthropic.AuthenticationError) {
    return "La clave de la API no es válida o fue revocada. Hay que revisarla en la configuración del servidor.";
  }

  if (e instanceof Anthropic.RateLimitError) {
    return "Demasiadas peticiones seguidas a la API. Espera un momento y vuelve a intentarlo.";
  }

  // El saldo agotado llega como un 400 corriente, así que no hay una clase de
  // error propia: hay que mirar el texto.
  if (/credit balance is too low/i.test(bruto)) {
    return "Se acabó el saldo de la API de Anthropic. Recárgalo en console.anthropic.com → Plans & Billing y vuelve a intentarlo; no se ha perdido nada de la conversación.";
  }

  if (/rate_limit|overloaded/i.test(bruto)) {
    return "La API está saturada en este momento. Espera un minuto y reintenta.";
  }

  if (e instanceof Anthropic.APIConnectionError) {
    return "El servidor no pudo alcanzar la API de Anthropic. Puede ser un corte de red pasajero.";
  }

  if (e instanceof Anthropic.APIError) {
    // Se recorta el JSON: lo útil está al principio y el resto es ruido.
    return `Error de la API (${e.status ?? "?"}). ${bruto.slice(0, 180)}`;
  }

  return bruto.slice(0, 300);
}

export interface Turno {
  rol: "user" | "assistant";
  contenido: string;
  /** Data URIs de las imágenes adjuntas a este turno. */
  imagenes?: string[];
}

/** Formatos que acepta la API; el resto se rechaza antes de llegar aquí. */
const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/**
 * Convierte un turno en el contenido que espera la API.
 *
 * Las imágenes van ANTES del texto: es el orden que recomienda Anthropic
 * cuando el texto se refiere a lo que se ve.
 */
function contenidoDe(t: Turno): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (!t.imagenes || t.imagenes.length === 0) return t.contenido;

  const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];

  for (const uri of t.imagenes) {
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(uri);
    if (!m) continue;
    const tipo = m[1];
    if (!TIPOS_IMAGEN.includes(tipo as (typeof TIPOS_IMAGEN)[number])) continue;
    bloques.push({
      type: "image",
      source: { type: "base64", media_type: tipo as "image/png", data: m[2] },
    });
  }

  // Un turno solo con imágenes ilegibles quedaría vacío, y la API rechaza los
  // mensajes sin contenido.
  bloques.push({ type: "text", text: t.contenido || "(sin texto)" });
  return bloques;
}

/**
 * Ejecuta un turno de conversación y va emitiendo lo que ocurre.
 *
 * `emitir` recibe eventos ya listos para mandar al navegador. Se separa así
 * para que la ruta HTTP no tenga que saber nada del SDK.
 */
export async function conversar(
  ctx: Contexto,
  sistema: string,
  historial: Turno[],
  emitir: (evento: { tipo: string; [k: string]: unknown }) => void
) {
  const anthropic = await cliente();

  const runner = anthropic.beta.messages.toolRunner({
    model: await modelo(),
    max_tokens: 32000,
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    tools: herramientasDe(ctx),
    messages: historial.map((t) => ({ role: t.rol, content: contenidoDe(t) })),
    stream: true,
  });

  let texto = "";
  let entrada = 0;
  let salida = 0;

  for await (const flujo of runner) {
    for await (const evento of flujo) {
      if (evento.type === "content_block_start" && evento.content_block.type === "tool_use") {
        emitir({ tipo: "herramienta", nombre: evento.content_block.name });
      } else if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
        texto += evento.delta.text;
        emitir({ tipo: "texto", texto: evento.delta.text });
      }
    }

    const mensaje = await flujo.finalMessage();
    entrada += mensaje.usage.input_tokens ?? 0;
    salida += mensaje.usage.output_tokens ?? 0;

    // Una pausa del servidor no es un final: si no se reanuda, la respuesta
    // queda cortada sin que nadie avise.
    if (mensaje.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: mensaje.content });
    }
  }

  return { texto, entrada, salida };
}
