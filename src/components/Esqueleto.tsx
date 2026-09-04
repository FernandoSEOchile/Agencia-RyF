/**
 * Lo que se enseña mientras llegan los datos.
 *
 * Había quince maneras de decir «cargando»: cada componente con su texto, su
 * pulso y su posición, y al cambiar de pestaña a veces un hueco en blanco.
 * Aquí hay una forma por tipo de vista —cifras, tabla, gráfico— con la
 * silueta de lo que va a aparecer, para que la pestaña cambie al instante y
 * el contenido llegue sobre un sitio que ya tiene forma.
 */
export default function Esqueleto({
  tipo = "tabla",
  className = "",
}: {
  tipo?: "cifras" | "tabla" | "grafico" | "texto";
  className?: string;
}) {
  const barra = "animate-pulse rounded-lg bg-black/[0.06]";

  if (tipo === "cifras") {
    return (
      <div className={`mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className}`} aria-busy="true" aria-label="Cargando">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tarjeta p-4">
            <div className={`${barra} h-2.5 w-20`} />
            <div className={`${barra} mt-3 h-7 w-16`} />
            <div className={`${barra} mt-2 h-2.5 w-24`} />
          </div>
        ))}
      </div>
    );
  }

  if (tipo === "grafico") {
    return (
      <div className={`tarjeta mt-5 p-5 ${className}`} aria-busy="true" aria-label="Cargando">
        <div className={`${barra} h-2.5 w-32`} />
        <div className={`${barra} mt-4 h-40 w-full`} />
      </div>
    );
  }

  if (tipo === "texto") {
    return (
      <div className={`mt-5 flex flex-col gap-2 ${className}`} aria-busy="true" aria-label="Cargando">
        <div className={`${barra} h-3 w-3/4`} />
        <div className={`${barra} h-3 w-full`} />
        <div className={`${barra} h-3 w-5/6`} />
      </div>
    );
  }

  return (
    <div className={`tarjeta mt-5 overflow-hidden ${className}`} aria-busy="true" aria-label="Cargando">
      <div className="flex gap-6 border-b border-[color:var(--linea)] px-5 py-3">
        {[24, 40, 16, 16].map((w, i) => (
          <div key={i} className={`${barra} h-2.5`} style={{ width: `${w}%` }} />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-6 border-b border-[color:var(--linea)] px-5 py-3.5 last:border-0">
          {[24, 40, 16, 16].map((w, j) => (
            <div key={j} className={`${barra} h-3`} style={{ width: `${w}%`, opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
