"use server";

import { signOut } from "@/lib/auth";

/**
 * Cerrar sesión, desde cualquier pantalla.
 *
 * Antes solo existía en la portada: en las demás pantallas la barra no tenía
 * botón de salir y había que volver atrás para encontrarlo.
 */
export async function salir() {
  await signOut({ redirectTo: "/entrar" });
}
