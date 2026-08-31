/**
 * Autenticación del panel.
 *
 * Correo y contraseña, con la contraseña guardada como hash bcrypt. Se eligió
 * así y no con un proveedor externo porque no todo el equipo tiene por qué
 * tener cuenta de Google, y esto funciona igual para cualquiera.
 *
 * La sesión va en un JWT firmado en cookie: el panel no necesita consultar la
 * base en cada petición para saber quién eres.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/entrar" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        clave: { label: "Contraseña", type: "password" },
      },
      async authorize(datos) {
        const email = String(datos?.email || "").trim().toLowerCase();
        const clave = String(datos?.clave || "");

        if (!email || !clave) return null;

        const usuario = await db.usuario.findUnique({ where: { email } });

        // Se compara igual aunque el usuario no exista, para no revelar por el
        // tiempo de respuesta qué correos están registrados.
        const hash = usuario?.clave ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const correcta = await bcrypt.compare(clave, hash);

        if (!usuario || !usuario.activo || !correcta) return null;

        await db.usuario.update({
          where: { id: usuario.id },
          data: { ultimoAcceso: new Date() },
        });

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nombre,
          rol: usuario.rol,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.rol = (user as { rol?: string }).rol;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid || "");
        (session.user as { rol?: string }).rol = String(token.rol || "LECTOR");
      }
      return session;
    },
  },
});

/** Sesión obligatoria: para usar al principio de cada acción del servidor. */
export async function exigirSesion() {
  const sesion = await auth();
  if (!sesion?.user?.id) throw new Error("Sesión no iniciada.");
  return sesion;
}

/** Igual, pero exigiendo rol de administrador. */
export async function exigirAdmin() {
  const sesion = await exigirSesion();
  if ((sesion.user as { rol?: string }).rol !== "ADMIN") {
    throw new Error("Hace falta rol de administrador.");
  }
  return sesion;
}
