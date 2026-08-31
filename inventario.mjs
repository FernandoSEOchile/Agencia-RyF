/**
 * Censo del catálogo, sin traer descripciones.
 *
 * El listado devuelve conteos de palabras en vez del texto, así que se puede
 * recorrer entero por poco: lo caro no es saber qué hay, es generar contenido.
 * Este censo es lo que decide cuántos productos entran de verdad en el lote.
 *
 * Uso:  node inventario.mjs <sitio>
 */
import { writeFileSync } from "node:fs";
import { api, sitio } from "./conexion.mjs";

const todos = [];
let pagina = 1;
let paginas = 1;

process.stdout.write("\n  leyendo");
do {
  const r = await api("GET", "/products?pagina=" + pagina);
  if (!r.ok) {
    console.log("\n  ✕ página " + pagina + ": HTTP " + r.s + " " + (r.j?.code || ""));
    break;
  }
  paginas = r.j.paginas;
  todos.push(...r.j.productos);
  process.stdout.write(".");
  pagina++;
} while (pagina <= paginas);

console.log(" " + todos.length + " productos\n");
writeFileSync("inventario.json", JSON.stringify(todos));

const n = todos.length;
const pct = (x) => (100 * x / n).toFixed(1).padStart(5) + " %";
const cuenta = (f) => todos.filter(f).length;

const bloque = (titulo, filas) => {
  console.log("  " + titulo);
  for (const [etiqueta, x] of filas) {
    console.log("    " + etiqueta.padEnd(34) + String(x).padStart(5) + "   " + pct(x));
  }
  console.log("");
};

bloque("estado", [
  ["publicados", cuenta((p) => p.estado === "publish")],
  ["borradores", cuenta((p) => p.estado === "draft")],
  ["otros", cuenta((p) => !["publish", "draft"].includes(p.estado))],
]);

bloque("descripción larga", [
  ["vacía", cuenta((p) => !p.palabras_desc)],
  ["1 – 40 palabras", cuenta((p) => p.palabras_desc > 0 && p.palabras_desc <= 40)],
  ["41 – 120 palabras", cuenta((p) => p.palabras_desc > 40 && p.palabras_desc <= 120)],
  ["más de 120", cuenta((p) => p.palabras_desc > 120)],
]);

bloque("descripción corta", [
  ["vacía", cuenta((p) => !p.palabras_corta)],
  ["1 – 25 palabras", cuenta((p) => p.palabras_corta > 0 && p.palabras_corta <= 25)],
  ["más de 25", cuenta((p) => p.palabras_corta > 25)],
]);

const seo = (p) => p.seo || {};
bloque("SEO", [
  ["sin meta title", cuenta((p) => !seo(p).title)],
  ["sin meta description", cuenta((p) => !seo(p).description && !seo(p).descripcion)],
]);

bloque("otros", [
  ["sin imagen destacada", cuenta((p) => !p.imagen)],
  ["sin categoría", cuenta((p) => !p.categorias || !p.categorias.length)],
  ["sin SKU", cuenta((p) => !p.sku)],
  ["con marcadores (lorem/placeholder)", cuenta((p) => p.marcadores && p.marcadores.length)],
]);

// Nombres repetidos: productos casi idénticos que conviene tratar en familia
// en vez de uno por uno, que es donde se va el presupuesto.
const porNombre = new Map();
for (const p of todos) {
  const raiz = p.nombre.toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g, "").split(/\s+/).slice(0, 3).join(" ");
  porNombre.set(raiz, (porNombre.get(raiz) || 0) + 1);
}
const familias = [...porNombre.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
console.log("  familias (mismo arranque de nombre)");
console.log("    familias con 2+ productos       " + String(familias.length).padStart(5));
console.log("    productos dentro de familias    " + String(familias.reduce((a, [, c]) => a + c, 0)).padStart(5));
console.log("    mayores: " + familias.slice(0, 6).map(([k, c]) => k + " (" + c + ")").join(", "));
console.log("\n  índice guardado en inventario.json\n");
