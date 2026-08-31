/**
 * Añade enlaces internos contextuales a las descripciones de categoría.
 *
 * Los enlaces van dentro del texto, sobre la palabra que ya nombra la
 * categoría de destino, y no en una lista de «relacionados» al final: un enlace
 * con texto ancla descriptivo dentro de una frase vale mucho más para un
 * buscador —y para quien lee— que una fila de enlaces genéricos.
 *
 * Cada sustitución se aplica una sola vez y se informa de las que no encajaron,
 * para que ningún enlace se dé por puesto sin estarlo.
 *
 * Uso:  node cat-enlazar.mjs <archivo.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

const B = "https://beepromo.cl/categoria/";

const U = {
  oficina: B + "escritorio-y-oficina/",
  mochilas: B + "mochilas-bananos-y-bolsos/",
  eco: B + "ecologicos-sustentable/",
  audiotec: B + "audio-y-tecnologia/",
  gourmet: B + "asados-cocina-gourmet/",
  mugs: B + "mug-vasos-tazas/",
  botellas: B + "botellas-agua-y-termicas/",
  tecnologia: B + "audio-y-tecnologia/tecnologia/",
  cocina: B + "asados-cocina-gourmet/cocina-gourmet/",
  cuadernos: B + "escritorio-y-oficina/cuadernos-libretas-memo-set/",
  viajes: B + "viajes/",
  lapices: B + "lapices/",
  belleza: B + "belleza-salud-mujer/",
  camping: B + "camping-cooler-y-picnic/",
  llaveros: B + "llaveros-corporativos/",
  bolsas: B + "mochilas-bananos-y-bolsos/bolsas-tnt-algodon/",
  ropa: B + "ropa-publicitaria/",
  vino: B + "asados-cocina-gourmet/cocina-gourmet/vino-bar-y-cristaleria/",
  mochilanote: B + "mochilas-bananos-y-bolsos/mochila-porta-notebok/",
  deporte: B + "deporte/",
  audio: B + "audio-y-tecnologia/audio/",
  telefono: B + "audio-y-tecnologia/tecnologia/accesorios-de-telefono/",
  verano: B + "verano/",
  cobre: B + "cobre/",
  trofeos: B + "escritorio-y-oficina/trofeos-y-galvanos/",
  bananos: B + "mochilas-bananos-y-bolsos/bananos-y-bolsos/",
  invierno: B + "invierno/",
  asados: B + "asados-cocina-gourmet/asados/",
  lapeco: B + "lapices/ecologicos/",
  herramientas: B + "herramientas/",
  premium: B + "premium/",
  juegos: B + "juegos-infantil/",
  lappromo: B + "lapices/promocionales-lapices/",
  automovil: B + "automovil/",
  bic: B + "lapices/lapices-promocionales-bic/",
  lapmet: B + "lapices/metalicos-lapices/",
  thomas: B + "premium/thomas/",
  kit: B + "escritorio-y-oficina/kit-bienvenida/",
  parker: B + "lapices/parker-cross-lapices/",
  gelroller: B + "lapices/gel-y-roller-lapices/",
  dulces: B + "asados-cocina-gourmet/cocina-gourmet/dulces/",
  pendrive: B + "audio-y-tecnologia/tecnologia/pendrive-personalizados/",
  auriculares: B + "audio-y-tecnologia/audio/auriculares-personalizados/",
  termos: B + "mug-vasos-tazas/termos-personalizados/",
  jockey: B + "ropa-publicitaria/jockey-y-gorros/",
  libretas: B + "escritorio-y-oficina/libretas-corporativas/",
  corporativos: B + "regalos-corporativos/",
  navidad: B + "regalos-corporativos-de-navidad/",
};

/** Por categoría: [texto a enlazar, destino]. Se aplica la primera aparición. */
const PLAN = {
  185: [["sets de escritura", "lapices"], ["un galvano de reconocimiento", "trofeos"], ["kit de bienvenida", "kit"], ["libretas", "libretas"]],
  192: [["Mochilas porta notebook", "mochilanote"], ["Bolsos deportivos y de viaje", "viajes"], ["Bananos y bolsos cruzados", "bananos"], ["Bolsas reutilizables", "bolsas"]],
  231: [["lápices", "lapeco"], ["libretas", "libretas"], ["llaveros", "llaveros"], ["mugs", "mugs"]],
  174: [["parlantes", "audio"], ["pendrives", "pendrive"], ["kits de bienvenida", "kit"]],
  239: [["Sets de asado y parrilla", "asados"], ["Tablas, cuchillería y accesorios gourmet", "cocina"], ["Vino, bar y cristalería", "vino"]],
  193: [["Termos", "termos"], ["Materiales sustentables", "eco"], ["Vaso térmico", "botellas"]],
  491: [["pendrives", "pendrive"], ["kits de bienvenida", "kit"], ["baterías externas", "audiotec"]],
  497: [["accesorios de café y té", "mugs"], ["Diciembre es la ventana natural", "navidad"], ["tablas, cuchillería", "asados"]],
  199: [["bolsos de viaje", "mochilas"], ["Clientes importantes", "premium"], ["almohadas de cuello", "deporte"]],
  176: [["implementos de ejercicio y bienestar", "deporte"], ["Kits de bienvenida", "kit"], ["neceseres", "mochilas"]],
  180: [["bolsos térmicos", "mochilas"], ["campañas comerciales de verano", "verano"], ["asado familiar", "asados"]],
  178: [["refuerza el mensaje sustentable", "eco"], ["kits de evento", "kit"], ["Retail y supermercados", "corporativos"]],
  195: [["gorros", "jockey"], ["regalos corporativos", "corporativos"]],
  499: [["kits de bienvenida de cargos profesionales", "kit"], ["obsequios a clientes importantes", "premium"], ["reconocimientos", "trofeos"]],
  183: [["bolsos deportivos", "mochilas"], ["botellas", "botellas"], ["Programas de bienestar", "belleza"]],
  490: [["audífonos con y sin cable", "auriculares"], ["regalos corporativos tecnológicos", "tecnologia"]],
  172: [["cargadores inalámbricos", "tecnologia"], ["regalos corporativos", "corporativos"]],
  198: [["coolers", "camping"], ["botellas", "botellas"], ["reposeras", "verano"]],
  181: [["copas, jarros", "vino"], ["artículos de escritorio", "oficina"], ["Reconocimientos", "trofeos"]],

  197: [["premiaciones internas", "premium"], ["reconocimientos corporativos en madera, cristal, mármol y metal", "oficina"]],
  501: [["la mochila se sale del presupuesto", "mochilanote"], ["Ferias y activaciones", "bolsas"], ["Actividades recreativas", "deporte"]],
  187: [["polerones, chaquetas", "ropa"], ["gorros", "jockey"], ["termos", "termos"]],
  496: [["línea gourmet", "gourmet"], ["tablas", "cocina"], ["delantales", "ropa"]],
  206: [["libretas", "libretas"], ["kits de bienvenida", "kit"], ["set de escritorio", "oficina"]],
  186: [["kits de emergencia para el auto", "automovil"], ["linternas", "llaveros"], ["obsequio de post-venta", "corporativos"]],
  194: [["artículos de escritura de marca", "parker"], ["reconocimientos por trayectoria", "trofeos"], ["materiales nobles", "cobre"]],
  386: [["puzzles", "juegos"], ["Navidad", "navidad"], ["artículos de dibujo", "lapices"]],
  253: [["bolígrafos plásticos, metálicos", "lapmet"], ["estuche", "premium"], ["capacitaciones y seminarios", "kit"]],
  175: [["Soportes de teléfono", "telefono"], ["cargadores", "tecnologia"], ["kits de emergencia", "herramientas"]],
  249: [["distintos sistemas de escritura", "lapices"], ["capacitaciones", "kit"]],
  251: [["lápiz plástico", "lappromo"], ["estuche", "premium"], ["grabado láser", "cobre"]],
  246: [["línea premium", "premium"], ["Kits de bienvenida", "kit"], ["artículos de escritura", "lapices"]],
  189: [["un mug o una botella", "mugs"], ["libreta y set de escritura", "lapices"], ["una mochila o un bolso", "mochilas"]],
  581: [["línea BIC", "bic"], ["Kits de bienvenida", "kit"], ["bolígrafo tradicional", "lappromo"]],
  252: [["Reconocimientos por trayectoria", "trofeos"], ["obsequios de escritura de alta gama", "premium"]],
  250: [["Kits de bienvenida", "kit"], ["bolígrafo tradicional", "lappromo"], ["set de escritorio", "oficina"]],
  184: [["Complemento de un kit", "kit"], ["Ferias y activaciones", "corporativos"], ["chocolates", "gourmet"]],
  560: [["entregas masivas", "corporativos"], ["reconocimientos individuales", "trofeos"], ["muestra virtual", "premium"]],
};

