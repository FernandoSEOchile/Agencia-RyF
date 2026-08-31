/**
 * Crea un producto, una entrada y una página en una sola pasada.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node crear-trio.mjs <imagen.png>
 */

import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const cadena = process.env.APPSEO_CONEXION;
const imagen = process.argv[2];

if (!cadena || !imagen) {
  console.error("\n  ✕ Uso: node crear-trio.mjs <imagen.png>\n");
  process.exit(1);
}

const conexion = JSON.parse(
  Buffer.from(cadena.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
);

async function llamar(metodo, camino, cuerpo = null) {
  const raw = cuerpo ? JSON.stringify(cuerpo) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const firma = createHmac("sha256", conexion.secret)
    .update([metodo, "/appseo/v1" + camino.split("?")[0], ts, nonce, createHash("sha256").update(raw).digest("hex")].join("\n"))
    .digest("hex");

  const res = await fetch(conexion.rest + camino, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "X-AppSEO-Key": conexion.key_id,
      "X-AppSEO-Timestamp": ts,
      "X-AppSEO-Nonce": nonce,
      "X-AppSEO-Signature": firma,
    },
    ...(raw ? { body: raw } : {}),
  });

  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no era JSON */ }
  return { estado: res.status, ok: res.ok, json, texto };
}

function reportar(etiqueta, r) {
  if (!r.ok) {
    console.log("    ✕ " + r.estado + " · " + (r.json?.code || "") + " — " + (r.json?.message || r.texto.slice(0, 160)));
    return null;
  }
  console.log("    ✓ id " + r.json.id + "  ·  " + r.json.estado);
  console.log("      " + r.json.editar);
  return r.json;
}

console.log("\n  " + conexion.site + "\n");

/* ---------- imagen compartida ---------- */
console.log("  → imagen");
const media = await llamar("POST", "/media", {
  nombre: basename(imagen),
  contenido: readFileSync(imagen).toString("base64"),
  alt: "Imagen generada para las pruebas del conector AppSEO RyF",
});
if (!media.ok) {
  console.error("    ✕ " + (media.json?.code || media.estado));
  process.exit(1);
}
console.log("    ✓ id " + media.json.id);

/* ---------- 1. producto ---------- */
console.log("\n  → producto");
const producto = reportar("producto", await llamar("POST", "/products", {
  nombre: "Auditoría SEO Express",
  slug: "auditoria-seo-express",
  estado: "draft",
  descripcion: `<p>Revisión completa de un sitio en una semana: rastreo técnico, arquitectura de contenidos, análisis de la competencia y un plan de acción priorizado por impacto.</p>
<h3>Qué incluye</h3>
<ul>
<li>Rastreo completo del sitio y detección de errores que bloquean el posicionamiento.</li>
<li>Análisis de las palabras clave por las que compites hoy y por las que deberías.</li>
<li>Revisión del enlazado interno y de la arquitectura de categorías.</li>
<li>Informe con las acciones ordenadas por impacto y esfuerzo, no por orden alfabético.</li>
</ul>
<p>Entrega en siete días laborables, con una sesión de una hora para repasar los hallazgos.</p>`,
  descripcion_corta: "<p>Diagnóstico SEO completo con plan de acción priorizado, entregado en una semana.</p>",
  imagen: media.json.id,
  etiquetas: ["auditoría", "seo", "consultoría"],
  precio_regular: "249000",
  precio_oferta: "199000",
  meta: {
    _yoast_wpseo_focuskw: "auditoria seo",
    _yoast_wpseo_metadesc: "Auditoría SEO completa en una semana: rastreo técnico, arquitectura, competencia y plan de acción priorizado por impacto.",
  },
}));

