"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Auditoría de la ficha de Google Business.
 *
 * La nota la calcula el servidor con reglas fijas; aquí solo se pinta. Esa
 * separación importa más de lo que parece: si el número lo decidiera el modelo,
 * dos auditorías seguidas darían cifras distintas y no se podría enseñar un
 * antes y un después a nadie.
 */

interface Bloque {
  id: string;
  etiqueta: string;
  puntos: number;
  tope: number;
  detalle: string;
}

interface Hallazgo {
  que: string;
  estado: "critico" | "mejorar" | "ok";
  porque: string;
}

interface Informe {
  resumen: string;
  rapidos: { titulo: string; porque: string }[];
  fuertes: string[];
}

interface Auditoria {
  id: string;
  negocio: string;
  nota: number;
  creado: string;
  coste: number;
  bloques: Bloque[];
  hallazgos: Hallazgo[];
  informe: Informe | null;
  datos: {
    categoria: string | null;
    direccion: string | null;
    resenas: number;
    nota: number | null;
  };
}

const FILTROS = [
  ["todo", "Todo"],
  ["critico", "Crítico"],
  ["mejorar", "Mejorar"],
  ["ok", "OK"],
] as const;

/** Verde a partir de 80, ámbar desde 50, rojo por debajo. */
function colorNota(n: number) {
  if (n >= 80) return "#1e8e3e";
  if (n >= 50) return "#d99400";
  return "#c0392b";
}

