import { api } from "./conexion.mjs";
const r = await api("GET", "/audit?por_pagina=1");
const t = r.j.taxonomies || {};
console.log("\n  taxonomías que devuelve el conector: " + Object.keys(t).join(", "));
for (const [k, v] of Object.entries(t)) {
  console.log("  " + k + ": " + (Array.isArray(v) ? v.length + " términos" : typeof v));
  if (Array.isArray(v) && v[0]) console.log("     campos: " + Object.keys(v[0]).join(", "));
}
const pc = t.product_cat || [];
if (pc.length) {
  console.log("\n  categorías de producto: " + pc.length);
  console.log("  con más productos:");
  [...pc].sort((a,b)=>b.total-a.total).slice(0,12).forEach(c =>
    console.log("     " + String(c.total).padStart(4) + "  " + c.nombre));
}
