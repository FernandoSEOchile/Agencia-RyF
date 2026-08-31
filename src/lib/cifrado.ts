/**
 * Cifrado de los secretos de cliente.
 *
 * Los secretos HMAC de cada WordPress dan permiso de escritura sobre ese sitio.
 * Guardarlos en claro significaría que una copia del archivo de la base —un
 * respaldo perdido, un volcado mal borrado— entrega todos los clientes a la
 * vez. Por eso van cifrados con una clave que vive fuera de la base, en el
 * entorno del servidor.
 *
 * Se usa AES-256-GCM, que además de cifrar autentica: si alguien modifica el
 * texto cifrado en la base, el descifrado falla en lugar de devolver basura.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const LARGO_IV = 12; // Recomendado para GCM.

/**
 * Deriva la clave de 32 bytes a partir de la variable de entorno.
 *
 * Se acepta tanto una clave en hexadecimal de 64 caracteres como una frase
 * larga, pero se exige un mínimo: una clave corta anula el cifrado entero.
 */
function clave(): Buffer {
  const bruta = process.env.APPSEO_CLAVE_CIFRADO;

  if (!bruta) {
    throw new Error(
      "Falta APPSEO_CLAVE_CIFRADO. Genérala con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  if (/^[0-9a-f]{64}$/i.test(bruta)) {
    return Buffer.from(bruta, "hex");
  }

  if (bruta.length < 32) {
    throw new Error("APPSEO_CLAVE_CIFRADO es demasiado corta: usa al menos 32 caracteres.");
  }

  return createHash("sha256").update(bruta).digest();
}

/**
 * Cifra un texto. Devuelve `iv.tag.datos`, todo en base64url.
 */
export function cifrar(texto: string): string {
  const iv = randomBytes(LARGO_IV);
  const c = createCipheriv(ALGORITMO, clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const tag = c.getAuthTag();

  return [iv, tag, datos].map((b) => b.toString("base64url")).join(".");
}

/**
 * Descifra lo producido por `cifrar`. Lanza si el texto fue alterado.
 */
export function descifrar(guardado: string): string {
  const partes = guardado.split(".");

  if (partes.length !== 3) {
    throw new Error("El secreto guardado no tiene el formato esperado.");
  }

  const [iv, tag, datos] = partes.map((p) => Buffer.from(p, "base64url"));

  const d = createDecipheriv(ALGORITMO, clave(), iv);
  d.setAuthTag(tag);

  return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
}

/**
 * ¿Está configurada la clave? Sirve para avisar en la interfaz antes de que
 * el usuario intente guardar un cliente y se encuentre con un error.
 */
export function cifradoListo(): boolean {
  try {
    clave();
    return true;
  } catch {
    return false;
  }
}