/* ---------- 2. entrada ---------- */
console.log("\n  → entrada");
const entrada = reportar("entrada", await llamar("POST", "/content", {
  tipo: "post",
  titulo: "Errores de SEO que están costándote tráfico ahora mismo",
  slug: "errores-seo-comunes",
  estado: "draft",
  extracto: "Cinco fallos que aparecen una y otra vez en las auditorías, con lo que cuesta cada uno y cómo se corrige.",
  contenido: `<!-- wp:paragraph -->
<p>Después de auditar decenas de sitios, los mismos cinco fallos aparecen una y otra vez. Ninguno es exótico y todos tienen arreglo.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">1. Páginas publicadas sin contenido</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Páginas de servicio que se crearon con la plantilla y nunca se rellenaron. Están en el menú, reciben enlaces internos y no dicen nada. Google las lee como contenido de baja calidad y tú repartes autoridad hacia la nada.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">2. Texto de relleno en producción</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Lorem ipsum olvidado desde el lanzamiento. Suena a broma, pero es más frecuente de lo que parece: la plantilla lo trae, nadie lo revisa, y ahí sigue años después.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">3. Dos páginas compitiendo por lo mismo</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Canibalización: dos URLs apuntando a la misma búsqueda. Google no sabe cuál mostrar y acaba mostrando peor las dos que si existiera una sola bien hecha.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">4. Fichas copiadas del proveedor</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>En tiendas online, la descripción idéntica a la de otras doscientas tiendas. No le das a Google una sola razón para elegirte a ti entre todas ellas.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">5. Páginas huérfanas</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Contenido al que no apunta nada: ni el menú, ni otra página, ni el pie. Existe en el servidor pero es invisible en la práctica.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Cómo encontrarlos</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Los cinco se detectan con un rastreo del sitio y media hora de revisión. Lo caro no es encontrarlos: es no haberlos buscado nunca.</p>
<!-- /wp:paragraph -->`,
  meta: {
    _yoast_wpseo_focuskw: "errores seo",
    _yoast_wpseo_metadesc: "Los cinco errores de SEO que más aparecen en auditorías reales: páginas vacías, texto de relleno, canibalización, fichas duplicadas y contenido huérfano.",
  },
}));

/* ---------- 3. página ---------- */
console.log("\n  → página");
const pagina = reportar("página", await llamar("POST", "/content", {
  tipo: "page",
  titulo: "Auditoría SEO",
  slug: "auditoria-seo",
  estado: "draft",
  contenido: `<!-- wp:paragraph {"style":{"typography":{"fontSize":"1.25rem"}}} -->
<p style="font-size:1.25rem">Antes de invertir un peso en contenido o enlaces, conviene saber qué está roto. Eso es una auditoría.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Qué reviso</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><strong>Técnico.</strong> Qué impide que Google lea tu sitio: velocidad, rastreo, indexación, errores de servidor.</li>
<li><strong>Contenido.</strong> Qué tienes publicado, qué está vacío, qué se duplica y qué falta.</li>
<li><strong>Arquitectura.</strong> Cómo se enlazan tus páginas entre sí y qué queda aislado.</li>
<li><strong>Competencia.</strong> Quién ocupa hoy los resultados que quieres y qué hace distinto.</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Qué recibes</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Un documento con los hallazgos ordenados <strong>por impacto y esfuerzo</strong>, no por orden alfabético. Lo que más mueve va primero, con instrucciones concretas para tu equipo de desarrollo.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Y una hora de conversación para repasarlo, que suele valer más que el propio informe.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Cuándo NO la necesitas</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Si tu sitio tiene tres meses y diez páginas, no hace falta una auditoría: hace falta contenido. Te lo diré antes de cobrarte nada.</p>
<!-- /wp:paragraph -->`,
  meta: {
    _yoast_wpseo_focuskw: "auditoria seo",
    _yoast_wpseo_metadesc: "Auditoría SEO: revisión técnica, de contenido, arquitectura y competencia, con los hallazgos priorizados por impacto real.",
  },
}));

console.log("\n  ── resumen ──");
console.log("  producto : " + (producto ? "id " + producto.id : "falló"));
console.log("  entrada  : " + (entrada ? "id " + entrada.id : "falló"));
console.log("  página   : " + (pagina ? "id " + pagina.id : "falló"));
console.log("\n  Revisa AppSEO → Registro para ver las operaciones anotadas.\n");
