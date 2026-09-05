"use client";

import { useMemo, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import { fecha, fechaLarga } from "@/lib/formato";

/**
 * Lo que ha fallado últimamente, en una sola tabla.
 *
 * Mezcla dos orígenes a propósito —las revisiones del vigía y los fallos de las
 * herramientas— porque quien mira esta pantalla no se pregunta «¿falló el vigía
 * o falló una herramienta?», se pregunta «¿qué está roto?». Separarlos en dos
 * tablas obligaría a cruzarlas a ojo para ver que el sitio caído y la
 * herramienta que no escribe son el mismo problema.
 *
 * Y se agrupa. Un conector que no responde se anota cada diez minutos: en una
 * semana son cien filas idénticas que entierran los otros fallos, que son los
 * que sí hay que leer. Un sitio caído es una fila con «×112 · desde el 3 sep».
 */

export interface Fallo {
  id: string;
  cuando: string;
  origen: "vigia" | "herramienta";
  cliente: string;
  que: string;
  detalle: string;
}

interface Grupo {
  clave: string;
  origen: Fallo["origen"];
  cliente: string;
  que: string;
  detalle: string;
  veces: number;
  ultima: string;
  primera: string;
}

type Col = "ultima" | "cliente" | "que" | "detalle" | "veces";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "ultima", texto: "Última vez" },
  { id: "cliente", texto: "Sitio" },
  { id: "que", texto: "Qué" },
  { id: "detalle", texto: "Qué pasó" },
  { id: "veces", texto: "Veces", clase: "text-right", num: true },
];

/**
 * Un mensaje que se pueda leer.
 *
 * Cuando el sitio del cliente está en mantenimiento, el conector devuelve su
 * página entera y eso acababa en la tabla como «<!DOCTYPE html>…». Se cambia
 * por lo que significa. Y se recorta: un mensaje de error de tres líneas ya
 * dijo lo que tenía que decir en la primera.
 */
function legible(detalle: string): string {
  const d = detalle.trim();
  if (/^\s*<!doctype|^\s*<html/i.test(d)) {
    return "El sitio devolvió una página HTML en vez de datos. Suele ser mantenimiento o un bloqueo del hosting.";
  }
  return d.length > 220 ? d.slice(0, 220) + "…" : d;
}

export default function Errores({ fallos }: { fallos: Fallo[] }) {
  const [busca, setBusca] = useState("");
  const { orden, ordenar, ordenarPor } = useOrden<Col>("ultima", false);

  const grupos = useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const f of fallos) {
      const detalle = legible(f.detalle);
      // La persona no forma parte de la clave: si tres personas chocan con el
      // mismo error es el mismo error.
      const clave = `${f.cliente}|${f.que}|${detalle.replace(/ · [^·]+$/, "")}`;
      const g = m.get(clave);
      if (g) {
        g.veces++;
        if (f.cuando > g.ultima) g.ultima = f.cuando;
        if (f.cuando < g.primera) g.primera = f.cuando;
      } else {
        m.set(clave, {
          clave,
          origen: f.origen,
          cliente: f.cliente,
          que: f.que,
          detalle,
          veces: 1,
          ultima: f.cuando,
          primera: f.cuando,
        });
      }
    }
    return [...m.values()];
  }, [fallos]);

  const texto = busca.trim().toLowerCase();
  const filtrados = texto
    ? grupos.filter((g) => `${g.cliente} ${g.que} ${g.detalle}`.toLowerCase().includes(texto))
    : grupos;

  const filas = ordenarPor(filtrados, (g, c) =>
    c === "ultima"
      ? g.ultima
      : c === "cliente"
        ? g.cliente
        : c === "que"
          ? g.que
          : c === "veces"
            ? g.veces
            : g.detalle
  );

  if (fallos.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-16 text-center">
        <p className="text-[15px] font-medium">Nada roto por aquí.</p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-[color:var(--tinta-media)]">
          Ni caídas ni herramientas que fallaran en los últimos siete días.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {grupos.length > 12 && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por sitio, herramienta o mensaje…"
            aria-label="Buscar fallos"
            className="w-full max-w-sm rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
          />
        )}
        <p className="text-[14px] text-[color:var(--tinta-suave)]">
          {grupos.length} {grupos.length === 1 ? "fallo distinto" : "fallos distintos"} · {fallos.length}{" "}
          {fallos.length === 1 ? "anotación" : "anotaciones"}
        </p>
      </div>

      <div className="tarjeta mt-4 overflow-x-auto">
        <table className="w-full text-[14px]">
          <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
          <tbody className="divide-y divide-[color:var(--linea)]">
            {filas.map((g) => (
              <tr key={g.clave}>
                <td
                  className="whitespace-nowrap px-5 py-3 tabular-nums text-[13px] text-[color:var(--tinta-suave)]"
                  title={fechaLarga(g.ultima)}
                >
                  {fecha(g.ultima, { hora: true })}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{g.cliente}</td>
                <td className="px-3 py-3">
                  <span
                    className={`pastilla ${
                      g.origen === "vigia" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {g.que}
                  </span>
                </td>
                <td className="px-3 py-3 text-[color:var(--tinta-media)]">
                  {g.detalle}
                  {g.veces > 1 && (
                    <span className="mt-0.5 block text-[12px] text-[color:var(--tinta-suave)]">
                      desde {fecha(g.primera, { hora: true })}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                  {g.veces > 1 ? (
                    <span className="pastilla bg-black/[0.05] text-[color:var(--tinta)]">×{g.veces}</span>
                  ) : (
                    <span className="text-[color:var(--tinta-suave)]">1</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {texto && filas.length === 0 && (
        <p className="mt-3 text-[14px] text-[color:var(--tinta-media)]">
          Ningún fallo coincide con «{busca}».
        </p>
      )}
    </>
  );
}
