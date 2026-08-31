import { readFileSync } from "node:fs";
const props = [...JSON.parse(readFileSync("cat-desc-1.json","utf8")), ...JSON.parse(readFileSync("cat-desc-2.json","utf8"))];
const urls = [...new Set(props.flatMap(c => [...c.seo.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1])))];
console.log("\n  destinos distintos: " + urls.length + "\n");
let mal = 0;
for (const u of urls) {
  let estado = "?", destino = "";
  try {
    const r = await fetch(u, { redirect: "manual", headers: {"User-Agent":"Mozilla/5.0"} });
    estado = r.status;
    if (estado >= 300 && estado < 400) destino = " → " + (r.headers.get("location")||"").replace("https://beepromo.cl","");
  } catch (e) { estado = "ERR"; destino = " " + (e.cause?.message || e.message); }
  const ok = estado === 200;
  if (!ok) { mal++; console.log("  ✕ " + String(estado).padEnd(4) + u.replace("https://beepromo.cl","") + destino); }
}
console.log("\n  destinos que no devuelven 200: " + mal + " de " + urls.length);
