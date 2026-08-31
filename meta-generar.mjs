/**
 * Genera meta descriptions sin llamar a ningún modelo.
 *
 * Todo sale de datos que ya están en el catálogo: nombre, categoría y tipo. Es
 * determinista, así que dos ejecuciones dan el mismo resultado y se puede
 * revisar antes de escribir nada.
 *
 * El precio queda fuera a propósito: cambia, y un meta description que miente
 * sobre el precio en los resultados de Google es peor que uno genérico.
 *
 * Uso:  node meta-generar.mjs [--todos]
 */
import { readFileSync, writeFileSync } from "node:fs";

const TOPE = 155; // Lo que Google suele mostrar antes de cortar.
const MINIMO = 70;

const inv = JSON.parse(readFileSync("inventario.json", "utf8"));

/* ---------- limpieza del nombre ---------- */

/**
 * Los nombres del catálogo vienen de una importación: mayúsculas irregulares,
 * puntos finales, abreviaturas pegadas. Se normalizan sin inventar nada.
 */
function limpiarNombre(bruto) {
  let n = String(bruto).trim().replace(/\s+/g, " ").replace(/\.+$/, "");

  // «C Bolígrafo» → «con bolígrafo»; «C/Banda» → «con banda».
  n = n.replace(/\bC[\/ ]([A-Za-zÁÉÍÓÚÑáéíóúñ])/g, "con $1");

  // La importación dejó mayúsculas irregulares («Memo Set aurora», «Cuello
  // polo»). Se recapitaliza entero, salvo palabras de enlace y siglas.
  const enlaces = new Set(["de", "del", "la", "las", "el", "los", "y", "con", "en", "para", "a", "por", "sin"]);
  n = n
    .split(" ")
    .map((w, i) => {
      const soloLetras = w.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
      // Siglas y códigos se dejan como están.
      if (soloLetras.length > 1 && soloLetras === soloLetras.toUpperCase() && soloLetras.length <= 3) return w;
      const b = w.toLowerCase();
      if (i > 0 && enlaces.has(b)) return b;
      // Se pone en mayúscula la primera letra, saltando comillas o paréntesis
      // de apertura: «(alfombrilla)» → «(Alfombrilla)».
      return b.replace(/[a-záéíóúñ]/, (c) => c.toUpperCase());
    })
    .join(" ");

  // Unidades pegadas: «356cc» → «356 cc».
  n = n.replace(/(\d)(cc|ml|lt|oz|gr|cm|mm)\b/gi, "$1 $2");

  return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Categoría más informativa: la más específica que no sea un cajón de sastre.
 */
function categoria(p) {
  const cats = (p.categorias || []).map((c) => (typeof c === "string" ? c : c.nombre)).filter(Boolean);
  if (!cats.length) return "";

  const genericas = /^(regalos? corporativos?|regalos?|productos?|destacados?|ofertas?|todos)/i;
  const buenas = cats.filter((c) => !genericas.test(c));
  const elegida = (buenas.length ? buenas : cats).sort((a, b) => a.length - b.length)[0];

  return corregir(elegida).toLowerCase();
}

/**
 * Erratas que trae el catálogo importado. Se corrigen aquí para no publicarlas
 * 2000 veces en Google; conviene arreglarlas también en WooCommerce, porque en
 * la tienda se siguen viendo mal.
 */
const ERRATAS = [
  [/\bRagalos\b/gi, "Regalos"],
  [/\bnotebok\b/gi, "notebook"],
  [/\bpromocional\b/gi, "promocionales"],
  [/\bpad mouse\b/gi, "mouse pad"],
];

function corregir(t) {
  let s = String(t);
  for (const [re, por] of ERRATAS) s = s.replace(re, por);
  return s;
}

/* ---------- plantillas ---------- */

/**
 * Varias formas para que 2000 resultados no parezcan la misma frase repetida.
 * Se elige por el id, así que el resultado es estable entre ejecuciones.
 */
const FORMAS = [
  (n, c) => `${n}. Regalo corporativo personalizable con tu logo, de nuestra línea de ${c}. Cotiza con despacho a todo Chile.`,
  (n, c) => `${n}, personalizable con el logo de tu empresa. Encuéntralo en ${c} y cotiza en línea con despacho a todo Chile.`,
  (n, c) => `Compra ${n} como regalo corporativo. Personalización con tu logo, categoría ${c} y despacho a todo Chile.`,
  (n, c) => `${n} para empresas. Grabado o impresión con tu marca. Parte de nuestra línea de ${c}. Cotiza sin compromiso.`,
  (n, c) => `${n}: regalo publicitario personalizable. Lo encuentras en ${c}, con despacho a todo Chile y atención a empresas.`,
];

const SIN_CATEGORIA = [
  (n) => `${n}. Regalo corporativo personalizable con el logo de tu empresa. Cotiza en línea con despacho a todo Chile.`,
  (n) => `Compra ${n} para empresas. Personalización con tu marca y despacho a todo Chile. Cotiza sin compromiso.`,
];

/**
 * Recorta por el último límite de palabra, nunca a mitad de una.
 */
function recortar(t, tope) {
  if (t.length <= tope) return t;
  const corte = t.slice(0, tope);
  const espacio = corte.lastIndexOf(" ");
  return corte.slice(0, espacio > 40 ? espacio : tope).replace(/[,;:.\s]+$/, "") + ".";
}

function generar(p, desvio = 0) {
  const n = limpiarNombre(p.nombre);
  const c = categoria(p);

  // Si el nombre ya es larguísimo, la plantilla no cabe y se usa una corta.
  const formas = c ? FORMAS : SIN_CATEGORIA;
  const forma = formas[(p.id + desvio) % formas.length];

  let t = c ? forma(n, c) : forma(n);

  if (t.length > TOPE) {
    // Se prueban las demás por si alguna cabe entera antes de recortar.
    const cabe = formas.map((f) => (c ? f(n, c) : f(n))).find((x) => x.length <= TOPE);
    t = cabe || recortar(t, TOPE);
  }

  return t;
}

/* ---------- ejecución ---------- */

const objetivo = inv.filter(
  (p) => p.estado === "publish" && !(p.seo || {}).metadesc
);

// Dos productos con el mismo nombre y categoría producirían el mismo texto.
// Google no penaliza por ello, pero es señal de plantilla y se evita barato.
const usados = new Set();
const salida = objetivo.map((p) => {
  let t = generar(p);
  if (usados.has(t)) {
    const alt = generar(p, 1) ;
    if (!usados.has(alt)) t = alt;
  }
  usados.add(t);
  return { id: p.id, nombre: p.nombre, metadesc: t };
});

/* ---------- control de calidad ---------- */

const largos = salida.map((x) => x.metadesc.length);
const cortos = salida.filter((x) => x.metadesc.length < MINIMO);
const pasados = salida.filter((x) => x.metadesc.length > TOPE);

const vistos = new Map();
for (const x of salida) vistos.set(x.metadesc, (vistos.get(x.metadesc) || 0) + 1);
const duplicados = [...vistos.values()].filter((v) => v > 1).reduce((a, b) => a + b, 0);

console.log("\n  productos publicados sin metadesc : " + objetivo.length);
console.log("  generados                          : " + salida.length);
console.log("  longitud  mín/med/máx              : " +
  Math.min(...largos) + " / " + Math.round(largos.reduce((a, b) => a + b, 0) / largos.length) + " / " + Math.max(...largos));
console.log("  por debajo de " + MINIMO + " caracteres        : " + cortos.length);
console.log("  por encima de " + TOPE + " caracteres       : " + pasados.length);
console.log("  textos duplicados exactos          : " + duplicados);

if (pasados.length) console.log("\n  ⚠ hay metas que superan el tope, revisa recortar()");

console.log("\n  -- muestra --");
const paso = Math.floor(salida.length / 12) || 1;
for (let i = 0; i < salida.length && i < paso * 12; i += paso) {
  const x = salida[i];
  console.log("\n  " + x.id + " · " + x.nombre);
  console.log("    [" + String(x.metadesc.length).padStart(3) + "] " + x.metadesc);
}

writeFileSync("meta-propuesto.json", JSON.stringify(salida, null, 1));
console.log("\n  " + salida.length + " metas en meta-propuesto.json (no se ha escrito nada en el sitio)\n");
