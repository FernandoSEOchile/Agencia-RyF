/**
 * Crea un segundo producto de prueba, esta vez con precio, y ejercita la
 * lista blanca de campos.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node crear-producto2.mjs <imagen>
 */

import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const cadena = process.env.APPSEO_CONEXION;
const imagen = process.argv[2];

if (!cadena || !imagen) {
  console.error("\n  ✕ Uso: node crear-producto2.mjs <imagen.png>\n");
  process.exit(1);
}

const conexion = JSON.parse(
  Buffer.from(cadena.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
);

async function llamar(metodo, camino, cuerpo = null) {
  const raw = cuerpo ? JSON.stringify(cuerpo) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const firma = createHmac("sha256", conexion.secret)
    .update([metodo, "/appseo/v1" + camino.split("?")[0], ts, nonce, createHash("sha256").update(raw).digest("hex")].join("\n"))
    .digest("hex");

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

console.log("\n  " + conexion.site + "\n");

const salud = await llamar("GET", "/health");
console.log("  conector : v" + salud.json.conector);

// ---------- imagen ----------
console.log("\n  → subir imagen");
const media = await llamar("POST", "/media", {
  nombre: basename(imagen),
  contenido: readFileSync(imagen).toString("base64"),
  alt: "Imagen del segundo producto de prueba del conector AppSEO",
});
if (!media.ok) {
  console.error("    ✕ " + (media.json?.code || media.estado) + " — " + (media.json?.message || ""));
  process.exit(1);
}
console.log("    ✓ id " + media.json.id);

// ---------- crear con precio ----------
const descripcion = `<p>Segundo producto de prueba del conector AppSEO. A diferencia del primero, este lleva precio, escrito a través del interruptor «Precios de productos».</p>
<h3>Qué se comprueba aquí</h3>
<ul>
<li>Escritura de precio regular y precio de oferta con <code>wc_format_decimal</code>.</li>
<li>Que el precio efectivo lo calcula WooCommerce, no el panel.</li>
<li>Que la lista blanca rechaza cualquier campo que no reconozca.</li>
<li>Que stock y SKU siguen sin poder escribirse, incluso con los precios habilitados.</li>
</ul>
<p>Puedes borrarlo sin ningún efecto secundario.</p>`;

console.log("\n  → crear producto con precio");
const prod = await llamar("POST", "/products", {
  nombre: "Producto de prueba AppSEO — con precio",
  slug: "producto-prueba-appseo-precio",
  estado: "draft",
  descripcion,
  descripcion_corta: "<p>Segundo producto de prueba, con precio regular y precio de oferta.</p>",
  imagen: media.json.id,
  etiquetas: ["prueba", "appseo", "con-precio"],
  precio_regular: "49990",
  precio_oferta: "39990",
  meta: {
    _yoast_wpseo_focuskw: "producto de prueba con precio",
    _yoast_wpseo_metadesc: "Segundo producto de prueba creado desde el panel AppSEO, con precio regular y de oferta.",
  },
});

if (!prod.ok) {
  console.error("    ✕ " + prod.estado + " · " + (prod.json?.code || "") + " — " + (prod.json?.message || prod.texto.slice(0, 240)));
  if (prod.json?.code === "appseo_precios_bloqueados") {
    console.error("\n    Activa «Precios de productos» en AppSEO → Conexión.");
  }
  process.exit(1);
}
console.log("    ✓ creado · id " + prod.json.id);

// ---------- lista blanca ----------
console.log("\n  → la lista blanca debe rechazar campos desconocidos");
const basura = await llamar("POST", "/products", { id: prod.json.id, campo_inventado: "x", precio_regular_typo: "1" });
if (basura.estado === 400 && basura.json?.code === "appseo_campo_desconocido") {
  console.log("    ✓ rechazado con 400");
  console.log("      " + basura.json.message.slice(0, 150) + "…");
} else {
  console.log("    ⚠ esperaba 400 appseo_campo_desconocido; obtuve " + basura.estado + " " + (basura.json?.code || ""));
}

console.log("\n  → stock y SKU deben seguir bloqueados");
const stock = await llamar("POST", "/products", { id: prod.json.id, stock: 50, sku: "TEST-1" });
if (!stock.ok) {
  console.log("    ✓ rechazado: " + stock.json?.code);
} else {
  console.log("    ⚠ ACEPTADO — no debería");
}

// ---------- leer ----------
console.log("\n  → leer de vuelta");
const p = (await llamar("GET", "/products/" + prod.json.id)).json;
console.log("    nombre         : " + p.nombre);
console.log("    precio regular : " + p.precio_regular);
console.log("    precio oferta  : " + p.precio_oferta);
console.log("    precio efectivo: " + p.precio + "   ← lo calcula WooCommerce");
console.log("    imagen         : id " + p.imagen);
console.log("    palabras desc  : " + p.palabras_desc);
console.log("    sku            : " + (p.sku || "(vacío, correcto)"));
console.log("    stock          : " + (p.stock_cantidad === null ? "(sin gestionar, correcto)" : p.stock_cantidad));
console.log("    seo keyword    : " + (p.seo.keyword || "—"));
console.log("");
