/**
 * Segunda pasada de enlazado: los casos que no encajaron en la primera,
 * con la frase corregida contra el texto real.
 */
import { readFileSync, writeFileSync } from "node:fs";
const B = "https://beepromo.cl/categoria/";
const EXTRA = {
  185: [["portarretratos", B + "escritorio-y-oficina/lanyard-y-credenciales/"], ["organizadores", B + "escritorio-y-oficina/cuadernos-libretas-memo-set/"]],
  174: [["cargadores", B + "audio-y-tecnologia/tecnologia/"]],
  178: [["en el supermercado", B + "regalos-corporativos/"]],
  200: [["sets de vino, copas, decantadores", B + "asados-cocina-gourmet/cocina-gourmet/"], ["Reconocimientos", B + "escritorio-y-oficina/trofeos-y-galvanos/"], ["Celebraciones internas", B + "regalos-corporativos-de-navidad/"]],
  206: [["bolígrafos en bambú, madera", B + "lapices/"], ["set de escritorio", B + "escritorio-y-oficina/"]],
  194: [["Reconocimientos por trayectoria", B + "escritorio-y-oficina/trofeos-y-galvanos/"]],
  175: [["soportes de teléfono", B + "audio-y-tecnologia/tecnologia/accesorios-de-telefono/"]],
};
const f = process.argv[2];
const d = JSON.parse(readFileSync(f, "utf8"));
let ok = 0, no = 0;
for (const c of d) {
  for (const [frase, url] of EXTRA[c.id] || []) {
    const i = c.seo.indexOf(frase);
    if (i < 0) { console.log("  ✕ " + c.id + " «" + frase + "»"); no++; continue; }
    const antes = c.seo.slice(0, i);
    if ((antes.match(/<a /g) || []).length > (antes.match(/<\/a>/g) || []).length) { console.log("  ✕ " + c.id + " dentro de enlace"); no++; continue; }
    c.seo = antes + '<a href="' + url + '">' + frase + "</a>" + c.seo.slice(i + frase.length);
    ok++;
  }
}
writeFileSync(f, JSON.stringify(d, null, 1));
console.log("  añadidos " + ok + (no ? "  ·  fallidos " + no : ""));