const archivo = process.argv[2];
const d = JSON.parse(readFileSync(archivo, "utf8"));

let puestos = 0;
let fallidos = 0;

for (const c of d) {
  const plan = PLAN[c.id];
  if (!plan) continue;

  for (const [frase, destino] of plan) {
    const url = U[destino];
    if (!url) {
      console.log("  ! destino desconocido: " + destino);
      fallidos++;
      continue;
    }

    // Solo fuera de un enlace ya existente y fuera de los encabezados.
    const i = c.seo.indexOf(frase);
    if (i < 0) {
      console.log("  ✕ " + c.id + "  no encontrado: «" + frase + "»");
      fallidos++;
      continue;
    }

    const antes = c.seo.slice(0, i);
    const abiertos = (antes.match(/<a /g) || []).length - (antes.match(/<\/a>/g) || []).length;
    if (abiertos > 0) {
      console.log("  ✕ " + c.id + "  ya dentro de un enlace: «" + frase + "»");
      fallidos++;
      continue;
    }

    c.seo = antes + '<a href="' + url + '">' + frase + "</a>" + c.seo.slice(i + frase.length);
    puestos++;
  }
}

writeFileSync(archivo, JSON.stringify(d, null, 1));

console.log("\n  enlaces puestos : " + puestos);
console.log("  no aplicados    : " + fallidos);
for (const c of d) {
  const n = (c.seo.match(/<a href=/g) || []).length;
  if (n < 2) console.log("  ⚠ " + c.id + " solo " + n + " enlaces  " + c.nombre);
}
