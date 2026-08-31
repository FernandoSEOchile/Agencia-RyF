import { readFileSync } from "node:fs";
const reg = JSON.parse(readFileSync("registro-cat-beepromo.cl.json","utf8"));
const props = [...JSON.parse(readFileSync("cat-desc-1.json","utf8")), ...JSON.parse(readFileSync("cat-desc-2.json","utf8"))];
let ok=0, mal=0, rotos=0;
const vistos = new Map();
for (const c of props) {
  const url = reg[c.id]?.url;
  const h = await (await fetch(url + "?v=" + Math.floor(Math.random()*1e6), {headers:{"User-Agent":"Mozilla/5.0"}})).text();
  const i = h.indexOf('class="appseo-cat-seo');
  const sec = i < 0 ? "" : h.slice(i, i + 12000);
  const enlaces = [...sec.matchAll(/<a href="(https:\/\/beepromo\.cl\/[^"]+)"/g)].map(m=>m[1]);
  const esperados = (c.seo.match(/<a href=/g)||[]).length;
  const bien = enlaces.length === esperados;
  bien ? ok++ : mal++;
  enlaces.forEach(u => vistos.set(u, (vistos.get(u)||0)+1));
  if (!bien) console.log("  ✕ " + c.id + " esperados " + esperados + " encontrados " + enlaces.length + "  " + c.nombre);
}
console.log("\n  categorías con los enlaces correctos: " + ok + " / " + props.length);
// comprobar que los destinos responden
console.log("  comprobando " + vistos.size + " destinos distintos...");
for (const u of vistos.keys()) {
  const r = await fetch(u, { method: "HEAD", headers: {"User-Agent":"Mozilla/5.0"} });
  if (r.status >= 400) { console.log("    ✕ " + r.status + "  " + u.replace("https://beepromo.cl","")); rotos++; }
}
console.log("  destinos rotos: " + rotos);
