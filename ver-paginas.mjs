import { api } from "./conexion.mjs";
const r = await api("GET", "/audit?por_pagina=200");
const c = (r.j.content || []).filter(x => x.tipo === "page" && x.estado === "publish");
console.log("\n  páginas publicadas: " + c.length + "\n");
for (const x of c) console.log("  " + String(x.palabras ?? 0).padStart(5) + " pal  " + (x.titulo||"").padEnd(34) + " " + (x.url||""));
