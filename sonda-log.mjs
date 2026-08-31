import { api, sitio } from "./conexion.mjs";
const h = await api("GET", "/health");
console.log("\n== " + sitio + "  v" + (h.j?.conector||"?"));
console.log("  health: " + JSON.stringify(h.j).slice(0,400));
const l = await api("GET", "/log?por_pagina=3");
console.log("\n  log HTTP " + l.s);
if (l.ok) {
  console.log("  claves: " + Object.keys(l.j).join(", "));
  const e = (l.j.entradas||[])[0];
  if (e) console.log("  campos entrada: " + Object.keys(e).join(", "));
  (l.j.entradas||[]).slice(0,3).forEach(x=>console.log("   " + JSON.stringify(x).slice(0,180)));
  console.log("  total: " + (l.j.total ?? "?"));
}
