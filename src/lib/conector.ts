/**
 * Cliente del conector AppSEO RyF.
 *
 * Firma cada petición con HMAC-SHA256 sobre método, ruta, marca de tiempo,
 * nonce y huella del cuerpo. Es la misma firma que valida el plugin, así que
 * cualquier cambio aquí tiene que acompañarse del cambio equivalente allá.
 *
 * Todo esto corre solo en el servidor: el secreto nunca debe llegar al
 * navegador. Por eso el módulo no se importa nunca desde un componente cliente.
 */
import "server-only";
import { createHmac, createHash, randomBytes } from "node:crypto";

export interface Credencial {
  urlRest: string;
  keyId: string;
  secreto: string;
}

export interface Respuesta<T = unknown> {
  estado: number;
  ok: boolean;
  datos: T | null;
  codigo?: string;
  mensaje?: string;
}

/** Cadena de conexión decodificada, tal como la genera el plugin. */
export interface CadenaConexion {
  v: number;
  site: string;
  rest: string;
  key_id: string;
  secret: string;
}

/**
 * Lee la cadena `appseo_...` que muestra el plugin.
 *
 * Se valida la forma antes de guardar nada: un error de copiado detectado aquí
 * ahorra una conexión que falla en silencio más tarde.
 */
export function leerCadena(cadena: string): CadenaConexion {
  const limpia = cadena.trim();

  if (!limpia.startsWith("appseo_")) {
    throw new Error("La cadena debe empezar por «appseo_». Cópiala completa desde AppSEO → Conexión.");
  }

  let datos: CadenaConexion;
  try {
    const base64 = limpia.slice(7).replace(/-/g, "+").replace(/_/g, "/");
    datos = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    throw new Error("La cadena no se pudo leer. ¿Se copió entera?");
  }

  if (!datos.rest || !datos.key_id || !datos.secret) {
    throw new Error("A la cadena le faltan datos. Vuelve a copiarla desde el plugin.");
  }

  // El panel escribe en el sitio del cliente: solo por HTTPS.
  if (!datos.rest.startsWith("https://")) {
    throw new Error("La URL del conector no usa HTTPS. No se puede conectar un sitio sin certificado.");
  }

  return datos;
}

/** Dominio legible a partir de la URL del sitio. */
export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Llamada firmada al conector de un cliente.
 *
 * No lanza en caso de error de la API: devuelve el estado para que quien llama
 * decida. Un cliente caído tiene que poder mostrarse como caído, no romper la
 * página entera.
 */
export async function llamar<T = unknown>(
  cred: Credencial,
  metodo: "GET" | "POST",
  ruta: string,
  cuerpo?: unknown
): Promise<Respuesta<T>> {
  const crudo = cuerpo === undefined ? "" : JSON.stringify(cuerpo);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");

  const firma = createHmac("sha256", cred.secreto)
    .update(
      [
        metodo,
        "/appseo/v1" + ruta.split("?")[0],
        ts,
        nonce,
        createHash("sha256").update(crudo).digest("hex"),
      ].join("\n")
    )
    .digest("hex");

  const cabeceras: Record<string, string> = {
    "X-AppSEO-Key": cred.keyId,
    "X-AppSEO-Timestamp": ts,
    "X-AppSEO-Nonce": nonce,
    "X-AppSEO-Signature": firma,
  };

  if (crudo) cabeceras["Content-Type"] = "application/json";

  try {
    const r = await fetch(cred.urlRest + ruta, {
      method: metodo,
      headers: cabeceras,
      body: crudo || undefined,
      cache: "no-store",
      // Un sitio lento no debe dejar colgada la carga del panel.
      signal: AbortSignal.timeout(15000),
    });

    const texto = await r.text();
    let datos: T | null = null;
    let codigo: string | undefined;
    let mensaje: string | undefined;

    try {
      const j = JSON.parse(texto);
      datos = j as T;
      if (!r.ok) {
        codigo = j?.code;
        mensaje = j?.message;
      }
    } catch {
      mensaje = texto.slice(0, 200);
    }

    return { estado: r.status, ok: r.ok, datos, codigo, mensaje };
  } catch (e) {
    const err = e as { name?: string; cause?: { code?: string }; message?: string };
    return {
      estado: 0,
      ok: false,
      datos: null,
      codigo: err.name === "TimeoutError" ? "tiempo_agotado" : err.cause?.code || "sin_respuesta",
      mensaje: err.name === "TimeoutError" ? "El sitio no respondió en 15 segundos." : err.message,
    };
  }
}

export interface Salud {
  ok: boolean;
  conector: string;
  wordpress: string;
  php: string;
  sitio: string;
  solo_lectura: boolean;
  permite_publicar: boolean;
  ultima_conexion: number;
}

/** Comprueba que las credenciales sirven y devuelve el estado del sitio. */
export function salud(cred: Credencial) {
  return llamar<Salud>(cred, "GET", "/health");
}
