"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmar } from "@/components/Confirmar";
import Esqueleto from "@/components/Esqueleto";
import { dinero, fecha, miles } from "@/lib/formato";

/**
 * Visibilidad en IA: qué dicen ChatGPT, Gemini y el bloque de IA de Google
 * cuando alguien pregunta lo que este cliente vende.
 *
 * La unidad es el prompt, no la palabra clave. Cada pregunta se lanza con
 * búsqueda web a cada plataforma, y se guarda si la respuesta nombra o cita al
 * cliente, en qué puesto entre los citados, y a quién más cita. Con eso se
 * responde lo que el cliente pregunta —«¿salgo en la IA?»— con datos y no con
 * una impresión.
 */

const PLATAFORMAS = [
  ["chatgpt", "ChatGPT"],
  ["gemini", "Gemini"],
] as const;
type Plataforma = (typeof PLATAFORMAS)[number][0];

interface Respuesta {
  aparece: boolean;
  citado: boolean;
  posicion: number | null;
  url: string | null;
  medido: string;
  dominios: string[];
  texto: string;
  historial: boolean[];
}

interface Prompt {
  id: string;
  texto: string;
  activo: boolean;
  plataformas: Record<string, Respuesta | null>;
}

interface Datos {
  marca: string;
  prompts: Prompt[];
  resumen: Record<string, { aparece: number; citado: number; total: number }>;
  competidores: { dominio: string; veces: number }[];
  overview: { medidas: number; conBloque: number; citadas: number; fuentes: { dominio: string; veces: number }[] };
}

/** Lo que costó de media un prompt en la prueba real. */
const COSTE_PROMPT = 0.032;

