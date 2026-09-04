import { test } from "node:test";
import assert from "node:assert/strict";
import { dinero, fecha, miles } from "./formato.ts";

/**
 * Pruebas de lo que se ve en cada pantalla.
 *
 * Son pocas y baratas a propósito: se corren con `npm run probar`, sin
 * instalar nada, y en cada push desde GitHub. Lo que protegen es lo que
 * costó unificar: que una fecha o un importe no vuelvan a salir distintos
 * de una pestaña a otra.
 */

test("dinero: dos decimales de un dólar para arriba", () => {
  assert.equal(dinero(14.006), "US$14.01");
  assert.equal(dinero(1), "US$1.00");
});

test("dinero: tres cifras significativas por debajo", () => {
  assert.equal(dinero(0.7092), "US$0.709");
  assert.equal(dinero(0.034), "US$0.034");
  assert.equal(dinero(0.0054), "US$0.0054");
});

test("dinero: el cero no es una cifra", () => {
  assert.equal(dinero(0), "sin coste");
  assert.equal(dinero(null), "sin coste");
  assert.equal(dinero(0, "—"), "—");
});

test("fecha: hoy y ayer se dicen con palabras", () => {
  const ahora = new Date();
  assert.equal(fecha(ahora), "hoy");
  assert.equal(fecha(new Date(ahora.getTime() - 86_400_000)), "ayer");
  assert.match(fecha(ahora, { hora: true }), /^hoy \d{2}:\d{2}$/);
});

test("fecha: sin año dentro del año, con año fuera", () => {
  const hace3anios = new Date();
  hace3anios.setFullYear(hace3anios.getFullYear() - 3);
  assert.match(fecha(hace3anios), /^\d{1,2} [a-z]{3} \d{4}$/);
  assert.equal(fecha(null), "—");
  assert.equal(fecha("no es una fecha"), "—");
});

test("miles: con punto, como en Chile", () => {
  assert.equal(miles(34355), "34.355");
  assert.equal(miles(null), "0");
});
