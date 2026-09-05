"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmar } from "@/components/Confirmar";
import Esqueleto from "@/components/Esqueleto";
import { dinero, fecha, miles } from "@/lib/formato";
import { descargarCsv } from "@/lib/csv";

/**
 * Competidores: el cliente contra sus rivales, con lo que ya se pagó.
 *
 * Tres fuentes cruzadas por dominio: la SERP de cada palabra seguida (trae a
 * todos los que posicionan), las citas de la IA, y la exploración de dominio.
 * Lo único que cuesta es explorar un rival por primera vez, y se dice antes.
 */

interface Dominio {
  dominio: string;
  esCliente: boolean;
  serp: { top3: number; top10: number; top20: number; media: number | null; medidas: number };
  ia: { respuestas: number; overviews: number };
  labs: { keywords: number; trafico: number; valor: number; top10: number; creado: string } | null;
}

interface Datos {
  cliente: { dominio: string; nombre: string };
  rivales: { id: string; dominio: string }[];
  dominios: Dominio[];
  porPalabra: { termino: string; dispositivo: string; medido: string | null; conSerp: boolean; puestos: Record<string, number | null> }[];
  sugeridos: { dominio: string; serp: number; ia: number; labs: number }[];
  brecha: { keyword: string; volumen: number; rival: string; posicionRival: number; posicionCliente: number | null; url: string | null }[];
  sinSerp: number;
  costeExploracion: number;
}

function colorPuesto(p: number | null) {
  if (p === null) return "text-[color:var(--tinta-suave)]";
  if (p <= 3) return "text-emerald-700 font-semibold";
  if (p <= 10) return "text-[color:var(--tinta)] font-semibold";
  if (p <= 20) return "text-amber-700";
  return "text-[color:var(--tinta-media)]";
}

