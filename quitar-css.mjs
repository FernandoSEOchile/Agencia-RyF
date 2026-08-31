/**
 * Devuelve el CSS adicional al estado anterior a la hoja de ficha de producto.
 *
 * No se «resta» la hoja: se restaura literalmente el contenido que había antes,
 * guardado cuando se anexó. Restar por coincidencia de texto dejaría residuos
 * si algo se editó a mano por el camino.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { api } from "./conexion.mjs";

const previo = readFileSync("../../Users/fparr/AppData/Local/Temp/claude/C--Programas-Claude-AppSEO/3ff499eb-c6fa-4b38-95d1-2cf4ff2e07c3/scratchpad/css-anterior.css", "utf8");

const actual = await api("GET", "/css");
if (!actual.ok) { console.log("✕ GET /css " + actual.s + " " + (actual.j?.code || "")); process.exit(1); }

console.log("\n  CSS actual   : " + actual.j.bytes + " bytes · " + actual.j.revisiones + " revisiones");
console.log("  a restaurar  : " + previo.length + " bytes");

// Copia de seguridad de lo que hay ahora, por si acaso.
writeFileSync("css-antes-de-quitar.css", actual.j.css);
console.log("  respaldo     : css-antes-de-quitar.css");

// ¿Lo que hay ahora empieza por lo que había antes? Si no, alguien editó a mano.
if (!actual.j.css.startsWith(previo.trim().slice(0, 200))) {
  console.log("\n  ⚠ el CSS actual no empieza como el anterior — se editó por otro sitio.");
  console.log("    Revisa css-antes-de-quitar.css antes de seguir.");
}

console.log("\n  → POST /css (reemplazar)");
const w = await api("POST", "/css", { css: previo, modo: "reemplazar" });
if (!w.ok) { console.log("  ✕ " + w.s + " " + (w.j?.code || "") + " — " + (w.j?.message || "")); process.exit(1); }

console.log("  ✓ " + w.j.bytes + " bytes · " + w.j.revisiones + " revisiones");

const fin = await api("GET", "/css");
const rastros = ["woocommerce-product-gallery", "single_add_to_cart_button", "single-product", "product_title"]
  .filter((c) => fin.j.css.includes(c));
console.log("  comprobación : " + fin.j.bytes + " bytes en el sitio · rastros de la hoja de producto: " +
  (rastros.length ? rastros.join(", ") : "ninguno"));
console.log("");
