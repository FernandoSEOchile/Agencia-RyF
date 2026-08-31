import { readFileSync } from "node:fs";
import { api } from "./conexion.mjs";
const props = JSON.parse(readFileSync(process.argv[3], "utf8"));
const reg = JSON.parse(readFileSync("registro-cat-beepromo.cl.json", "utf8"));
let ok=0, mal=0;
for (const c of props) {
  const url = reg[c.id]?.url;
  if (!url) { console.log("  ? " + c.id + " sin url"); continue; }
  const h = await (await fetch(url + "?v=" + Math.floor(Math.random()*1e6), {headers:{"User-Agent":"Mozilla/5.0"}})).text();
  const m = h.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,"");
  const primerH2 = (c.seo.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)||[])[1].replace(/<[^>]+>/g,"");
  const hay = m.includes(primerH2);
  const bloque = /appseo-cat-seo/.test(m);
  const veces = (m.match(/appseo-cat-seo/g)||[]).length;
  const bien = hay && bloque && veces === 1;
  bien ? ok++ : mal++;
  console.log((bien?"  ✓ ":"  ✕ ") + String(c.id).padEnd(5) + " texto=" + (hay?"sí":"NO") +
    " bloque=" + (bloque?"sí":"NO") + " veces=" + veces + "  " + c.nombre.slice(0,34));
}
console.log("\n  correctas " + ok + " / " + props.length + (mal?"  ·  con problemas "+mal:""));
