import { readFileSync } from "node:fs";
import { api } from "./conexion.mjs";
const inv = JSON.parse(readFileSync("inventario.json", "utf8")).filter(p => p.estado === "publish");
const elegir = (min, max) => inv.find(p => p.palabras_desc > min && p.palabras_desc <= max);
const sel = [elegir(0, 40), elegir(40, 120), elegir(120, 9999)].filter(Boolean);
for (const s of sel) {
  const r = await api("GET", "/products?id=" + s.id);
  const p = (r.j.productos || [])[0] || r.j.producto || r.j;
  console.log("\n" + "=".repeat(72));
  console.log("  " + s.id + " · " + s.nombre + "  (" + s.palabras_desc + " palabras)");
  console.log("  categorías: " + (s.categorias||[]).map(c=>c.nombre||c).join(", "));
  console.log("\n  -- CORTA --\n" + String(p.descripcion_corta||"(vacía)").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,600));
  console.log("\n  -- LARGA --\n" + String(p.descripcion||"(vacía)").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,900));
}
