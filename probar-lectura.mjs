import { api } from "./conexion.mjs";
const r = await api("GET", "/products/50842");
console.log("\n  HTTP " + r.s);
if (r.ok) {
  const p = r.j;
  console.log("  " + p.nombre);
  console.log("  descripcion      : " + String(p.descripcion || "").length + " bytes");
  console.log("  descripcion_corta: " + String(p.descripcion_corta || "").length + " bytes");
  console.log("  campos: " + Object.keys(p).join(", "));
} else {
  console.log("  " + (r.j?.code || r.t.slice(0, 120)));
}
