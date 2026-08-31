/**
 * Cambia el esquema de SQLite a Postgres.
 *
 * Se ejecuta UNA vez, antes de desplegar. Prisma no permite elegir el motor con
 * una variable de entorno, así que el cambio es en el archivo.
 *
 * Las migraciones existentes están escritas en dialecto SQLite y no valen para
 * Postgres, así que se archivan y se genera una nueva contra la base real.
 *
 * Uso:  node scripts/a-postgres.mjs
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";

const ESQUEMA = "prisma/schema.prisma";
let s = readFileSync(ESQUEMA, "utf8");

if (s.includes('provider = "postgresql"')) {
  console.log("\n  El esquema ya está en Postgres. Nada que hacer.\n");
  process.exit(0);
}

s = s.replace('provider = "sqlite"', 'provider = "postgresql"');
s = s.replace(
  "// Arranca en SQLite para poder trabajar sin montar un servidor. Al desplegar\n// en el VPS se cambia `provider` a \"postgresql\" y la URL: el resto del esquema\n// no necesita tocarse.",
  "// En producción corre sobre Postgres. Para volver a SQLite en local basta con\n// cambiar `provider`, pero las migraciones no son intercambiables entre ambos."
);

writeFileSync(ESQUEMA, s);

// Las migraciones de SQLite no se pueden aplicar sobre Postgres: el SQL difiere.
if (existsSync("prisma/migrations")) {
  const destino = "prisma/migrations-sqlite";
  if (!existsSync(destino)) {
    renameSync("prisma/migrations", destino);
    console.log(`  Migraciones de SQLite archivadas en ${destino}`);
  }
}

console.log(`
  ✓ Esquema cambiado a Postgres.

  Ahora, con la base de datos ya levantada y DATABASE_URL apuntando a ella:

    npx prisma migrate dev --name inicial

  Eso crea la migración de Postgres. Después ya puedes construir la imagen.
`);