export default function FichaLocal({
  clienteId,
  nombreCliente,
  puedeAuditar,
}: {
  clienteId: string;
  nombreCliente: string;
  puedeAuditar: boolean;
}) {
  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [viendo, setViendo] = useState<string | null>(null);
  const [referencia, setReferencia] = useState(nombreCliente);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>("todo");

  const cargar = useCallback(async () => {
    try {
      const d = await fetch(`/api/ficha?cliente=${clienteId}`).then((r) => r.json());
      if (d.error) {
        setError(d.error);
        return;
      }
      setAuditorias(d.auditorias ?? []);
      if (!viendo && d.auditorias?.[0]) setViendo(d.auditorias[0].id);
    } catch {
      setError("No se pudieron leer las auditorías.");
    }
  }, [clienteId, viendo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function auditar() {
    if (!referencia.trim()) return;
    setCorriendo(true);
    setError(null);

    try {
      const r = await fetch("/api/ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, referencia: referencia.trim() }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }

      setViendo(d.auditoria.id);
      await cargar();
    } catch {
      setError("No se pudo auditar la ficha.");
    } finally {
      setCorriendo(false);
    }
  }

  const a = auditorias.find((x) => x.id === viendo) ?? auditorias[0] ?? null;
  const anterior = a ? auditorias.find((x) => x.creado < a.creado) : null;

  const hallazgos = a
    ? filtro === "todo"
      ? a.hallazgos
      : a.hallazgos.filter((h) => h.estado === filtro)
    : [];

  const cuenta = (e: string) => a?.hallazgos.filter((h) => h.estado === e).length ?? 0;

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Análisis de la ficha</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-[color:var(--tinta-media)]">
            Lee la ficha de Google Business del negocio y la puntúa: qué señales tiene, cómo está de
            reseñas, cuánto contenido aprovecha y cuánta presencia acumula.
          </p>
        </div>

        {puedeAuditar && (
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nombre del negocio, o cid:123456"
              className="min-w-[220px] rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none focus:border-[color:var(--acento)]"
            />
            <button
              onClick={auditar}
              disabled={corriendo || !referencia.trim()}
              className="boton-fuerte disabled:opacity-40"
              title="Consulta la ficha en Google y redacta el diagnóstico. Cuesta menos de un centavo."
            >
              {corriendo ? "Analizando…" : "Analizar ficha"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}

      {corriendo && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
          Consultando la ficha y redactando el diagnóstico. Medio minuto.
        </p>
      )}

      {!a && !corriendo && (
        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-14 text-center">
          <p className="text-[15px] font-medium">Esta ficha no se ha analizado nunca.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Escribe el nombre del negocio tal como sale en Google Maps.
          </p>
        </div>
      )}

      {a && (
        <>
          {/* La nota, con el negocio y el resumen del modelo al lado. */}
          <div className="tarjeta mt-5 flex flex-wrap items-start gap-6 p-5">
            <div className="text-center">
              <p
                className="text-[42px] font-semibold leading-none tabular-nums"
                style={{ color: colorNota(a.nota) }}
              >
                {a.nota}
                <span className="text-[20px] text-[color:var(--tinta-suave)]">/100</span>
              </p>
              {anterior && (
                <p
                  className={`mt-1.5 text-[12px] font-medium tabular-nums ${
                    a.nota > anterior.nota ? "text-emerald-700" : a.nota < anterior.nota ? "text-red-600" : "text-[color:var(--tinta-suave)]"
                  }`}
                >
                  {a.nota === anterior.nota
                    ? "igual que antes"
                    : `${a.nota > anterior.nota ? "▲" : "▼"} ${Math.abs(a.nota - anterior.nota)} desde el ${anterior.creado.slice(0, 10)}`}
                </p>
              )}
            </div>

            <div className="min-w-[240px] flex-1">
              <p className="text-[15px] font-semibold">{a.negocio}</p>
              <p className="mt-0.5 text-[12px] text-[color:var(--tinta-suave)]">
                {a.datos.categoria ?? "sin categoría"}
                {a.datos.direccion && ` · ${a.datos.direccion}`}
              </p>

              {a.informe?.resumen && (
                <p className="mt-3 border-l-2 border-[color:var(--acento)] pl-3 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
                  {a.informe.resumen}
                </p>
              )}
            </div>
          </div>

          {/* Los cuatro bloques con su barra. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {a.bloques.map((b) => {
              const parte = b.puntos / b.tope;
              return (
                <div key={b.id} className="tarjeta p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13px] font-medium">{b.etiqueta}</p>
                    <p className="text-[13px] font-semibold tabular-nums" style={{ color: colorNota(parte * 100) }}>
                      {b.puntos}
                      <span className="text-[color:var(--tinta-suave)]">/{b.tope}</span>
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${parte * 100}%`, background: colorNota(parte * 100) }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
                    {b.detalle}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Arreglos rápidos: lo que se hace hoy. */}
          {a.informe?.rapidos?.length ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <h3 className="text-[13px] font-semibold text-amber-900">
                Arreglos de menos de una hora
              </h3>
              <ol className="mt-3 flex flex-col gap-2.5">
                {a.informe.rapidos.map((q, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500 text-[11px] font-semibold tabular-nums text-white">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed">
                      <span className="font-medium">{q.titulo}</span>{" "}
                      <span className="text-[color:var(--tinta-media)]">— {q.porque}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {a.informe?.fuertes?.length ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h3 className="text-[13px] font-semibold text-emerald-900">Lo que ya está bien</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {a.informe.fuertes.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <span className="text-emerald-700">✓</span>
                    <span className="text-[color:var(--tinta-media)]">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Todos los hallazgos, filtrables. */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {FILTROS.map(([id, texto]) => (
              <button
                key={id}
                onClick={() => setFiltro(id)}
                className={`boton ${filtro === id ? "!border-[color:var(--tinta)]" : ""}`}
              >
                {texto}
                <span className="tabular-nums text-[color:var(--tinta-suave)]">
                  {id === "todo" ? a.hallazgos.length : cuenta(id)}
                </span>
              </button>
            ))}
          </div>

          <div className="tarjeta mt-3 divide-y divide-[color:var(--linea)] overflow-hidden">
            {hallazgos.map((h, i) => (
              <div key={i} className="flex gap-3 px-5 py-3.5">
                <span
                  className={`mt-0.5 shrink-0 text-[13px] ${
                    h.estado === "critico"
                      ? "text-red-600"
                      : h.estado === "mejorar"
                        ? "text-amber-600"
                        : "text-emerald-700"
                  }`}
                >
                  {h.estado === "critico" ? "✕" : h.estado === "mejorar" ? "▲" : "✓"}
                </span>
                <div>
                  <p className="text-[13px] font-medium">{h.que}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--tinta-media)]">
                    {h.porque}
                  </p>
                </div>
              </div>
            ))}

            {hallazgos.length === 0 && (
              <p className="px-5 py-6 text-center text-[13px] text-[color:var(--tinta-suave)]">
                Nada en esta categoría.
              </p>
            )}
          </div>

          {auditorias.length > 1 && (
            <div className="mt-5">
              <p className="rotulo">Análisis anteriores · verlos es gratis</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {auditorias.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setViendo(x.id)}
                    className={`boton ${x.id === a.id ? "!border-[color:var(--tinta)]" : ""}`}
                  >
                    <span className="tabular-nums font-medium" style={{ color: colorNota(x.nota) }}>
                      {x.nota}
                    </span>
                    <span className="text-[color:var(--tinta-suave)]">{x.creado.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
