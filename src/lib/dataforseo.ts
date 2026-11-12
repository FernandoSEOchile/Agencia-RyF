import "server-only";
import { db } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";
import { leerSerp, type LecturaSerp } from "@/lib/serp";
import { paisPorIso } from "@/lib/ubicaciones";

/**
 * Cliente de DataForSEO para medir posiciones en Google.
 *
 * Se usa el endpoint en vivo y no la cola de tareas porque quien pulsa
 * «medir» está mirando la pantalla: esperar unos segundos es aceptable, volver
 * dentro de diez minutos no. Cuando haya medición programada, esa sí irá por
 * la cola, que es bastante más barata.
 *
 * Cada llamada lleva una sola consulta. Los endpoints en vivo aceptan un array
 * pero procesan de uno en uno, así que mandar veinte juntas no ahorra tiempo y
 * complica saber cuál falló.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

export interface Medicion extends LecturaSerp {
  coste: number | null;
}

export interface Credenciales {
  login: string;
  clave: string;
  pruebas: boolean;
}

/** Lo que hace falta para llamar a la API, o null si no está configurado. */
export async function credenciales(): Promise<Credenciales | null> {
  const filas = await db.config.findMany({
    where: { clave: { in: ["dfs_login", "dfs_clave", "dfs_pruebas"] } },
  });

  const dato = (k: string) => filas.find((f) => f.clave === k);

  const login = dato("dfs_login")?.valor;
  const cruda = dato("dfs_clave");
  if (!login || !cruda) return null;

  let clave: string;
  try {
    clave = cruda.cifrado ? descifrar(cruda.valor) : cruda.valor;
  } catch {
    return null;
  }

  return { login, clave, pruebas: dato("dfs_pruebas")?.valor === "si" };
}

export async function guardarCredenciales(login: string, clave: string, pruebas: boolean) {
  await db.config.upsert({
    where: { clave: "dfs_login" },
    update: { valor: login.trim(), cifrado: false },
    create: { clave: "dfs_login", valor: login.trim(), cifrado: false },
  });
  await db.config.upsert({
    where: { clave: "dfs_clave" },
    update: { valor: cifrar(clave.trim()), cifrado: true },
    create: { clave: "dfs_clave", valor: cifrar(clave.trim()), cifrado: true },
  });
  await db.config.upsert({
    where: { clave: "dfs_pruebas" },
    update: { valor: pruebas ? "si" : "no", cifrado: false },
    create: { clave: "dfs_pruebas", valor: pruebas ? "si" : "no", cifrado: false },
  });
}

export async function borrarCredenciales() {
  await db.config.deleteMany({ where: { clave: { in: ["dfs_login", "dfs_clave", "dfs_pruebas"] } } });
}

function cabecera(c: Credenciales) {
  return "Basic " + Buffer.from(`${c.login}:${c.clave}`).toString("base64");
}

export interface Cuenta {
  dinero: number;
  moneda: string;
  depositado: number;
  gastado: number;
}

