"use client";

/**
 * Preparación de imágenes antes de enviarlas al chat.
 *
 * Una captura de móvil pesa varios megas y llega a 4000 píxeles de ancho. La
 * API no saca nada de ese detalle —reduce internamente a 1568 px— así que
 * mandarla entera solo cuesta tiempo de subida y dinero en tokens.
 *
 * Aquí se reduce en el navegador antes de que salga: es donde está la imagen y
 * donde no cuesta nada hacerlo.
 */

/** Lado máximo que aprovecha la API. Más allá, se escala y se pierde el resto. */
const LADO_MAXIMO = 1568;

/** Formatos que acepta la API de Anthropic. */
export const FORMATOS = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export interface Adjunta {
  /** Data URI listo para enviar. */
  uri: string;
  nombre: string;
  bytes: number;
}

/**
 * Reduce una imagen y la devuelve como data URI.
 *
 * Los GIF se dejan intactos: redibujarlos en un lienzo mataría la animación, y
 * suelen ser capturas cortas que no pesan tanto.
 */
export async function prepararImagen(archivo: File): Promise<Adjunta> {
  if (!FORMATOS.includes(archivo.type)) {
    throw new Error(`${archivo.name || "La imagen"}: formato no admitido (usa JPG, PNG, GIF o WebP).`);
  }

  if (archivo.type === "image/gif") {
    if (archivo.size > 4_000_000) throw new Error("Ese GIF pesa más de 4 MB.");
    return { uri: await comoDataUri(archivo), nombre: archivo.name || "imagen.gif", bytes: archivo.size };
  }

  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;

  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo procesar la imagen.");

  // Fondo blanco: un PNG con transparencia convertido a JPEG dejaría los
  // huecos en negro, y en una captura de pantalla eso arruina la lectura.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const uri = lienzo.toDataURL("image/jpeg", 0.85);
  return {
    uri,
    nombre: archivo.name || "imagen.jpg",
    // El data URI es base64: unas cuatro terceras partes más que los bytes reales.
    bytes: Math.round((uri.length - uri.indexOf(",") - 1) * 0.75),
  };
}

function comoDataUri(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

/** Tamaño legible, para mostrarlo junto a la miniatura. */
export function pesoLegible(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
