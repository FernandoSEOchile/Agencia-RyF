/**
 * Lee la clave de API desde disco.
 *
 * Vive en `.anthropic-key`, fuera del código y fuera del historial de la
 * terminal. Quien tenga esta clave gasta el saldo de la cuenta, así que no
 * viaja en argumentos ni en variables que queden registradas.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RUTA = join(dirname(fileURLToPath(import.meta.url)), ".anthropic-key");

if (!existsSync(RUTA)) {
  console.error("\n  Falta .anthropic-key");
  console.error("  Créala con la clave de console.anthropic.com\n");
  process.exit(1);
}

export const clave = readFileSync(RUTA, "utf8").trim();

if (!clave.startsWith("sk-ant-")) {
  console.error("\n  La clave no empieza por «sk-ant-» — ¿se copió entera?\n");
  process.exit(1);
}
