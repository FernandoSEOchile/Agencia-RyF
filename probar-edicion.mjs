/**
 * Prueba el ciclo de edición y publicación sobre contenido existente.
 *
 * Secuencia: editar un borrador → publicarlo → devolverlo a borrador.
 * Deja el sitio como estaba.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node probar-edicion.mjs <id>
 */

import { createHmac, createHash, randomBytes } from "node:crypto";

const PREFIJO = "appseo_";
const cadena = process.env.APPSEO_CONEXION || process.argv.find((a) => a.startsWith(PREFIJO));
const ID = Number(process.argv.find((a) => /^\d+$/.test(a)) || 0);

if (!cadena || !ID) {
  console.error("\n  ✕ Uso: $env:APPSEO_CONEXION = \"appseo_...\"; node probar-edicion.mjs <id>\n");
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

function comprobar(condicion, mensaje) {
  console.log((condicion ? "    ✓ " : "    ✗ ") + mensaje);
  return condicion;
}

console.log("\n  " + conexion.site + "  ·  entrada " + ID + "\n");

// ---------- estado inicial ----------
const inicial = await llamar("GET", "/content/" + ID);
if (!inicial.ok) {
  console.error("  ✕ No pude leer la entrada: " + (inicial.json?.code || inicial.estado));
  process.exit(1);
}
console.log("  estado inicial : " + inicial.json.estado + "  ·  «" + inicial.json.titulo + "»");
const contenidoOriginal = inicial.json.contenido;
const tituloOriginal = inicial.json.titulo;

// ---------- 1. editar sin cambiar el estado ----------
console.log("\n  → 1. Editar contenido y título (sin tocar el estado)");
const marca = "editada-" + Math.floor(Date.now() / 1000);
const edicion = await llamar("POST", "/content", {
  id: ID,
  titulo: "AppSEO — editada por el panel",
  contenido: contenidoOriginal + `\n\n<!-- wp:paragraph -->\n<p>Párrafo añadido por el panel: ${marca}</p>\n<!-- /wp:paragraph -->`,
  meta: { _yoast_wpseo_metadesc: "Descripción actualizada por el panel el " + new Date().toISOString().slice(0, 10) },
});

if (!edicion.ok) {
  console.error("    ✕ " + edicion.estado + " " + (edicion.json?.code || "") + " — " + (edicion.json?.message || ""));
  process.exit(1);
}

const trasEditar = await llamar("GET", "/content/" + ID);
comprobar(!edicion.json.creado, "actualizó en vez de crear una nueva");
comprobar(trasEditar.json.titulo === "AppSEO — editada por el panel", "el título cambió");
comprobar(trasEditar.json.contenido.includes(marca), "el contenido nuevo está guardado");
comprobar(trasEditar.json.estado === inicial.json.estado, "el estado se mantuvo en «" + trasEditar.json.estado + "»");
comprobar(!!edicion.json.anterior, "devolvió el estado anterior para poder deshacer");

// ---------- 2. publicar ----------
console.log("\n  → 2. Publicar");
const publicar = await llamar("POST", "/content", { id: ID, estado: "publish" });

if (!publicar.ok) {
  const c = publicar.json?.code;
  console.error("    ✗ " + publicar.estado + " " + c + " — " + (publicar.json?.message || ""));
  if (c === "appseo_publish_disabled") {
    console.error("      Activa «Publicación directa» en AppSEO → Conexión.");
  }
} else {
  const trasPublicar = await llamar("GET", "/content/" + ID);
  comprobar(trasPublicar.json.estado === "publish", "quedó publicada");
  comprobar(!trasPublicar.json.url.includes("?p="), "la URL pasó a ser permanente: " + trasPublicar.json.url);
}

// ---------- 3. devolver a borrador y restaurar ----------
console.log("\n  → 3. Devolver a borrador y restaurar el contenido original");
const revertir = await llamar("POST", "/content", {
  id: ID,
  estado: inicial.json.estado,
  titulo: tituloOriginal,
  contenido: contenidoOriginal,
});

if (!revertir.ok) {
  console.error("    ✗ no pude revertir: " + (revertir.json?.code || revertir.estado));
} else {
  const final = await llamar("GET", "/content/" + ID);
  comprobar(final.json.estado === inicial.json.estado, "vuelve a estado «" + final.json.estado + "»");
  comprobar(final.json.titulo === tituloOriginal, "título restaurado");
  comprobar(final.json.contenido === contenidoOriginal, "contenido restaurado tal cual");
}

console.log("");
