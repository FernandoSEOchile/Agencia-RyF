/**
 * Importa a la base los clientes que hoy viven en archivos sueltos.
 *
 * Lee `.appseo/<dominio>.txt`, comprueba contra el sitio que la credencial
 * sirve, y la guarda cifrada. No borra los archivos: eso lo decides tú cuando
 * el panel esté andando.
 *
 * Uso:  npm run panel:importar
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createCipheriv, randomBytes, createHash, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const RAIZ = ".appseo";
const db = new PrismaClient();

/* --- cifrado: mismo formato que src/lib/cifrado.ts --- */
function clave() {
  const bruta = process.env.APPSEO_CLAVE_CIFRADO;
  if (!bruta) throw new Error("Falta APPSEO_CLAVE_CIFRADO en .env.local");
  if (/^[0-9a-f]{64}$/i.test(bruta)) return Buffer.from(bruta, "hex");
  if (bruta.length < 32) throw new Error("APPSEO_CLAVE_CIFRADO demasiado corta");
  return createHash("sha256").update(bruta).digest();
}

function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64url")).join(".");
}

/* --- comprobación contra el sitio --- */
async function comprobar(cfg) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("base64url");
  const firma = createHmac("sha256", cfg.secret)
    .update(["GET", "/appseo/v1/health", ts, nonce, createHash("sha256").update("").digest("hex")].join("\n"))
    .digest("hex");

  const r = await fetch(cfg.rest + "/health", {
    headers: {
      "X-AppSEO-Key": cfg.key_id,
      "X-AppSEO-Timestamp": ts,
      "X-AppSEO-Nonce": nonce,
      "X-AppSEO-Signature": firma,
    },
  });

  return r.ok ? await r.json() : null;
}

if (!existsSync(RAIZ)) {
  console.error(`\n  No existe la carpeta ${RAIZ}. Nada que importar.\n`);
  process.exit(1);
}

const archivos = readdirSync(RAIZ).filter((f) => f.endsWith(".txt"));
console.log(`\n  ${archivos.length} credenciales encontradas\n`);

let ok = 0, saltados = 0, fallidos = 0;

for (const archivo of archivos) {
  const dominio = archivo.slice(0, -4);
  const cadena = readFileSync(join(RAIZ, archivo), "utf8").trim();

  if (!cadena.startsWith("appseo_")) {
    console.log(`  ✕ ${dominio}  la cadena no empieza por «appseo_»`);
    fallidos++;
    continue;
  }

  let cfg;
  try {
    cfg = JSON.parse(
      Buffer.from(cadena.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );
  } catch {
    console.log(`  ✕ ${dominio}  cadena ilegible`);
    fallidos++;
    continue;
  }

  // Se comprueba antes de guardar: importar una credencial muerta solo
  // traslada el problema a la base.
  const salud = await comprobar(cfg).catch(() => null);
  if (!salud) {
    console.log(`  ✕ ${dominio}  el sitio no respondió o la credencial ya no sirve`);
    fallidos++;
    continue;
  }

  const existente = await db.cliente.findUnique({ where: { dominio } });
  if (existente) {
    console.log(`  · ${dominio}  ya estaba, se actualiza la credencial`);
    saltados++;
  }

  await db.cliente.upsert({
    where: { dominio },
    update: {
      urlRest: cfg.rest,
      keyId: cfg.key_id,
      secreto: cifrar(cfg.secret),
      version: salud.conector,
      soloLectura: salud.solo_lectura,
      ultimaSonda: new Date(),
      estadoSonda: "ok",
    },
    create: {
      nombre: dominio,
      dominio,
      urlRest: cfg.rest,
      keyId: cfg.key_id,
      secreto: cifrar(cfg.secret),
      version: salud.conector,
      soloLectura: salud.solo_lectura,
      ultimaSonda: new Date(),
      estadoSonda: "ok",
    },
  });

  if (!existente) {
    console.log(`  ✓ ${dominio}  v${salud.conector}  ${salud.solo_lectura ? "solo lectura" : "escritura"}`);
    ok++;
  }
}

// Todo administrador ve todos los clientes, así que no hace falta crear
// accesos: la tabla Acceso solo se usa para EDITOR y LECTOR.
console.log(`\n  importados ${ok}  ·  actualizados ${saltados}  ·  fallidos ${fallidos}`);
console.log(`\n  Los archivos de ${RAIZ}/ siguen ahí. Bórralos cuando el panel esté andando.\n`);

await db.$disconnect();
