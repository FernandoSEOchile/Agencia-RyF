/**
 * Censo de categorías: cuáles tienen descripción SEO y cuáles no.
 *
 * No trae el texto, solo su tamaño. Saber qué falta debe ser barato; lo caro
 * es escribirlo.
 *
 * Uso:  node cat-censo.mjs <sitio>
 */
import { writeFileSync } from "node:fs";
import { api, sitio } from "./conexion.mjs";

const r = await api("GET", "/terms?taxonomia=product_cat");

if (!r.ok) {
  console.log("\n  ✕ " + r.s + " " + (r.j?.code || "") +
    (r.j?.code === "rest_no_route" ? "  → hace falta la v1.13.0" : ""));
  process.exit(1);
}

const t = r.j.terminos;
writeFileSync("categorias-" + sitio + ".json", JSON.stringify(t, null, 1));

const sin = t.filter((c) => !c.seo_bytes);
const con = t.filter((c) => c.seo_bytes);
const vacias = t.filter((c) => !c.productos);

console.log("\n  categorías          : " + t.length);
console.log("  con descripción SEO : " + con.length);
console.log("  SIN descripción     : " + sin.length);
console.log("  sin ningún producto : " + vacias.length + "  (no vale la pena escribirlas)");
console.log("  con FAQ del snippet : " + t.filter((c) => c.faq_bytes).length);

const objetivo = sin.filter((c) => c.productos > 0).sort((a, b) => b.productos - a.productos);

console.log("\n  a escribir: " + objetivo.length + " categorías con productos\n");
console.log("  PRODUCTOS  CATEGORÍA");
objetivo.slice(0, 40).forEach((c) =>
  console.log("  " + String(c.productos).padStart(8) + "   " + c.nombre)
);
if (objetivo.length > 40) console.log("  ... y " + (objetivo.length - 40) + " más");

const tramos = { "100+": 0, "50-99": 0, "20-49": 0, "5-19": 0, "1-4": 0 };
for (const c of objetivo) {
  const n = c.productos;
  tramos[n >= 100 ? "100+" : n >= 50 ? "50-99" : n >= 20 ? "20-49" : n >= 5 ? "5-19" : "1-4"]++;
}
console.log("\n  por tamaño:");
for (const [k, v] of Object.entries(tramos)) if (v) console.log("    " + k.padEnd(8) + v + " categorías");

console.log("\n  guardado en categorias-" + sitio + ".json\n");