export default function VisibilidadIa({
  clienteId,
  puedeEditar,
  hayProveedor,
}: {
  clienteId: string;
  puedeEditar: boolean;
  hayProveedor: boolean;
}) {
  const { confirmar, dialogo } = useConfirmar();
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [marca, setMarca] = useState("");
  const [propuestas, setPropuestas] = useState<string[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [ver, setVer] = useState<{ prompt: string; plataforma: Plataforma } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const j = await fetch(`/api/ia?cliente=${clienteId}`).then((r) => r.json());
      if (j.error) {
        setError(j.error);
        return;
      }
      setD(j);
      setMarca(j.marca ?? "");
    } catch {
      setError("No se pudo leer la visibilidad en IA.");
    } finally {
      setCargando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function llamar(metodo: string, cuerpo: unknown) {
    const r = await fetch("/api/ia", {
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

  const añadir = (lineas: string) =>
    con("añadir", async () => {
      const j = await llamar("POST", { clienteId, textos: lineas });
      setAviso(`${j.añadidas} ${j.añadidas === 1 ? "pregunta añadida" : "preguntas añadidas"}. Pulsa «Medir ahora» cuando quieras lanzarlas.`);
      setTexto("");
      setAbierto(false);
      setPropuestas([]);
      setElegidas(new Set());
      await cargar();
    });

  const sugerir = () =>
    con("sugerir", async () => {
      const j = await llamar("POST", { clienteId, accion: "sugerir" });
      setPropuestas(j.propuestas ?? []);
      setElegidas(new Set(j.propuestas ?? []));
      setAbierto(true);
    });

  const medir = () => {
    const n = (d?.prompts.filter((p) => p.activo).length ?? 0) * PLATAFORMAS.length;
    return con("medir", async () => {
      if (!(await confirmar({ titulo: `¿Lanzar ${n} preguntas a la IA?`, detalle: `Cada respuesta con búsqueda web cuesta unos tres centavos: ≈ ${dinero(n * COSTE_PROMPT)} en total. Tarda alrededor de un minuto.`, boton: "Medir", peligroso: false }))) return;
      const j = await llamar("PATCH", { clienteId });
      setAviso(`${j.hechas} respuestas guardadas por ${dinero(Number(j.coste))}${j.fallos ? ` · ${j.fallos} fallaron` : ""}.`);
      await cargar();
    });
  };

  const quitar = (p: Prompt) =>
    con("quitar", async () => {
      if (!(await confirmar({ titulo: "¿Quitar esta pregunta?", detalle: `«${p.texto}». Se pierde su histórico de respuestas.`, boton: "Quitar" }))) return;
      await llamar("DELETE", { clienteId, promptId: p.id });
      await cargar();
    });

  const guardarMarca = () =>
    con("marca", async () => {
      const j = await llamar("POST", { clienteId, accion: "marca", marca });
      setAviso(`Se buscará «${j.marca}» en las respuestas.`);
    });

  if (cargando) return <Esqueleto tipo="cifras" />;
  if (!d) return <p className="mt-5 text-[14px] text-red-600">{error}</p>;

  const activos = d.prompts.filter((p) => p.activo);
  const nPreguntas = activos.length * PLATAFORMAS.length;
  const abierta = ver ? d.prompts.find((p) => p.id === ver.prompt)?.plataformas[ver.plataforma] ?? null : null;

  return (
    <div className="mt-5">
      {dialogo}
      {error && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}
      {aviso && <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">{aviso}</p>}

      {/* ---------------- Cabecera ---------------- */}
      <div className="tarjeta tarjeta-destacada grid gap-px overflow-hidden lg:grid-cols-[1fr_1fr_1fr_1.2fr] [&>*]:ring-1 [&>*]:ring-[color:var(--linea)]">
        {PLATAFORMAS.map(([id, nombre]) => {
          const r = d.resumen[id];
          const parte = r && r.total ? Math.round((100 * r.aparece) / r.total) : null;
          return (
            <div key={id} className="bg-[color:var(--panel)] px-5 py-4">
              <p className="rotulo">{nombre}</p>
              {r && r.total > 0 ? (
                <>
                  <p className={`mt-1.5 cifra text-[28px] leading-none ${parte! >= 50 ? "text-emerald-700" : parte! > 0 ? "text-amber-700" : "text-red-600"}`}>
                    {parte}%
                    <span className="ml-1.5 text-[14px] font-normal text-[color:var(--tinta-media)]">de las preguntas</span>
                  </p>
                  <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">
                    aparece en {r.aparece} de {r.total} · citado con enlace en {r.citado}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">Sin medir todavía.</p>
              )}
            </div>
          );
        })}

        <div className="bg-[color:var(--panel)] px-5 py-4">
          <p className="rotulo">Bloque de IA de Google</p>
          {d.overview.medidas > 0 ? (
            <>
              <p className="mt-1.5 cifra text-[28px] leading-none">
                {miles(d.overview.citadas)}
                <span className="ml-1.5 text-[14px] font-normal text-[color:var(--tinta-media)]">
                  de {d.overview.conBloque} {d.overview.conBloque === 1 ? "búsqueda con IA" : "búsquedas con IA"}
                </span>
              </p>
              <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">
                te citan · Google puso IA en {d.overview.conBloque} de las {d.overview.medidas} palabras seguidas
              </p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
              Sale de las palabras seguidas en Posiciones: mide alguna y aparecerá aquí.
            </p>
          )}
        </div>

        <div className="bg-[color:var(--panel)] px-5 py-4">
          <p className="rotulo">A quién cita la IA</p>
          {d.competidores.length === 0 && d.overview.fuentes.length === 0 ? (
            <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">Cuando haya respuestas, aquí saldrán los dominios que más recomienda.</p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {[...d.competidores, ...d.overview.fuentes.filter((f) => !d.competidores.some((c) => c.dominio === f.dominio))].slice(0, 8).map((c) => (
                <li key={c.dominio} className="pastilla bg-black/[0.05] text-[color:var(--tinta)]" title={`${c.veces} ${c.veces === 1 ? "vez" : "veces"}`}>
                  {c.dominio} <span className="ml-1 tabular-nums text-[color:var(--tinta-suave)]">{c.veces}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!hayProveedor && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
          Falta conectar DataForSEO. Un administrador puede hacerlo en Ajustes; hasta entonces se pueden guardar preguntas pero no lanzarlas.
        </p>
      )}

      {/* ---------------- Preguntas ---------------- */}
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold">Lo que la gente le pregunta a la IA</h3>
            <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
              Cada pregunta se lanza con búsqueda web a ChatGPT y a Gemini, y se guarda si la respuesta nombra a{" "}
              <span className="font-medium text-[color:var(--tinta)]">{d.marca}</span> o enlaza a su sitio.
            </p>
          </div>
          {puedeEditar && (
            <div className="flex flex-wrap items-center gap-2">
              {activos.length > 0 && (
                <button onClick={medir} disabled={ocupado !== null || !hayProveedor} className="boton" title={`≈ ${dinero(nPreguntas * COSTE_PROMPT)}`}>
                  {ocupado === "medir" ? "Preguntando…" : `Medir ahora · ≈ ${dinero(nPreguntas * COSTE_PROMPT)}`}
                </button>
              )}
              <button onClick={sugerir} disabled={ocupado !== null} className="boton" title="El asistente propone preguntas a partir de las palabras seguidas y de lo que sabe del cliente">
                {ocupado === "sugerir" ? "Pensando…" : "Sugerir preguntas"}
              </button>
              <button onClick={() => setAbierto(!abierto)} className={abierto ? "boton" : "boton-fuerte"}>
                {abierto ? "Cerrar" : "Añadir preguntas"}
              </button>
            </div>
          )}
        </div>

        {ocupado === "medir" && (
          <p className="mt-3 text-[14px] text-[color:var(--tinta-suave)]">Preguntando a cada modelo con búsqueda web… alrededor de un minuto.</p>
        )}

        {abierto && (
          <div className="tarjeta mt-4 p-5">
            {propuestas.length > 0 && (
              <div className="mb-4">
                <p className="text-[14px] font-medium">Propuestas del asistente</p>
                <p className="mt-0.5 text-[13px] text-[color:var(--tinta-suave)]">Desmarca las que no encajen. Se guardan solo las marcadas.</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {propuestas.map((p) => (
                    <li key={p}>
                      <label className="flex items-start gap-2 text-[14px]">
                        <input
                          type="checkbox"
                          checked={elegidas.has(p)}
                          onChange={(e) => {
                            const s = new Set(elegidas);
                            if (e.target.checked) s.add(p);
                            else s.delete(p);
                            setElegidas(s);
                          }}
                          className="mt-1 accent-[color:var(--acento)]"
                        />
                        <span>{p}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => añadir([...elegidas].join("\n"))}
                  disabled={elegidas.size === 0 || ocupado !== null}
                  className="boton-fuerte mt-3"
                >
                  Guardar {elegidas.size} {elegidas.size === 1 ? "pregunta" : "preguntas"}
                </button>
              </div>
            )}
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder={"Una pregunta por línea, como la escribiría un cliente:\n¿Qué purificador de agua me recomiendan para una casa en Santiago?\n¿Dónde comprar filtros de agua con instalación en Providencia?"}
              className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] text-[color:var(--tinta-media)]">
                Marca a detectar
                <input
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  onBlur={() => marca.trim() && marca.trim() !== d.marca && guardarMarca()}
                  placeholder={d.marca}
                  aria-label="Marca a detectar en las respuestas"
                  className="w-44 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-[color:var(--acento)]"
                />
              </label>
              <button onClick={() => añadir(texto)} disabled={ocupado !== null || texto.trim().length === 0} className="boton-fuerte ml-auto">
                Añadir
              </button>
            </div>
          </div>
        )}

        {d.prompts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-12 text-center">
            <p className="text-[15px] font-medium">Todavía no hay preguntas.</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-[color:var(--tinta-media)]">
              Escribe lo que un cliente le preguntaría a ChatGPT, o pide al asistente que proponga diez a partir de lo que ya sabe.
            </p>
          </div>
        ) : (
          <div className="tarjeta mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[color:var(--linea)] text-left">
                  <th className="rotulo px-5 py-3">Pregunta</th>
                  {PLATAFORMAS.map(([id, nombre]) => (
                    <th key={id} className="rotulo px-3 py-3">{nombre}</th>
                  ))}
                  <th className="rotulo px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--linea)]">
                {d.prompts.map((p) => (
                  <tr key={p.id} className="align-top transition hover:bg-black/[0.015]">
                    <td className="max-w-[420px] px-5 py-3">
                      <p className="font-medium">{p.texto}</p>
                    </td>
                    {PLATAFORMAS.map(([id]) => {
                      const r = p.plataformas[id];
                      return (
                        <td key={id} className="px-3 py-3">
                          {!r ? (
                            <span className="text-[color:var(--tinta-suave)]">sin medir</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setVer(ver?.prompt === p.id && ver.plataforma === id ? null : { prompt: p.id, plataforma: id })}
                              className="text-left"
                              title="Ver la respuesta"
                            >
                              <span className={`font-semibold ${r.citado ? "text-emerald-700" : r.aparece ? "text-amber-700" : "text-red-600"}`}>
                                {r.citado ? `✓ citado${r.posicion ? ` · ${r.posicion}º` : ""}` : r.aparece ? "✓ nombrado" : "✗ no sale"}
                              </span>
                              <span className="mt-0.5 flex items-center gap-2 text-[12px] text-[color:var(--tinta-suave)]">
                                <span className="flex gap-0.5" aria-label={`Últimas ${r.historial.length} mediciones`}>
                                  {r.historial.map((h, i) => (
                                    <span key={i} className={`inline-block h-2 w-2 rounded-full ${h ? "bg-emerald-500" : "bg-black/[0.15]"}`} />
                                  ))}
                                </span>
                                {fecha(r.medido)}
                              </span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right">
                      {puedeEditar && (
                        <button onClick={() => quitar(p)} disabled={ocupado !== null} className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600">
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ver && abierta && (
          <div className="tarjeta mt-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-medium">
                {PLATAFORMAS.find(([id]) => id === ver.plataforma)?.[1]} · {fecha(abierta.medido, { hora: true })}
              </p>
              <button onClick={() => setVer(null)} className="text-[13px] text-[color:var(--tinta-suave)] hover:text-[color:var(--tinta)]">
                Cerrar
              </button>
            </div>
            {abierta.dominios.length > 0 && (
              <p className="mt-2 text-[13px] text-[color:var(--tinta-media)]">
                Cita, en orden: {abierta.dominios.map((x, i) => (
                  <span key={x} className={x === abierta.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#].*$/, "") ? "font-semibold text-emerald-700" : ""}>
                    {i > 0 && " · "}{x}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--tinta-media)]">{abierta.texto}</p>
          </div>
        )}

        <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-[color:var(--tinta-suave)]">
          Las respuestas de la IA cambian de un día a otro y según quién pregunta: una sola medición es una foto, la
          tendencia sale de repetirla. Los puntos verdes son las últimas pasadas en las que apareció. Con la medición
          automática de Posiciones activada, estas preguntas se lanzan en la misma pasada.
        </p>
      </section>
    </div>
  );
}
