"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import Plataforma from "@/components/Plataforma";
import { dinero, fecha, miles } from "@/lib/formato";
import type { FilaCartera } from "@/lib/cartera";

/**
 * La tabla de la portada: cada cliente en una fila con sus cifras.
 *
 * Antes eran tarjetas con la versión del conector y poco más; para saber cómo
 * iba un cliente había que entrar en su ficha. Aquí la cartera entera se lee
 * de un vistazo y se ordena por lo que preocupe: quién perdió top 10, a quién
 * no lo nombra la IA, dónde se está gastando más.
 */

type Col = "nombre" | "estado" | "top10" | "gsc" | "ia" | "tecnico" | "enlaces" | "gasto";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "nombre", texto: "Cliente" },
  { id: "estado", texto: "Estado" },
  { id: "top10", texto: "Top 10", clase: "text-right", num: true },
  { id: "gsc", texto: "En Google", clase: "text-right", num: true },
  { id: "ia", texto: "IA", clase: "text-right", num: true },
  { id: "tecnico", texto: "Rotas", clase: "text-right", num: true },
  { id: "enlaces", texto: "Dominios", clase: "text-right", num: true },
  { id: "gasto", texto: "Gasto mes", clase: "text-right", num: true },
];

const NIVEL = { ok: 0, neutro: 1, aviso: 2, caido: 3 } as const;

/** La variación contra la medición anterior. En «rotas» bajar es lo bueno. */
function Delta({ n, invertido = false }: { n: number | null; invertido?: boolean }) {
  if (n === null) return null;
  if (n === 0) return <span className="text-[11.5px] text-[color:var(--tinta-suave)]">=</span>;
  const bien = invertido ? n < 0 : n > 0;
  return (
    <span className={`text-[11.5px] font-medium tabular-nums ${bien ? "text-emerald-700" : "text-red-600"}`}>
      {n > 0 ? "▲" : "▼"} {Math.abs(n)}
    </span>
  );
}

function Cifra({ valor, de, titulo }: { valor: string; de?: string; titulo?: string }) {
  return (
    <span className="cifra text-[16px] leading-none tabular-nums" title={titulo}>
      {valor}
      {de && <span className="ml-1 text-[12px] font-normal text-[color:var(--tinta-suave)]">/ {de}</span>}
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

function mesCorto(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" });
}

export default function Cartera({ filas }: { filas: FilaCartera[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const { orden, ordenar, ordenarPor } = useOrden<Col>("nombre", true);

  const q = busca.trim().toLowerCase();
  const visibles = ordenarPor(
    filas.filter((f) => !q || `${f.nombre} ${f.dominio}`.toLowerCase().includes(q)),
    (f, c) => {
      switch (c) {
        case "nombre":
          return f.nombre;
        case "estado":
          return NIVEL[f.estado.nivel];
        case "top10":
          return f.top10;
        case "gsc":
          return f.gsc?.consultas ?? null;
        case "ia":
          return f.ia?.visibles ?? null;
        case "tecnico":
          return f.tecnico?.rotas ?? null;
        case "enlaces":
          return f.enlaces?.dominios ?? null;
        case "gasto":
          return f.gastoMes;
      }
    }
  );

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente por nombre o dominio…"
          aria-label="Buscar cliente"
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
                onClick={() => router.push(`/panel/clientes/${f.id}`)}
                className="cursor-pointer transition hover:bg-black/[0.02]"
              >
                <td className="px-5 py-3">
                  <Link href={`/panel/clientes/${f.id}`} className="block min-w-0" onClick={(e) => e.stopPropagation()}>
                    <span className="block truncate text-[15px] font-semibold">{f.nombre}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[color:var(--tinta-suave)]">
                      <Plataforma cual={f.plataforma} tam={13} />
                      <span className="truncate">{f.dominio}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span
                    title={f.estado.detalle}
                    className={`pastilla ${
                      f.estado.nivel === "caido"
                        ? "bg-red-50 text-red-700"
                        : f.estado.nivel === "aviso"
                          ? "bg-amber-50 text-amber-700"
                          : f.estado.nivel === "ok" && f.estado.texto === "Escritura"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-black/[0.05] text-[color:var(--tinta-media)]"
                    }`}
                  >
                    {f.estado.texto}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  {f.top10 === null ? (
                    <Vacio titulo={f.seguidas ? "Seguidas pero sin medir todavía" : "Sin palabras en seguimiento"} />
                  ) : (
                    <span className="flex flex-col items-end gap-0.5">
                      <Cifra valor={miles(f.top10)} de={miles(f.seguidas)} titulo="Palabras seguidas en el top 10 de Google" />
                      <Delta n={f.top10Delta} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {!f.gsc ? (
                    <Vacio titulo="Sin Search Console leído: conéctalo o abre su Panorama" />
                  ) : (
                    <span className="flex flex-col items-end gap-0.5">
                      <Cifra valor={miles(f.gsc.consultas)} titulo={`Búsquedas por las que salió en ${mesCorto(f.gsc.mes)} (Search Console)`} />
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11.5px] text-[color:var(--tinta-suave)]">{mesCorto(f.gsc.mes)}</span>
                        <Delta n={f.gsc.delta} />
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {!f.ia ? (
                    <Vacio titulo="Sin preguntas de IA definidas" />
                  ) : (
                    <span className="flex flex-col items-end gap-0.5">
                      <Cifra valor={miles(f.ia.visibles)} de={miles(f.ia.total)} titulo="Preguntas en las que ChatGPT o Gemini lo nombran" />
                      <Delta n={f.ia.delta} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {!f.tecnico ? (
                    <Vacio titulo="Sin rastreo técnico" />
                  ) : (
                    <span className="flex flex-col items-end gap-0.5">
                      <Cifra
                        valor={miles(f.tecnico.rotas)}
                        de={miles(f.tecnico.paginas)}
                        titulo={`Páginas rotas de las rastreadas · ${fecha(f.tecnico.medido)}`}
                      />
                      <Delta n={f.tecnico.delta} invertido />
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {!f.enlaces ? (
                    <Vacio titulo="Perfil de enlaces sin consultar" />
                  ) : (
                    <Cifra valor={miles(f.enlaces.dominios)} titulo={`Dominios que enlazan · ${fecha(f.enlaces.medido)}`} />
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="flex flex-col items-end gap-0.5">
                    <Cifra valor={dinero(f.gastoMes, "US$0")} titulo="Gasto en proveedores este mes" />
                    {f.tarifa != null && (
                      <span className="text-[11.5px] text-[color:var(--tinta-suave)]">de {dinero(f.tarifa)}</span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
