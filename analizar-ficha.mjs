/**
 * Radiografía del marcado real de una ficha de producto.
 *
 * Antes de escribir una línea de CSS para un cliente hay que saber contra qué
 * clases existen de verdad. Suponerlo por el nombre del tema es como se acaba
 * aplicando una hoja que no engancha con nada y dando el trabajo por hecho.
 *
 * Uso:  node analizar-ficha.mjs <url>
 */
import { writeFileSync } from "node:fs";

const url = process.argv[2];
if (!url) {
  console.error("\n  Uso: node analizar-ficha.mjs <url de una ficha de producto>\n");
  process.exit(1);
}

const h = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (AppSEO)" } })).text();
writeFileSync("ficha-analizada.html", h);

// Solo el marcado: en el CSS y el JS en línea aparecen nombres de clase que
// nunca llegan a aplicarse a un elemento.
const marcado = h.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

const clases = new Set();
for (const m of marcado.matchAll(/\sclass\s*=\s*"([^"]*)"/g)) {
  m[1].split(/\s+/).forEach((c) => c && clases.add(c));
}

console.log("\n  " + url);
console.log("  " + h.length + " bytes · " + clases.size + " clases aplicadas\n");

/* ---------- piezas de la ficha ---------- */
const piezas = {
  "galería":        ["woocommerce-product-gallery", "astra-shop-thumbnail-wrap", "ast-woocommerce-container", "flex-viewport", "woocommerce-product-gallery__image"],
  "título":         ["product_title", "entry-title"],
  "precio":         ["price", "woocommerce-Price-amount", "amount"],
  "desc. corta":    ["woocommerce-product-details__short-description"],
  "añadir carrito": ["single_add_to_cart_button", "cart", "quantity"],
  "pestañas":       ["woocommerce-tabs", "wc-tabs", "panel"],
  "relacionados":   ["related", "upsells", "products"],
  "migas":          ["woocommerce-breadcrumb", "ast-breadcrumbs", "yoast-breadcrumbs"],
  "resumen":        ["summary", "entry-summary"],
};

for (const [nombre, cands] of Object.entries(piezas)) {
  const vivos = cands.filter((c) => clases.has(c));
  console.log("  " + nombre.padEnd(16) + (vivos.length ? vivos.join(", ") : "— ninguna de: " + cands.join(", ")));
}

/* ---------- envoltorios y cabecera ---------- */
console.log("\n  -- envoltorios y cabecera:");
[...clases]
  .filter((c) => /^(ast-|site-|entry-|page-|content|main|header|primary|elementor-location)/.test(c))
  .sort()
  .slice(0, 40)
  .forEach((c) => console.log("      ." + c));

/* ---------- quién maqueta ---------- */
console.log("\n  -- maquetador:");
for (const [q, marca] of Object.entries({
  Elementor: "elementor-page",
  "Elementor (widget)": "elementor-widget",
  Divi: "et_pb_",
  "GenerateBlocks": "gb-element-",
  Bricks: "brxe-",
  WPBakery: "vc_row",
  "Bloques WP": "wp-block-",
})) {
  const n = (marcado.match(new RegExp(marca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  if (n) console.log("      " + q.padEnd(20) + n + " apariciones");
}

console.log("\n  HTML guardado en ficha-analizada.html\n");
