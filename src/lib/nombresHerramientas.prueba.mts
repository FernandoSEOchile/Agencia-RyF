import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOMBRES_HERRAMIENTAS, ESCRIBEN, nombreHerramienta } from "./nombresHerramientas.ts";

/**
 * Cada herramienta del asistente tiene que tener nombre legible.
 *
 * Diecisiete de veintinueve salían con su identificador en el chat porque la
 * lista vivía aparte y nadie se acordaba de tocarla. Esta prueba lee los
 * archivos de las herramientas como texto —son `server-only` y no se pueden
 * importar aquí— y falla si aparece una sin nombre.
 */

function nombresEn(archivo: string): string[] {
  const fuente = readFileSync(new URL(archivo, import.meta.url), "utf8");
  return [...fuente.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

test("todas las herramientas tienen nombre legible", () => {
  const todas = new Set([...nombresEn("./herramientas.ts"), ...nombresEn("./herramientasShopify.ts")]);
  const sinNombre = [...todas].filter((t) => !(t in NOMBRES_HERRAMIENTAS));
  assert.deepEqual(sinNombre, [], `Sin nombre legible: ${sinNombre.join(", ")}`);
});

test("las que escriben existen de verdad", () => {
  const todas = new Set([...nombresEn("./herramientas.ts"), ...nombresEn("./herramientasShopify.ts")]);
  for (const t of ESCRIBEN) assert.ok(todas.has(t), `${t} está en ESCRIBEN pero no es una herramienta`);
});

test("un id desconocido no sale con guiones bajos", () => {
  assert.equal(nombreHerramienta("hacer_algo_raro"), "hacer algo raro");
});
