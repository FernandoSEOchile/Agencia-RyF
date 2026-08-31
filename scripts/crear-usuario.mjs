/**
 * Crea o actualiza un usuario del panel.
 *
 * La contraseña se pide por consola y nunca viaja como argumento: los
 * argumentos quedan en el historial del terminal y en la lista de procesos.
 *
 * Uso:  npm run panel:usuario
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const rl = createInterface({ input: stdin, output: stdout });

/** Pregunta ocultando lo que se escribe. */
async function secreto(pregunta) {
  stdout.write(pregunta);
  const anterior = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY) stdin.setRawMode(true);

  let valor = "";
  await new Promise((resolver) => {
    const onData = (buf) => {
      const c = buf.toString("utf8");
      if (c === "\r" || c === "\n") {
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(anterior);
        stdout.write("\n");
        resolver();
      } else if (c === "") {
        process.exit(1);
      } else if (c === "" || c === "\b") {
        valor = valor.slice(0, -1);
      } else {
        valor += c;
      }
    };
    stdin.on("data", onData);
  });

  return valor;
}

const email = (await rl.question("Correo: ")).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("\n  Ese correo no parece válido.\n");
  process.exit(1);
}

const existente = await db.usuario.findUnique({ where: { email } });
if (existente) console.log("  Ese usuario ya existe: se le cambiará la contraseña.");

const nombre = existente ? existente.nombre : (await rl.question("Nombre: ")).trim() || email;

const primerUsuario = (await db.usuario.count()) === 0;
const rol = existente
  ? existente.rol
  : primerUsuario
    ? "ADMIN"
    : ((await rl.question("Rol [ADMIN/EDITOR/LECTOR] (EDITOR): ")).trim().toUpperCase() || "EDITOR");

if (!["ADMIN", "EDITOR", "LECTOR"].includes(rol)) {
  console.error("\n  Rol no válido.\n");
  process.exit(1);
}

rl.close();

const clave = await secreto("Contraseña: ");
if (clave.length < 10) {
  console.error("\n  Usa al menos 10 caracteres. Esta contraseña abre el acceso a todos los clientes.\n");
  process.exit(1);
}

const repetida = await secreto("Repetir contraseña: ");
if (clave !== repetida) {
  console.error("\n  No coinciden.\n");
  process.exit(1);
}

const hash = await bcrypt.hash(clave, 12);

const usuario = await db.usuario.upsert({
  where: { email },
  update: { clave: hash, activo: true },
  create: { email, nombre, clave: hash, rol },
});

console.log(`\n  ✓ ${usuario.email}  ·  ${usuario.nombre}  ·  rol ${usuario.rol}`);
if (primerUsuario) console.log("    Es el primer usuario, así que queda como ADMIN.");
console.log("");

await db.$disconnect();
