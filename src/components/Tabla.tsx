"use client";

import { useState } from "react";

/**
 * Ordenación de tablas, compartida.
 *
 * Vive aquí porque la regla es de todas: cualquier tabla del panel se ordena
 * pulsando sus encabezados. Resolverlo tabla por tabla garantizaba olvidarlo
 * en la siguiente, así que la forma de no olvidarlo es que ordenar venga de
 * serie con el encabezado.
 */

export interface Columna<T extends string> {
  id: T;
  texto: string;
  /** Clases extra de la celda, normalmente «text-right». */
  clase?: string;
  /** Las numéricas arrancan de mayor a menor, que es lo que se quiere ver. */
  num?: boolean;
  /** Una columna de acciones no se ordena. */
  fija?: boolean;
}

export function useOrden<T extends string>(inicial: T, ascInicial = true) {
  const [orden, setOrden] = useState<{ col: T; asc: boolean }>({
    col: inicial,
    asc: ascInicial,
  });

  /** Pulsar otra columna la estrena por su lado útil; repetir invierte. */
  function ordenar(col: T, num?: boolean) {
    setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: !num }));
  }

  /**
   * Ordena una lista según la columna activa.
   *
   * Los textos se comparan con las reglas del español —para que las eñes y
   * los acentos caigan donde un chileno los busca— y los números como números.
   */
  function ordenarPor<F>(filas: F[], valor: (f: F, col: T) => string | number | null): F[] {
    return [...filas].sort((a, b) => {
      const x = valor(a, orden.col) ?? "";
      const y = valor(b, orden.col) ?? "";
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "es");
      return orden.asc ? cmp : -cmp;
    });
  }

  return { orden, ordenar, ordenarPor };
}

export function Cabecera<T extends string>({
  columnas,
  orden,
  ordenar,
  acciones,
}: {
  columnas: readonly Columna<T>[];
  orden: { col: T; asc: boolean };
  ordenar: (col: T, num?: boolean) => void;
  /** Si la tabla tiene una última columna de botones, deja su hueco. */
  acciones?: boolean;
}) {
  return (
    <thead>
      <tr className="border-b border-[color:var(--linea)] text-left">
        {columnas.map((c) => (
          <th key={c.id} className={`rotulo px-3 py-3 first:px-5 ${c.clase ?? ""}`}>
            {c.fija ? (
              c.texto
            ) : (
              <button
                onClick={() => ordenar(c.id, c.num)}
                className={`rotulo transition hover:text-[color:var(--tinta)] ${
                  orden.col === c.id ? "!text-[color:var(--tinta)]" : ""
                }`}
              >
                {c.texto}
                <span className="ml-1 inline-block w-2 text-[10px]">
                  {orden.col === c.id ? (orden.asc ? "▲" : "▼") : ""}
                </span>
              </button>
            )}
          </th>
        ))}
        {acciones && <th className="rotulo px-3 py-3" />}
      </tr>
    </thead>
  );
}
