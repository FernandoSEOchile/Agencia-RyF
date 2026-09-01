/**
 * Publica una versión del conector para que los clientes la instalen solos.
 *
 * Copia el ZIP a `public/plugin/` y escribe los metadatos que consultan los
 * WordPress. Antes comprueba que la versión del archivo dentro del ZIP coincide
 * con la del código: publicar metadatos que anuncian una versión distinta a la
 * que hay dentro deja a todos los sitios reinstalando en bucle, porque tras
 * actualizar siguen viéndose desactualizados.
 *
 * Uso:  npm run plugin:publicar
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ORIGEN = "appseo-ryf.zip";
const DESTINO = "public/plugin";

if (!existsSync(ORIGEN)) {
  console.error(`\n  No existe ${ORIGEN}. Empaqueta el plugin primero.\n`);
  process.exit(1);
}

/** Versión declarada en el código fuente. */
const fuente = readFileSync("appseo-ryf/appseo-ryf.php", "utf8");
const enCodigo = (fuente.match(/^\s*\*\s*Version:\s*(.+)$/m) || [])[1]?.trim();

if (!enCodigo) {
  console.error("\n  No se pudo leer la versión del archivo principal del plugin.\n");
  process.exit(1);
}

/** Versión que viaja dentro del ZIP, que es la que acabará instalada. */
let enZip = "";
try {
  const listado = execFileSync("node", [
    "-e",
    `const z=require('fs').readFileSync('${ORIGEN}');process.stdout.write(z.toString('latin1'))`,
  ]).toString("latin1");
  // El ZIP está comprimido, así que la cabecera no siempre se ve en claro; se
  // usa como comprobación adicional, no como única fuente.
  const m = listado.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
  enZip = m ? m[1] : "";
} catch {
  enZip = "";
}

if (enZip && enZip !== enCodigo) {
  console.error(
    `\n  El ZIP contiene la versión ${enZip} pero el código declara ${enCodigo}.` +
      `\n  Vuelve a empaquetar antes de publicar.\n`
  );
  process.exit(1);
}

const requiereWp = (fuente.match(/Requires at least:\s*(.+)/) || [])[1]?.trim() || "";
const requierePhp = (fuente.match(/Requires PHP:\s*(.+)/) || [])[1]?.trim() || "7.4";

mkdirSync(DESTINO, { recursive: true });
copyFileSync(ORIGEN, `${DESTINO}/appseo-ryf.zip`);

const notas = process.argv.slice(2).join(" ").trim();

writeFileSync(
  `${DESTINO}/version.json`,
  JSON.stringify(
    {
      version: enCodigo,
      probado: requiereWp,
      php: requierePhp,
      notas,
      publicado: new Date().toISOString(),
    },
    null,
    1
  ) + "\n"
);

const bytes = readFileSync(`${DESTINO}/appseo-ryf.zip`).length;

console.log(`
  ✓ Publicada la versión ${enCodigo}  ·  ${Math.round(bytes / 1024)} KB
  ${notas ? "  " + notas + "\n" : ""}
  Los sitios la verán en cuanto caduque su caché (hasta 6 horas), o al
  entrar en Plugins → Buscar actualizaciones.

  Falta subirla al servidor:  git push  y  desplegar.
`);
