"use client";

import { useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

/**
 * Investigación de palabras clave, al estilo de una barra de búsqueda.
 *
 * Primero mira si esa palabra ya se investigó: si está guardada, se pinta sin
 * pagar nada. El botón que cuesta dinero es otro y lo dice, porque la regla de
 * la casa es que ningún gasto ocurre solo.
 */

interface Sugerencia {
  keyword: string;
  volumen: number;
  tendencia: number | null;
  cpc: number | null;
  competencia: number | null;
  intencion: string | null;
  palabras: number;
  origen: string;
}

interface Reciente {
  semilla: string;
  pais: number;
  cuantas: number;
  creado: string;
}

type Col = "keyword" | "volumen" | "tendencia" | "cpc" | "competencia" | "intencion" | "palabras";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "keyword", texto: "Palabra clave" },
  { id: "volumen", texto: "Búsquedas/mes", clase: "text-right", num: true },
  { id: "tendencia", texto: "Tendencia", clase: "text-right", num: true },
  { id: "cpc", texto: "CPC", clase: "text-right", num: true },
  { id: "competencia", texto: "Competencia", clase: "text-right", num: true },
  { id: "intencion", texto: "Intención" },
  { id: "palabras", texto: "Palabras", clase: "text-right", num: true },
];

const INTENCION: Record<string, string> = {
  informational: "informativa",
  commercial: "comparar",
  transactional: "comprar",
  navigational: "marca",
};

const miles = (n: number) => n.toLocaleString("es-CL");

