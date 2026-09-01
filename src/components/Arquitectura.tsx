"use client";

import { useState } from "react";

export interface NodoVista {
  id: string;
  slug: string;
  nombre: string;
  nivel: number;
  volumen: number;
  keywords: number;
  estado: string;
  urlDestino: string | null;
  confianza: number | null;
  nota: string | null;
  comoSeCotejo: string | null;
}

export interface ArquitecturaVista {
  id: string;
  nombre: string;
  archivo: string;
  creado: string;
  cotejado: string | null;
  nodos: NodoVista[];
}

const FILTROS = [
  ["todo", "Todo"],
  ["falta", "Por crear"],
  ["dudosa", "Dudosas"],
  ["creada", "Creadas"],
] as const;

function estilo(estado: string) {
  if (estado === "creada") return "bg-emerald-50 text-emerald-700";
  if (estado === "dudosa") return "bg-amber-50 text-amber-800";
  if (estado === "falta") return "bg-red-50 text-red-700";
  return "bg-neutral-100 text-neutral-600";
}

function etiqueta(estado: string) {
  if (estado === "creada") return "creada";
  if (estado === "dudosa") return "dudosa";
  if (estado === "falta") return "por crear";
  return estado;
}

export default function Arquitectura({
  clienteId,
  actual,
  puedeSubir,
}: {
  clienteId: string;
  actual: ArquitecturaVista | null;
  puedeSubir: boolean;
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("todo");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    setSubiendo(true);
    setError(null);
    setAviso(null);

    const cuerpo = new FormData();
    cuerpo.append("cliente", clienteId);
    cuerpo.append("archivo", f);

    try {
      const r = await fetch("/api/arquitectura", { method: "POST", body: cuerpo });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo procesar el archivo.");
      setAviso(`Leídas ${j.secciones} secciones y cotejadas contra ${j.candidatos} URLs del sitio.`);
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSubiendo(false);
    }
  }

  async function recotejar() {
    if (!actual) return;
    setSubiendo(true);
    setError(null);
    try {
      const r = await fetch("/api/arquitectura", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquitecturaId: actual.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo recotejar.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setSubiendo(false);
    }
  }

  const nodos = actual?.nodos ?? [];
  const visibles = filtro === "todo" ? nodos : nodos.filter((n) => n.estado === filtro);

  const cuenta = (e: string) => nodos.filter((n) => n.estado === e).length;
  const volumenPerdido = nodos.filter((n) => n.estado === "falta").reduce((s, n) => s + n.volumen, 0);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[#ff6b00]/10 px-2.5 py-1 text-[11px] font-semibold text-[#ff6b00]">
          beta
        </span>

        {puedeSubir && (
          <label className="cursor-pointer rounded-lg border border-neutral-300 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-[#ff6b00] hover:text-[#ff6b00]">
            {subiendo ? "Procesando…" : actual ? "Subir otra versión" : "Subir Excel AST"}
            <input
              type="file"
              accept=".xlsx,.xlsm"
              hidden
              disabled={subiendo}
              onChange={subir}
            />
          </label>
        )}

        {actual && puedeSubir && (
          <button
            onClick={recotejar}
            disabled={subiendo}
            className="rounded-lg border border-neutral-300 px-3.5 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-[#ff6b00] hover:text-[#ff6b00] disabled:opacity-40"
          >
            Volver a cotejar
          </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {aviso && <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{aviso}</p>}

      {!actual ? (
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-neutral-700">
            No hay ninguna arquitectura cargada para este cliente.
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-neutral-500">
            Sube el Excel con la hoja «AST». Se leerán las secciones previstas y se cruzarán con lo que
            existe en el sitio para ver qué está creado, con qué URL, y qué falta.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4">
            {[
              ["Secciones", String(nodos.length), ""],
              ["Creadas", String(cuenta("creada")), "text-emerald-700"],
              ["Dudosas", String(cuenta("dudosa")), "text-amber-700"],
              ["Por crear", String(cuenta("falta")), "text-red-700"],
            ].map(([k, v, color]) => (
              <div key={k} className="bg-white px-4 py-3">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{k}</dt>
                <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${color || "text-neutral-900"}`}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          {volumenPerdido > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              Las secciones por crear suman{" "}
              <strong className="tabular-nums text-neutral-800">
                {volumenPerdido.toLocaleString("es-CL")}
              </strong>{" "}
              búsquedas mensuales que hoy el sitio no puede capturar.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {FILTROS.map(([id, texto]) => (
              <button
                key={id}
                onClick={() => setFiltro(id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filtro === id
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {texto}
              </button>
            ))}
            <span className="ml-auto text-xs text-neutral-400">
              {actual.archivo}
              {actual.cotejado && ` · cotejado ${actual.cotejado.slice(0, 16).replace("T", " ")}`}
            </span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400">
                  <th className="px-4 py-2.5 font-semibold">Sección prevista</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Volumen</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">URL que la ataca</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibles.map((n) => (
                  <tr key={n.id} className="align-top hover:bg-neutral-50">
                    <td className="max-w-[280px] px-4 py-2.5">
                      {/* La sangría hace visible la jerarquía sin una columna extra. */}
                      <div style={{ paddingLeft: (n.nivel - 1) * 14 }}>
                        <p className="truncate font-medium text-neutral-900">{n.nombre}</p>
                        <p className="truncate font-mono text-[11px] text-neutral-400">{n.slug}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-neutral-600">
                      {n.volumen ? n.volumen.toLocaleString("es-CL") : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${estilo(
                          n.estado
                        )}`}
                      >
                        {etiqueta(n.estado)}
                      </span>
                      {n.estado === "dudosa" && n.confianza !== null && (
                        <span className="ml-1.5 text-[11px] tabular-nums text-neutral-400">
                          {n.confianza}%
                        </span>
                      )}
                    </td>
                    <td className="max-w-[300px] px-4 py-2.5 text-xs">
                      {n.urlDestino ? (
                        <>
                          <a
                            href={n.urlDestino}
                            target="_blank"
                            rel="noopener"
                            className="block truncate text-neutral-700 underline-offset-2 hover:text-[#ff6b00] hover:underline"
                            title={n.urlDestino}
                          >
                            {n.urlDestino.replace(/^https?:\/\/[^/]+/, "")}
                          </a>
                          {n.nota && <p className="mt-0.5 text-[11px] text-neutral-400">{n.nota}</p>}
                        </>
                      ) : (
                        <span className="text-neutral-300">sin URL — hay que crearla</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-neutral-400">
            El cruce es automático: coincidencia exacta de slug, y si no, parecido por nombre. Lo que queda
            entre medias se marca como dudoso en vez de decidirlo por ti — dar por creada una sección que
            no lo está es peor que dejarla en duda.
          </p>
        </>
      )}
    </div>
  );
}
