const urls = [
  "https://beepromo.cl/categoria-producto/bananos-bolsos-y-mochilas-corporativas/",
  "https://beepromo.cl/categoria-producto/tazas-vasos-y-mug-corporativos/",
  "https://beepromo.cl/categoria-producto/llaveros-corporativos/",
];
for (const u of urls) {
  const h = await (await fetch(u + "?v=" + Math.floor(Math.random()*1e6), { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  const m = h.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  console.log("\n  " + u.split("/").filter(Boolean).pop());
  console.log("    plantilla Elementor archive : " + (/elementor-location-archive/.test(m) ? "SÍ" : "no"));
  console.log("    plantilla Elementor single  : " + (/elementor-location-single/.test(m) ? "sí" : "no"));
  console.log("    .appseo-cat-seo             : " + (/appseo-cat-seo/.test(m) ? "sí" : "NO"));
  console.log("    .term-description           : " + (/term-description/.test(m) ? "sí" : "no"));
  console.log("    widget archive-products     : " + (/elementor-widget-archive-products|elementor-widget-wc-archive-products/.test(m) ? "sí" : "no"));
  console.log("    widget woocommerce-products : " + (/elementor-widget-woocommerce-products/.test(m) ? "sí" : "no"));
  const wid = [...new Set([...m.matchAll(/elementor-widget-([a-z0-9-]+)/g)].map(x=>x[1]))];
  console.log("    widgets: " + wid.slice(0,14).join(", "));
}
