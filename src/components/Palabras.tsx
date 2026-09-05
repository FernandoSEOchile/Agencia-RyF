"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import { dinero } from "@/lib/formato";
import { descargarCsv } from "@/lib/csv";

/**
 * Palabras clave: lo que ya tenemos y lo que falta por comprar, en una pantalla.
 *
 * Separarlo en dos —almacén por un lado, buscador de pago por otro— obligaba a
 * mirar en dos sitios antes de decidir si valía la pena pagar, que es
 * exactamente la decisión que se toma aquí. Así que escribes una vez: sale al
 * instante lo guardado, y al lado el botón que trae lo que no está.
 *
 * Después de pagar no hay dos listas: lo comprado entra al almacén y la tabla
 * lo vuelve a leer de ahí. Una sola fuente de verdad, y la fecha de cada dato
 * a la vista.
 */

interface Termino {
  keyword: string;
  volumen: number;
  cpc: number | null;
  competencia: number | null;
  intencion: string | null;
  tendencia: number | null;
  palabras: number;
  veces: number;
  origenes: string[];
  actualizado: string;
}

type Col = "keyword" | "volumen" | "tendencia" | "cpc" | "veces" | "actualizado";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "keyword", texto: "Palabra clave" },
  { id: "volumen", texto: "Búsquedas/mes", clase: "text-right", num: true },
  { id: "tendencia", texto: "Tendencia", clase: "text-right", num: true },
  { id: "cpc", texto: "CPC", clase: "text-right", num: true },
  { id: "veces", texto: "Vista", clase: "text-right", num: true },
  { id: "actualizado", texto: "Dato de", clase: "text-right" },
];

const INTENCION: Record<string, string> = {
  informational: "informativa",
  commercial: "comparar",
  transactional: "comprar",
  navigational: "marca",
};

const miles = (n: number) => n.toLocaleString("es-CL");

