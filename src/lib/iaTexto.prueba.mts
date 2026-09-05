import { test } from "node:test";
import assert from "node:assert/strict";
import { detectar, dominiosCitados, nombraMarca, raizDominio } from "./iaTexto.ts";

/**
 * Cómo se decide si la IA «menciona» a un cliente. Son las reglas que
 * convierten una respuesta de texto en un ✓ o un ✗, así que conviene que no
 * cambien sin que alguien se entere.
 */

test("raizDominio: quita protocolo, www, ruta y parámetros", () => {
  assert.equal(raizDominio("https://www.fontus.cl/?utm_source=openai"), "fontus.cl");
  assert.equal(raizDominio("http://Tienda.Ejemplo.CL/a/b?c=1#d"), "tienda.ejemplo.cl");
});

test("dominiosCitados: ChatGPT con utm y Gemini con redireccionador", () => {
  const anotaciones = [
    { title: "Fontus", url: "https://fontus.cl/?utm_source=openai" },
    { title: "mercadolibre.cl", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ..." },
    { title: "Fontus otra vez", url: "https://www.fontus.cl/producto/x" },
    { title: "Sin dominio en el título", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB" },
  ];
  assert.deepEqual(dominiosCitados(anotaciones), ["fontus.cl", "mercadolibre.cl"]);
});

test("nombraMarca: palabra entera, sin acentos ni mayúsculas", () => {
  assert.equal(nombraMarca("Te recomiendo Fontus por su servicio.", "fontus"), true);
  assert.equal(nombraMarca("La empresa Aguasfontus S.A.", "Fontus"), false);
  assert.equal(nombraMarca("Compra en Ósmosis Chile.", "Osmosis Chile"), true);
  assert.equal(nombraMarca("nada que ver", "ab"), false);
});

test("detectar: citado manda sobre nombrado, y da el puesto entre los citados", () => {
  const r = detectar(
    "Opciones: Voda, Aqualitat y Fontus.",
    [
      { title: "Voda", url: "https://www.vodachile.cl/" },
      { title: "Fontus", url: "https://fontus.cl/?utm_source=openai" },
    ],
    { dominio: "fontus.cl", marca: "Fontus" }
  );
  assert.equal(r.aparece, true);
  assert.equal(r.citado, true);
  assert.equal(r.posicion, 2);
  assert.equal(r.url, "https://fontus.cl/?utm_source=openai");

  const solo = detectar("Puedes mirar Fontus.", [{ title: "Voda", url: "https://vodachile.cl" }], { dominio: "fontus.cl", marca: "Fontus" });
  assert.equal(solo.aparece, true);
  assert.equal(solo.citado, false);
  assert.equal(solo.posicion, null);

  const nada = detectar("Compra en cualquier ferretería.", [], { dominio: "fontus.cl", marca: "Fontus" });
  assert.equal(nada.aparece, false);
});
