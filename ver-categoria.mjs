const url = process.argv[2];
const h = await (await fetch(url + "?v=" + Math.floor(Math.random()*1e6), { headers: { "User-Agent": "Mozilla/5.0" } })).text();
console.log("\n  " + url);
console.log("  bytes: " + h.length);
const bloque = h.includes('appseo-cat-seo');
const css = h.includes('id="appseo-cat-seo-css"');
console.log("  bloque .appseo-cat-seo : " + (bloque ? "presente" : "NO"));
console.log("  <style> del plugin     : " + (css ? "presente" : "NO"));
const veces = (h.match(/appseo-cat-seo term-description/g) || []).length;
console.log("  veces que se pinta     : " + veces);
if (bloque) {
  const i = h.indexOf('class="appseo-cat-seo');
  const trozo = h.slice(i, i + 1400).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log("\n  texto del bloque (inicio):\n     " + trozo.slice(0, 350));
  const sec = h.slice(i, i + 12000);
  console.log("\n  etiquetas dentro: h2=" + (sec.match(/<h2/g)||[]).length +
    " h3=" + (sec.match(/<h3/g)||[]).length +
    " table=" + (sec.match(/<table/g)||[]).length +
    " details=" + (sec.match(/<details/g)||[]).length +
    " ul=" + (sec.match(/<ul/g)||[]).length);
}