/** Días desde que se refrescó. Es lo que decide si el dato todavía vale. */
function dias(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function Palabras({ puedePagar }: { puedePagar: boolean }) {
  const [busca, setBusca] = useState("");
  const [terminos, setTerminos] = useState<Termino[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [pagando, setPagando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [minimo, setMinimo] = useState(0);
  const [maxPalabras, setMaxPalabras] = useState(0);
  const [viejasDe, setViejasDe] = useState(0);

  const { orden, ordenar, ordenarPor } = useOrden<Col>("volumen", false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const p = new URLSearchParams();
      if (busca.trim()) p.set("busca", busca.trim().toLowerCase());
      if (minimo) p.set("minimo", String(minimo));
      if (maxPalabras) p.set("maxPalabras", String(maxPalabras));
      if (viejasDe) p.set("viejasDe", String(viejasDe));

      const d = await fetch(`/api/terminos?${p}`).then((r) => r.json());
      setTerminos(d.terminos ?? []);
      setTotal(d.total ?? 0);
    } catch {
      setError("No se pudo leer el almacén.");
    } finally {
      setCargando(false);
    }
  }, [busca, minimo, maxPalabras, viejasDe]);

  // Se espera un momento para no lanzar una consulta por cada tecla.
  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);

  /** Compra palabras nuevas alrededor de la semilla escrita. */
  async function investigar() {
    const semilla = busca.trim().toLowerCase();
    if (!semilla) return;

    setPagando(true);
    setAviso(null);
    setError(null);

    try {
      const r = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semilla }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }

      setAviso(
        `${miles(d.cuantas)} palabras traídas · ${miles(d.nuevas)} que no teníamos · costó ${dinero(Number(d.coste))}` +
          (d.avisos?.length ? ` · ${d.avisos.join(" · ")}` : "")
      );

      await cargar();
    } catch {
      setError("No se pudo lanzar la búsqueda.");
    } finally {
      setPagando(false);
    }
  }

  /** Vuelve a pedir el volumen de lo que se está viendo. */
  async function actualizar() {
    if (terminos.length === 0) return;

    setPagando(true);
    setAviso(null);
    setError(null);

    try {
      const r = await fetch("/api/terminos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: terminos.map((t) => t.keyword) }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }

      setAviso(`${miles(d.tocadas)} palabras actualizadas · costó ${dinero(Number(d.coste))}`);
      await cargar();
    } catch {
      setError("No se pudo actualizar.");
    } finally {
      setPagando(false);
    }
  }

  const filas = ordenarPor(terminos, (t, c) =>
    c === "keyword" ? t.keyword : c === "actualizado" ? t.actualizado : (t[c] ?? -1)
  );

  const volumenTotal = terminos.reduce((s, t) => s + t.volumen, 0);
  const hayBusqueda = busca.trim().length > 0;
  const ocupado = cargando || pagando;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[280px] flex-1 flex-col gap-1">
          <span className="rotulo">Palabra</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="regalos corporativos"
            spellCheck={false}
            className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-4 py-2.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
          />
        </label>

        {puedePagar && (
          <button
            onClick={investigar}
            disabled={ocupado || !hayBusqueda}
            className="boton-fuerte disabled:opacity-40"
            title="Pregunta a DataForSEO por todo lo que rodea a esta palabra. Cuesta unos céntimos y lo que traiga se queda guardado."
          >
            {pagando ? "Buscando…" : "Buscar palabras nuevas"}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="rotulo">Volumen mínimo</span>
          <input
            type="number"
            min={0}
            value={minimo || ""}
            onChange={(e) => setMinimo(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-28 rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] tabular-nums outline-none focus:border-[color:var(--acento)]"
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
            className="w-28 rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] tabular-nums outline-none focus:border-[color:var(--acento)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="rotulo">Sin refrescar desde</span>
          <select
            value={viejasDe}
            onChange={(e) => setViejasDe(Number(e.target.value))}
            className="rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-[color:var(--acento)]"
          >
            <option value={0}>cualquiera</option>
            <option value={30}>más de 1 mes</option>
            <option value={90}>más de 3 meses</option>
            <option value={180}>más de 6 meses</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {filas.length > 0 && (
          <button
            type="button"
            onClick={() => descargarCsv("palabras-clave", filas.map((t) => ({ ...t })))}
            className="text-[12px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
          >
            Descargar CSV
          </button>
        )}
        <p className="text-[13px] text-[color:var(--tinta-media)]">
          {cargando
            ? hayBusqueda
              ? "Buscando…"
              : "Leyendo lo guardado…"
            : `${miles(total)} ${total === 1 ? "palabra guardada" : "palabras guardadas"}` +
              (hayBusqueda ? ` para «${busca.trim()}»` : "") +
              (total > terminos.length ? ` · se muestran ${miles(terminos.length)}` : "") +
              (terminos.length > 0
                ? ` · ${miles(volumenTotal)} búsquedas al mes entre ellas`
                : "")}
        </p>

        {puedePagar && terminos.length > 0 && (
          <button
            onClick={actualizar}
            disabled={ocupado}
            className="boton disabled:opacity-50"
            title="Vuelve a pedir el volumen de las que se están viendo. Se cobra por tanda, no por palabra."
          >
            {terminos.length === 1 ? "Actualizar esta" : `Actualizar estas ${miles(terminos.length)}`}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}
      {aviso && <p className="mt-3 text-[13px] text-emerald-700">{aviso}</p>}

      {!cargando && terminos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">
            {hayBusqueda
              ? `No tenemos nada guardado para «${busca.trim()}».`
              : "El almacén todavía está vacío."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            {hayBusqueda && puedePagar
              ? "Pulsa «Buscar palabras nuevas» y lo que traiga se queda aquí para siempre."
              : "Se llena solo: cada palabra que investigues y cada dominio que explores dejan aquí lo que trajeron."}
          </p>
        </div>
      ) : (
        <div className="tarjeta mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
            <tbody className="divide-y divide-[color:var(--linea)]">
              {filas.map((t) => {
                const edad = dias(t.actualizado);
                return (
                  <tr key={t.keyword}>
                    <td className="px-5 py-2.5">
                      {t.keyword}
                      {t.intencion && (
                        <span className="ml-2 pastilla bg-black/[0.05] text-[color:var(--tinta-suave)]">
                          {INTENCION[t.intencion] ?? t.intencion}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {miles(t.volumen)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        t.tendencia == null
                          ? "text-[color:var(--tinta-suave)]"
                          : t.tendencia > 0
                            ? "text-emerald-700"
                            : t.tendencia < 0
                              ? "text-red-600"
                              : ""
                      }`}
                    >
                      {t.tendencia == null ? "—" : `${t.tendencia > 0 ? "+" : ""}${t.tendencia}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                      {t.cpc == null ? "—" : `$${t.cpc.toFixed(2)}`}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]"
                      title={t.origenes.join(" · ")}
                    >
                      {t.veces}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
                        edad > 180
                          ? "text-red-600"
                          : edad > 90
                            ? "text-amber-700"
                            : "text-[color:var(--tinta-suave)]"
                      }`}
                    >
                      {edad === 0 ? "hoy" : edad === 1 ? "ayer" : `hace ${edad} d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
