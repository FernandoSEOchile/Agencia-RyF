import { readFileSync, writeFileSync } from "node:fs";
import { api, sitio } from "./conexion.mjs";
const p = JSON.parse(readFileSync(process.argv[3], "utf8"));
const pal = p.contenido.replace(/<!--[\s\S]*?-->/g,"").replace(/<[^>]+>/g," ").split(/\s+/).filter(Boolean).length;
console.log("\n  sitio: " + sitio);
console.log("  " + p.titulo);
console.log("  " + pal + " palabras · estado " + p.estado + "\n");
const r = await api("POST", "/content", p);
if (!r.ok) { console.log("  ✕ HTTP " + r.s + " " + (r.j?.code||"") + " — " + (r.j?.message||"").slice(0,200)); process.exit(1); }
console.log("  ✓ id " + r.j.id);
console.log("    url    : " + (r.j.url || r.j.enlace || ""));
console.log("    editar : " + (r.j.editar || ""));
if (r.j.meta_escrito) {
  console.log("    meta ok: " + (r.j.meta_escrito.escritas||[]).join(", "));
  const rz = r.j.meta_escrito.rechazadas || [];
  if (rz.length) console.log("    meta rechazado: " + rz.join(", "));
}
writeFileSync("post-creado.json", JSON.stringify(r.j, null, 1));
