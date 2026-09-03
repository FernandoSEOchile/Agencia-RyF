"use client";

import { useState } from "react";

/**
 * Core Web Vitals de unas pocas páginas.
 *
 * No se guarda en la base a propósito, de momento: es una medición puntual que
 * se mira y se comenta con el cliente, y guardar histórico sin que nadie lo
 * haya pedido añade una tabla y una pantalla que nadie abriría.
 */

interface Medicion {
  url: string;
  nota: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  reales: boolean;
  error: string | null;
}

/** Los umbrales son los de Google, no inventados. */
function color(valor: number | null, bien: number, regular: number) {
  if (valor == null) return "text-[color:var(--tinta-suave)]";
  if (valor <= bien) return "text-emerald-700";
  if (valor <= regular) return "text-amber-700";
  return "text-red-600";
}

function colorNota(n: number | null) {
  if (n == null) return "text-[color:var(--tinta-suave)]";
  if (n >= 90) return "text-emerald-700";
  if (n >= 50) return "text-amber-700";
  return "text-red-600";
}

export default function Velocidad({
  clienteId,
  puedeMedir,
}: {
  clienteId: string;
  puedeMedir: boolean;
}) {
  const [mediciones, setMediciones] = useState<Medicion[] | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function medir() {
    setMidiendo(true);
    setError(null);

    try {
      const r = await fetch("/api/velocidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }
      setMediciones(d.mediciones ?? []);
    } catch {
      setError("No se pudo medir. Puede que Google tardara demasiado.");
    } finally {
      setMidiendo(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Velocidad en móvil</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-[color:var(--tinta-media)]">
            Mide la portada y las dos páginas más lentas del último rastreo con PageSpeed de
            Google. En móvil, que es lo que Google usa para decidir posiciones.
          </p>
        </div>

        {puedeMedir && (
          <button onClick={medir} disabled={midiendo} className="boton disabled:opacity-50">
            {midiendo ? "Midiendo…" : "Medir velocidad"}
          </button>
        )}
      </div>

      {midiendo && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
          Tarda un minuto largo: Google carga cada página de verdad en un navegador.
        </p>
      )}

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}

      {mediciones && mediciones.length > 0 && (
        <div className="tarjeta mt-4 divide-y divide-[color:var(--linea)] overflow-hidden">
          {mediciones.map((m) => (
            <div key={m.url} className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
              <div className="min-w-[240px] flex-1">
                <p className="truncate text-[13px]">{m.url}</p>
                <p className="mt-0.5 text-[11px] text-[color:var(--tinta-suave)]">
                  {m.error
                    ? m.error
                    : m.reales
                      ? "datos de usuarios reales, últimos 28 días"
                      : "simulación de laboratorio · el sitio no tiene tráfico suficiente para datos reales"}
                </p>
              </div>

              <div className="text-center">
                <p className={`text-[26px] font-semibold tabular-nums ${colorNota(m.nota)}`}>
                  {m.nota ?? "—"}
                </p>
                <p className="text-[11px] text-[color:var(--tinta-suave)]">nota</p>
              </div>

              <div className="text-center">
                <p className={`text-[15px] font-medium tabular-nums ${color(m.lcp, 2.5, 4)}`}>
                  {m.lcp == null ? "—" : `${m.lcp.toFixed(1)} s`}
                </p>
                <p className="text-[11px] text-[color:var(--tinta-suave)]" title="Largest Contentful Paint: cuánto tarda en verse lo principal">
                  carga
                </p>
              </div>

              <div className="text-center">
                <p className={`text-[15px] font-medium tabular-nums ${color(m.cls, 0.1, 0.25)}`}>
                  {m.cls == null ? "—" : m.cls.toFixed(2)}
                </p>
                <p className="text-[11px] text-[color:var(--tinta-suave)]" title="Cumulative Layout Shift: cuánto baila la página mientras carga">
                  estabilidad
                </p>
              </div>

              <div className="text-center">
                <p className={`text-[15px] font-medium tabular-nums ${color(m.inp, 200, 500)}`}>
                  {m.inp == null ? "—" : `${m.inp} ms`}
                </p>
                <p className="text-[11px] text-[color:var(--tinta-suave)]" title="Interaction to Next Paint: cuánto tarda en responder a un toque">
                  respuesta
                </p>
              </div>

              <div className="text-center">
                <p className={`text-[15px] font-medium tabular-nums ${color(m.ttfb, 800, 1800)}`}>
                  {m.ttfb == null ? "—" : `${Math.round(m.ttfb)} ms`}
                </p>
                <p className="text-[11px] text-[color:var(--tinta-suave)]" title="Time To First Byte: lo que tarda el servidor. Si va mal, es el hosting">
                  servidor
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
