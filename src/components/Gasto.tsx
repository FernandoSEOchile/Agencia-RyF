"use client";

import { useEffect, useState } from "react";

interface Concepto {
  servicio: string;
  concepto: string;
  monto: number;
  veces: number;
}

interface Dia {
  dia: string;
  claude: number;
  dataforseo: number;
}

interface Datos {
  desde: string;
  hasta: string;
  total: number;
  claude: number;
  dataforseo: number;
  porConcepto: Concepto[];
  porDia: Dia[];
  error?: string;
}

const PERIODOS = [
  [7, "7 días"],
  [28, "28 días"],
  [90, "3 meses"],
  [365, "1 año"],
] as const;

function fecha(diasAtras: number): string {
  return new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
}

const dolares = (n: number) =>
  n >= 1 ? `US$${n.toFixed(2)}` : n > 0 ? `US$${n.toFixed(4)}` : "US$0";

export default function Gasto({ clienteId }: { clienteId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<number | null>(28);
  const [desde, setDesde] = useState(fecha(28));
  const [hasta, setHasta] = useState(fecha(0));

  async function cargar(d: string, h: string) {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/gasto?cliente=${encodeURIComponent(clienteId)}&desde=${d}&hasta=${h}`
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo leer el gasto.");
      setDatos(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(desde, hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  function elegirPeriodo(n: number) {
    setDias(n);
    setDesde(fecha(n));
    setHasta(fecha(0));
  }

  const cima = Math.max(1, ...(datos?.porDia ?? []).map((d) => d.claude + d.dataforseo));

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmentos">
          {PERIODOS.map(([n, texto]) => (
            <button
              key={n}
              onClick={() => elegirPeriodo(n)}
              className={`segmento ${dias === n ? "segmento-activo" : ""}`}
            >
              {texto}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[12px] text-[color:var(--tinta-media)]">
          desde
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => {
              setDias(null);
              setDesde(e.target.value);
            }}
            className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[12px] outline-none focus:border-[color:var(--acento)]"
          />
          hasta
          <input
            type="date"
            value={hasta}
            min={desde}
            max={fecha(0)}
            onChange={(e) => {
              setDias(null);
              setHasta(e.target.value);
            }}
            className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[12px] outline-none focus:border-[color:var(--acento)]"
          />
        </label>

        {cargando && <span className="text-[12px] text-[color:var(--tinta-suave)]">cargando…</span>}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}

      {datos && (
        <>
          <dl className="tarjeta mt-4 grid grid-cols-3 divide-x divide-[color:var(--linea)] overflow-hidden">
            {[
              ["Total", datos.total, ""],
              ["Claude", datos.claude, ""],
              ["API de SEO", datos.dataforseo, ""],
            ].map(([k, v, color]) => (
              <div key={String(k)} className="px-5 py-4">
                <dt className="rotulo">{String(k)}</dt>
                <dd className={`mt-1 text-[24px] font-semibold tabular-nums ${color}`}>
                  {dolares(Number(v))}
                </dd>
              </div>
            ))}
          </dl>

          {datos.porDia.length > 1 && (
            <div className="tarjeta mt-3 p-5">
              <p className="rotulo">Por día</p>
              {/* Barras apiladas: importa tanto el total del día como de dónde
                  vino, y dos series separadas obligarían a comparar de memoria. */}
              <div className="mt-4 flex h-28 items-end gap-[3px]">
                {datos.porDia.map((d) => {
                  const total = d.claude + d.dataforseo;
                  return (
                    <div
                      key={d.dia}
                      className="group relative flex-1 cursor-default"
                      title={`${d.dia} · ${dolares(total)}  (Claude ${dolares(d.claude)} · SEO ${dolares(d.dataforseo)})`}
                    >
                      <div
                        style={{ height: `${(d.dataforseo / cima) * 100}%` }}
                        className="w-full bg-[color:var(--acento)]/70"
                      />
                      <div
                        style={{ height: `${(d.claude / cima) * 100}%` }}
                        className="w-full bg-[color:var(--tinta)]/80"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 flex flex-wrap gap-4 text-[11px] text-[color:var(--tinta-suave)]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 bg-[color:var(--tinta)]/80" /> Claude
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 bg-[color:var(--acento)]/70" /> API de SEO
                </span>
                <span className="ml-auto">
                  {datos.desde} a {datos.hasta}
                </span>
              </p>
            </div>
          )}

          <div className="tarjeta mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[color:var(--linea)] text-left">
                  <th className="rotulo px-5 py-3">Concepto</th>
                  <th className="rotulo px-3 py-3">Servicio</th>
                  <th className="rotulo px-3 py-3 text-right">Veces</th>
                  <th className="rotulo px-5 py-3 text-right">Gasto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--linea)]">
                {datos.porConcepto.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[color:var(--tinta-suave)]">
                      Sin gasto registrado en este periodo.
                    </td>
                  </tr>
                ) : (
                  datos.porConcepto.map((c) => (
                    <tr key={`${c.servicio}-${c.concepto}`} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5 font-medium capitalize">{c.concepto}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`pastilla ${
                            c.servicio === "claude"
                              ? "bg-black/[0.06] text-[color:var(--tinta-media)]"
                              : "bg-[color:var(--acento)]/10 text-[color:var(--acento)]"
                          }`}
                        >
                          {c.servicio === "claude" ? "Claude" : "SEO"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {c.veces}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                        {dolares(c.monto)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
            Cada operación se apunta en el momento y con el importe ya calculado, no recalculado
            después: las tarifas cambian y el resultado sería una cifra que nunca se pagó. Se cuenta el
            chat, la corrección de arquitectura, la medición de posiciones y el análisis de SERP.
            Search Console no aparece porque no cuesta nada.
          </p>
        </>
      )}
    </div>
  );
}
