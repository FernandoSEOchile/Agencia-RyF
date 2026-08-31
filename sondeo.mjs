import { api, sitio } from "./conexion.mjs";
const r = await api("GET", "/products?por_pagina=2");
console.log("\n  sitio: " + sitio + "  ·  HTTP " + r.s);
if (!r.ok) { console.log("  " + (r.j?.code || "") + " — " + (r.j?.message || r.t.slice(0,200))); process.exit(0); }
const j = r.j;
console.log("  claves: " + Object.keys(j).join(", "));
for (const [k,v] of Object.entries(j)) {
  if (Array.isArray(v)) console.log("  " + k + ": " + v.length + " elementos");
  else if (typeof v !== "object") console.log("  " + k + ": " + v);
  else console.log("  " + k + ": " + JSON.stringify(v).slice(0,200));
}
const arr = Object.values(j).find(Array.isArray) || [];
if (arr[0]) {
  console.log("\n  campos por producto: " + Object.keys(arr[0]).join(", "));
  const p = arr[0];
  console.log("\n  muestra:");
  console.log("    id        : " + p.id);
  console.log("    nombre    : " + (p.nombre||"").slice(0,70));
  console.log("    desc corta: " + String(p.descripcion_corta||"").replace(/<[^>]+>/g,"").slice(0,120) + "  [" + String(p.descripcion_corta||"").length + " bytes]");
  console.log("    desc larga: " + String(p.descripcion||"").replace(/<[^>]+>/g,"").slice(0,120) + "  [" + String(p.descripcion||"").length + " bytes]");
}
