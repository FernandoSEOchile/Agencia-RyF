/**
 * Candado por operación, en memoria.
 *
 * Medir posiciones o refrescar backlinks cuesta dinero, y dos personas —o dos
 * pestañas de la misma persona— podían lanzarlo a la vez y pagarlo dos veces.
 * El panel corre en un solo proceso, así que un Set en memoria basta; si
 * algún día hay varias réplicas, esto tiene que pasar a la base.
 */
const activos = new Map<string, number>();

/** Un candado que nadie soltó (un proceso que murió a mitad) caduca solo. */
const CADUCIDAD = 10 * 60 * 1000;

export function tomar(clave: string): boolean {
  const desde = activos.get(clave);
  if (desde && Date.now() - desde < CADUCIDAD) return false;
  activos.set(clave, Date.now());
  return true;
}

export function soltar(clave: string) {
  activos.delete(clave);
}
