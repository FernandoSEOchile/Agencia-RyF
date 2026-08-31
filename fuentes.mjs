const u = "https://beepromo.cl/categoria-producto/bananos-bolsos-y-mochilas-corporativas/";
const h = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
const reglas = [...h.matchAll(/([^{}]{1,160})\{([^{}]{1,300})\}/g)];
const busca = (test) => reglas.filter(r => test.test(r[1]) && /font-family/.test(r[2])).slice(0, 4);
for (const [etiq, re] of [["h1–h6", /h[1-6]/], ["body", /\bbody\b/], ["entry-title", /entry-title/]]) {
  console.log("\n== " + etiq);
  for (const r of busca(re)) {
    console.log("  " + r[1].replace(/\s+/g, " ").trim().slice(0, 100));
    console.log("     " + (r[2].match(/font-family[^;]*/) || [""])[0].slice(0, 110));
  }
}
