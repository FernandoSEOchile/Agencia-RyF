import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * La ficha con la que el cron del servidor se identifica.
 *
 * El cron no tiene sesión: manda `Authorization: Bearer <ficha>` y aquí se
 * compara en tiempo constante, para que no se pueda adivinar a tientas. La
 * misma ficha vale para el vigía y para las mediciones programadas: son el
 * mismo llamante.
 */
export function fichaDeCronValida(cabecera: string | null): boolean {
  const recibida = (cabecera ?? "").startsWith("Bearer ") ? (cabecera ?? "").slice(7) : "";
  const esperada = process.env.VIGIA_TOKEN ?? "";
  if (!esperada || !recibida) return false;

  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}
