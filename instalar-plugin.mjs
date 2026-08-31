/**
 * Instala y activa un plugin del repositorio oficial mediante AppSEO Connect.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node instalar-plugin.mjs woocommerce
 *       añade --solo-instalar para no activarlo
 */

import { createHmac, createHash, randomBytes } from "node:crypto";

const PREFIJO = "appseo_";
const cadena = process.env.APPSEO_CONEXION || process.argv.find((a) => a.startsWith(PREFIJO));
const slug = process.argv.slice(2).find((a) => /^[a-z0-9-]+$/.test(a) && !a.startsWith("--"));
const soloInstalar = process.argv.includes("--solo-instalar");

if (!cadena || !slug) {
  console.error("\n  ✕ Uso: node instalar-plugin.mjs <slug> [--solo-instalar]\n");
  process.exit(1);
}

const b64 = cadena.slice(PREFIJO.length).replace(/-/g, "+").replace(/_/g, "/");
const conexion = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

async function llamar(metodo, camino, cuerpo = null) {
  const raw = cuerpo ? JSON.stringify(cuerpo) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const canonical = [
    metodo.toUpperCase(),
    "/appseo/v1" + camino.split("?")[0],
    ts,
    nonce,
    createHash("sha256").update(raw).digest("hex"),
  ].join("\n");
  const firma = createHmac("sha256", conexion.secret).update(canonical).digest("hex");

  const res = await fetch(conexion.rest + camino, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "X-AppSEO-Key": conexion.key_id,
      "X-AppSEO-Timestamp": ts,
      "X-AppSEO-Nonce": nonce,
      "X-AppSEO-Signature": firma,
    },
    ...(raw ? { body: raw } : {}),
  });

  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no era JSON */ }
  return { estado: res.status, ok: res.ok, json, texto };
}

console.log("\n  " + conexion.site + "  ·  " + slug + "\n");

console.log("  → instalar");
const inst = await llamar("POST", "/plugins", { accion: "instalar", slug });

if (!inst.ok) {
  console.error("    ✕ " + inst.estado + " · " + (inst.json?.code || "") + " — " + (inst.json?.message || inst.texto.slice(0, 160)));
  process.exit(1);
}

console.log("    ✓ " + inst.json.accion + (inst.json.version ? "  v" + inst.json.version : ""));
console.log("      archivo: " + inst.json.archivo);
if ((inst.json.avisos || []).length) {
  inst.json.avisos.slice(-3).forEach((a) => console.log("      · " + String(a).replace(/<[^>]+>/g, "")));
}

if (soloInstalar) {
  console.log("\n  (no se activa: --solo-instalar)\n");
  process.exit(0);
}

console.log("\n  → activar");
const act = await llamar("POST", "/plugins", { accion: "activar", archivo: inst.json.archivo });

if (!act.ok) {
  console.error("    ✕ " + act.estado + " · " + (act.json?.code || "") + " — " + (act.json?.message || ""));
  process.exit(1);
}
console.log("    ✓ " + act.json.accion);

console.log("\n  → comprobando el inventario");
const lista = await llamar("GET", "/plugins");
const encontrado = (lista.json?.plugins || []).find((p) => p.slug === slug);
if (encontrado) {
  console.log("    " + (encontrado.activo ? "●" : "○") + " " + encontrado.nombre + " v" + encontrado.version + (encontrado.activo ? "  activo" : "  inactivo"));
} else {
  console.log("    ⚠ no aparece en el inventario");
}
console.log("");
