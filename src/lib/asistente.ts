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
import { CRITERIO_CONTENIDO } from "@/lib/contenido";
import { claveApi, modelo, espacioTrabajo } from "@/lib/config";

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
  // Las claves ligadas a identidad rechazan cualquier petición que no diga en
  // qué espacio de trabajo actúa. Las demás ignoran la cabecera, así que
  // mandarla siempre que esté configurada es seguro.
  const espacio = await espacioTrabajo();

  return new Anthropic({
    apiKey,
    defaultHeaders: espacio ? { "anthropic-workspace-id": espacio } : undefined,
  });
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
  /** «wordpress» o «shopify». Cambia lo que se puede hacer y cómo se llama. */
  plataforma?: string;
  /** Se añade el criterio de diseño solo si el encargo lo pide: son ~900
   *  palabras que se pagarían en cada turno de cualquier conversación. */
  conDiseno?: boolean;
  /** Igual que el de diseño: el criterio de redacción solo viaja cuando el
   *  encargo es escribir. */
  conContenido?: boolean;
  /** Lo aprendido de ESTE sitio en conversaciones anteriores. */
  memorias?: { titulo: string; nota: string }[];
}) {
  return `${
  datos.plataforma === "shopify"
    ? `Eres el asistente de AppSEO para la tienda ${datos.nombre} (${datos.dominio}), una tienda Shopify conectada por su API de administración (versión ${datos.version ?? "?"}).`
    : `Eres el asistente de AppSEO para el sitio ${datos.nombre} (${datos.dominio}), un WordPress con el conector AppSEO RyF v${datos.version ?? "?"}.`
}

Trabajas para una agencia SEO chilena. Escribes en español de Chile, sin tecnicismos innecesarios.

QUÉ PUEDES HACER
Tienes herramientas que leen y ${datos.puedeEscribir ? "escriben" : "leen (la escritura está desactivada en este sitio)"} directamente en ${datos.plataforma === "shopify" ? "esa tienda" : "ese WordPress"}. No devuelves texto para que alguien lo copie: lo aplicas tú.
${
  datos.plataforma === "shopify"
    ? `
CÓMO ES SHOPIFY
- Lo que en otras plataformas son categorías, aquí son colecciones. Las herramientas se llaman igual, pero al hablar con la persona di «colección».
- CREAR NO ES PUBLICAR. Un producto o una colección recién creados existen en el admin y su URL pública devuelve 404 hasta que se publican en la tienda online. Cuando crees algo sin publicar, dilo con esas palabras y da el enlace del admin, nunca el público.
- El SEO tiene campos propios —título y descripción— en productos, colecciones y páginas. No hace falta ningún plugin.
- No toques precios ni inventario: el panel escribe contenido y SEO.
`
    : `
CÓMO ES WORDPRESS
- Puedes crear, no solo editar: crear_producto y crear_categoria levantan cosas que aún no existen. Una categoría puede colgar de otra pasando «padre».
- Lo que creas nace como borrador. Muchos sitios tienen desactivada la publicación directa desde el panel: si te la rechazan, deja el borrador hecho, dilo con esas palabras y da el enlace de edición para que lo publiquen a mano.
- Nunca escribes precio, stock ni SKU. El conector los rechaza a propósito, así que no lo intentes ni lo prometas.
`
}
CÓMO TRABAJAS
- Antes de reescribir algo, léelo. Nunca escribas encima de un texto que no has visto.${
  datos.plataforma === "shopify"
    ? ""
    : `
- Antes de escribir CSS, usa reconocer_tema. Cada tienda monta sus fichas distinto y un CSS escrito a ciegas no engancha con nada.`
}
- Después de escribir, comprueba el resultado en vez de darlo por hecho. Las escrituras devuelven el estado anterior: guárdalo por si hay que deshacer.
- En tandas grandes, empieza por una y enséñala antes de seguir con el resto.
- Si algo falla, dilo con el error concreto. No lo suavices.

QUÉ NO INVENTAS
No te inventes especificaciones de producto —materiales, medidas, plazos de entrega, garantías— que no estén en los datos. Un dato inventado en una tienda real es una promesa que alguien tendrá que cumplir. Si el nombre del producto dice «400 cc», puedes usarlo; si no dice el material, no lo menciones.

SOBRE EL COSTE
Cada mensaje cuesta dinero real. Trae solo los datos que necesitas: listar_productos devuelve metadatos, no descripciones completas, y leer_producto es para cuando de verdad vas a trabajar sobre ese producto.

Cuando termines algo, resume en una o dos frases qué cambió y dónde verlo.

${
  datos.memorias?.length
    ? `LO QUE YA SABES DE ESTE SITIO
Esto lo aprendiste en conversaciones anteriores sobre ${datos.dominio}, y solo vale para este sitio. Dalo por bueno salvo que veas lo contrario; si algo dejó de ser cierto, corrígelo con olvidar y recordar.

${datos.memorias.map((m) => `- ${m.titulo}: ${m.nota}`).join("\n")}

Cuando aprendas algo duradero de este sitio —cómo está montado, qué tratamiento usa, qué decidió el cliente, qué no hay que tocar— guárdalo con recordar. No guardes lo de hoy ni lo que ya está en las herramientas.
`
    : `Cuando aprendas algo duradero de este sitio —cómo está montado, qué tratamiento usa, qué decidió el cliente, qué no hay que tocar— guárdalo con recordar, para que la próxima conversación empiece sabiéndolo.
`
}
${datos.conDiseno ? CRITERIO_DISENO : ""}
${datos.conContenido ? CRITERIO_CONTENIDO : ""}`;
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

  // «network error» a secas es lo que devuelve Node cuando la conexión con la
  // API se corta a mitad de la respuesta. Salía tal cual y no decía nada: ni
  // qué pasó, ni si se perdió el trabajo, ni qué hacer. Pasa sobre todo en
  // respuestas largas con muchas herramientas encadenadas.
  if (/^network error$|terminated|premature close|socket hang up|ECONNRESET/i.test(bruto)) {
    return "Se cortó la conexión con la API mientras respondía. Suele pasar en respuestas largas con muchos pasos. Vuelve a enviar el mensaje: lo anterior de la conversación no se perdió, y si el asistente ya había escrito en el sitio, eso también quedó hecho.";
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

/** Lo consumido en un turno. Se va llenando sobre la marcha, no al final. */
export interface Uso {
  texto: string;
  entrada: number;
  salida: number;
  cacheEscritura: number;
  cacheLectura: number;
}

export function usoVacio(): Uso {
  return { texto: "", entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };
}

/**
 * Órdenes cortas y directas: «cambia el título», «pon esta meta description».
 *
 * En estas no hay nada que deliberar —la persona ya decidió— y razonar antes de
 * obedecer solo añade espera y tokens de salida, que son los caros. En todo lo
 * demás se deja pensar: es preferible pagar de más en un análisis que dar un
 * análisis malo barato.
 */
const ORDEN_DIRECTA =
  /^(?:por favor,?\s*)?(?:cambia|pon|ponle|escribe|actualiza|corrige|arregla|sube|agrega|añade|borra|elimina|quita|reemplaza|renombra|traduce|duplica|activa|desactiva|guarda)\b/i;

function razonamiento(historial: Turno[]): "adaptive" | null {
  const ultimo = [...historial].reverse().find((t) => t.rol === "user");
  if (!ultimo) return "adaptive";

  const texto = ultimo.contenido.trim();
  const directa = texto.length < 200 && !texto.includes("?") && ORDEN_DIRECTA.test(texto);
  return directa ? null : "adaptive";
}

/**
 * Marca hasta dónde cachear la conversación.
 *
 * Hacen falta DOS marcas, y esto es lo que se hace mal casi siempre: la API
 * solo busca en la caché en los puntos marcados de ESTA petición. Con una sola
 * marca al final se escribe caché cada turno y no se lee ninguna —se paga el
 * recargo sin cobrar nunca el descuento—. La marca del penúltimo turno del
 * usuario es la que escribimos la vez anterior, así que esa acierta; la del
 * último deja preparada la de la próxima.
 */
function conCache(
  mensajes: Anthropic.Beta.BetaMessageParam[]
): Anthropic.Beta.BetaMessageParam[] {
  const marcar = (i: number) => {
    const bloques = mensajes[i]?.content;
    if (!Array.isArray(bloques) || bloques.length === 0) return;
    const ultimo = bloques[bloques.length - 1] as { cache_control?: unknown };
    ultimo.cache_control = { type: "ephemeral" };
  };

  const usuarios = mensajes.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  marcar(usuarios[usuarios.length - 1]);
  if (usuarios.length > 1) marcar(usuarios[usuarios.length - 2]);
  return mensajes;
}

/**
 * Ejecuta un turno de conversación y va emitiendo lo que ocurre.
 *
 * `emitir` recibe eventos ya listos para mandar al navegador. Se separa así
 * para que la ruta HTTP no tenga que saber nada del SDK.
 *
 * Lo consumido se escribe en `uso` según va llegando, en vez de devolverse al
 * terminar. La diferencia importa cuando esto falla a mitad: los tokens ya
 * generados se pagan igual, y con un `return` se perdían justo en el caso en
 * que más falta hace saberlo.
 */
export async function conversar(
  ctx: Contexto,
  sistema: string,
  historial: Turno[],
  emitir: (evento: { tipo: string; [k: string]: unknown }) => void,
  uso: Uso = usoVacio()
) {
  const anthropic = await cliente();
  const pensar = razonamiento(historial);

  const runner = anthropic.beta.messages.toolRunner({
    model: await modelo(),
    max_tokens: 32000,
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    ...(pensar ? { thinking: { type: pensar as "adaptive" } } : {}),
    tools: herramientasDe(ctx),
    messages: conCache(historial.map((t) => ({ role: t.rol, content: contenidoDe(t) }))),
    stream: true,
  });

  for await (const flujo of runner) {
    for await (const evento of flujo) {
      if (evento.type === "content_block_start" && evento.content_block.type === "tool_use") {
        emitir({ tipo: "herramienta", nombre: evento.content_block.name });
      } else if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
        uso.texto += evento.delta.text;
        emitir({ tipo: "texto", texto: evento.delta.text });
      }
    }

    const mensaje = await flujo.finalMessage();
    uso.entrada += mensaje.usage.input_tokens ?? 0;
    uso.salida += mensaje.usage.output_tokens ?? 0;
    uso.cacheEscritura += mensaje.usage.cache_creation_input_tokens ?? 0;
    uso.cacheLectura += mensaje.usage.cache_read_input_tokens ?? 0;

    // Una pausa del servidor no es un final: si no se reanuda, la respuesta
    // queda cortada sin que nadie avise.
    if (mensaje.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: mensaje.content });
    }
  }

  return uso;
}
