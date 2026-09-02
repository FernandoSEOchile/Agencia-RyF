"use client";

import { useEffect, useState } from "react";

interface Fila {
  consulta: string;
  clics: number;
  impresiones: number;
  ctr: number;
  posicion: number;
}

interface Respuesta {
  configurado: boolean;
  correo: string | null;
  propiedades: { url: string; permiso: string }[];
  propiedad: string | null;
  dias?: number;
  filas: Fila[];
  error?: string;
}

const PERIODOS = [
  [28, "28 días"],
  [90, "3 meses"],
  [180, "6 meses"],
] as const;

const VISTAS = [
  ["oportunidades", "Oportunidades"],
  ["todo", "Todas"],
] as const;

/**
 * La franja donde una consulta ya tiene visibilidad pero casi ningún clic.
 *
 * Es el mejor trabajo disponible: Google ya considera la página relevante, así
 * que mejorarla rinde mucho más que atacar una consulta desde cero.
 */
function esOportunidad(f: Fila) {
  return f.posicion >= 4 && f.posicion <= 20 && f.impresiones >= 20;
}

export default function SearchConsole({
  clienteId,
  puedeEditar,
  onSeguir,
}: {
  clienteId: string;
  puedeEditar: boolean;
  onSeguir?: (consulta: string) => void;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [dias, setDias] = useState<number>(28);
  const [vista, setVista] = useState<(typeof VISTAS)[number][0]>("oportunidades");
  const [busca, setBusca] = useState("");

  async function cargar(d: number) {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/gsc?cliente=${encodeURIComponent(clienteId)}&dias=${d}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudieron leer los datos.");
      setDatos(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(dias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  async function elegirPropiedad(propiedad: string) {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/gsc", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, propiedad }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar.");
      await cargar(dias);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCargando(false);
    }
  }

  if (cargando && !datos) {
    return <p className="mt-4 text-[13px] text-[color:var(--tinta-suave)]">Consultando Search Console…</p>;
  }

  if (error) {
    return <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>;
  }

  if (!datos?.configurado) {
    return (
      <p className="mt-4 rounded-2xl bg-black/[0.03] px-4 py-3 text-[13px] text-[color:var(--tinta-media)]">
        Search Console no está conectado. Un administrador puede hacerlo en Ajustes; da las posiciones
        reales de lo que este sitio ya posiciona, gratis.
      </p>
    );
  }

  // Sin propiedad asignada no hay datos que pedir: primero hay que decir cuál
  // de las propiedades de Google corresponde a este cliente.
  if (!datos.propiedad) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] p-5">
        <p className="text-[13px] font-medium">¿Qué propiedad de Search Console es este cliente?</p>

        {datos.propiedades.length === 0 ? (
          <p className="mt-2 text-[13px] text-[color:var(--tinta-media)]">
            La cuenta de servicio no tiene acceso a ninguna propiedad todavía. En Search Console, añade{" "}
            <span className="break-all font-mono text-[12px]">{datos.correo}</span> como usuario con
            permiso «Restringido».
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {datos.propiedades.map((p) => (
              <li key={p.url}>
                <button
                  disabled={!puedeEditar || cargando}
                  onClick={() => elegirPropiedad(p.url)}
                  className="boton font-mono !text-[12px]"
                >
                  {p.url}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const filas = datos.filas ?? [];
  const oportunidades = filas.filter(esOportunidad);

  const visibles = (vista === "oportunidades" ? oportunidades : filas)
    .filter((f) => !busca.trim() || f.consulta.includes(busca.trim().toLowerCase()))
    .sort((a, b) => b.impresiones - a.impresiones)
    .slice(0, 100);

  const clics = filas.reduce((s, f) => s + f.clics, 0);
  const impresiones = filas.reduce((s, f) => s + f.impresiones, 0);
  const media = filas.length
    ? Math.round((filas.reduce((s, f) => s + f.posicion, 0) / filas.length) * 10) / 10
    : null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segmentos">
          {PERIODOS.map(([d, n]) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`segmento ${dias === d ? "segmento-activo" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-[color:var(--tinta-suave)]">{datos.propiedad}</span>
        {cargando && <span className="text-[12px] text-[color:var(--tinta-suave)]">actualizando…</span>}
      </div>

      <dl className="tarjeta mt-4 grid grid-cols-2 divide-x divide-[color:var(--linea)] overflow-hidden sm:grid-cols-4">
        {[
          ["Consultas", filas.length.toLocaleString("es-CL"), ""],
          ["Clics", clics.toLocaleString("es-CL"), ""],
          ["Impresiones", impresiones.toLocaleString("es-CL"), ""],
          ["Oportunidades", String(oportunidades.length), oportunidades.length ? "text-amber-600" : ""],
        ].map(([k, v, color]) => (
          <div key={k} className="px-5 py-4">
            <dt className="rotulo">{k}</dt>
            <dd className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{v}</dd>
          </div>
        ))}
      </dl>

      {media !== null && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
          Posición media de {media} sobre {filas.length.toLocaleString("es-CL")} consultas.{" "}
          {oportunidades.length > 0 && (
            <>
              Hay <strong className="font-semibold text-[color:var(--tinta)]">{oportunidades.length}</strong>{" "}
              entre los puestos 4 y 20 con impresiones reales: ahí Google ya considera relevante la
              página, y mejorarla rinde más que atacar algo desde cero.
            </>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="segmentos">
          {VISTAS.map(([id, n]) => (
            <button
              key={id}
              onClick={() => setVista(id)}
              className={`segmento ${vista === id ? "segmento-activo" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar consultas…"
          className="ml-auto w-60 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-1.5 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
        />
      </div>

      <div className="tarjeta mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[color:var(--linea)] text-left">
              <th className="rotulo px-5 py-3">Consulta</th>
              <th className="rotulo px-3 py-3 text-right">Posición</th>
              <th className="rotulo px-3 py-3 text-right">Clics</th>
              <th className="rotulo px-3 py-3 text-right">Impresiones</th>
              <th className="rotulo px-3 py-3 text-right">CTR</th>
              <th className="rotulo px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--linea)]">
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-[color:var(--tinta-suave)]">
                  {vista === "oportunidades"
                    ? "No hay consultas entre los puestos 4 y 20 con impresiones suficientes."
                    : "Search Console no devolvió datos para este periodo."}
                </td>
              </tr>
            ) : (
              visibles.map((f) => (
                <tr key={f.consulta} className="transition hover:bg-black/[0.015]">
                  <td className="px-5 py-2.5">{f.consulta}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                      f.posicion <= 3
                        ? "text-emerald-600"
                        : f.posicion <= 10
                        ? ""
                        : "text-[color:var(--tinta-media)]"
                    }`}
                  >
                    {f.posicion}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{f.clics}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                    {f.impresiones.toLocaleString("es-CL")}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                    {(f.ctr * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {puedeEditar && onSeguir && (
                      <button
                        onClick={() => onSeguir(f.consulta)}
                        className="text-[12px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
                        title="Añadir al seguimiento de posiciones"
                      >
                        Seguir
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
        Datos reales de Google, sin coste. La posición es un promedio de todas las veces que el sitio
        se mostró en el periodo, no la foto de un momento — por eso sale con decimales y no coincide
        exactamente con lo que mide DataForSEO. Search Console va con dos o tres días de retraso, así
        que el periodo termina ahí.
      </p>
    </div>
  );
}
