import "server-only";
import { db } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";

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

export interface Medicion {
  puesto: number | null;
  url: string | null;
  bloquesArriba: number | null;
  coste: number | null;
  /** Si Google puso su bloque de IA en esa búsqueda, si citó al cliente y a quién citó. */
  iaOverview: boolean;
  iaCitado: boolean;
  iaUrl: string | null;
  iaFuentes: string[];
  /** Los veinte primeros orgánicos: dominio, URL y puesto. Para comparar con rivales. */
  serp: { d: string; u: string; p: number }[];
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

/** Quita protocolo, www y barra final para poder comparar dominios. */
function raiz(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/**
 * Mide en qué puesto aparece un dominio para una consulta.
 *
 * Se cuenta la posición dentro de lo orgánico, no la del array: DataForSEO
 * mezcla anuncios, mapas y «otras preguntas» en la misma lista, y llamar
 * «puesto 3» a algo que tiene dos bloques de anuncios encima sería mentir
 * sobre lo que el usuario ve.
 */
export async function medir(
  c: Credenciales,
  dominio: string,
  consulta: {
    termino: string;
    ubicacion: number;
    idioma: string;
    dispositivo: string;
  }
): Promise<Medicion> {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;

  // «advanced» y no «regular» para traer el bloque de IA de Google con sus
  // fuentes: cuesta el doble (US$0,004 medido en vivo) y con eso se sabe si la
  // IA cita al cliente en la misma consulta que mide el puesto.
  const r = await fetch(`${base}/v3/serp/google/organic/live/advanced`, {
    method: "POST",
    headers: { Authorization: cabecera(c), "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        keyword: consulta.termino,
        location_code: consulta.ubicacion,
        language_code: consulta.idioma,
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

  const objetivo = raiz(dominio);
  let orgánicos = 0;
  let noOrgánicosArriba = 0;
  const serp: { d: string; u: string; p: number }[] = [];

  // El bloque de IA: sus fuentes vienen arriba (`references`) y dentro de cada
  // trozo de texto (`items[].references`). Se juntan todas.
  const ai = items.find((i) => String(i.type ?? "") === "ai_overview") as
    | { references?: { domain?: string; url?: string }[]; items?: { references?: { domain?: string; url?: string }[] }[] }
    | undefined;
  const fuentes: string[] = [];
  let iaUrl: string | null = null;
  if (ai) {
    const refs = [...(ai.references ?? []), ...(ai.items ?? []).flatMap((x) => x.references ?? [])];
    for (const ref of refs) {
      const d = raiz(String(ref.domain ?? "") || String(ref.url ?? ""));
      if (!d) continue;
      if (d === objetivo && !iaUrl) iaUrl = String(ref.url ?? "") || null;
      if (!fuentes.includes(d)) fuentes.push(d);
    }
  }
  const ia = { iaOverview: Boolean(ai), iaCitado: fuentes.includes(objetivo), iaUrl, iaFuentes: fuentes.slice(0, 20) };

  for (const item of items) {
    const tipo = String(item.type ?? "");

    if (tipo !== "organic") {
      // Solo cuentan los bloques que van por encima del resultado, así que se
      // acumulan mientras no lo hayamos encontrado.
      noOrgánicosArriba++;
      continue;
    }

    orgánicos++;

    const suUrl = String(item.url ?? "");
    const suDominio = String(item.domain ?? "") || raiz(suUrl);
    if (orgánicos <= 20) serp.push({ d: raiz(suDominio), u: suUrl, p: orgánicos });
  }

  const mio = serp.find((x) => x.d === objetivo);
  if (mio) {
    // Los bloques por encima son los que había antes de SU resultado, no los de
    // toda la página: se recalculan hasta su posición.
    let arriba = 0;
    let vistos = 0;
    for (const item of items) {
      if (String(item.type ?? "") === "organic") {
        vistos++;
        if (vistos === mio.p) break;
      } else arriba++;
    }
    return { puesto: mio.p, url: mio.u || null, bloquesArriba: arriba, coste, ...ia, serp };
  }

  // Fuera de los veinte guardados puede estar más abajo: se busca en el resto.
  let vistos = 0;
  for (const item of items) {
    if (String(item.type ?? "") !== "organic") continue;
    vistos++;
    const suUrl = String(item.url ?? "");
    const suDominio = String(item.domain ?? "") || raiz(suUrl);
    if (raiz(suDominio) === objetivo) {
      return { puesto: vistos, url: suUrl || null, bloquesArriba: noOrgánicosArriba, coste, ...ia, serp };
    }
  }

  // No aparecer no es un error: es el dato.
  return { puesto: null, url: null, bloquesArriba: null, coste, ...ia, serp };
}
