import { api } from "./conexion.mjs";
const a = await api("GET", "/audit?por_pagina=1");
const p = a.j.site.plugins.filter(x => /seo|yoast|rank|aioseo|squirrly/i.test(x.nombre));
console.log("\n  plugins de SEO instalados:");
p.forEach(x => console.log("    " + (x.activo ? "activo  " : "inactivo") + "  " + x.nombre + " " + x.version));
if (!p.length) console.log("    NINGUNO");

const r = await api("GET", "/products?pagina=1");
const uno = r.j.productos[0];
console.log("\n  campo seo tal cual lo devuelve el conector:");
console.log("    " + JSON.stringify(uno.seo));
console.log("    producto: " + uno.id + " · " + uno.nombre);
console.log("    url: " + uno.url);
