/**
 * Arranca y para el Postgres de desarrollo.
 *
 * Es una copia en carpeta de PostgreSQL, no un servicio de Windows: no se
 * instaló nada en el sistema y para deshacerlo basta borrar el directorio. Por
 * eso hay que encenderla a mano antes de `npm run dev`, y por eso existe este
 * script en vez de una línea en el README que nadie recuerda.
 *
 * Va en el puerto 5433 y no en el 5432 para no chocar con otro Postgres que
 * alguien tenga instalado en su equipo.
 *
 * Uso:  npm run local:base | local:base:parar | local:base:estado
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Dónde vive la copia de PostgreSQL. Fuera del repositorio, a propósito. */
const RAIZ = process.env.PG_LOCAL ?? "C:\\Programas Claude\\pglocal";

const BIN = join(RAIZ, "pgsql", "bin");
const DATOS = join(RAIZ, "datos");
const REGISTRO = join(RAIZ, "registro.log");
const PUERTO = process.env.PG_LOCAL_PUERTO ?? "5433";

const orden = process.argv[2] ?? "estado";

if (!existsSync(join(BIN, "pg_ctl.exe"))) {
  console.error(`
  No encuentro PostgreSQL en ${RAIZ}.

  Es la copia en carpeta que se baja de get.enterprisedb.com. Si la tienes en
  otro sitio, dilo con la variable PG_LOCAL.
`);
  process.exit(1);
}

function pgctl(args, tolerante = false) {
  try {
    return execFileSync(join(BIN, "pg_ctl.exe"), args, { encoding: "utf8" });
  } catch (e) {
    if (tolerante) return e.stdout ?? "";
    throw e;
  }
}

if (orden === "arrancar") {
  // `status` devuelve error cuando está parada, que aquí no es un fallo.
  const estado = pgctl(["-D", DATOS, "status"], true);

  if (estado.includes("PID")) {
    console.log(`  La base ya estaba corriendo en el puerto ${PUERTO}.`);
    process.exit(0);
  }

  pgctl(["-D", DATOS, "-o", `-p ${PUERTO}`, "-l", REGISTRO, "start"]);
  console.log(`
  ✓ Base de desarrollo lista en 127.0.0.1:${PUERTO}

  Registro:  ${REGISTRO}
  Ahora:     npm run dev
`);
} else if (orden === "parar") {
  pgctl(["-D", DATOS, "-m", "fast", "stop"], true);
  console.log("  Base de desarrollo parada.");
} else {
  const estado = pgctl(["-D", DATOS, "status"], true);
  console.log(estado.trim() || "  La base de desarrollo está parada.");
}