export default function Competidores({
  clienteId,
  puedeEditar,
  hayProveedor,
  onSeguir,
}: {
  clienteId: string;
  puedeEditar: boolean;
  hayProveedor: boolean;
  /** Manda una palabra de la brecha al seguimiento de Posiciones. */
  onSeguir?: (termino: string) => Promise<void>;
}) {
  const { confirmar, dialogo } = useConfirmar();
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [verBrecha, setVerBrecha] = useState(15);
  const [seguidas, setSeguidas] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    try {
      const j = await fetch(`/api/competidores?cliente=${clienteId}`).then((r) => r.json());
      if (j.error) {
        setError(j.error);
        return;
      }
      setD(j);
    } catch {
      setError("No se pudo leer la comparativa.");
    } finally {
      setCargando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function llamar(metodo: string, cuerpo: unknown) {
    const r = await fetch("/api/competidores", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo completar la operación.");
    return j;
  }

  async function con(tarea: string, fn: () => Promise<void>) {
    setOcupado(tarea);
    setError(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(null);
    }
  }

  const añadir = (dominio: string) =>
    con(`añadir:${dominio}`, async () => {
      const j = await llamar("POST", { clienteId, dominio });
      setNuevo("");
      setAviso(`${j.dominio} añadido. Explóralo para comparar palabras y tráfico; la SERP y la IA ya cuentan solas.`);
      await cargar();
    });

  const quitar = (r: { id: string; dominio: string }) =>
    con(`quitar:${r.id}`, async () => {
      if (!(await confirmar({ titulo: `¿Quitar a ${r.dominio}?`, detalle: "Deja de compararse. Su exploración guardada no se borra.", boton: "Quitar" }))) return;
      await llamar("DELETE", { clienteId, competidorId: r.id });
      await cargar();
    });

  const explorar = (dominio: string) =>
    con(`explorar:${dominio}`, async () => {
      if (!(await confirmar({ titulo: `¿Explorar ${dominio}?`, detalle: `Trae sus palabras, tráfico estimado e histórico de DataForSEO. Ha costado ≈ ${dinero(d?.costeExploracion ?? 0.15)} las últimas veces. Verlo después no cuesta nada.`, boton: "Explorar", peligroso: false }))) return;
      const j = await llamar("PATCH", { clienteId, dominio });
      setAviso(`${dominio} explorado: ${miles(j.keywords)} palabras por ${dinero(Number(j.coste))}.`);
      await cargar();
    });

  const seguir = (termino: string) =>
    con(`seguir:${termino}`, async () => {
      if (!onSeguir) return;
      await onSeguir(termino);
      setSeguidas((s) => new Set(s).add(termino));
    });

  if (cargando) return <Esqueleto tipo="cifras" />;
  if (!d) return <p className="mt-5 text-[14px] text-red-600">{error}</p>;

  const medidas = d.dominios[0]?.serp.medidas ?? 0;
  const maxTop10 = Math.max(1, ...d.dominios.map((x) => x.serp.top10));
  const conBrecha = d.brecha.slice(0, verBrecha);

  return (
    <div className="mt-5">
      {dialogo}
      {error && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}
      {aviso && <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">{aviso}</p>}

      {/* ---------------- Cuota de voz ---------------- */}
      <div className="tarjeta tarjeta-destacada p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="rotulo">Cuota de voz en tus palabras seguidas</p>
          <p className="text-[13px] text-[color:var(--tinta-suave)]">
            {medidas > 0 ? `en cuántas de las ${medidas} palabras con SERP guardada está cada uno en el top 10` : "sin palabras medidas todavía"}
          </p>
        </div>
        {medidas === 0 ? (
          <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
            {d.sinSerp > 0
              ? `Hay ${d.sinSerp} ${d.sinSerp === 1 ? "palabra seguida" : "palabras seguidas"} pero sin SERP guardada: se rellena con la próxima medición en Posiciones.`
              : "Sigue palabras en Posiciones y mídelas: la SERP de cada una trae a todos los rivales sin coste extra."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {[...d.dominios].sort((a, b) => b.serp.top10 - a.serp.top10).map((x) => (
              <li key={x.dominio} className="grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3 text-[14px]">
                <span className={`truncate ${x.esCliente ? "font-semibold" : ""}`} title={x.dominio}>
                  {x.esCliente ? d.cliente.nombre : x.dominio}
                </span>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.05]">
                  <div
                    className={`h-full rounded-full ${x.esCliente ? "bg-[color:var(--acento)]" : "bg-black/[0.3]"}`}
                    style={{ width: `${(100 * x.serp.top10) / maxTop10}%` }}
                  />
                </div>
                <span className="tabular-nums text-[color:var(--tinta-media)]">
                  <span className="cifra text-[15px] text-[color:var(--tinta)]">{x.serp.top10}</span> / {medidas}
                  {x.serp.top3 > 0 && <span className="ml-2 text-[12px]">· {x.serp.top3} en top 3</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------------- Rivales ---------------- */}
      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold">Rivales</h3>
            <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
              Hasta seis. La SERP de tus palabras y las citas de la IA los cuentan solos; explorarlos trae además sus palabras y su tráfico.
            </p>
          </div>
          {puedeEditar && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nuevo.trim()) añadir(nuevo.trim());
              }}
              className="flex items-center gap-2"
            >
              <input
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                placeholder="rival.cl"
                aria-label="Dominio del rival"
                className="w-48 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-1.5 font-mono text-[13px] outline-none transition focus:border-[color:var(--acento)]"
              />
              <button type="submit" disabled={ocupado !== null || !nuevo.trim()} className="boton-fuerte">
                Añadir
              </button>
            </form>
          )}
        </div>

        {d.sugeridos.length > 0 && puedeEditar && d.rivales.length < 6 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-[color:var(--tinta-suave)]">Aparecen donde tú:</span>
            {d.sugeridos.slice(0, 8).map((s) => (
              <button
                key={s.dominio}
                onClick={() => añadir(s.dominio)}
                disabled={ocupado !== null}
                className="pastilla bg-black/[0.05] text-[color:var(--tinta)] transition hover:bg-[color:var(--acento)]/10 hover:text-[color:var(--acento)]"
                title={`Top 10 en ${s.serp} de tus palabras · citado ${s.ia} veces por la IA${s.labs ? ` · ${s.labs} palabras en común` : ""}`}
              >
                + {s.dominio}
              </button>
            ))}
          </div>
        )}

        <div className="tarjeta mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[color:var(--linea)] text-left">
                <th className="rotulo px-5 py-3">Dominio</th>
                <th className="rotulo px-3 py-3 text-right" title="En tus palabras seguidas">Top 3</th>
                <th className="rotulo px-3 py-3 text-right">Top 10</th>
                <th className="rotulo px-3 py-3 text-right">Media</th>
                <th className="rotulo px-3 py-3 text-right" title="Citado en respuestas de ChatGPT y Gemini, y en el bloque de IA de Google">Citas IA</th>
                <th className="rotulo px-3 py-3 text-right" title="Palabras por las que posiciona, según DataForSEO">Palabras</th>
                <th className="rotulo px-3 py-3 text-right" title="Visitas mensuales estimadas desde Google">Tráfico est.</th>
                <th className="rotulo px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--linea)]">
              {d.dominios.map((x) => {
                const rival = d.rivales.find((r) => r.dominio === x.dominio);
                return (
                  <tr key={x.dominio} className={x.esCliente ? "bg-[color:var(--acento)]/[0.04]" : "transition hover:bg-black/[0.015]"}>
                    <td className="px-5 py-3">
                      <span className={x.esCliente ? "font-semibold" : ""}>{x.dominio}</span>
                      {x.esCliente && <span className="ml-2 pastilla bg-[color:var(--acento)]/10 text-[color:var(--acento)]">tú</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{medidas ? x.serp.top3 : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{medidas ? x.serp.top10 : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{x.serp.media ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {x.ia.respuestas + x.ia.overviews || "—"}
                      {x.ia.overviews > 0 && <span className="ml-1 text-[12px] text-[color:var(--tinta-suave)]">({x.ia.overviews} Google)</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{x.labs ? miles(x.labs.keywords) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{x.labs ? miles(x.labs.trafico) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      {puedeEditar && hayProveedor && (
                        <button
                          onClick={() => explorar(x.dominio)}
                          disabled={ocupado !== null}
                          className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
                          title={x.labs ? `Explorado ${fecha(x.labs.creado)}. Volver a explorar cuesta ≈ ${dinero(d.costeExploracion)}` : `Trae sus palabras y tráfico · ≈ ${dinero(d.costeExploracion)}`}
                        >
                          {ocupado === `explorar:${x.dominio}` ? "Explorando…" : x.labs ? `explorado ${fecha(x.labs.creado)}` : `Explorar · ≈ ${dinero(d.costeExploracion)}`}
                        </button>
                      )}
                      {rival && puedeEditar && (
                        <button onClick={() => quitar(rival)} disabled={ocupado !== null} className="ml-3 text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600">
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {d.rivales.length === 0 && (
          <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">Añade un rival para empezar a comparar.</p>
        )}
      </section>

      {/* ---------------- Por palabra ---------------- */}
      {d.rivales.length > 0 && medidas > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-[17px] font-semibold">Palabra por palabra</h3>
              <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
                El puesto de cada uno en la última medición de tus palabras seguidas. Verde en el top 3, negro en el top 10, ámbar hasta el 20.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                descargarCsv(
                  `competidores-${d.cliente.dominio}`,
                  d.porPalabra.filter((x) => x.conSerp).map((x) => ({ palabra: x.termino, dispositivo: x.dispositivo, ...x.puestos }))
                )
              }
              className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
            >
              Descargar CSV
            </button>
          </div>
          <div className="tarjeta mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[color:var(--linea)] text-left">
                  <th className="rotulo px-5 py-3">Palabra</th>
                  {d.dominios.map((x) => (
                    <th key={x.dominio} className={`rotulo px-3 py-3 text-right ${x.esCliente ? "!text-[color:var(--acento)]" : ""}`}>
                      {x.esCliente ? "tú" : x.dominio.replace(/\.[a-z]+$/, "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--linea)]">
                {d.porPalabra.filter((x) => x.conSerp).map((x) => (
                  <tr key={`${x.termino}-${x.dispositivo}`} className="transition hover:bg-black/[0.015]">
                    <td className="px-5 py-2.5">
                      {x.termino}
                      <span className="ml-2 text-[12px] text-[color:var(--tinta-suave)]">{x.dispositivo === "mobile" ? "móvil" : "escritorio"}</span>
                    </td>
                    {d.dominios.map((dm) => {
                      const p = x.puestos[dm.dominio];
                      return (
                        <td key={dm.dominio} className={`px-3 py-2.5 text-right tabular-nums ${colorPuesto(p)}`}>
                          {p ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- Brecha ---------------- */}
      {d.rivales.length > 0 && (
        <section className="mt-8">
          <h3 className="text-[17px] font-semibold">
            Palabras que ellos tienen y tú no
            {d.brecha.length > 0 && <span className="cifra ml-2 text-[color:var(--tinta-media)]">{d.brecha.length}</span>}
          </h3>
          <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
            Un rival en el top 20 y tú sin seguirla ni posicionar. Sale de las exploraciones: explora a cada rival para que aparezcan las suyas.
          </p>
          {d.brecha.length === 0 ? (
            <p className="mt-3 text-[14px] text-[color:var(--tinta-suave)]">
              {d.dominios.some((x) => !x.esCliente && x.labs) ? "Nada que ellos tengan y tú no, con lo explorado." : "Explora a algún rival para ver su brecha."}
            </p>
          ) : (
            <>
              <div className="tarjeta mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[14px]">
                  <thead>
                    <tr className="border-b border-[color:var(--linea)] text-left">
                      <th className="rotulo px-5 py-3">Palabra</th>
                      <th className="rotulo px-3 py-3 text-right">Volumen</th>
                      <th className="rotulo px-3 py-3">Rival</th>
                      <th className="rotulo px-3 py-3 text-right">Su puesto</th>
                      <th className="rotulo px-3 py-3 text-right">Tú</th>
                      <th className="rotulo px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--linea)]">
                    {conBrecha.map((b) => (
                      <tr key={b.keyword} className="transition hover:bg-black/[0.015]">
                        <td className="px-5 py-2.5">{b.keyword}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{miles(b.volumen)}</td>
                        <td className="px-3 py-2.5 text-[color:var(--tinta-media)]">
                          {b.url ? (
                            <a href={b.url} target="_blank" rel="noopener" className="underline-offset-2 hover:text-[color:var(--acento)] hover:underline" title={b.url}>
                              {b.rival}
                            </a>
                          ) : (
                            b.rival
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${colorPuesto(b.posicionRival)}`}>{b.posicionRival}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-suave)]">{b.posicionCliente ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          {puedeEditar && onSeguir && (
                            seguidas.has(b.keyword) ? (
                              <span className="text-[13px] text-emerald-700">seguida</span>
                            ) : (
                              <button onClick={() => seguir(b.keyword)} disabled={ocupado !== null} className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]">
                                Seguir
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.brecha.length > verBrecha && (
                <button onClick={() => setVerBrecha(d.brecha.length)} className="mt-2 text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]">
                  Ver las {d.brecha.length}
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
