/**
 * Escribe descripciones SEO de categoría, con respaldo y libro de registro.
 *
 * El estado anterior se guarda antes de enviar cada cambio, y el libro se
 * escribe también antes: si el proceso muere a mitad, ese término queda como
 * «en vuelo» y se revisa a mano, en vez de reescribirse dos veces.
 *
 * Uso:  node cat-escribir.mjs <sitio> <archivo.json> [--limite N]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { api, sitio } from "./conexion.mjs";

const archivo = process.argv[3];
if (!archivo || !archivo.endsWith(".json")) {
  console.error("\n  Uso: node cat-escribir.mjs <sitio> <archivo.json> [--limite N]\n");
  process.exit(1);
}

const i = process.argv.indexOf("--limite");
const limite = i > 0 ? parseInt(process.argv[i + 1], 10) : Infinity;

const LIBRO = "registro-cat-" + sitio + ".json";
const RESPALDO = "respaldo-cat-" + sitio + ".json";

const propuestas = JSON.parse(readFileSync(archivo, "utf8"));
const libro = existsSync(LIBRO) ? JSON.parse(readFileSync(LIBRO, "utf8")) : {};
const respaldo = existsSync(RESPALDO) ? JSON.parse(readFileSync(RESPALDO, "utf8")) : {};

const guardar = () => {
  writeFileSync(LIBRO, JSON.stringify(libro, null, 1));
  writeFileSync(RESPALDO, JSON.stringify(respaldo, null, 1));
};

let hechos = 0, saltados = 0, fallos = 0;

console.log("\n  sitio: " + sitio + "  ·  " + propuestas.length + " categorías en " + archivo + "\n");

for (const c of propuestas) {
  if (hechos >= limite) break;

  if (libro[c.id] && libro[c.id].estado === "escrito") {
    saltados++;
    continue;
  }

  libro[c.id] = { estado: "en_vuelo", nombre: c.nombre, intento: new Date().toISOString() };
  guardar();

  const r = await api("POST", "/terms", { id: c.id, taxonomia: "product_cat", seo: c.seo });

  if (!r.ok) {
    libro[c.id] = {
      estado: "fallido",
      nombre: c.nombre,
      http: r.s,
      code: r.j?.code || "",
      mensaje: (r.j?.message || r.t || "").slice(0, 160),
    };
    guardar();
    fallos++;
    console.log("  ✕ " + String(c.id).padEnd(5) + " HTTP " + r.s + " " + (r.j?.code || "") + "  " + c.nombre);
    continue;
  }

  if (r.j.anterior !== undefined) respaldo[c.id] = r.j.anterior;

  libro[c.id] = {
    estado: "escrito",
    nombre: c.nombre,
    url: r.j.url,
    bytes: r.j.bytes,
    escrito_en: new Date().toISOString(),
  };
  guardar();

  hechos++;
  console.log("  ✓ " + String(c.id).padEnd(5) + String(r.j.bytes).padStart(5) + " bytes  " + c.nombre);
}

console.log("\n  escritas " + hechos + "  ·  ya estaban " + saltados + "  ·  fallidas " + fallos);
console.log("  registro : " + LIBRO + "\n");
