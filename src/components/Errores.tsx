"use client";

import { useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

/**
 * Lo que ha fallado últimamente, en una sola tabla.
 *
 * Mezcla dos orígenes a propósito —las revisiones del vigía y los fallos de las
 * herramientas— porque quien mira esta pantalla no se pregunta «¿falló el vigía
 * o falló una herramienta?», se pregunta «¿qué está roto?». Separarlos en dos
 * tablas obligaría a cruzarlas a ojo para ver que el sitio caído y la
 * herramienta que no escribe son el mismo problema.
 */

export interface Fallo {
  id: string;
  cuando: string;
  origen: "vigia" | "herramienta";
  cliente: string;
  que: string;
  detalle: string;
}

type Col = "cuando" | "cliente" | "que" | "detalle";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "cuando", texto: "Cuándo" },
  { id: "cliente", texto: "Sitio" },
  { id: "que", texto: "Qué" },
  { id: "detalle", texto: "Qué pasó" },
];

export default function Errores({ fallos }: { fallos: Fallo[] }) {
  const [busca, setBusca] = useState("");
  const { orden, ordenar, ordenarPor } = useOrden<Col>("cuando", false);

  const texto = busca.trim().toLowerCase();
  const filtrados = texto
    ? fallos.filter((f) =>
        `${f.cliente} ${f.que} ${f.detalle}`.toLowerCase().includes(texto)
      )
    : fallos;

  const filas = ordenarPor(filtrados, (f, c) =>
    c === "cuando" ? f.cuando : c === "cliente" ? f.cliente : c === "que" ? f.que : f.detalle
  );

  if (fallos.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
        <p className="text-[15px] font-medium">Nada roto por aquí.</p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-[color:var(--tinta-media)]">
          Ni caídas ni herramientas que fallaran en los últimos siete días.
        </p>
      </div>
    );
  }

  return (
    <>
      {fallos.length > 30 && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por sitio, herramienta o mensaje…"
          className="mt-6 w-full max-w-sm rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
        />
      )}

      <div className="tarjeta mt-4 overflow-x-auto">
        <table className="w-full text-[13px]">
          <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
          <tbody className="divide-y divide-[color:var(--linea)]">
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-[12px] text-[color:var(--tinta-suave)]">
                  {f.cuando.slice(5, 16).replace("T", " ")}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{f.cliente}</td>
                <td className="px-3 py-3">
                  <span
                    className={`pastilla ${
                      f.origen === "vigia"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {f.que}
                  </span>
                </td>
                <td className="px-3 py-3 text-[color:var(--tinta-media)]">{f.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {texto && filas.length === 0 && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
          Ningún fallo coincide con «{busca}».
        </p>
      )}
    </>
  );
}