export default function Keywords({ puedeBuscar }: { puedeBuscar: boolean }) {
  const [semilla, setSemilla] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [datos, setDatos] = useState<{
    semilla: string;
    sugerencias: Sugerencia[];
    medida: string | null;
    coste: number | null;
  } | null>(null);

  const [recientes, setRecientes] = useState<Reciente[]>([]);

  // Filtros. El de volumen mínimo y el de número de palabras son los dos que de
  // verdad se usan: separan la cabeza de la cola larga de un vistazo.
  const [minimo, setMinimo] = useState(0);
  const [maxPalabras, setMaxPalabras] = useState(0);
  const [contiene, setContiene] = useState("");

  const { orden, ordenar, ordenarPor } = useOrden<Col>("volumen", false);

  useEffect(() => {
    fetch("/api/keywords")
      .then((r) => r.json())
      .then((d) => setRecientes(d.recientes ?? []))
      .catch(() => {});
  }, []);

  async function mirar(palabra: string) {
    const p = palabra.trim().toLowerCase();
    if (!p) return;

    setCargando(true);
    setError(null);
    setAviso(null);
    setSemilla(p);

    try {
      const r = await fetch(`/api/keywords?semilla=${encodeURIComponent(p)}`);
      const d = await r.json();

      if (d.sugerencias) {
        setDatos({ semilla: p, sugerencias: d.sugerencias, medida: d.medida, coste: d.coste });
        if (!d.fresca) setAviso("Estos datos tienen más de un mes. Puedes volver a pedirlos.");
      } else {
        setDatos(null);
        setAviso("Esta palabra no se ha investigado todavía.");
      }
    } catch {
      setError("No se pudo consultar lo guardado.");
    } finally {
      setCargando(false);
    }
  }

  async function pedir() {
    const p = semilla.trim().toLowerCase();
    if (!p) return;

    setCargando(true);
    setError(null);
    setAviso(null);

    try {
      const r = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semilla: p }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }

      setDatos({
        semilla: p,
        sugerencias: d.sugerencias,
        medida: new Date().toISOString(),
        coste: d.coste,
      });
      setAviso(
        `${miles(d.cuantas)} palabras · costó US$${Number(d.coste).toFixed(4)}` +
          (d.avisos?.length ? ` · ${d.avisos.join(" · ")}` : "")
      );

      const lista = await fetch("/api/keywords").then((x) => x.json());
      setRecientes(lista.recientes ?? []);
    } catch {
      setError("No se pudo lanzar la búsqueda.");
    } finally {
      setCargando(false);
    }
  }

  const todas = datos?.sugerencias ?? [];
  const texto = contiene.trim().toLowerCase();

  const filtradas = todas.filter(
    (s) =>
      s.volumen >= minimo &&
      (maxPalabras === 0 || s.palabras <= maxPalabras) &&
      (!texto || s.keyword.includes(texto))
  );

  const filas = ordenarPor(filtradas, (s, c) =>
    c === "keyword" ? s.keyword : c === "intencion" ? (s.intencion ?? "") : (s[c] ?? -1)
  );

  const volumenTotal = filtradas.reduce((t, s) => t + s.volumen, 0);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mirar(semilla);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={semilla}
          onChange={(e) => setSemilla(e.target.value)}
          placeholder="regalos corporativos"
          spellCheck={false}
          className="min-w-[260px] flex-1 rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-4 py-2.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
        />
        <button type="submit" disabled={cargando} className="boton disabled:opacity-50">
          {cargando ? "Buscando…" : "Ver lo guardado"}
        </button>
        {puedeBuscar && (
          <button
            type="button"
            onClick={pedir}
            disabled={cargando || !semilla.trim()}
            className="boton-fuerte disabled:opacity-50"
            title="Consulta a DataForSEO. Cuesta unos céntimos y queda guardada."
          >
            Consultar y pagar
          </button>
        )}
      </form>

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}
      {aviso && <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">{aviso}</p>}

      {!datos && recientes.length > 0 && (
        <div className="mt-8">
          <h2 className="rotulo">Ya investigadas · verlas es gratis</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {recientes.map((r) => (
              <button
                key={`${r.semilla}-${r.pais}`}
                onClick={() => mirar(r.semilla)}
                className="boton"
              >
                {r.semilla}
                <span className="text-[color:var(--tinta-suave)]">{miles(r.cuantas)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {datos && (
        <>
          <div className="mt-8 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="rotulo">Volumen mínimo</span>
              <input
                type="number"
                min={0}
                value={minimo || ""}
                onChange={(e) => setMinimo(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-32 rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] tabular-nums outline-none focus:border-[color:var(--acento)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="rotulo">Máx. palabras</span>
              <input
                type="number"
                min={0}
                value={maxPalabras || ""}
                onChange={(e) => setMaxPalabras(Number(e.target.value) || 0)}
                placeholder="todas"
                className="w-32 rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] tabular-nums outline-none focus:border-[color:var(--acento)]"
              />
            </label>

            <label className="flex flex-1 flex-col gap-1">
              <span className="rotulo">Contiene</span>
              <input
                value={contiene}
                onChange={(e) => setContiene(e.target.value)}
                placeholder="filtrar dentro de los resultados"
                className="w-full min-w-[200px] rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-[color:var(--acento)]"
              />
            </label>
          </div>

          <p className="mt-4 text-[13px] text-[color:var(--tinta-media)]">
            {miles(filas.length)} de {miles(todas.length)} palabras
            {" · "}
            {miles(volumenTotal)} búsquedas al mes entre todas
            {datos.medida && ` · datos del ${datos.medida.slice(0, 10)}`}
          </p>

          <div className="tarjeta mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
              <tbody className="divide-y divide-[color:var(--linea)]">
                {filas.slice(0, 500).map((s) => (
                  <tr key={s.keyword}>
                    <td className="px-5 py-2.5">
                      {s.keyword}
                      {s.origen === "relacionada" && (
                        <span className="ml-2 pastilla bg-black/[0.05] text-[color:var(--tinta-suave)]">
                          relacionada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {miles(s.volumen)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        s.tendencia == null
                          ? "text-[color:var(--tinta-suave)]"
                          : s.tendencia > 0
                            ? "text-emerald-700"
                            : s.tendencia < 0
                              ? "text-red-600"
                              : ""
                      }`}
                    >
                      {s.tendencia == null ? "—" : `${s.tendencia > 0 ? "+" : ""}${s.tendencia}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                      {s.cpc == null ? "—" : `$${s.cpc.toFixed(2)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                      {s.competencia == null ? "—" : s.competencia.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-[color:var(--tinta-media)]">
                      {s.intencion ? (INTENCION[s.intencion] ?? s.intencion) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-suave)]">
                      {s.palabras}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filas.length > 500 && (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
              Se muestran las 500 primeras de {miles(filas.length)}. Afina los filtros para ver el
              resto.
            </p>
          )}
        </>
      )}
    </>
  );
}
