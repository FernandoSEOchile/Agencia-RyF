"use client";

import { useEffect, useState } from "react";

/**
 * Core Web Vitals de unas pocas páginas.
 *
 * La última medición se guarda porque el cuadro de la rejilla tiene que poder
 * enseñar una nota al abrir la pestaña, y medir de verdad cuesta medio minuto
 * por página. Una fila por URL, sobrescrita: interesa la foto de ahora.
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
  alMedir,
}: {
  clienteId: string;
  puedeMedir: boolean;
  /** Avisa de la nota nueva para que el cuadro de arriba se actualice solo. */
  alMedir?: (nota: number | null) => void;
}) {
  const [mediciones, setMediciones] = useState<Medicion[] | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrirse se enseña lo último guardado, sin medir: si hubiera que medir
  // para ver algo, desplegar el cuadro costaría medio minuto por página.
  useEffect(() => {
    fetch(`/api/velocidad?cliente=${clienteId}`)
      .then((r) => r.json())
      .then((d) => setMediciones(d.mediciones ?? []))
      .catch(() => {});
  }, [clienteId]);

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
      const nuevas: Medicion[] = d.mediciones ?? [];
      setMediciones(nuevas);

      const conNota = nuevas.filter((m) => m.nota != null);
      alMedir?.(
        conNota.length
          ? Math.round(conNota.reduce((t, m) => t + (m.nota ?? 0), 0) / conNota.length)
          : null
      );
    } catch {
      setError("No se pudo medir. Puede que Google tardara demasiado.");
    } finally {
      setMidiendo(false);
    }
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-[color:var(--tinta-suave)]">
          Mide la portada y las dos páginas más lentas del último rastreo.
        </p>

        {puedeMedir && (
          <button onClick={medir} disabled={midiendo} className="boton disabled:opacity-50">
            {midiendo ? "Midiendo…" : mediciones?.length ? "Medir de nuevo" : "Medir velocidad"}
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
