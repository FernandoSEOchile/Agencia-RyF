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
  [
    "automatico",
    "Automático",
    "Elige según lo que pidas: el rápido para consultar, el equilibrado para escribir, el potente para analizar.",
  ],
  ["claude-opus-5", "Opus 5", "El más capaz. Para diseño, redacción larga y trabajo delicado."],
  ["claude-sonnet-5", "Sonnet 5", "Equilibrado. Buena opción por defecto para el día a día."],
  ["claude-haiku-4-5", "Haiku 4.5", "El más barato y rápido. Para tareas mecánicas y repetitivas."],
] as const;

export const MODELO_POR_DEFECTO = "claude-opus-5";

/**
 * Qué clase de trabajo es, que es lo que decide el modelo.
 *
 * Poner un selector de modelo en cada pantalla parece dar control, pero
 * pregunta algo que quien usa el panel no puede responder —«¿le pongo Haiku a
 * la lectura del Excel?»— y basta con que uno quede mal puesto para que la
 * calidad baje sin que nadie se entere. Aquí cada sitio declara qué hace, que
 * sí lo sabe, y la correspondencia con el modelo se decide en un solo lugar.
 */
export type Tarea =
  /** Transformar algo que ya está: resumir, reformular, extraer un dato. */
  | "mecanica"
  /** Escribir o editar: es el grueso del trabajo del panel. */
  | "redaccion"
  /** Decidir, comparar, explicar por qué. Donde equivocarse cuesta caro. */
  | "analisis";

export const MODELO_DE_TAREA: Record<Tarea, string> = {
  mecanica: "claude-haiku-4-5",
  redaccion: "claude-sonnet-5",
  analisis: "claude-opus-5",
};

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

  // Se valida la forma porque este valor viaja como cabecera en CADA petición:
  // un texto suelto como «default» hace que la API rechace todo, y el error
  // que devuelve habla de créditos, así que el fallo se disfraza de problema
  // de facturación y cuesta horas encontrarlo.
  if (!/^wrkspc_[A-Za-z0-9]+$/.test(v)) {
    throw new Error(
      "El identificador debe empezar por «wrkspc_». Si no tienes uno, deja el campo vacío: la mayoría de las claves no lo necesitan."
    );
  }

  await escribir("workspace_id", v, false);
}

/**
 * Lo que hay guardado en ajustes, tal cual. Puede ser «automatico».
 *
 * Solo el chat sabe qué hacer con «automatico», porque es el único que ve lo
 * que se ha pedido. El resto usa `modelo()`, que ya devuelve uno concreto.
 */
export async function modeloConfigurado(): Promise<string> {
  const guardado = await leer("modelo");
  if (guardado && MODELOS.some(([id]) => id === guardado)) return guardado;
  return process.env.ANTHROPIC_MODEL || MODELO_POR_DEFECTO;
}

/**
 * El modelo para una clase de trabajo. Siempre uno concreto.
 *
 * Un modelo fijado a mano en ajustes manda sobre esto: existe para el día en
 * que haya que forzar algo —un modelo saturado, una respuesta rara que se
 * quiere reproducir—, no para el uso diario.
 */
export async function modelo(tarea: Tarea = "redaccion"): Promise<string> {
  const m = await modeloConfigurado();
  return m === "automatico" ? MODELO_DE_TAREA[tarea] : m;
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
    modelo: await modeloConfigurado(),
    modeloEnPanel: Boolean(await leer("modelo")),
    espacio: (await espacioTrabajo()) ?? "",
  };
}
