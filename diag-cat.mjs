import { api } from "./conexion.mjs";
const h = await api("GET", "/health");
console.log("\n  conector v" + (h.j?.conector || "?"));
const a = await api("GET", "/ajustes");
if (!a.ok) {
  console.log("  ✕ /ajustes " + a.s + " " + (a.j?.code || "") +
    (a.j?.code === "rest_no_route" ? "  → la v1.12.0 no está instalada todavía" : ""));
  process.exit(0);
}
console.log("  módulo activo  : " + (a.j.seo_categorias ? "sí" : "NO"));
console.log("  solo página 1  : " + (a.j.seo_categorias_solo_pagina_1 ? "sí" : "no"));
console.log("  CSS guardado   : " + a.j.seo_categorias_css.length + " bytes");
console.log("  snippet activo : " + (a.j.fragmento_activo ? "SÍ (el plugin se aparta)" : "no"));
if (a.j.seo_categorias_css) {
  console.log("  primeras líneas del CSS:");
  a.j.seo_categorias_css.split("\n").slice(0,4).forEach(l=>console.log("     "+l.slice(0,70)));
}
