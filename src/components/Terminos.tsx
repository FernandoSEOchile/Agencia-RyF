"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

/**
 * El almacén de palabras clave, con su fecha y su botón de refrescar.
 *
 * La fecha se enseña en cada fila y no en una esquina porque el dato viejo y el
 * de hoy conviven en la misma tabla: una palabra puede llevar ocho meses ahí y
 * la de al lado haberse pedido esta mañana. Sin la fecha por fila, alguien
 * decidiría con la vieja creyéndola nueva.
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

/** Cuántos días lleva sin refrescarse. Es lo que decide si el dato vale. */
function dias(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function Terminos({ puedeActualizar }: { puedeActualizar: boolean }) {
  const [terminos, setTerminos] = useState<Termino[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [minimo, setMinimo] = useState(0);
  const [maxPalabras, setMaxPalabras] = useState(0);
  const [viejasDe, setViejasDe] = useState(0);

  const { orden, ordenar, ordenarPor } = useOrden<Col>("volumen", false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const p = new URLSearchParams();
      if (busca.trim()) p.set("busca", busca.trim());
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

  // Se espera un momento antes de consultar para no lanzar una petición por
  // cada tecla mientras alguien escribe en el buscador.
  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);

  async function actualizar() {
    if (terminos.length === 0) return;

    setCargando(true);
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

      setAviso(
        `${miles(d.tocadas)} palabras actualizadas · costó US$${Number(d.coste).toFixed(4)}`
      );
      await cargar();
    } catch {
      setError("No se pudo actualizar.");
    } finally {
      setCargando(false);
    }
  }

  const filas = ordenarPor(terminos, (t, c) =>
    c === "keyword" ? t.keyword : c === "actualizado" ? t.actualizado : (t[c] ?? -1)
  );

  const volumenTotal = terminos.reduce((s, t) => s + t.volumen, 0);

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="rotulo">Buscar</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="regalos, floristería, corporativo…"
            className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="rotulo">Volumen mínimo</span>
          <input
            type="number"
            min={0}
            value={minimo || ""}
            onChange={(e) => setMinimo(Number(e.target.value) || 0)}
            placeholder="0"
            className="w-28 rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] tabular-nums outline-none focus:border-[color:var(--acento)]"
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
            className="w-28 rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] tabular-nums outline-none focus:border-[color:var(--acento)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="rotulo">Sin refrescar desde</span>
          <select
            value={viejasDe}
            onChange={(e) => setViejasDe(Number(e.target.value))}
            className="rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--acento)]"
          >
            <option value={0}>cualquiera</option>
            <option value={30}>más de 1 mes</option>
            <option value={90}>más de 3 meses</option>
            <option value={180}>más de 6 meses</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13px] text-[color:var(--tinta-media)]">
          {cargando
            ? "Buscando…"
            : `${miles(total)} ${total === 1 ? "palabra guardada" : "palabras guardadas"}` +
              (total > terminos.length ? ` · se muestran ${miles(terminos.length)}` : "") +
              ` · ${miles(volumenTotal)} búsquedas al mes entre las mostradas`}
        </p>

        {puedeActualizar && terminos.length > 0 && (
          <button
            onClick={actualizar}
            disabled={cargando}
            className="boton disabled:opacity-50"
            title="Vuelve a pedir el volumen de las palabras que se están viendo. Cuesta unos céntimos por tanda, no por palabra."
          >
            Actualizar estas {miles(terminos.length)}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}
      {aviso && <p className="mt-3 text-[13px] text-emerald-700">{aviso}</p>}

      {!cargando && terminos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">
            {total === 0 && !busca ? "El almacén todavía está vacío." : "Nada coincide con eso."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            {total === 0 && !busca
              ? "Se llena solo: cada palabra que investigues y cada dominio que explores dejan aquí lo que trajeron."
              : "Prueba con menos filtros."}
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
