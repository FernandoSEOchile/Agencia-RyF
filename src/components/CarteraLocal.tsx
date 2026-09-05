"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import { fecha, miles } from "@/lib/formato";
import type { FilaLocal } from "@/lib/carteraLocal";

/**
 * La tabla del módulo Local: cada cliente con su ficha y su cuadrícula.
 *
 * Se lee como la cartera de la portada, pero solo con lo local: quién tiene
 * la ficha de Google Business en forma, quién sale en el paquete de tres y
 * quién le está ganando la calle. Pulsar una fila lleva a la pestaña Local
 * de ese cliente, que es donde se trabaja.
 */

type Col = "nombre" | "ficha" | "keyword" | "top3" | "visible" | "media" | "rival" | "medido";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "nombre", texto: "Cliente" },
  { id: "ficha", texto: "Ficha de Google", clase: "text-right", num: true },
  { id: "keyword", texto: "Búsqueda local" },
  { id: "top3", texto: "En el top 3", clase: "text-right", num: true },
  { id: "visible", texto: "Aparece", clase: "text-right", num: true },
  { id: "media", texto: "Puesto medio", clase: "text-right" },
  { id: "rival", texto: "Quién manda" },
  { id: "medido", texto: "Medido", clase: "text-right", num: true },
];

function colorNota(n: number) {
  return n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-600" : "text-red-600";
}

function Delta({ n, sufijo = "" }: { n: number | null; sufijo?: string }) {
  if (n === null) return null;
  if (n === 0) return <span className="text-[11.5px] text-[color:var(--tinta-suave)]">=</span>;
  return (
    <span className={`text-[11.5px] font-medium tabular-nums ${n > 0 ? "text-emerald-700" : "text-red-600"}`}>
      {n > 0 ? "▲" : "▼"} {Math.abs(n)}
      {sufijo}
    </span>
  );
}

function Vacio({ titulo }: { titulo: string }) {
  return (
    <span className="text-[14px] text-[color:var(--tinta-suave)]" title={titulo}>
      —
    </span>
  );
}

export default function CarteraLocal({ filas }: { filas: FilaLocal[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const { orden, ordenar, ordenarPor } = useOrden<Col>("top3", false);

  const q = busca.trim().toLowerCase();
  const visibles = ordenarPor(
    filas.filter((f) => !q || `${f.nombre} ${f.dominio} ${f.barrido?.keyword ?? ""} ${f.ficha?.negocio ?? ""}`.toLowerCase().includes(q)),
    (f, c) => {
      switch (c) {
        case "nombre":
          return f.nombre;
        case "ficha":
          return f.ficha?.nota ?? null;
        case "keyword":
          return f.barrido?.keyword ?? "";
        case "top3":
          return f.barrido?.enTop3 ?? null;
        case "visible":
          return f.barrido?.visible ?? null;
        case "media":
          return f.barrido?.media ?? null;
        case "rival":
          return f.barrido?.rival ?? "";
        case "medido":
          return f.barrido?.creado ?? f.ficha?.creado ?? "";
      }
    }
  );

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente, negocio o búsqueda…"
          aria-label="Buscar"
          className="w-full max-w-sm rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-2 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
        />
        {q && (
          <span className="text-[14px] text-[color:var(--tinta-suave)]">
            {visibles.length} de {filas.length}
          </span>
        )}
      </div>

      <div className="tarjeta tarjeta-destacada mt-3 overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-[14px]">
          <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
          <tbody className="divide-y divide-[color:var(--linea)]">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-5 py-10 text-center text-[14px] text-[color:var(--tinta-suave)]">
                  Nada coincide con «{busca}».
                </td>
              </tr>
            )}
            {visibles.map((f) => (
              <tr
                key={f.id}
                onClick={() => router.push(`/panel/clientes/${f.id}?t=local`)}
                className="cursor-pointer transition hover:bg-black/[0.02]"
              >
                <td className="px-5 py-3">
                  <Link href={`/panel/clientes/${f.id}?t=local`} className="block min-w-0" onClick={(e) => e.stopPropagation()}>
                    <span className="block truncate text-[15px] font-semibold">{f.nombre}</span>
                    <span className="block truncate text-[13px] text-[color:var(--tinta-suave)]">{f.ficha?.negocio ?? f.dominio}</span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right">
                  {f.ficha ? (
                    <span className="flex flex-col items-end gap-0.5">
                      <span className={`cifra text-[16px] leading-none tabular-nums ${colorNota(f.ficha.nota)}`} title={`Auditada ${fecha(f.ficha.creado)}`}>
                        {f.ficha.nota}
                        <span className="ml-0.5 text-[12px] font-normal text-[color:var(--tinta-suave)]">/100</span>
                      </span>
                      <Delta n={f.ficha.delta} />
                    </span>
                  ) : (
                    <Vacio titulo="Ficha de Google Business sin auditar" />
                  )}
                </td>
                <td className="px-3 py-3">
                  {f.barrido ? (
                    <span className="block max-w-[220px] truncate" title={f.barrido.keyword}>
                      {f.barrido.keyword}
                    </span>
                  ) : (
                    <Vacio titulo="Sin cuadrícula medida" />
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {f.barrido ? (
                    <span className="flex flex-col items-end gap-0.5">
                      <span
                        className={`cifra text-[16px] leading-none tabular-nums ${f.barrido.enTop3 >= 50 ? "text-emerald-600" : f.barrido.enTop3 >= 20 ? "text-amber-600" : "text-red-600"}`}
                        title={`Está entre los tres primeros en el ${f.barrido.enTop3}% de los ${miles(f.barrido.medidos)} puntos del mapa`}
                      >
                        {f.barrido.enTop3}%
                      </span>
                      <Delta n={f.barrido.deltaTop3} sufijo=" pts" />
                    </span>
                  ) : (
                    <Vacio titulo="Sin cuadrícula medida" />
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {f.barrido ? (
                    <span className="cifra text-[16px] leading-none tabular-nums" title="Puntos del mapa en los que aparece entre los resultados">
                      {f.barrido.visible}%
                    </span>
                  ) : (
                    <Vacio titulo="Sin cuadrícula medida" />
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {f.barrido?.media != null ? f.barrido.media : <Vacio titulo="Sin cuadrícula medida" />}
                </td>
                <td className="px-3 py-3">
                  {f.barrido?.rival ? (
                    <span className="block max-w-[220px] truncate text-[color:var(--tinta-media)]" title={`Sale primero donde este cliente no: ${f.barrido.rival}`}>
                      {f.barrido.rival}
                    </span>
                  ) : f.barrido ? (
                    <span className="text-[13px] text-emerald-700">nadie: manda el cliente</span>
                  ) : (
                    <Vacio titulo="Sin cuadrícula medida" />
                  )}
                </td>
                <td className="px-3 py-3 text-right text-[13px] tabular-nums text-[color:var(--tinta-suave)]">
                  {f.barrido ? fecha(f.barrido.creado) : f.ficha ? fecha(f.ficha.creado) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
