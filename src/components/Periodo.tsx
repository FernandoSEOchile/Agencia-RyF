"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * El selector de periodo, el mismo en todas las vistas.
 *
 * Había tres juegos distintos —Panorama con «1 mes», Posiciones con «28 días»,
 * Gasto con «7 días»— y ninguno se acordaba al cambiar de pestaña. Comparar
 * «el último mes» en dos vistas obligaba a elegirlo dos veces, y no era el
 * mismo mes. Aquí hay un juego único; cada vista enseña los tramos que le
 * sirven, y la elección se guarda en la URL para que pase de una pestaña a
 * otra y sobreviva a la recarga.
 */

export const TRAMOS = [
  [7, "7 días"],
  [28, "28 días"],
  [90, "3 meses"],
  [180, "6 meses"],
  [365, "1 año"],
  [730, "2 años"],
] as const;

export type Dias = (typeof TRAMOS)[number][0];

const CLAVE = "p";

function leerUrl(): number | null {
  if (typeof window === "undefined") return null;
  const v = Number(new URLSearchParams(window.location.search).get(CLAVE));
  return TRAMOS.some(([d]) => d === v) ? v : null;
}

function escribirUrl(dias: number) {
  const url = new URL(window.location.href);
  url.searchParams.set(CLAVE, String(dias));
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Estado del periodo compartido por URL.
 *
 * `permitidos` acota a los tramos que la vista sabe manejar; si la URL trae
 * uno que no está, se usa `porDefecto` en vez de romper la vista.
 */
export function usePeriodo(porDefecto: Dias, permitidos: readonly Dias[] = TRAMOS.map(([d]) => d)) {
  const [dias, setDiasEstado] = useState<number>(porDefecto);

  useEffect(() => {
    const enUrl = leerUrl();
    if (enUrl !== null && permitidos.includes(enUrl as Dias)) setDiasEstado(enUrl);
    // Solo al montar: después manda lo que elija la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDias = useCallback((d: number) => {
    setDiasEstado(d);
    escribirUrl(d);
  }, []);

  return { dias, setDias, permitidos };
}

export default function Periodo({
  dias,
  setDias,
  permitidos,
  extra,
}: {
  dias: number;
  setDias: (d: number) => void;
  permitidos: readonly Dias[];
  /** Controles que van a la derecha de los tramos, como «desde / hasta». */
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="segmentos">
        {TRAMOS.filter(([d]) => permitidos.includes(d)).map(([d, texto]) => (
          <button
            key={d}
            type="button"
            onClick={() => setDias(d)}
            className={`segmento ${dias === d ? "segmento-activo" : ""}`}
            aria-pressed={dias === d}
          >
            {texto}
          </button>
        ))}
      </div>
      {extra}
    </div>
  );
}
