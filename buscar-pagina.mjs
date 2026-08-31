import { api, sitio } from "./conexion.mjs";
const r = await api("GET", "/audit?por_pagina=200");
if (!r.ok) { console.log("✕ " + r.s + " " + (r.j?.code||"")); process.exit(1); }
const c = r.j.content || [];
console.log("\n  sitio: " + sitio + "  ·  " + c.length + " contenidos\n");
const q = (process.argv[3] || "blog").toLowerCase();
const hits = c.filter(x => (x.titulo||"").toLowerCase().includes(q) || (x.slug||"").toLowerCase().includes(q));
console.log("  campos: " + Object.keys(c[0]||{}).join(", ") + "\n");
for (const x of hits) {
  console.log("  " + x.id + "  " + (x.tipo||"") + "  " + (x.estado||"") + "  " + String(x.palabras ?? "?").padStart(5) + " pal  " + (x.titulo||""));
  console.log("        " + (x.url || x.enlace || ""));
}
console.log("\n  páginas vacías o casi (<40 palabras):");
c.filter(x => (x.palabras ?? 0) < 40 && x.estado === "publish")
 .forEach(x => console.log("   " + String(x.palabras ?? 0).padStart(4) + " pal  " + (x.tipo||"").padEnd(5) + " " + (x.titulo||"")));
