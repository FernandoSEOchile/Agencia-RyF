/**
 * Crea un producto de prueba en WooCommerce con imagen y descripciones,
 * y comprueba que la guarda de precios funciona.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node crear-producto.mjs <ruta-imagen>
 */

import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const PREFIJO = "appseo_";
const cadena = process.env.APPSEO_CONEXION;
const imagen = process.argv[2];

if (!cadena || !imagen) {
  console.error("\n  ✕ Uso: $env:APPSEO_CONEXION = \"appseo_...\"; node crear-producto.mjs <imagen.png>\n");
  process.exit(1);
}

const conexion = JSON.parse(
  Buffer.from(cadena.slice(PREFIJO.length).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
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

// ---------- 1. subir la imagen ----------
console.log("  → POST /media");
const bytes = readFileSync(imagen);
const media = await llamar("POST", "/media", {
  nombre: basename(imagen),
  contenido: bytes.toString("base64"),
  alt: "Imagen de producto generada para pruebas del conector AppSEO",
});

if (!media.ok) {
  console.error("    ✕ " + media.estado + " · " + (media.json?.code || "") + " — " + (media.json?.message || ""));
  process.exit(1);
}
console.log("    ✓ id " + media.json.id + "  ·  " + media.json.mime);
console.log("      " + media.json.url);

// ---------- 2. crear el producto ----------
const descripcion = `<p>Producto de prueba creado por el panel AppSEO a través del plugin conector, usando las clases CRUD de WooCommerce.</p>
<h3>Qué demuestra</h3>
<ul>
<li>Creación de productos sin pasar por el escritorio de WordPress.</li>
<li>Subida de imagen a la biblioteca y asignación como imagen destacada.</li>
<li>Escritura de metadatos de Yoast sobre un producto.</li>
<li>Uso de <code>WC_Product_Simple</code> en lugar de escribir metadatos a mano, para no descuadrar las tablas de búsqueda del catálogo.</li>
</ul>
<p>Puedes borrarlo sin ningún efecto secundario.</p>`;

console.log("\n  → POST /products");
const prod = await llamar("POST", "/products", {
  nombre: "Producto de prueba AppSEO",
  slug: "producto-prueba-appseo",
  estado: "draft",
  descripcion,
  descripcion_corta: "<p>Producto de prueba generado automáticamente para validar el conector AppSEO.</p>",
  imagen: media.json.id,
  etiquetas: ["prueba", "appseo"],
  meta: {
    _yoast_wpseo_focuskw: "producto de prueba",
    _yoast_wpseo_metadesc: "Producto de prueba creado desde el panel AppSEO para validar el módulo de WooCommerce.",
  },
});

if (!prod.ok) {
  console.error("    ✕ " + prod.estado + " · " + (prod.json?.code || "") + " — " + (prod.json?.message || prod.texto.slice(0, 200)));
  process.exit(1);
}

console.log("    ✓ " + (prod.json.creado ? "creado" : "actualizado") + "  ·  id " + prod.json.id);
console.log("      estado : " + prod.json.estado);
console.log("      editar : " + prod.json.editar);
console.log("      meta   : " + (prod.json.meta_escrito?.escritas || []).join(", "));

// ---------- 3. probar la guarda de precios ----------
console.log("\n  → Probando la guarda: intentar escribir el precio");
const conPrecio = await llamar("POST", "/products", {
  id: prod.json.id,
  precio_regular: "49900",
});

if (conPrecio.estado === 403 && conPrecio.json?.code === "appseo_campo_prohibido") {
  console.log("    ✓ rechazado con 403, como está diseñado");
  console.log("      " + conPrecio.json.message);
} else {
  console.log("    ⚠ respuesta inesperada: " + conPrecio.estado + " " + (conPrecio.json?.code || ""));
}

// ---------- 4. leer de vuelta ----------
console.log("\n  → GET /products/" + prod.json.id);
const leido = await llamar("GET", "/products/" + prod.json.id);
const p = leido.json;
console.log("    nombre          : " + p.nombre);
console.log("    slug            : " + p.slug);
console.log("    estado          : " + p.estado + "  ·  tipo " + p.tipo);
console.log("    imagen          : " + (p.imagen ? "id " + p.imagen : "sin imagen"));
console.log("    palabras desc   : " + p.palabras_desc + "  ·  corta: " + p.palabras_corta);
console.log("    precio          : " + (p.precio === "" || p.precio === null ? "(sin precio)" : p.precio));
console.log("    seo keyword     : " + (p.seo.keyword || "—"));
console.log("    etiquetas       : " + (p.etiquetas || []).join(", "));
console.log("");
