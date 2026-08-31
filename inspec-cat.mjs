const u = "https://beepromo.cl/categoria/lapices/bic/";
const h = await (await fetch(u + "?v=" + Math.floor(Math.random()*1e6), { headers: { "User-Agent": "Mozilla/5.0" } })).text();

const st = h.match(/<style id="appseo-cat-seo-css">([\s\S]*?)<\/style>/);
console.log("\n  <style> del plugin: " + (st ? st[1].length + " bytes" : "AUSENTE"));

const i = h.indexOf('class="appseo-cat-seo');
console.log("\n  contenedor padre (200 car. antes):");
console.log("     ..." + h.slice(Math.max(0,i-260), i).replace(/\s+/g," ").slice(-240));

const sec = h.slice(i, i + 20000);
const fin = sec.indexOf("</div>");
console.log("\n  estructura interna:");
for (const m of sec.slice(0,16000).matchAll(/<(h[1-6]|details|summary|p|ul|ol|table|div|strong)\b([^>]*)>/g)) {
  const c=(m[2].match(/class="([^"]*)"/)||[])[1];
  if (/^(h[1-6]|details|summary|table|ul|ol)$/.test(m[1])) console.log("     <"+m[1]+(c?" ."+c:"")+">");
}

console.log("\n  ¿otros CSS tocan .appseo-cat-seo o details?");
const conflictos = [...h.matchAll(/([^{}]{0,90}(?:details|summary)[^{}]{0,60})\{([^}]{0,140})\}/g)]
  .filter(m => !m[1].includes('appseo')).slice(0,6);
conflictos.forEach(m => console.log("     " + m[1].replace(/\s+/g," ").trim().slice(0,80) + "  →  " + m[2].replace(/\s+/g," ").slice(0,80)));
if (!conflictos.length) console.log("     ninguno");
