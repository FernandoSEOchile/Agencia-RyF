import { test } from "node:test";
import assert from "node:assert/strict";
import { leerSerp, esDelCliente, limpiarUrl } from "./serp.ts";
import { nombreUbicacion, paisPorIso } from "./ubicaciones.ts";

/**
 * Pruebas de qué cuenta como «aparecer» en Google.
 *
 * Los resultados son de ejemplo, con la forma que devuelve DataForSEO. Cada
 * caso es uno de los que hacían que el panel dijera «fuera» cuando Search
 * Console decía otra cosa.
 */

const org = (dominio: string, ruta = "/") => ({ type: "organic", domain: dominio, url: `https://${dominio}${ruta}` });

test("resultado orgánico normal: puesto y bloques por encima", () => {
  const r = leerSerp(
    [{ type: "paid", domain: "anuncio.cl" }, org("otro.cl"), org("www.cliente.cl", "/flores/"), org("tercero.cl")],
    "cliente.cl"
  );
  assert.equal(r.puesto, 2);
  assert.equal(r.tipo, "organico");
  assert.equal(r.url, "https://www.cliente.cl/flores/");
  assert.equal(r.bloquesArriba, 1);
  assert.equal(r.revisados, 3);
});

test("el fragmento destacado cuenta como puesto 1", () => {
  const r = leerSerp(
    [{ type: "featured_snippet", domain: "cliente.cl", url: "https://cliente.cl/guia/" }, org("otro.cl")],
    "cliente.cl"
  );
  assert.equal(r.puesto, 1);
  assert.equal(r.tipo, "destacado");
});

test("el mapa se guarda aparte y no cambia el puesto orgánico", () => {
  const r = leerSerp(
    [
      { type: "local_pack", domain: "rival.cl", url: "https://rival.cl/" },
      { type: "local_pack", domain: "magnoliacasadeflores.cl", url: "https://magnoliacasadeflores.cl/?srsltid=abc" },
      { type: "local_pack", domain: null, url: null },
      org("laflorera.cl"),
      org("instagram.com"),
    ],
    "magnoliacasadeflores.cl"
  );
  assert.equal(r.puestoMapa, 2);
  assert.equal(r.urlMapa, "https://magnoliacasadeflores.cl/");
  assert.equal(r.puesto, null);
  assert.equal(r.revisados, 2);
});

test("el mapa entero cuenta como un solo bloque por encima", () => {
  const r = leerSerp(
    [
      { type: "local_pack", domain: "a.cl" },
      { type: "local_pack", domain: "b.cl" },
      { type: "local_pack", domain: "c.cl" },
      org("cliente.cl"),
    ],
    "cliente.cl"
  );
  assert.equal(r.puesto, 1);
  assert.equal(r.bloquesArriba, 1);
});

test("búsqueda que viene corta: no aparece, pero dice cuántos se revisaron", () => {
  const items = Array.from({ length: 12 }, (_, i) => org(`sitio${i}.cl`));
  const r = leerSerp(items, "fontus.cl");
  assert.equal(r.puesto, null);
  assert.equal(r.revisados, 12);
  assert.equal(r.serp.length, 12);
});

test("resultados como enlaces de Google: la medición se rechaza, no se guarda «no está»", () => {
  const items = Array.from({ length: 10 }, () => ({
    type: "organic",
    domain: "google.cl",
    url: "https://google.cl/goto?url=CAESygEBxCJF18A3&gsessionid=x",
  }));
  assert.throws(() => leerSerp(items, "fontus.cl"), /enlaces de Google/);
});

test("un resultado de Google entre sitios normales no rechaza la medición", () => {
  const r = leerSerp([org("google.cl"), org("easy.cl"), org("fontus.cl")], "fontus.cl");
  assert.equal(r.puesto, 3);
});

test("subdominios del cliente cuentan; el dominio padre no", () => {
  assert.equal(esDelCliente("tienda.cliente.cl", "cliente.cl"), true);
  assert.equal(esDelCliente("www.cliente.cl", "https://cliente.cl/"), true);
  assert.equal(esDelCliente("otrocliente.cl", "cliente.cl"), false);
  assert.equal(esDelCliente("cliente.cl", "tienda.cliente.cl"), false);
});

test("la URL sale sin el srsltid de Google y conserva lo demás", () => {
  assert.equal(limpiarUrl("https://fontus.cl/filtros/?srsltid=AU7gw4"), "https://fontus.cl/filtros/");
  assert.equal(limpiarUrl("https://fontus.cl/p?color=azul&srsltid=x"), "https://fontus.cl/p?color=azul");
});

test("la IA cita al cliente aunque sea con un subdominio", () => {
  const r = leerSerp(
    [{ type: "ai_overview", references: [{ domain: "blog.cliente.cl", url: "https://blog.cliente.cl/x" }] }, org("otro.cl")],
    "cliente.cl"
  );
  assert.equal(r.iaOverview, true);
  assert.equal(r.iaCitado, true);
  assert.equal(r.iaUrl, "https://blog.cliente.cl/x");
});

test("ubicaciones: Chile por defecto y nombre de ciudad", () => {
  assert.equal(paisPorIso(undefined).google, "google.cl");
  assert.equal(paisPorIso("us").idioma, "en");
  assert.equal(nombreUbicacion({ pais: "cl", ubicacion: 2152 }), "Chile");
  assert.equal(
    nombreUbicacion({ pais: "cl", ubicacion: 1, ubicacionNombre: "Santiago,Santiago Metropolitan Region,Chile" }),
    "Santiago, Chile"
  );
});
