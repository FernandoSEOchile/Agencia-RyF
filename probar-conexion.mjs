/**
 * Probador de conexión con AppSEO Connect.
 *
 * Firma una petición real y llama al sitio, para verificar que el protocolo
 * HMAC funciona de extremo a extremo antes de construir nada encima.
 *
 * Uso:
 *   node probar-conexion.mjs                 → lee APPSEO_CONEXION del entorno
 *   node probar-conexion.mjs --audit         → además pide la auditoría completa
 *
 * La cadena de conexión contiene el secreto compartido. Pásala por variable de
 * entorno, no como argumento: los argumentos quedan en el historial del shell.
 *
 *   PowerShell:  $env:APPSEO_CONEXION = "appseo_..."
 *   bash:        export APPSEO_CONEXION="appseo_..."
 */

import { createHmac, createHash, randomBytes } from "node:crypto";

const PREFIJO = "appseo_";

function decodificar(cadena) {
  if (!cadena || !cadena.startsWith(PREFIJO)) {
    throw new Error('La cadena de conexión debe empezar por "appseo_".');
  }
  const b64 = cadena.slice(PREFIJO.length).replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(b64, "base64").toString("utf8");
  const datos = JSON.parse(json);

  for (const campo of ["site", "rest", "key_id", "secret"]) {
    if (!datos[campo]) throw new Error(`A la cadena le falta el campo "${campo}".`);
  }
  return datos;
}

/**
 * Llama a un endpoint del conector firmando la petición.
 */
async function llamar(conexion, metodo, camino, cuerpo = null) {
  const raw = cuerpo ? JSON.stringify(cuerpo) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");

  // Se firma SOLO la ruta, sin la cadena de consulta: es lo que devuelve
  // $request->get_route() en WordPress. Incluir los parámetros obligaría a que
  // PHP y JavaScript los codificaran de forma idéntica, y esa es una fuente de
  // fallos silenciosos que no compensa. El cuerpo sí va firmado, así que toda
  // escritura queda cubierta.
  const rutaFirmada = "/appseo/v1" + camino.split("?")[0];

  const canonical = [
    metodo.toUpperCase(),
    rutaFirmada,
    ts,
    nonce,
    createHash("sha256").update(raw).digest("hex"),
  ].join("\n");

  const firma = createHmac("sha256", conexion.secret).update(canonical).digest("hex");

  const inicio = Date.now();
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

  const ms = Date.now() - inicio;
  const texto = await res.text();

  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* la respuesta no era JSON */
  }

  return { estado: res.status, ok: res.ok, ms, json, texto };
}

function fallo(mensaje, pista = "") {
  console.error("\n  ✕ " + mensaje);
  if (pista) console.error("    " + pista);
  process.exit(1);
}

const cadena = process.env.APPSEO_CONEXION || process.argv.find((a) => a.startsWith(PREFIJO));

if (!cadena) {
  fallo(
    "No encuentro la cadena de conexión.",
    'Defínela con:  $env:APPSEO_CONEXION = "appseo_..."   (la copias de Ajustes → AppSEO Connect)'
  );
}

let conexion;
try {
  conexion = decodificar(cadena);
} catch (e) {
  fallo("La cadena de conexión no es válida.", e.message);
}

console.log("\n  Sitio : " + conexion.site);
console.log("  REST  : " + conexion.rest);
console.log("  Clave : " + conexion.key_id + "\n");

// ---------- 1. salud ----------
console.log("  → GET /health");
const salud = await llamar(conexion, "GET", "/health");

if (!salud.ok) {
  const codigo = salud.json?.code || "sin código";
  const mensaje = salud.json?.message || salud.texto.slice(0, 200);

  const pistas = {
    appseo_bad_signature: "La firma no coincide. Suele ser que la ruta firmada no es la misma que la llamada.",
    appseo_stale_request: "Desfase horario mayor de 300 s entre tu equipo y el servidor.",
    appseo_unknown_key: "La cadena de conexión es de otro sitio, o se regeneraron las credenciales.",
    appseo_missing_headers: "Faltan cabeceras de firma en la petición.",
    rest_no_route: "El plugin no está activo, o los enlaces permanentes necesitan guardarse de nuevo.",
  };

  fallo(`HTTP ${salud.estado} · ${codigo} · ${mensaje}`, pistas[codigo] || "");
}

const s = salud.json;
console.log(`    ✓ HTTP ${salud.estado} en ${salud.ms} ms\n`);
console.log("    conector       : v" + s.conector);
console.log("    WordPress      : " + s.wordpress + "  ·  PHP " + s.php);
console.log("    solo lectura   : " + (s.solo_lectura ? "SÍ (no acepta cambios)" : "no"));
console.log("    publica directo: " + (s.permite_publicar ? "SÍ" : "no"));
console.log("    usuario activo : " + (s.usuario_activo || "⚠ sin configurar — la escritura fallará"));

// ---------- 2. antirreplay ----------
console.log("\n  → Comprobando protección antirreplay");
const ts = String(Math.floor(Date.now() / 1000));
const nonce = randomBytes(16).toString("base64url");
const canonical = ["GET", "/appseo/v1/health", ts, nonce, createHash("sha256").update("").digest("hex")].join("\n");
const firma = createHmac("sha256", conexion.secret).update(canonical).digest("hex");
const cabeceras = {
  "X-AppSEO-Key": conexion.key_id,
  "X-AppSEO-Timestamp": ts,
  "X-AppSEO-Nonce": nonce,
  "X-AppSEO-Signature": firma,
};

const primera = await fetch(conexion.rest + "/health", { headers: cabeceras });
const repetida = await fetch(conexion.rest + "/health", { headers: cabeceras });

if (primera.ok && repetida.status === 409) {
  console.log("    ✓ el reenvío se rechaza con 409, como debe");
} else {
  console.log(`    ⚠ esperaba 200 y luego 409; obtuve ${primera.status} y ${repetida.status}`);
}

// ---------- 3. auditoría ----------
if (process.argv.includes("--audit")) {
  console.log("\n  → GET /audit");
  const aud = await llamar(conexion, "GET", "/audit?limit=500");

  if (!aud.ok) {
    fallo(`HTTP ${aud.estado} · ${aud.json?.code || ""} · ${aud.json?.message || ""}`);
  }

  const a = aud.json;
  const vacias = a.content.filter((c) => c.palabras === 0 && c.estado === "publish");
  const relleno = a.content.filter((c) => c.marcadores.length > 0);
  const sinSeo = a.content.filter((c) => !c.seo.keyword || !c.seo.metadesc);

  console.log(`    ✓ HTTP ${aud.estado} en ${aud.ms} ms  ·  ${(aud.texto.length / 1024).toFixed(1)} KB\n`);
  console.log("    piezas analizadas : " + a.content.length + (a.truncated.was_capped ? ` (de ${a.truncated.total}, recortado)` : ""));
  console.log("    enlaces internos  : " + a.links.length);
  console.log("    plugins           : " + a.site.plugins.length);
  console.log("    ── hallazgos ──");
  console.log("    publicadas vacías : " + vacias.length);
  console.log("    con texto relleno : " + relleno.length + (relleno.length ? "  ← " + relleno.map((c) => c.titulo).join(", ") : ""));
  console.log("    sin datos SEO     : " + sinSeo.length);
}

console.log("\n  Conexión verificada.\n");
