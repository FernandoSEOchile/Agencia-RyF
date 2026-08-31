/**
 * Informe del envoltorio del tema, sobre una página representativa.
 *
 * Uso:  node ver-tema.mjs [url]
 */
import { writeFileSync } from "node:fs";
import { api } from "./conexion.mjs";

const url = process.argv[2] || "";

const h = await api("GET", "/health");
if (!h.ok) {
  console.log("\n  ✕ /health " + h.s + " " + (h.j?.code || h.t.slice(0, 80)) + "\n");
  process.exit(1);
}
console.log("\n  conector v" + h.j.conector);

const r = await api("GET", "/theme" + (url ? "?url=" + encodeURIComponent(url) : ""));
if (!r.ok) {
  console.log("  ✕ /theme " + r.s + " " + (r.j?.code || "") + "\n");
  process.exit(1);
}

const t = r.j;
console.log("  tema        : " + t.tema.nombre + " v" + t.tema.version +
  (t.tema.padre ? " (hijo de " + t.tema.padre + ")" : ""));
console.log("  WooCommerce : " + (t.woocommerce.activo
  ? "v" + t.woocommerce.version + " · plantillas sobrescritas: " + t.woocommerce.total_sobrescritas
  : "no activo"));

const e = t.envoltorio;
console.log("\n  sonda       : " + e.codigo + " · " + e.bytes + " bytes");
console.log("  analizada   : " + e.url_analizada);
if (e.parece_cortina) console.log("  ⚠ parece una pantalla de «próximamente», no la página real");
console.log("  migas Woo   : " + (e.migas_woo ? "sí" : "no"));
console.log("  envoltorio  :");
if (e.encontrados?.length) {
  e.encontrados.forEach((x) => console.log("      ." + x.clase.padEnd(28) + " → " + x.familia));
} else {
  console.log("      (ninguno de los conocidos)");
}

const vars = { ...(t.variables.theme_json || {}), ...(t.variables.stylesheet || {}) };
console.log("  variables de color: " + Object.keys(vars).length);
Object.entries(vars).slice(0, 8).forEach(([k, v]) => console.log("      " + k.padEnd(26) + " " + v));

writeFileSync("theme-huella.json", JSON.stringify(t, null, 1));
console.log("\n  huella completa → theme-huella.json\n");
