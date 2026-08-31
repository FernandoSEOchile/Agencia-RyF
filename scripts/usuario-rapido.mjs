/**
 * Crea o actualiza un usuario sin preguntar nada.
 *
 * El script interactivo oculta la contraseña mientras se escribe, y eso no
 * funciona en todos los terminales —el del navegador de Hostinger, por
 * ejemplo—. Esta versión lee los datos de variables de entorno, que sí
 * funcionan en cualquier sitio.
 *
 * Uso:
 *   EMAIL=tu@correo.com NOMBRE="Tu Nombre" CLAVE="tu contraseña" \
 *     node scripts/usuario-rapido.mjs
 *
 * La contraseña queda en el historial del terminal. Bórralo después con:
 *   history -c
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = (process.env.EMAIL || "").trim().toLowerCase();
const nombre = (process.env.NOMBRE || "").trim();
const clave = process.env.CLAVE || "";

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("\n  Falta EMAIL o no es un correo válido.\n");
  process.exit(1);
}

if (clave.length < 10) {
  console.error(
    "\n  La contraseña debe tener al menos 10 caracteres.\n" +
      "  Esta clave abre el acceso de escritura a todos los clientes.\n"
  );
  process.exit(1);
}

const db = new PrismaClient();

const primero = (await db.usuario.count()) === 0;
const existente = await db.usuario.findUnique({ where: { email } });

const usuario = await db.usuario.upsert({
  where: { email },
  update: { clave: await bcrypt.hash(clave, 12), activo: true },
  create: {
    email,
    nombre: nombre || email,
    clave: await bcrypt.hash(clave, 12),
    // El primero manda: si no fuera administrador, nadie podría conectar
    // clientes ni crear al resto del equipo.
    rol: primero ? "ADMIN" : "EDITOR",
  },
});

console.log(
  `\n  ✓ ${existente ? "contraseña actualizada" : "usuario creado"}: ${usuario.email}` +
    `  ·  ${usuario.nombre}  ·  rol ${usuario.rol}\n`
);

if (primero) console.log("  Es el primer usuario, así que queda como administrador.\n");
console.log("  Entra en el panel y borra el historial del terminal con:  history -c\n");

await db.$disconnect();
