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
  // Sesión deslizante: dura siete días y se renueva con el uso. Antes caducaba
  // exactamente doce horas después de entrar, aunque se estuviera trabajando,
  // y cortaba un chat a mitad de tarea justo a la hora de más uso.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
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
    async jwt({ token, user }) {
      if (user) {
        token.rol = (user as { rol?: string }).rol;
        token.uid = user.id;
        token.visto = Date.now();
        return token;
      }

      // Cada diez minutos se vuelve a mirar la base. El JWT no lo hace solo, y
      // sin esto desactivar a alguien o bajarle el rol tardaba horas en surtir
      // efecto: la sesión seguía creyendo lo que decía al entrar.
      if (token.uid && Date.now() - Number(token.visto ?? 0) > 10 * 60 * 1000) {
        const u = await db.usuario.findUnique({
          where: { id: String(token.uid) },
          select: { rol: true, activo: true },
        });
        if (!u || !u.activo) {
          // Sin id, cada pantalla manda a entrar: es la forma de cerrar la
          // sesión desde aquí sin tocar la cookie.
          token.uid = "";
          token.rol = "LECTOR";
        } else {
          token.rol = u.rol;
        }
        token.visto = Date.now();
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
