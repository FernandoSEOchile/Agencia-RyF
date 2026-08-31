/**
 * Envía el CSS de la sección de categorías a un cliente.
 *
 * El CSS vive en un archivo local por sitio, `css/<dominio>.css`, y si no
 * existe se usa el base. Así cada cliente puede tener el suyo sin que nadie
 * tenga que pegar nada en el escritorio de WordPress.
 *
 * Uso:  node css-empujar.mjs <sitio> [--activar]
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { api, sitio } from "./conexion.mjs";

const propio = "css/" + sitio + ".css";
const base = "appseo-ryf/assets/categoria-base.css";

mkdirSync("css", { recursive: true });

const ruta = existsSync(propio) ? propio : base;
const css = readFileSync(ruta, "utf8");

console.log("\n  sitio  : " + sitio);
console.log("  origen : " + ruta + "  (" + css.length + " bytes)");

/* ---------- estado actual ---------- */
const antes = await api("GET", "/ajustes");
if (!antes.ok) {
  console.log("  ✕ GET /ajustes " + antes.s + " " + (antes.j?.code || "") +
    (antes.j?.code === "rest_no_route" ? "  → hace falta la v1.12.0" : ""));
  process.exit(1);
}

console.log("\n  módulo activo   : " + (antes.j.seo_categorias ? "sí" : "no"));
console.log("  snippet activo  : " + (antes.j.fragmento_activo ? "sí (el plugin se aparta)" : "no"));
console.log("  CSS actual      : " + antes.j.seo_categorias_css.length + " bytes");

// Copia de seguridad antes de pisar nada.
if (antes.j.seo_categorias_css) {
  writeFileSync("css/" + sitio + ".anterior.css", antes.j.seo_categorias_css);
  console.log("  respaldo        : css/" + sitio + ".anterior.css");
}

/* ---------- envío ---------- */
const cuerpo = { seo_categorias_css: css };
if (process.argv.includes("--activar")) {
  cuerpo.seo_categorias = 1;
}

console.log("\n  → POST /ajustes");
const w = await api("POST", "/ajustes", cuerpo);

if (!w.ok) {
  console.log("  ✕ " + w.s + " " + (w.j?.code || "") + " — " + (w.j?.message || ""));
  process.exit(1);
}

console.log("  ✓ " + w.j.cambiados.join(", "));

/* ---------- comprobación ---------- */
const luego = await api("GET", "/ajustes");
const igual = luego.j.seo_categorias_css.trim() === css.trim();
console.log("\n  en el sitio     : " + luego.j.seo_categorias_css.length + " bytes");
console.log("  coincide        : " + (igual ? "sí" : "NO — revisa el saneado"));
console.log("  módulo activo   : " + (luego.j.seo_categorias ? "sí" : "no"));
console.log("");
