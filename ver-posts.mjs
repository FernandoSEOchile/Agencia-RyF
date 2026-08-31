import { api } from "./conexion.mjs";
const r = await api("GET", "/audit?por_pagina=200");
const c = (r.j.content || []).filter(x => x.tipo === "post");
console.log("\n  entradas: " + c.length + "\n");
for (const x of c.sort((a,b)=>(b.palabras||0)-(a.palabras||0))) {
  console.log("  " + String(x.id).padEnd(6) + String(x.palabras ?? 0).padStart(5) + " pal  " + (x.estado||"").padEnd(8) + (x.titulo||""));
  console.log("        " + (x.url||"") + "   [" + (x.editor||"?") + "]");
}
