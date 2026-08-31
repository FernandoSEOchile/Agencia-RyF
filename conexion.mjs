/**
 * Cliente firmado del conector AppSEO RyF, con varios sitios.
 *
 * Cada cliente tiene su archivo en `.appseo/<dominio>.txt`. Las cadenas no
 * viven en el código ni en variables de entorno: los shells no las conservan
 * entre sesiones y el historial de la terminal sí.
 *
 * El sitio se elige con el primer argumento de los scripts, o con la variable
 * APPSEO_SITIO. Si solo hay uno guardado, se usa ese.
 */
import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), ".appseo");

/** Dominios con credenciales guardadas. */
export function sitios() {
  if (!existsSync(RAIZ)) return [];
  return readdirSync(RAIZ)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.slice(0, -4))
    .sort();
}

/**
 * Resuelve qué sitio usar. Acepta el dominio entero o un trozo, para no tener
 * que escribirlo completo.
 */
function elegir(pedido) {
  const todos = sitios();

  if (!todos.length) {
    console.error("\n  No hay credenciales en .appseo/\n");
    process.exit(1);
  }

  if (!pedido) {
    if (todos.length === 1) return todos[0];
    console.error("\n  Hay " + todos.length + " sitios. Indica cuál:\n    " + todos.join("\n    ") + "\n");
    process.exit(1);
  }

  const exacto = todos.find((s) => s === pedido);
  if (exacto) return exacto;

  const parciales = todos.filter((s) => s.includes(pedido.toLowerCase()));
  if (parciales.length === 1) return parciales[0];

  if (parciales.length > 1) {
    console.error("\n  «" + pedido + "» coincide con varios:\n    " + parciales.join("\n    ") + "\n");
  } else {
    console.error("\n  No tengo credenciales de «" + pedido + "».\n  Guardadas:\n    " + todos.join("\n    ") + "\n");
  }
  process.exit(1);
}

export const sitio = elegir(process.env.APPSEO_SITIO || process.argv[2] || "");

const cadena = readFileSync(join(RAIZ, sitio + ".txt"), "utf8").trim();

if (!cadena.startsWith("appseo_")) {
  console.error("\n  La cadena de " + sitio + " no empieza por «appseo_» — ¿se copió entera?\n");
  process.exit(1);
}

export const cfg = JSON.parse(
  Buffer.from(cadena.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
);

/**
 * Llamada firmada. Devuelve { s, ok, j, t } sin lanzar excepciones: los
 * scripts deciden qué hacer con un fallo, en vez de morir a mitad de un lote.
 */
export async function api(metodo, ruta, cuerpo) {
  const crudo = cuerpo ? JSON.stringify(cuerpo) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");

  const firma = createHmac("sha256", cfg.secret)
    .update([
      metodo,
      "/appseo/v1" + ruta.split("?")[0],
      ts,
      nonce,
      createHash("sha256").update(crudo).digest("hex"),
    ].join("\n"))
    .digest("hex");

  const r = await fetch(cfg.rest + ruta, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "X-AppSEO-Key": cfg.key_id,
      "X-AppSEO-Timestamp": ts,
      "X-AppSEO-Nonce": nonce,
      "X-AppSEO-Signature": firma,
    },
    ...(crudo ? { body: crudo } : {}),
  });

  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* no era JSON */ }
  return { s: r.status, ok: r.ok, j, t };
}
