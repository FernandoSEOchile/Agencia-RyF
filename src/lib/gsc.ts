import "server-only";
import { createSign } from "node:crypto";
import { db } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";

/**
 * Search Console mediante cuenta de servicio.
 *
 * Se usa cuenta de servicio y no OAuth a propósito. El permiso de Search
 * Console es de los que Google considera sensibles: con OAuth habría que pasar
 * su revisión, o dejar la aplicación en modo de pruebas y reconectar cada
 * siete días cuando caduca el token. Una cuenta de servicio no caduca, no pide
 * pantalla de consentimiento, y el acceso se concede y se revoca propiedad a
 * propiedad desde el propio Search Console, que es justo el control que
 * necesita un panel que trabaja con sitios ajenos.
 */

const ALCANCE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

interface Cuenta {
  client_email: string;
  private_key: string;
}

export interface FilaConsulta {
  consulta: string;
  clics: number;
  impresiones: number;
  ctr: number;
  posicion: number;
}

export interface Propiedad {
  url: string;
  permiso: string;
}

/** La credencial guardada, o null si nadie la ha configurado. */
export async function cuenta(): Promise<Cuenta | null> {
  const fila = await db.config.findUnique({ where: { clave: "gsc_cuenta" } });
  if (!fila) return null;

  try {
    const j = JSON.parse(fila.cifrado ? descifrar(fila.valor) : fila.valor);
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key };
  } catch {
    return null;
  }
}

/**
 * Guarda el JSON de la cuenta de servicio.
 *
 * Se guarda entero y no solo los dos campos que se usan: si Google añade algo
 * necesario más adelante, estará ahí en vez de haber que pedir el archivo otra
 * vez.
 */
export async function guardarCuenta(json: string) {
  const j = JSON.parse(json);

  if (j.type !== "service_account") {
    throw new Error("Ese JSON no es de una cuenta de servicio. Descárgalo desde «Claves» de la cuenta.");
  }
  if (!j.client_email || !j.private_key) {
    throw new Error("Al JSON le faltan «client_email» o «private_key».");
  }

  await db.config.upsert({
    where: { clave: "gsc_cuenta" },
    update: { valor: cifrar(JSON.stringify(j)), cifrado: true },
    create: { clave: "gsc_cuenta", valor: cifrar(JSON.stringify(j)), cifrado: true },
  });
}

export async function borrarCuenta() {
  await db.config.deleteMany({ where: { clave: "gsc_cuenta" } });
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Token de acceso, cacheado mientras siga siendo válido. */
let cache: { token: string; caduca: number } | null = null;

async function token(c: Cuenta): Promise<string> {
  // Un minuto de margen: pedir uno nuevo es barato, que caduque a mitad de una
  // tanda de peticiones no lo es.
  if (cache && cache.caduca > Date.now() + 60_000) return cache.token;

  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: c.client_email,
    scope: ALCANCE,
    aud: TOKEN,
    iat: ahora,
    exp: ahora + 3600,
  })}`;

  const firma = createSign("RSA-SHA256").update(cuerpo).sign(c.private_key, "base64url");

  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cuerpo}.${firma}`,
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  const j = await r.json();
  if (!r.ok || !j.access_token) {
    throw new Error(
      j.error_description || j.error || "Google rechazó la credencial de la cuenta de servicio."
    );
  }

  cache = { token: j.access_token, caduca: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cache.token;
}

/** Propiedades a las que esta cuenta de servicio tiene acceso concedido. */
export async function propiedades(c: Cuenta): Promise<Propiedad[]> {
  const t = await token(c);

  const r = await fetch(`${API}/sites`, {
    headers: { Authorization: `Bearer ${t}` },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  if (!r.ok) throw new Error(`Search Console respondió ${r.status}.`);

  const j = await r.json();
  return (j.siteEntry ?? [])
    .map((s: { siteUrl: string; permissionLevel: string }) => ({
      url: s.siteUrl,
      permiso: s.permissionLevel,
    }))
    // «siteUnverifiedUser» significa que la propiedad existe pero no nos han
    // dado permiso todavía: mostrarla como disponible sería mentir.
    .filter((p: Propiedad) => p.permiso !== "siteUnverifiedUser");
}

/** Fecha en formato ISO corto, desplazada tantos días hacia atrás. */
function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Consultas por las que el sitio apareció en Google.
 *
 * Se arranca tres días atrás porque Search Console va con retraso: pedir hasta
 * hoy devuelve los últimos días vacíos y hunde la media de posición sin que
 * haya pasado nada.
 */
export async function consultas(
  c: Cuenta,
  propiedad: string,
  dias = 28,
  limite = 500
): Promise<FilaConsulta[]> {
  const t = await token(c);

  const r = await fetch(
    `${API}/sites/${encodeURIComponent(propiedad)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: haceDias(dias + 3),
        endDate: haceDias(3),
        dimensions: ["query"],
        rowLimit: limite,
        type: "web",
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    }
  );

  if (r.status === 403) {
    throw new Error(
      "La cuenta de servicio no tiene acceso a esa propiedad. Añádela como usuario en Search Console."
    );
  }
  if (!r.ok) throw new Error(`Search Console respondió ${r.status}.`);

  const j = await r.json();

  return (j.rows ?? []).map(
    (f: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
      consulta: f.keys[0],
      clics: f.clicks,
      impresiones: f.impressions,
      ctr: f.ctr,
      // Google devuelve la posición media con decimales; un decimal basta y
      // dos dan una falsa sensación de precisión sobre lo que es un promedio.
      posicion: Math.round(f.position * 10) / 10,
    })
  );
}
