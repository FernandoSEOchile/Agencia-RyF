import type { NombreIcono } from "@/components/Iconos";

/** Un destino del riel: pantalla, rótulo corto e icono. */
export interface Enlace {
  href: string;
  texto: string;
  icono: NombreIcono;
}

/**
 * Las pantallas del panel según el rol, en el orden del riel.
 *
 * Vive fuera del riel porque la paleta de Ctrl+K y el menú del móvil enseñan
 * la misma lista: si cada uno la escribiera, se desincronizarían al primer
 * cambio.
 */
export function enlacesDelPanel(rol: string): Enlace[] {
  return [
    { href: "/panel", texto: "Clientes", icono: "clientes" },
    { href: "/panel/explorar", texto: "Explorar", icono: "explorar" },
    { href: "/panel/terminos", texto: "Palabras", icono: "palabras" },
    { href: "/panel/local", texto: "Local", icono: "local" },
    { href: "/panel/errores", texto: "Fallos", icono: "fallos" },
    ...(rol === "ADMIN" || rol === "GESTOR" ? [{ href: "/panel/gasto", texto: "Gasto", icono: "gasto" as const }] : []),
    ...(rol === "ADMIN"
      ? [
          { href: "/panel/usuarios", texto: "Usuarios", icono: "usuarios" as const },
          { href: "/panel/ajustes", texto: "Ajustes", icono: "ajustes" as const },
        ]
      : []),
  ];
}

/** Si el enlace es el de la pantalla actual. La portada abarca las fichas de cliente. */
export function enlaceActivo(href: string, ruta: string): boolean {
  return href === "/panel" ? ruta === "/panel" || ruta.startsWith("/panel/clientes") : ruta.startsWith(href);
}
