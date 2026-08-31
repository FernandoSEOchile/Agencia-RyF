/**
 * Crea una entrada a través de AppSEO Connect.
 *
 * Prueba el camino de escritura completo: contenido en bloques y metadatos
 * protegidos de Yoast, que es justo lo que la REST API del núcleo no permite.
 *
 * Uso:  $env:APPSEO_CONEXION = "appseo_..."; node crear-post.mjs
 */

import { createHmac, createHash, randomBytes } from "node:crypto";

const PREFIJO = "appseo_";
const cadena = process.env.APPSEO_CONEXION || process.argv.find((a) => a.startsWith(PREFIJO));

if (!cadena) {
  console.error('\n  ✕ Define APPSEO_CONEXION con la cadena de conexión.\n');
  process.exit(1);
}

const b64 = cadena.slice(PREFIJO.length).replace(/-/g, "+").replace(/_/g, "/");
const conexion = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

async function llamar(metodo, camino, cuerpo = null) {
  const raw = cuerpo ? JSON.stringify(cuerpo) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const canonical = [
    metodo.toUpperCase(),
    "/appseo/v1" + camino.split("?")[0],
    ts,
    nonce,
    createHash("sha256").update(raw).digest("hex"),
  ].join("\n");
  const firma = createHmac("sha256", conexion.secret).update(canonical).digest("hex");

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

const contenido = `<!-- wp:paragraph -->
<p>Esta entrada fue creada por el panel AppSEO a través del plugin conector, sin ejecutar código en el servidor y sin usar el escritorio de WordPress.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Qué demuestra</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Autenticación por firma HMAC contra un endpoint propio.</li>
<li>Creación de contenido con marcado de bloques de Gutenberg.</li>
<li>Escritura de metadatos protegidos de Yoast, que la REST API del núcleo no permite.</li>
<li>Atribución al usuario configurado en los ajustes del conector.</li>
</ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>Puedes borrarla sin ningún efecto secundario.</p>
<!-- /wp:paragraph -->`;

console.log("\n  " + conexion.site);
console.log("  → POST /content\n");

const r = await llamar("POST", "/content", {
  tipo: "post",
  titulo: "AppSEO",
  slug: "appseo",
  estado: "draft",
  extracto: "Entrada de prueba creada desde el panel AppSEO mediante el plugin conector.",
  contenido,
  meta: {
    _yoast_wpseo_focuskw: "appseo",
    _yoast_wpseo_metadesc: "Entrada de prueba creada desde el panel AppSEO a través del plugin conector.",
    _yoast_wpseo_meta_robots_noindex: "1",
  },
});

if (!r.ok) {
  const codigo = r.json?.code || "";
  console.error("  ✕ HTTP " + r.estado + " · " + codigo);
  console.error("    " + (r.json?.message || r.texto.slice(0, 200)));

  if (codigo === "appseo_read_only") {
    console.error("\n    El sitio está en modo solo lectura. Es el comportamiento correcto.");
    console.error("    Para permitir la escritura: AppSEO → Conexión → desmarca «Modo solo lectura».");
  }
  if (codigo === "appseo_no_acting_user") {
    console.error("\n    Falta seleccionar el «Autor de los cambios» en los ajustes del conector.");
  }
  process.exit(1);
}

const d = r.json;
console.log("  ✓ " + (d.creado ? "creada" : "actualizada") + "  ·  ID " + d.id);
console.log("    estado : " + d.estado);
console.log("    url    : " + d.url);
console.log("    editar : " + d.editar);
console.log("    meta escrito   : " + (d.meta_escrito?.escritas || []).join(", "));
if ((d.meta_escrito?.rechazadas || []).length) {
  console.log("    meta rechazado : " + d.meta_escrito.rechazadas.join(", ") + "  (fuera de la lista blanca)");
}
console.log("");
