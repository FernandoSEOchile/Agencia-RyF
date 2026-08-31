import { readFileSync } from "node:fs";
const inv = JSON.parse(readFileSync("inventario.json","utf8")).reduce((a,p)=>(a[p.id]=p,a),{});
const props = JSON.parse(readFileSync("desc-propuesto.json","utf8"));
let ok=0, mal=0;
for (const p of props) {
  const url = inv[p.id].url;
  const h = await (await fetch(url + "?v=" + Math.floor(Math.random()*1e6), {headers:{"User-Agent":"Mozilla/5.0"}})).text();
  const m = h.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,"");
  const primerH2 = (p.descripcion.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)||[])[1].replace(/<[^>]+>/g,"");
  const hayH2 = m.includes(primerH2);
  const hayTabla = /<table/i.test(m);
  const filas = (m.match(/<tr[ >]/gi)||[]).length;
  const faq = (m.match(/<h4[^>]*>\s*¿/g)||[]).length;
  const h1 = (m.match(/<h1[^>]*>/g)||[]).length;
  const bien = hayH2 && hayTabla && h1===1 && faq>=3;
  bien ? ok++ : mal++;
  console.log((bien?"  ✓ ":"  ✕ ") + String(p.id).padEnd(7) +
    " h1=" + h1 + " tabla=" + (hayTabla?"sí":"NO") + " filas=" + String(filas).padEnd(2) +
    " faq=" + faq + "  " + p.nombre.slice(0,34));
}
console.log("\n  correctos " + ok + " / " + props.length + (mal?"  ·  con problemas "+mal:""));
