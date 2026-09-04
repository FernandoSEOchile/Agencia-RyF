/**
 * Un gráfico de línea del tamaño de una palabra, para meter en una celda.
 *
 * La tabla de posiciones enseñaba solo el puesto de hoy y el de la medición
 * anterior; el histórico completo estaba guardado y no se veía. Esto pinta las
 * últimas mediciones a lo ancho de una celda: sin ejes ni etiquetas, porque a
 * ese tamaño lo único que se lee es la forma.
 *
 * `invertido` es para las posiciones, donde 1 está arriba y 100 abajo.
 */
export default function Chispa({
  valores,
  invertido = false,
  ancho = 72,
  alto = 20,
  color = "#2a78d6",
}: {
  /** null cuando no hubo dato (no aparecía). Se pinta como hueco. */
  valores: (number | null)[];
  invertido?: boolean;
  ancho?: number;
  alto?: number;
  color?: string;
}) {
  const puntos = valores.map((v, i) => ({ i, v }));
  const conDato = puntos.filter((p): p is { i: number; v: number } => p.v !== null);
  if (conDato.length < 2) return null;

  const min = Math.min(...conDato.map((p) => p.v));
  const max = Math.max(...conDato.map((p) => p.v));
  const paso = ancho / Math.max(1, valores.length - 1);
  const y = (v: number) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    const norm = invertido ? t : 1 - t;
    return 2 + norm * (alto - 4);
  };

  // Un tramo por cada racha continua de datos: los huecos cortan la línea en
  // vez de unirse por encima, que se leería como una posición inventada.
  const tramos: string[] = [];
  let actual: string[] = [];
  for (const p of puntos) {
    if (p.v === null) {
      if (actual.length) tramos.push(actual.join(" "));
      actual = [];
    } else {
      actual.push(`${(p.i * paso).toFixed(1)},${y(p.v).toFixed(1)}`);
    }
  }
  if (actual.length) tramos.push(actual.join(" "));

  const ultimo = conDato[conDato.length - 1];

  return (
    <svg
      width={ancho}
      height={alto}
      viewBox={`0 0 ${ancho} ${alto}`}
      aria-label={`Últimas ${conDato.length} mediciones`}
      className="overflow-visible"
    >
      {tramos.map((d, i) => (
        <polyline key={i} points={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={(ultimo.i * paso).toFixed(1)} cy={y(ultimo.v).toFixed(1)} r="2" fill={color} />
    </svg>
  );
}
