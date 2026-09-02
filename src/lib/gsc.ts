import "server-only";
import { db } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";

/**
 * Search Console mediante OAuth.
 *
 * Cada persona autoriza su propia cuenta de Google y el panel ve exactamente
 * las propiedades que esa cuenta ya tiene. Es lo que permite vender esto: una
 * agencia se conecta sola, sin que nadie le añada una cuenta de servicio
 * propiedad por propiedad, y revoca el acceso desde su cuenta de Google cuando
 * quiera.
 *
 * Se guarda el token de refresco, no el de acceso. El de acceso dura una hora;
 * el de refresco vale mientras el usuario no revoque el permiso.
 */

const ALCANCE = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "openid",
  "email",
].join(" ");

const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

export interface Aplicacion {
  id: string;
  secreto: string;
  redireccion: string;
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

/** A dónde vuelve Google tras autorizar. Debe coincidir con lo declarado allí. */
export function urlRedireccion(): string {
  const base = (process.env.NEXTAUTH_URL || process.env.APPSEO_URL || "").replace(/\/$/, "");
  return `${base}/api/gsc/callback`;
}

/** Credenciales de la aplicación de Google, o null si nadie las configuró. */
export async function aplicacion(): Promise<Aplicacion | null> {
  const filas = await db.config.findMany({
    where: { clave: { in: ["gsc_client_id", "gsc_client_secret"] } },
  });

  const id = filas.find((f) => f.clave === "gsc_client_id")?.valor;
  const bruto = filas.find((f) => f.clave === "gsc_client_secret");
  if (!id || !bruto) return null;

  try {
    return {
      id,
      secreto: bruto.cifrado ? descifrar(bruto.valor) : bruto.valor,
      redireccion: urlRedireccion(),
    };
  } catch {
    return null;
  }
}

export async function guardarAplicacion(id: string, secreto: string) {
  await db.config.upsert({
    where: { clave: "gsc_client_id" },
    update: { valor: id.trim(), cifrado: false },
    create: { clave: "gsc_client_id", valor: id.trim(), cifrado: false },
  });
  await db.config.upsert({
    where: { clave: "gsc_client_secret" },
    update: { valor: cifrar(secreto.trim()), cifrado: true },
    create: { clave: "gsc_client_secret", valor: cifrar(secreto.trim()), cifrado: true },
  });
}

export async function borrarAplicacion() {
  await db.config.deleteMany({ where: { clave: { in: ["gsc_client_id", "gsc_client_secret"] } } });
}

/**
 * Empaqueta a dónde volver después de autorizar.
 *
 * Se cifra en vez de firmarse porque el cifrado que ya tenemos es autenticado:
 * si alguien manipula el parámetro, el descifrado falla en lugar de devolver
 * datos alterados. Y lleva caducidad para que un enlace viejo no sirva.
 */
export function crearEstado(clienteId: string): string {
  return cifrar(JSON.stringify({ clienteId, exp: Date.now() + 15 * 60_000 }));
}

export function leerEstado(estado: string): { clienteId: string } | null {
  try {
    const j = JSON.parse(descifrar(estado));
    if (!j.exp || j.exp < Date.now()) return null;
    return { clienteId: String(j.clienteId) };
  } catch {
    return null;
  }
}

/** A dónde mandar al usuario para que autorice. */
export function urlAutorizacion(app: Aplicacion, estado: string): string {
  const p = new URLSearchParams({
    client_id: app.id,
    redirect_uri: app.redireccion,
    response_type: "code",
    scope: ALCANCE,
    // Sin «offline» Google no entrega token de refresco, y sin «consent» deja
    // de entregarlo a partir de la segunda autorización de la misma cuenta:
    // el panel se quedaría sin poder renovar y fallaría a la hora.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTORIZAR}?${p}`;
}

/** Canjea el código de la vuelta por los tokens, y averigua de quién son. */
export async function canjear(
  app: Aplicacion,
  codigo: string
): Promise<{ correo: string; refresco: string }> {
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: app.id,
      client_secret: app.secreto,
      redirect_uri: app.redireccion,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  const j = await r.json();

  if (!r.ok) {
    console.error("[gsc] Google rechazó el canje:", r.status, JSON.stringify(j));
    throw new Error(
      `Google rechazó la autorización (${j.error ?? r.status}): ${j.error_description ?? "sin detalle"}`
    );
  }

  if (!j.refresh_token) {
    throw new Error(
      "Google no devolvió token de refresco. Revoca el acceso del panel en tu cuenta de Google y vuelve a autorizar."
    );
  }

  // El correo viaja dentro del id_token, que aquí solo se lee: viene por canal
  // seguro directamente de Google, así que no hace falta verificar la firma.
  let correo = "cuenta de Google";
  try {
    const carga = JSON.parse(Buffer.from(String(j.id_token).split(".")[1], "base64url").toString());
    if (carga.email) correo = String(carga.email);
  } catch {
    /* si no viene, se guarda igual: el correo es etiqueta, no credencial */
  }

  return { correo, refresco: String(j.refresh_token) };
}

/** Guarda o actualiza la conexión de una cuenta. */
export async function guardarConexion(correo: string, refresco: string, usuarioId?: string) {
  return db.conexionGoogle.upsert({
    where: { correo },
    update: { refresco: cifrar(refresco), usadoPor: usuarioId },
    create: { correo, refresco: cifrar(refresco), usadoPor: usuarioId },
  });
}

/** Tokens de acceso vivos, por conexión. Renovarlos cuesta una petición. */
const cache = new Map<string, { token: string; caduca: number }>();

async function token(conexionId: string): Promise<string> {
  const guardado = cache.get(conexionId);
  if (guardado && guardado.caduca > Date.now() + 60_000) return guardado.token;

  const [app, conexion] = await Promise.all([
    aplicacion(),
    db.conexionGoogle.findUnique({ where: { id: conexionId } }),
  ]);

  if (!app) throw new Error("Search Console no está configurado en el panel.");
  if (!conexion) throw new Error("Esa conexión de Google ya no existe.");

  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.id,
      client_secret: app.secreto,
      refresh_token: descifrar(conexion.refresco),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  const j = await r.json();

  if (!r.ok || !j.access_token) {
    // «invalid_grant» significa que el usuario revocó el permiso o cambió la
    // contraseña. Decirlo con esas palabras evita media hora de búsqueda.
    if (j.error === "invalid_grant") {
      throw new Error(
        `La autorización de ${conexion.correo} ya no vale: se revocó desde Google. Hay que volver a conectar.`
      );
    }
    throw new Error(j.error_description || j.error || "No se pudo renovar el acceso a Google.");
  }

  cache.set(conexionId, {
    token: j.access_token,
    caduca: Date.now() + (j.expires_in ?? 3600) * 1000,
  });

  return j.access_token;
}

/** Propiedades que ve esa cuenta de Google. */
export async function propiedades(conexionId: string): Promise<Propiedad[]> {
  const t = await token(conexionId);

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
    .filter((p: Propiedad) => p.permiso !== "siteUnverifiedUser");
}

/** Fecha ISO corta, desplazada tantos días hacia atrás. */
function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Consultas por las que el sitio apareció en Google.
 *
 * El periodo termina tres días antes de hoy porque Search Console va con
 * retraso: pedir hasta hoy devuelve los últimos días vacíos y hunde la media
 * sin que haya pasado nada.
 */
export async function consultas(
  conexionId: string,
  propiedad: string,
  dias = 28,
  limite = 500
): Promise<FilaConsulta[]> {
  const t = await token(conexionId);

  const r = await fetch(`${API}/sites/${encodeURIComponent(propiedad)}/searchAnalytics/query`, {
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
  });

  if (r.status === 403) {
    throw new Error("Esa cuenta de Google ya no tiene acceso a esta propiedad.");
  }
  if (!r.ok) throw new Error(`Search Console respondió ${r.status}.`);

  const j = await r.json();

  return (j.rows ?? []).map(
    (f: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
      consulta: f.keys[0],
      clics: f.clicks,
      impresiones: f.impressions,
      ctr: f.ctr,
      // Un decimal basta: es un promedio, y dos decimales darían una falsa
      // sensación de precisión.
      posicion: Math.round(f.position * 10) / 10,
    })
  );
}
