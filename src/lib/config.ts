import "server-only";
import { db } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";

/**
 * Ajustes del panel, editables desde la interfaz.
 *
 * Lo que se guarda aquí manda sobre las variables de entorno. El entorno sigue
 * sirviendo de arranque —para que un panel recién desplegado funcione sin que
 * nadie entre a configurarlo— pero deja de ser el sitio donde hay que tocar
 * cada vez que cambia una clave.
 */

export const MODELOS = [
  ["claude-opus-5", "Opus 5", "El más capaz. Para diseño, redacción larga y trabajo delicado."],
  ["claude-sonnet-5", "Sonnet 5", "Equilibrado. Buena opción por defecto para el día a día."],
  ["claude-haiku-4-5", "Haiku 4.5", "El más barato y rápido. Para tareas mecánicas y repetitivas."],
] as const;

export const MODELO_POR_DEFECTO = "claude-opus-5";

async function leer(clave: string): Promise<string | null> {
  const fila = await db.config.findUnique({ where: { clave } });
  if (!fila) return null;

  if (!fila.cifrado) return fila.valor;

  try {
    return descifrar(fila.valor);
  } catch {
    // Si la clave de cifrado cambió, el valor guardado ya no sirve. Se prefiere
    // caer al entorno antes que dejar el panel muerto.
    return null;
  }
}

async function escribir(clave: string, valor: string, sensible: boolean) {
  const guardado = sensible ? cifrar(valor) : valor;
  await db.config.upsert({
    where: { clave },
    update: { valor: guardado, cifrado: sensible },
    create: { clave, valor: guardado, cifrado: sensible },
  });
}

/** La clave de la API que se usará para hablar con el modelo. */
export async function claveApi(): Promise<string | null> {
  return (
    (await leer("anthropic_api_key")) ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.APP_ANTHROPIC_API_KEY ||
    null
  );
}

export async function guardarClaveApi(valor: string) {
  await escribir("anthropic_api_key", valor.trim(), true);
}

export async function borrarClaveApi() {
  await db.config.deleteMany({ where: { clave: "anthropic_api_key" } });
}

/**
 * Identificador del espacio de trabajo.
 *
 * Las claves ligadas a identidad exigen que cada petición diga en qué espacio
 * actúa; sin esto responden 400 aunque la clave sea perfectamente válida y
 * haya saldo de sobra. Las claves normales lo ignoran, así que mandarlo cuando
 * existe no rompe nada.
 */
export async function espacioTrabajo(): Promise<string | null> {
  return (await leer("workspace_id")) || process.env.ANTHROPIC_WORKSPACE_ID || null;
}

export async function guardarEspacioTrabajo(valor: string) {
  const v = valor.trim();
  if (!v) {
    await db.config.deleteMany({ where: { clave: "workspace_id" } });
    return;
  }
  await escribir("workspace_id", v, false);
}

/** Modelo con el que responde el asistente. */
export async function modelo(): Promise<string> {
  const guardado = await leer("modelo");
  if (guardado && MODELOS.some(([id]) => id === guardado)) return guardado;
  return process.env.ANTHROPIC_MODEL || MODELO_POR_DEFECTO;
}

export async function guardarModelo(valor: string) {
  if (!MODELOS.some(([id]) => id === valor)) throw new Error("Ese modelo no está en la lista.");
  await escribir("modelo", valor, false);
}

/**
 * Estado de la configuración para la pantalla de ajustes.
 *
 * Nunca devuelve la clave: solo su rastro. Una clave que viaja al navegador
 * para «mostrarla» es una clave que acaba en el historial del navegador, en
 * una captura de pantalla o en el portapapeles de quien no debe.
 */
export async function estadoConfig() {
  const clave = await claveApi();
  const guardadaEnPanel = Boolean(await leer("anthropic_api_key"));

  return {
    hayClave: Boolean(clave),
    origen: guardadaEnPanel ? ("panel" as const) : clave ? ("entorno" as const) : ("ninguno" as const),
    // Lo justo para reconocer cuál es sin revelarla.
    rastro: clave ? `${clave.slice(0, 10)}…${clave.slice(-4)}` : "",
    modelo: await modelo(),
    modeloEnPanel: Boolean(await leer("modelo")),
    espacio: (await espacioTrabajo()) ?? "",
  };
}
