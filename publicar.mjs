import { api } from "./conexion.mjs";
const id = Number(process.argv[3]);
const r = await api("POST", "/content", { id, estado: "publish" });
console.log("\n  HTTP " + r.s);
if (!r.ok) { console.log("  " + (r.j?.code||"") + " — " + (r.j?.message||"").slice(0,200)); process.exit(1); }
console.log("  ✓ " + r.j.estado + "  " + (r.j.url||""));
