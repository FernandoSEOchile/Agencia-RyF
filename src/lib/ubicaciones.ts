/**
 * Dónde se hace la búsqueda al medir posiciones.
 *
 * Cada país trae su idioma: antes iba siempre en español, y medir Estados
 * Unidos era buscar en español. El dominio de Google (`google`) es solo
 * informativo: no se le manda al proveedor, porque forzarlo le hacía devolver
 * enlaces de redirección de Google en vez de los sitios (ver `medir`).
 *
 * Los códigos son los de ubicación de Google Ads, que son los que usa
 * DataForSEO. Las ciudades no se escriben a mano: se piden al proveedor con su
 * código exacto, porque uno inventado mide otra cosa sin avisar.
 */

export interface Pais {
  /** Código de ubicación del país. */
  codigo: number;
  iso: string;
  nombre: string;
  idioma: string;
  google: string;
}

export const PAISES: readonly Pais[] = [
  { codigo: 2152, iso: "cl", nombre: "Chile", idioma: "es", google: "google.cl" },
  { codigo: 2484, iso: "mx", nombre: "México", idioma: "es", google: "google.com.mx" },
  { codigo: 2032, iso: "ar", nombre: "Argentina", idioma: "es", google: "google.com.ar" },
  { codigo: 2170, iso: "co", nombre: "Colombia", idioma: "es", google: "google.com.co" },
  { codigo: 2604, iso: "pe", nombre: "Perú", idioma: "es", google: "google.com.pe" },
  { codigo: 2724, iso: "es", nombre: "España", idioma: "es", google: "google.es" },
  { codigo: 2840, iso: "us", nombre: "Estados Unidos", idioma: "en", google: "google.com" },
];

export const CHILE = PAISES[0];

export function paisPorIso(iso: string | null | undefined): Pais {
  return PAISES.find((p) => p.iso === iso) ?? CHILE;
}

/** El país de un código que es de país; para una ciudad no sirve, por eso se guarda el iso. */
export function paisPorCodigo(codigo: number): Pais | undefined {
  return PAISES.find((p) => p.codigo === codigo);
}

/** Cómo se nombra una ubicación en pantalla: «Chile» o «Santiago, Chile». */
export function nombreUbicacion(o: { pais: string; ubicacion: number; ubicacionNombre?: string | null }): string {
  const p = paisPorIso(o.pais);
  if (o.ubicacion === p.codigo || !o.ubicacionNombre) return p.nombre;
  return `${o.ubicacionNombre.split(",")[0]}, ${p.nombre}`;
}
