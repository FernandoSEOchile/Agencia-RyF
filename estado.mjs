/**
 * Inventario de todos los sitios conectados.
 *
 * Sin esto no hay forma de saber qué versión corre cada cliente ni si el
 * conector sigue respondiendo — que es lo primero que hace falta antes de
 * empujar nada a una cartera de sitios.
 *
 * Uso:  node estado.mjs
 */
import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), ".appseo");

if (!existsSync(RAIZ)) {
  console.error("\n  No hay credenciales en .appseo/\n");
  process.exit(1);
}

const dominios = readdirSync(RAIZ).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4)).sort();

async function llamar(cfg, metodo, ruta) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const firma = createHmac("sha256", cfg.secret)
    .update([metodo, "/appseo/v1" + ruta.split("?")[0], ts, nonce,
      createHash("sha256").update("").digest("hex")].join("\n"))
    .digest("hex");

  const r = await fetch(cfg.rest + ruta, {
    headers: {
      "X-AppSEO-Key": cfg.key_id,
      "X-AppSEO-Timestamp": ts,
      "X-AppSEO-Nonce": nonce,
      "X-AppSEO-Signature": firma,
    },
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* no era JSON */ }
  return { s: r.status, ok: r.ok, j };
}

const filas = await Promise.all(dominios.map(async (d) => {
  const cadena = readFileSync(join(RAIZ, d + ".txt"), "utf8").trim();
  let cfg;
  try {
    cfg = JSON.parse(Buffer.from(cadena.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  } catch {
    return { d, estado: "cadena ilegible" };
  }

  try {
    const h = await llamar(cfg, "GET", "/health");
    if (!h.ok) return { d, estado: "HTTP " + h.s + (h.j?.code ? " · " + h.j.code : "") };
    return {
      d,
      estado: "ok",
      v: h.j.conector,
      escritura: h.j.read_only === false || h.j.solo_lectura === false ? "sí" : "no",
      wp: h.j.wp || h.j.wordpress || "",
    };
  } catch (e) {
    return { d, estado: "sin respuesta (" + e.cause?.code || e.message + ")" };
  }
}));

console.log("");
const anchoD = Math.max(...filas.map((f) => f.d.length), 7);
console.log("  " + "SITIO".padEnd(anchoD) + "  CONECTOR  ESCRIBE  ESTADO");
for (const f of filas) {
  console.log("  " + f.d.padEnd(anchoD) + "  " +
    (f.v || "—").padEnd(8) + "  " +
    (f.escritura || "—").padEnd(7) + "  " +
    f.estado);
}

const versiones = [...new Set(filas.filter((f) => f.v).map((f) => f.v))];
if (versiones.length > 1) {
  console.log("\n  ⚠ conviven " + versiones.length + " versiones del conector: " + versiones.join(", "));
}
console.log("");
