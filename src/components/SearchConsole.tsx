"use client";

import { useEffect, useState } from "react";

interface Fila {
  consulta: string;
  clics: number;
  impresiones: number;
  ctr: number;
  posicion: number;
  pagina: string | null;
  paginas: number;
}

/** Columnas ordenables. El sentido inicial de cada una es el útil por defecto. */
const COLUMNAS = [
  { id: "consulta", texto: "Consulta", ancho: "", num: false },
  { id: "pagina", texto: "URL que posiciona", ancho: "", num: false },
  { id: "posicion", texto: "Posición", ancho: "text-right", num: true },
  { id: "clics", texto: "Clics", ancho: "text-right", num: true },
  { id: "impresiones", texto: "Impresiones", ancho: "text-right", num: true },
  { id: "ctr", texto: "CTR", ancho: "text-right", num: true },
] as const;

type Columna = (typeof COLUMNAS)[number]["id"];

interface Respuesta {
  configurado: boolean;
  cuentas: { id: string; correo: string }[];
  conexion: { id: string; correo: string } | null;
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
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({
    col: "impresiones",
    asc: false,
  });

  /** Al cambiar de columna se arranca por lo interesante: lo alto en números,
   *  alfabético en textos. Volver a pulsar invierte. */
  function ordenar(col: Columna) {
    setOrden((o) =>
      o.col === col
        ? { col, asc: !o.asc }
        : { col, asc: !COLUMNAS.find((c) => c.id === col)!.num }
    );
  }

  async function cargar(d: number) {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/gsc?cliente=${encodeURIComponent(clienteId)}&dias=${d}`);
      const j = await r.json();

      // Un fallo al hablar con Google no debe borrar el resto: la pantalla
      // sigue necesitando saber si hay cuenta conectada para ofrecer el botón
      // de reconectar, que suele ser justo lo que hace falta.
      if (j?.configurado !== undefined) setDatos(j);
      if (!r.ok) throw new Error(j.error || "No se pudieron leer los datos.");
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

  async function guardar(cuerpo: Record<string, unknown>) {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/gsc", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, ...cuerpo }),
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

  const aviso = error && (
    <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
  );

  if (!datos?.configurado) {
    return (
      <p className="mt-4 rounded-2xl bg-black/[0.03] px-4 py-3 text-[13px] text-[color:var(--tinta-media)]">
        Search Console no está habilitado en este panel. Un administrador debe configurarlo en Ajustes.
      </p>
    );
  }

  // Sin cuenta de Google no hay nada que pedir. Se ofrece autorizar una nueva
  // o reutilizar otra ya autorizada, porque una misma cuenta suele dar acceso
  // a todos los sitios de una agencia.
  if (!datos.conexion) {
    return (
      <div className="mt-4">
        {aviso}
        <div className="rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] p-6 text-center">
          <p className="text-[15px] font-medium">Conecta Search Console</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Autoriza la cuenta de Google que tiene acceso a este sitio. El panel solo podrá leer los
            datos de búsqueda, y puedes revocar el permiso desde tu cuenta de Google cuando quieras.
          </p>

          {puedeEditar ? (
            <a href={`/api/gsc/conectar?cliente=${encodeURIComponent(clienteId)}`} className="boton-fuerte mt-4">
              Conectar con Google
            </a>
          ) : (
            <p className="mt-3 text-[12px] text-[color:var(--tinta-suave)]">
              No tienes permiso para conectar cuentas.
            </p>
          )}

          {datos.cuentas.length > 0 && puedeEditar && (
            <div className="mt-6 border-t border-[color:var(--linea)] pt-4">
              <p className="rotulo">O usa una cuenta ya autorizada</p>
              <ul className="mt-2 flex flex-wrap justify-center gap-2">
                {datos.cuentas.map((c) => (
                  <li key={c.id}>
                    <button
                      disabled={cargando}
                      onClick={() => guardar({ conexionId: c.id })}
                      className="boton !text-[12px]"
                    >
                      {c.correo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sin propiedad asignada no hay datos que pedir: primero hay que decir cuál
  // de las propiedades de Google corresponde a este cliente.
  if (!datos.propiedad) {
    return (
      <div className="mt-4">
        {aviso}
        <div className="rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] p-5">
          <p className="text-[13px] font-medium">¿Qué propiedad corresponde a este cliente?</p>
          <p className="mt-1 text-[12px] text-[color:var(--tinta-suave)]">
            Conectado como {datos.conexion.correo}
          </p>

          {datos.propiedades.length === 0 ? (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
              Esa cuenta de Google no tiene ninguna propiedad verificada en Search Console. Prueba con
              otra cuenta.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {datos.propiedades.map((x) => (
                <li key={x.url}>
                  <button
                    disabled={!puedeEditar || cargando}
                    onClick={() => guardar({ propiedad: x.url })}
                    className="boton font-mono !text-[12px]"
                  >
                    {x.url}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {puedeEditar && (
            <button
              onClick={() => guardar({ conexionId: "" })}
              className="mt-4 text-[12px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
            >
              Usar otra cuenta de Google
            </button>
          )}
        </div>
      </div>
    );
  }

  const filas = datos.filas ?? [];
  const oportunidades = filas.filter(esOportunidad);

  const visibles = (vista === "oportunidades" ? oportunidades : filas)
    .filter(
      (f) =>
        !busca.trim() ||
        f.consulta.includes(busca.trim().toLowerCase()) ||
        (f.pagina ?? "").toLowerCase().includes(busca.trim().toLowerCase())
    )
    .sort((a, b) => {
      const x = a[orden.col] ?? "";
      const y = b[orden.col] ?? "";
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "es");
      return orden.asc ? cmp : -cmp;
    })
    .slice(0, 200);

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
        {puedeEditar && (
          <button
            onClick={() => guardar({ propiedad: "" })}
            className="ml-auto text-[12px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
            title={`Conectado como ${datos.conexion.correo}`}
          >
            Cambiar propiedad
          </button>
        )}
      </div>

      {aviso}

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
        <table className="w-full min-w-[840px] border-collapse text-[13px]">
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
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-[color:var(--tinta-suave)]">
                  {vista === "oportunidades"
                    ? "No hay consultas entre los puestos 4 y 20 con impresiones suficientes."
                    : "Search Console no devolvió datos para este periodo."}
                </td>
              </tr>
            ) : (
              visibles.map((f) => (
                <tr key={f.consulta} className="align-top transition hover:bg-black/[0.015]">
                  <td className="px-5 py-2.5">
                    {f.consulta}
                    {f.paginas > 1 && (
                      <span
                        className="ml-2 pastilla bg-amber-50 text-amber-700"
                        title={`${f.paginas} páginas del sitio compiten por esta consulta`}
                      >
                        {f.paginas} URLs
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {f.pagina ? (
                      <a
                        href={f.pagina}
                        target="_blank"
                        rel="noopener"
                        className="block max-w-[260px] truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                        title={f.pagina}
                      >
                        {f.pagina.replace(/^https?:\/\/[^/]+/, "") || "/"}
                      </a>
                    ) : (
                      <span className="text-[color:var(--tinta-suave)]">—</span>
                    )}
                  </td>
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