/** Comprueba que las credenciales sirven, leyendo el estado de la cuenta. */
export async function saldo(c: Credenciales): Promise<Cuenta> {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;
  const r = await fetch(`${base}/v3/appendix/user_data`, {
    headers: { Authorization: cabecera(c) },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  if (r.status === 401) throw new Error("Usuario o contraseña de DataForSEO incorrectos.");
  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const datos = j?.tasks?.[0]?.result?.[0];
  if (!datos) throw new Error("DataForSEO no devolvió los datos de la cuenta.");

  return {
    dinero: Number(datos.money?.balance ?? 0),
    moneda: String(datos.money?.currency ?? "USD"),
    depositado: Number(datos.money?.total ?? 0),
    gastado: Number(datos.money?.spent ?? 0),
  };
}

/**
 * Estado de la cuenta para la pantalla de ajustes, sin reventar si falla.
 *
 * Que el proveedor no responda no debe impedir abrir los ajustes, así que un
 * fallo aquí se convierte en «no se pudo leer» y no en una página en blanco.
 */
export async function estadoCuenta(): Promise<Cuenta | null> {
  const c = await credenciales();
  if (!c) return null;
  try {
    return await saldo(c);
  } catch {
    return null;
  }
}

/**
 * Mide en qué puesto aparece un dominio para una consulta.
 *
 * Qué cuenta como aparecer —orgánico, fragmento destacado, mapa— lo decide
 * `leerSerp`, que se prueba aparte con resultados de ejemplo.
 *
 * El idioma sale del país de la consulta: dejarlo fijo en español hacía que
 * medir Estados Unidos fuera buscar en español.
 *
 * El dominio de Google (`se_domain`) NO se manda, a propósito. El proveedor ya
 * elige google.cl para Chile a partir de la ubicación, y forzarlo hizo que
 * devolviera cada resultado como un enlace de redirección de Google
 * (google.cl/goto?url=…) en vez de la URL del sitio: el 10-nov-2026 cuarenta
 * mediciones de Fontus salieron «no está» por eso.
 */
export async function medir(
  c: Credenciales,
  dominio: string,
  consulta: {
    termino: string;
    ubicacion: number;
    pais: string;
    idioma: string;
    dispositivo: string;
  }
): Promise<Medicion> {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;
  const pais = paisPorIso(consulta.pais);

  // «advanced» y no «regular» para traer el bloque de IA de Google con sus
  // fuentes, y el mapa: cuesta el doble (US$0,004 medido en vivo).
  const r = await fetch(`${base}/v3/serp/google/organic/live/advanced`, {
    method: "POST",
    headers: { Authorization: cabecera(c), "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        keyword: consulta.termino,
        location_code: consulta.ubicacion,
        language_code: consulta.idioma || pais.idioma,
        device: consulta.dispositivo,
        depth: 100,
        load_async_ai_overview: true,
      },
    ]),
    signal: AbortSignal.timeout(90000),
    cache: "no-store",
  });

  if (r.status === 401) throw new Error("Usuario o contraseña de DataForSEO incorrectos.");
  if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const tarea = j?.tasks?.[0];

  // El código 20000 es «todo bien». Cualquier otro trae su propio mensaje, que
  // es más útil que uno genérico nuestro.
  if (tarea?.status_code && tarea.status_code !== 20000) {
    throw new Error(`DataForSEO: ${tarea.status_message ?? tarea.status_code}`);
  }

  const coste = typeof j?.cost === "number" ? j.cost : null;
  const items: Array<Record<string, unknown>> = tarea?.result?.[0]?.items ?? [];

  return { ...leerSerp(items, dominio), coste };
}

export interface UbicacionProveedor {
  codigo: number;
  nombre: string;
  tipo: string;
}

const ubicacionesGuardadas = new Map<string, { cuando: number; lista: UbicacionProveedor[] }>();

/**
 * Las ciudades y regiones de un país, con el código exacto del proveedor.
 *
 * La lista es gratis pero pesa —miles de filas en países grandes— y casi no
 * cambia, así que se guarda en memoria un día.
 */
export async function ubicacionesDe(c: Credenciales, iso: string): Promise<UbicacionProveedor[]> {
  const guardada = ubicacionesGuardadas.get(iso);
  if (guardada && Date.now() - guardada.cuando < 86_400_000) return guardada.lista;

  const base = c.pruebas ? PRUEBAS : PRODUCCION;
  const r = await fetch(`${base}/v3/serp/google/locations/${encodeURIComponent(iso)}`, {
    headers: { Authorization: cabecera(c) },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (r.status === 401) throw new Error("Usuario o contraseña de DataForSEO incorrectos.");
  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const filas: Array<Record<string, unknown>> = j?.tasks?.[0]?.result ?? [];
  const lista = filas
    .filter((f) => ["City", "Region", "State", "Province"].includes(String(f.location_type ?? "")))
    .map((f) => ({
      codigo: Number(f.location_code),
      nombre: String(f.location_name ?? ""),
      tipo: String(f.location_type ?? ""),
    }))
    .filter((f) => f.codigo && f.nombre)
    .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre, "es") : a.tipo === "City" ? -1 : 1));

  ubicacionesGuardadas.set(iso, { cuando: Date.now(), lista });
  return lista;
}
