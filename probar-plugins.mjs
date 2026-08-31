/**
 * Prueba los endpoints de gestión de plugins de AppSEO Connect.
 *
 * Verifica tanto que funcionan como que los seguros están puestos: si la
 * gestión está desactivada, la instalación debe rechazarse con 403.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node probar-plugins.mjs
 */

import { createHmac, createHash, randomBytes } from "node:crypto";

const PREFIJO = "appseo_";
const cadena = process.env.APPSEO_CONEXION || process.argv.find((a) => a.startsWith(PREFIJO));

if (!cadena) {
  console.error('\n  ✕ Define APPSEO_CONEXION con la cadena de conexión.\n');
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
  return { estado: res.status, ok: res.ok, json };
}

console.log("\n  " + conexion.site + "\n");

// 1. versión del conector
const salud = await llamar("GET", "/health");
if (!salud.ok) {
  console.error("  ✕ /health falló: " + (salud.json?.code || salud.estado));
  process.exit(1);
}
console.log("  conector instalado : v" + salud.json.conector);

// 2. inventario de plugins
const lista = await llamar("GET", "/plugins");
if (!lista.ok) {
  console.error("  ✕ GET /plugins: " + (lista.json?.code || lista.estado) + " — " + (lista.json?.message || ""));
  process.exit(1);
}

const p = lista.json;
console.log("  gestión de plugins : " + (p.gestion_activa ? "ACTIVADA" : "desactivada (seguro puesto)"));
console.log("  permite instalar   : " + (p.permite_instalar ? "sí" : "no (DISALLOW_FILE_MODS)"));
console.log("  método de archivos : " + p.metodo_archivos);
console.log("\n  plugins instalados : " + p.plugins.length);
for (const pl of p.plugins) {
  const marca = pl.protegido ? " ← protegido" : "";
  const upd = pl.actualiza_a ? "  ⟳ " + pl.actualiza_a : "";
  console.log(
    "    " + (pl.activo ? "●" : "○") + " " +
    pl.nombre.padEnd(28).slice(0, 28) + " v" + pl.version.padEnd(10).slice(0, 10) +
    pl.slug + upd + marca
  );
}

// 3. el seguro: intentar instalar debe fallar si la gestión está desactivada
console.log("\n  → Probando el seguro: instalar con la gestión " + (p.gestion_activa ? "activada" : "desactivada"));
const intento = await llamar("POST", "/plugins", { accion: "instalar", slug: "classic-editor" });

if (!p.gestion_activa) {
  if (intento.estado === 403 && intento.json?.code === "appseo_plugins_desactivado") {
    console.log("    ✓ rechazado con 403, como debe");
  } else {
    console.log("    ⚠ esperaba 403 appseo_plugins_desactivado; obtuve " + intento.estado + " " + (intento.json?.code || ""));
  }
} else {
  console.log("    resultado: " + intento.estado + " " + JSON.stringify(intento.json));
}

// 4. el conector no debe poder desactivarse a sí mismo
console.log("\n  → Probando la autoprotección: desactivar el propio conector");
const suicidio = await llamar("POST", "/plugins", { accion: "desactivar", archivo: "appseo-connect/appseo-connect.php" });

if (suicidio.json?.code === "appseo_autoproteccion") {
  console.log("    ✓ se niega a desactivarse a sí mismo");
} else if (suicidio.json?.code === "appseo_plugins_desactivado") {
  console.log("    · bloqueado antes por la gestión desactivada (no llega a probarse la autoprotección)");
} else {
  console.log("    ⚠ respuesta inesperada: " + suicidio.estado + " " + (suicidio.json?.code || JSON.stringify(suicidio.json)));
}

console.log("");
