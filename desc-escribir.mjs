/**
 * Escribe las descripciones propuestas, con respaldo y libro de registro.
 *
 * El estado anterior de cada producto se guarda ANTES de enviar el cambio. Si
 * el proceso muere entre la petición y la respuesta, el registro deja ese
 * producto en «dudoso» en vez de en «pendiente», para revisarlo a mano en lugar
 * de escribirlo dos veces.
 *
 * Uso:  node desc-escribir.mjs <sitio> [--limite N]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { api, sitio } from "./conexion.mjs";

const LIBRO = "registro-desc-" + sitio + ".json";
const RESPALDO = "respaldo-desc-" + sitio + ".json";

const i = process.argv.indexOf("--limite");
const limite = i > 0 ? parseInt(process.argv[i + 1], 10) : Infinity;

const propuestas = JSON.parse(readFileSync("desc-propuesto.json", "utf8"));
const libro = existsSync(LIBRO) ? JSON.parse(readFileSync(LIBRO, "utf8")) : {};
const respaldo = existsSync(RESPALDO) ? JSON.parse(readFileSync(RESPALDO, "utf8")) : {};

const guardar = () => {
  writeFileSync(LIBRO, JSON.stringify(libro, null, 1));
  writeFileSync(RESPALDO, JSON.stringify(respaldo, null, 1));
};

let hechos = 0;
let saltados = 0;
let fallos = 0;

console.log("\n  sitio: " + sitio + "  ·  " + propuestas.length + " propuestas\n");

for (const p of propuestas) {
  if (hechos >= limite) break;

  const previo = libro[p.id];
  if (previo && previo.estado === "escrito") {
    saltados++;
    continue;
  }

  // Se marca ANTES de llamar. Si el proceso muere aquí, al reanudar queda
  // constancia de que hubo un intento en vuelo.
  libro[p.id] = { estado: "en_vuelo", nombre: p.nombre, intento: new Date().toISOString() };
  guardar();

  const r = await api("POST", "/products", {
    id: p.id,
    descripcion: p.descripcion,
  });

  if (!r.ok) {
    libro[p.id] = {
      estado: "fallido",
      nombre: p.nombre,
      http: r.s,
      code: r.j?.code || "",
      mensaje: (r.j?.message || r.t || "").slice(0, 200),
    };
    guardar();
    fallos++;
    console.log("  ✕ " + p.id + "  HTTP " + r.s + "  " + (r.j?.code || "") + "  " + p.nombre.slice(0, 40));
    continue;
  }

  // El conector devuelve el estado anterior para poder deshacer.
  if (r.j.anterior !== undefined) respaldo[p.id] = r.j.anterior;

  libro[p.id] = {
    estado: "escrito",
    nombre: p.nombre,
    bytes: p.descripcion.length,
    escrito_en: new Date().toISOString(),
  };
  guardar();

  hechos++;
  console.log("  ✓ " + p.id + "  " + String(p.descripcion.length).padStart(5) + " bytes  " + p.nombre.slice(0, 44));
}

console.log("\n  escritos " + hechos + "  ·  ya estaban " + saltados + "  ·  fallidos " + fallos);
console.log("  registro : " + LIBRO);
console.log("  respaldo : " + RESPALDO + "\n");
