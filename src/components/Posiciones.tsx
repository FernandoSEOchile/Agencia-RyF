"use client";

import { useConfirmar } from "@/components/Confirmar";
import { useState } from "react";
  const { confirmar, dialogo } = useConfirmar();
import SearchConsole from "@/components/SearchConsole";
import { dinero } from "@/lib/formato";

export interface KeywordVista {
  id: string;
  termino: string;
  dispositivo: string;
  urlObjetivo: string | null;
  puesto: number | null;
  urlPosicionada: string | null;
  bloquesArriba: number | null;
  medido: string | null;
  anterior: number | null;
  mediciones: number;
}

const UBICACIONES = [
  [2152, "Chile"],
  [2484, "México"],
  [2032, "Argentina"],
  [2170, "Colombia"],
  [2604, "Perú"],
  [2724, "España"],
  [2840, "Estados Unidos"],
] as const;

const FUENTES = [
  ["gsc", "Search Console"],
  ["api", "Medición directa"],
] as const;

const COLUMNAS = [
  { id: "termino", texto: "Consulta", ancho: "", num: false },
  { id: "puesto", texto: "Puesto", ancho: "text-right", num: true },
  { id: "cambio", texto: "Cambio", ancho: "text-right", num: true },
  { id: "url", texto: "URL que posiciona", ancho: "", num: false },
] as const;

type Columna = (typeof COLUMNAS)[number]["id"];

/** El salto entre dos mediciones, con el signo que entiende un humano. */
function delta(k: KeywordVista): number | null {
  if (k.puesto === null || k.anterior === null) return null;
  // Bajar de número es mejorar, así que se invierte para que positivo = subió.
  return k.anterior - k.puesto;
}

function colorPuesto(p: number | null) {
  if (p === null) return "text-[color:var(--tinta-suave)]";
  if (p <= 3) return "text-emerald-600";
  if (p <= 10) return "text-[color:var(--tinta)]";
  if (p <= 20) return "text-amber-600";
  return "text-[color:var(--tinta-media)]";
}

