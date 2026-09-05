/**
 * Cómo se llama cada herramienta cuando la ve una persona.
 *
 * Vive aparte de las herramientas porque estas son `server-only` y el chat
 * las nombra en el navegador. Es una lista cerrada a propósito: una
 * herramienta nueva sin nombre aquí sale con su identificador —«leer_contenido»—
 * y eso es exactamente lo que se quiere que no pase, así que se comprueba en
 * los tests que las dos listas coinciden.
 */
export const NOMBRES_HERRAMIENTAS: Record<string, string> = {
  estado_del_sitio: "Comprobando el sitio",
  auditar_contenido: "Auditando el contenido",
  listar_productos: "Listando productos",
  leer_producto: "Leyendo un producto",
  escribir_producto: "Escribiendo un producto",
  crear_producto: "Creando un producto",
  listar_categorias: "Listando categorías",
  escribir_categoria: "Escribiendo una categoría",
  crear_categoria: "Creando una categoría",
  listar_contenido: "Listando páginas y entradas",
  leer_contenido: "Leyendo una página",
  escribir_contenido: "Escribiendo contenido",
  crear_contenido: "Creando una página",
  publicar_en_tienda: "Publicando en la tienda",
  leer_css: "Leyendo el CSS",
  escribir_css: "Escribiendo CSS",
  reconocer_tema: "Reconociendo el tema",
  leer_diseno_elementor: "Leyendo el diseño de Elementor",
  disenar_con_elementor: "Maquetando con Elementor",
  ver_pagina: "Mirando la página en vivo",
  ver_registro: "Revisando el registro",
  ver_rastreo: "Consultando el rastreo técnico",
  analizar_competencia: "Analizando la competencia",
  ver_search_console: "Consultando Search Console",
  ver_posiciones: "Consultando posiciones",
  ver_arquitectura: "Consultando la arquitectura",
  ver_backlinks: "Consultando backlinks",
  recordar: "Guardando un apunte del sitio",
  olvidar: "Borrando un apunte del sitio",
  anotar_en_bitacora: "Anotando en la bitácora",
};

/** Las que escriben en el sitio del cliente. Son las que se pueden deshacer. */
export const ESCRIBEN = new Set([
  "escribir_producto",
  "crear_producto",
  "escribir_categoria",
  "crear_categoria",
  "escribir_contenido",
  "crear_contenido",
  "publicar_en_tienda",
  "escribir_css",
  "disenar_con_elementor",
]);

export function nombreHerramienta(id: string): string {
  return NOMBRES_HERRAMIENTAS[id] ?? id.replace(/_/g, " ");
}
