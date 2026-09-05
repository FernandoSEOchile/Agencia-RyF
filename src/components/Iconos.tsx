/**
 * Los iconos del panel, dibujados a mano en trazo de 1.75.
 *
 * Van aquí y no en una librería porque son veinte y no van a ser doscientos:
 * cada uno se elige a propósito para una pantalla, y un paquete de cinco mil
 * iconos invita a poner uno donde no hace falta ninguno.
 */
const TRAZOS: Record<string, string[]> = {
  clientes: [
    "M9 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0",
    "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2",
    "M16 3.13a4 4 0 0 1 0 7.75",
    "M21 21v-2a4 4 0 0 0 -3 -3.85",
  ],
  explorar: [
    "M21 12a9 9 0 1 0 -9 9",
    "M3.6 9h16.8",
    "M3.6 15h7.9",
    "M11.5 3a17 17 0 0 0 0 18",
    "M12.5 3a17 17 0 0 1 2.4 6.3",
    "M15 18m0 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M20.2 20.2l1.8 1.8",
  ],
  palabras: ["M8 15m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M10.85 12.15l10.15 -10.15", "M18 5l2 2", "M15 8l2 2"],
  fallos: [
    "M12 9v4",
    "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z",
    "M12 16h.01",
  ],
  gasto: [
    "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1",
    "M12 6v2",
    "M12 16v2",
  ],
  usuarios: ["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"],
  ajustes: [
    "M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M4 6l8 0",
    "M16 6l4 0",
    "M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M4 12l2 0",
    "M10 12l10 0",
    "M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M4 18l11 0",
    "M19 18l1 0",
  ],
  cuenta: [
    "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855",
  ],
  salir: ["M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2", "M9 12h12l-3 -3", "M18 15l3 -3"],
  buscar: ["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
  consola: ["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6", "M7 10l2 2l4 -4"],
  menu: ["M4 6l16 0", "M4 12l16 0", "M4 18l16 0"],
  cerrar: ["M18 6l-12 12", "M6 6l12 12"],
  abajo: ["M6 9l6 6l6 -6"],
  mas: ["M12 5l0 14", "M5 12l14 0"],

  // Secciones de un cliente.
  asistente: ["M8 9h8", "M8 13h6", "M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"],
  panorama: ["M4 4h6v8h-6z", "M4 16h6v4h-6z", "M14 12h6v8h-6z", "M14 4h6v4h-6z"],
  posiciones: ["M3 17l6 -6l4 4l8 -8", "M14 7l7 0l0 7"],
  ia: [
    "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z",
    "M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z",
    "M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z",
  ],
  competidores: [
    "M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
    "M15 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
    "M9 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
    "M4 20l14 0",
  ],
  local: ["M12 11m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"],
  backlinks: [
    "M9 15l6 -6",
    "M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464",
    "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463",
  ],
  tecnico: ["M3 12h4l3 8l4 -16l3 8h4"],
  sitemap: [
    "M3 16a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
    "M15 16a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
    "M9 4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
    "M6 15v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1",
    "M12 9l0 3",
  ],
  arquitectura: [
    "M12 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M5 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M19 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M6.5 17.5l5.5 -4.5l5.5 4.5",
    "M12 7l0 6",
  ],
  bitacora: ["M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1", "M9 4v16", "M13 8l2 0", "M13 12l2 0"],
  recibo: ["M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2", "M9 7l6 0", "M9 11l6 0"],
  registro: ["M12 8l0 4l2 2", "M3.05 11a9 9 0 1 1 .5 4", "M3 20v-5h5"],
  datos: ["M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0", "M4 6v6a8 3 0 0 0 16 0v-6", "M4 12v6a8 3 0 0 0 16 0v-6"],
};

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam = 20, className }: { nombre: NombreIcono; tam?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {(TRAZOS[nombre] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