export default function Posiciones({
  clienteId,
  keywords,
  puedeEditar,
  hayProveedor,
  hayGsc,
}: {
  clienteId: string;
  keywords: KeywordVista[];
  puedeEditar: boolean;
  hayProveedor: boolean;
  hayGsc: boolean;
}) {
  const [fuente, setFuente] = useState<(typeof FUENTES)[number][0]>(hayGsc ? "gsc" : "api");
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [ubicacion, setUbicacion] = useState(2152);
  const [dispositivo, setDispositivo] = useState("desktop");
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "puesto", asc: true });

  /** Al cambiar de columna se arranca por lo útil; volver a pulsar invierte. */
  function ordenar(col: Columna) {
    setOrden((o) =>
      o.col === col ? { col, asc: !o.asc } : { col, asc: col === "puesto" || col === "termino" }
    );
  }
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function llamar(metodo: string, cuerpo: unknown) {
    const r = await fetch("/api/posiciones", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo completar la operación.");
    return j;
  }

  /** Pasa una consulta de Search Console al seguimiento medido. */
  async function seguirDesdeGsc(consulta: string) {
    setError(null);
    setAviso(null);
    try {
      await llamar("POST", { clienteId, terminos: consulta, ubicacion: 2152, dispositivo: "desktop" });
      setAviso(`«${consulta}» añadida al seguimiento. Cambia a «Medición directa» y pulsa medir.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }

  async function añadir() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const j = await llamar("POST", { clienteId, terminos: texto, ubicacion, dispositivo });
      const repes = j.recibidas - j.añadidas;
      setAviso(
        `${j.añadidas} consultas añadidas${repes > 0 ? ` (${repes} ya estaban)` : ""}. Ahora pulsa «Medir».`
      );
      setTexto("");
      setAbierto(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setOcupado(false);
    }
  }

  async function medir(soloNuevas: boolean) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const j = await llamar("PATCH", { clienteId, soloNuevas });

      if (j.medidas === 0 && j.fallos > 0) {
        throw new Error(j.detalleFallos?.[0] ?? "Ninguna consulta se pudo medir.");
      }

      setAviso(
        `${j.medidas} consultas medidas por ${dinero(Number(j.coste))}` +
          (j.fallos ? ` · ${j.fallos} fallaron` : "") +
          (j.pendientes ? ` · quedan ${j.pendientes} para la próxima pasada` : "")
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setOcupado(false);
    }
  }

  async function quitar(id: string, termino: string) {
    if (!(await confirmar({ titulo: `¿Quitar «${termino}» del seguimiento?`, detalle: "Se pierde su histórico de posiciones.", boton: "Quitar" }))) return;
    setOcupado(true);
    try {
      await llamar("DELETE", { keywordId: id });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setOcupado(false);
    }
  }

  const valorDe = (k: KeywordVista, col: Columna): string | number => {
    if (col === "termino") return k.termino;
    if (col === "url") return k.urlPosicionada ?? "";
    if (col === "cambio") return delta(k) ?? 0;
    // Sin medir y fuera del top 100 van al final: lo accionable arriba.
    return k.puesto ?? 999;
  };

  const ordenadas = [...keywords].sort((a, b) => {
    const x = valorDe(a, orden.col);
    const y = valorDe(b, orden.col);
    const cmp =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "es");
    return orden.asc ? cmp : -cmp;
  });

  const medidas = keywords.filter((k) => k.puesto !== null);
  const sinMedir = keywords.filter((k) => k.mediciones === 0).length;
  const fuera = keywords.filter((k) => k.mediciones > 0 && k.puesto === null).length;
  const media = medidas.length
    ? Math.round((medidas.reduce((s, k) => s + (k.puesto ?? 0), 0) / medidas.length) * 10) / 10
    : null;

  /** Cuántas caen dentro de ese puesto. Acumulativo, como en Search Console. */
  const top = (n: number) => medidas.filter((k) => (k.puesto ?? 999) <= n).length;

  return (
    <div className="mt-5">
      {dialogo}
      {hayGsc && (
      <div className="segmentos">
        {FUENTES.map(([id, n]) => (
          <button
            key={id}
            onClick={() => setFuente(id)}
            className={`segmento ${fuente === id ? "segmento-activo" : ""}`}
          >
            {n}
          </button>
        ))}
      </div>
      )}

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
      {aviso && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{aviso}</p>
      )}

      {fuente === "gsc" ? (
        <SearchConsole clienteId={clienteId} puedeEditar={puedeEditar} onSeguir={seguirDesdeGsc} />
      ) : (
        <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {puedeEditar && (
          <button onClick={() => setAbierto(!abierto)} className="boton">
            {abierto ? "Cerrar" : "Añadir consultas"}
          </button>
        )}

        {puedeEditar && keywords.length > 0 && (
          <>
            <button onClick={() => medir(true)} disabled={ocupado || !sinMedir} className="boton">
              Medir las nuevas{sinMedir > 0 && ` (${sinMedir})`}
            </button>
            <button onClick={() => medir(false)} disabled={ocupado} className="boton">
              Medir todo
            </button>
          </>
        )}

        {ocupado && (
          <span className="text-[13px] text-[color:var(--tinta-suave)]">
            Consultando Google… puede tardar un minuto.
          </span>
        )}
      </div>

      {!hayProveedor && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Falta conectar DataForSEO. Un administrador puede hacerlo en Ajustes; hasta entonces se
          pueden añadir consultas pero no medirlas.
        </p>
      )}

      {abierto && (
        <div className="tarjeta mt-4 p-5">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder={"Una consulta por línea:\nregalos corporativos\ntermos personalizados\nmochilas para notebook"}
            className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <span className="text-[color:var(--tinta-media)]">País</span>
              <select
                value={ubicacion}
                onChange={(e) => setUbicacion(Number(e.target.value))}
                className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] outline-none"
              >
                {UBICACIONES.map(([id, n]) => (
                  <option key={id} value={id}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <div className="segmentos">
              {[
                ["desktop", "Escritorio"],
                ["mobile", "Móvil"],
              ].map(([id, n]) => (
                <button
                  key={id}
                  onClick={() => setDispositivo(id)}
                  className={`segmento ${dispositivo === id ? "segmento-activo" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={añadir}
              disabled={ocupado || texto.trim().length === 0}
              className="boton-fuerte ml-auto"
            >
              Añadir
            </button>
          </div>

          <p className="mt-3 text-[12px] text-[color:var(--tinta-suave)]">
            La misma consulta en escritorio y en móvil son dos seguimientos distintos, porque Google
            devuelve resultados distintos. En ecommerce suele importar más el móvil.
          </p>
        </div>
      )}

      {keywords.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-20 text-center">
          <p className="text-[15px] font-medium">Todavía no se sigue ninguna consulta.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Añade las palabras por las que este cliente quiere posicionar. Cada medición consulta
            Google de verdad y cuesta unas milésimas de dólar, así que se hace cuando tú lo pides.
          </p>
        </div>
      ) : (
        <>
          <dl className="tarjeta mt-5 grid grid-cols-2 divide-x divide-[color:var(--linea)] overflow-hidden sm:grid-cols-4">
            {[
              ["Palabras posicionadas", String(medidas.length), ""],
              ["En seguimiento", String(keywords.length), ""],
              ["Posición media", media !== null ? String(media) : "—", ""],
              ["Sin medir", String(sinMedir), sinMedir ? "text-amber-600" : ""],
            ].map(([k, v, color]) => (
              <div key={k} className="px-5 py-4">
                <dt className="rotulo">{k}</dt>
                <dd className={`mt-1 text-[24px] font-semibold tabular-nums ${color}`}>{v}</dd>
              </div>
            ))}
          </dl>

          <dl className="tarjeta mt-3 grid grid-cols-2 divide-x divide-[color:var(--linea)] overflow-hidden sm:grid-cols-5">
            {[
              ["Top 3", top(3), "text-emerald-600"],
              ["Top 10", top(10), "text-emerald-600"],
              ["Top 20", top(20), ""],
              ["Top 100", top(100), ""],
              ["Fuera del 100", fuera, fuera ? "text-[color:var(--tinta-media)]" : ""],
            ].map(([k, v, color]) => (
              <div key={String(k)} className="px-5 py-4">
                <dt className="rotulo">{String(k)}</dt>
                <dd className={`mt-1 text-[24px] font-semibold tabular-nums ${color}`}>
                  {Number(v).toLocaleString("es-CL")}
                </dd>
              </div>
            ))}
          </dl>

          <div className="tarjeta mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[color:var(--linea)] text-left">
                  {COLUMNAS.map((c) => (
                    <th key={c.id} className={`rotulo px-3 py-3 first:px-5 ${c.ancho}`}>
                      <button
                        onClick={() => ordenar(c.id)}
                        className={`rotulo transition hover:text-[color:var(--tinta)] ${
                          orden.col === c.id ? "!text-[color:var(--tinta)]" : ""
                        }`}
                      >
                        {c.texto}
                        <span className="ml-1 inline-block w-2 text-[9px]">
                          {orden.col === c.id ? (orden.asc ? "▲" : "▼") : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th className="rotulo px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--linea)]">
                {ordenadas.map((k) => {
                  const d = delta(k);
                  return (
                    <tr key={k.id} className="align-top transition hover:bg-black/[0.015]">
                      <td className="px-5 py-3">
                        <p className="font-medium">{k.termino}</p>
                        <p className="mt-0.5 text-[11px] text-[color:var(--tinta-suave)]">
                          {k.dispositivo === "mobile" ? "móvil" : "escritorio"}
                          {k.medido && ` · ${k.medido}`}
                          {k.mediciones === 0 && " · sin medir"}
                        </p>
                      </td>

                      <td className={`px-3 py-3 text-right text-[15px] font-semibold tabular-nums ${colorPuesto(k.puesto)}`}>
                        {k.mediciones === 0 ? "—" : k.puesto ?? "+100"}
                        {k.bloquesArriba !== null && k.bloquesArriba > 0 && (
                          <span
                            className="ml-1 text-[11px] font-normal text-[color:var(--tinta-suave)]"
                            title={`${k.bloquesArriba} bloques de Google (anuncios, mapas, preguntas) por encima`}
                          >
                            +{k.bloquesArriba}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right tabular-nums">
                        {d === null || d === 0 ? (
                          <span className="text-[color:var(--tinta-suave)]">—</span>
                        ) : (
                          <span className={d > 0 ? "text-emerald-600" : "text-red-600"}>
                            {d > 0 ? "▲" : "▼"} {Math.abs(d)}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3">
                        {k.urlPosicionada ? (
                          <a
                            href={k.urlPosicionada}
                            target="_blank"
                            rel="noopener"
                            className="block max-w-[320px] truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                            title={k.urlPosicionada}
                          >
                            {k.urlPosicionada.replace(/^https?:\/\/[^/]+/, "") || "/"}
                          </a>
                        ) : (
                          <span className="text-[color:var(--tinta-suave)]">
                            {k.mediciones === 0 ? "sin medir" : "no aparece en los 100 primeros"}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right">
                        {puedeEditar && (
                          <button
                            onClick={() => quitar(k.id, k.termino)}
                            disabled={ocupado}
                            className="text-[12px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
                          >
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

          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
            El puesto es la posición entre los resultados orgánicos. El número pequeño al lado cuenta
            los bloques de Google que van por encima —anuncios, mapa local, «otras preguntas»—, porque
            ser tercero debajo de tres bloques no es lo mismo que ser tercero. Cada pasada mide como
            máximo 40 consultas para que el gasto sea previsible.
          </p>
        </>
      )}
        </>
      )}
    </div>
  );
}
