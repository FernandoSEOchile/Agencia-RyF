const url = process.argv[2];
const h = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
console.log("bytes " + h.length);

const cont = (re, n) => [...new Set([...h.matchAll(re)].map(m => m[1]))].slice(0, n);

console.log("\n-- variables CSS de Astra:");
cont(/(--ast-global-color-\d+)\s*:\s*([^;}]+)/g, 0);
const vars = [...h.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g)];
const uniq = new Map();
for (const m of vars) if (!uniq.has(m[1])) uniq.set(m[1], m[2]);
[...uniq].slice(0, 24).forEach(([k, v]) => console.log("   " + k.padEnd(30) + v));

console.log("\n-- familias tipográficas declaradas:");
cont(/font-family\s*:\s*([^;}"]{3,70})/g, 10).forEach(f => console.log("   " + f.trim()));

console.log("\n-- Google Fonts:");
cont(/fonts\.googleapis\.com\/css2?\?([^"']+)/g, 4).forEach(f => console.log("   " + decodeURIComponent(f).slice(0, 160)));

console.log("\n-- colores más repetidos en el CSS en línea:");
const cols = {};
for (const m of h.matchAll(/#([0-9a-fA-F]{6})\b/g)) cols["#" + m[1].toLowerCase()] = (cols["#" + m[1].toLowerCase()] || 0) + 1;
Object.entries(cols).sort((a,b)=>b[1]-a[1]).slice(0,14).forEach(([c,n]) => console.log("   " + c + "  ×" + n));

console.log("\n-- clases del contenedor de contenido:");
["ast-container","site-content","content-area","products","site-main"].forEach(c =>
  console.log("   ." + c.padEnd(16) + (new RegExp('class="[^"]*\b'+c+'\b').test(h) ? "presente" : "no")));
