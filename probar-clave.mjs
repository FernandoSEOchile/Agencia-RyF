/**
 * Comprueba que la clave funciona y cuánto cuesta una llamada mínima.
 *
 * Uso:  node probar-clave.mjs
 */
import { clave } from "./clave.mjs";

const r = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": clave,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 32,
    messages: [{ role: "user", content: "Responde solo: ok" }],
  }),
});

const j = await r.json();

if (!r.ok) {
  console.log("\n  ✕ HTTP " + r.s + " " + (j.error?.type || ""));
  console.log("    " + (j.error?.message || JSON.stringify(j).slice(0, 200)));
  if (j.error?.type === "authentication_error") console.log("\n    La clave no es válida. Crea otra en console.anthropic.com.");
  if (/credit|balance/i.test(j.error?.message || "")) console.log("\n    Falta saldo: Billing → Add credit.");
  process.exit(1);
}

console.log("\n  ✓ la clave funciona");
console.log("    respuesta : " + j.content.map((c) => c.text).join("").trim());
console.log("    tokens    : " + j.usage.input_tokens + " entrada · " + j.usage.output_tokens + " salida");
console.log("    coste     : " + ((j.usage.input_tokens * 1 + j.usage.output_tokens * 5) / 1e6).toFixed(6) + " USD");
console.log("");
