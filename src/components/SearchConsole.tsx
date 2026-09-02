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
  urls: { url: string; impresiones: number; clics: number; posicion: number }[];
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
  dominio: string;
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
  ["canibal", "Canibalizaciones"],
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

/**
 * Dos o más páginas del sitio peleando por la misma consulta.
 *
 * No basta con que Google haya mostrado varias: prueba páginas continuamente y
 * eso sería ruido. Se exige que la segunda tenga peso real —al menos un quinto
 * de las impresiones— porque solo entonces hay reparto de fuerza que arreglar.
 */
function esCanibal(f: Fila) {
  if (f.paginas < 2 || f.impresiones < 20) return false;
  const segunda = f.urls[1];
  return Boolean(segunda && segunda.impresiones / f.impresiones >= 0.2);
}

/** Cuánto se lleva la página principal. Por debajo del 60 % el reparto duele. */
function dominio(f: Fila) {
  return f.urls[0] && f.impresiones ? Math.round((f.urls[0].impresiones / f.impresiones) * 100) : 100;
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
  const [buscaProp, setBuscaProp] = useState("");
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

  // Con cien propiedades en la cuenta, encontrar la del cliente a ojo es una
  // tarea: las que contienen su dominio suben arriba, y hay buscador.
  const raiz = (datos.dominio ?? "").replace(/^www\./, "").toLowerCase();
  const propiedadesOrdenadas = [...datos.propiedades]
    .filter((x) => !buscaProp.trim() || x.url.toLowerCase().includes(buscaProp.trim().toLowerCase()))
    .sort((a, b) => {
      const pesa = (u: string) => (raiz && u.toLowerCase().includes(raiz) ? 0 : 1);
      return pesa(a.url) - pesa(b.url) || a.url.localeCompare(b.url);
    });

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
            <>
              <input
                value={buscaProp}
                onChange={(e) => setBuscaProp(e.target.value)}
                placeholder="Buscar propiedad…"
                className="mt-3 w-full max-w-sm rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-1.5 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
              />

              <p className="mt-2 text-[12px] text-[color:var(--tinta-suave)]">
                {datos.propiedades.length} propiedades en esta cuenta, las de este dominio primero.
                Cuidado con la variante: para Google, una propiedad con «www» y otra sin él son dos
                sitios distintos, y la equivocada devuelve casi nada.
              </p>

              <ul className="scroll-fino mt-3 flex max-h-72 flex-wrap gap-2 overflow-y-auto">
                {propiedadesOrdenadas.map((x) => (
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
            </>
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
  const canibales = filas.filter(esCanibal);

  const conjunto =
    vista === "oportunidades" ? oportunidades : vista === "canibal" ? canibales : filas;

  const visibles = conjunto
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

  /** Cuántas consultas caen dentro de ese puesto. Acumulativo. */
  const top = (n: number) => filas.filter((f) => f.posicion <= n).length;

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
          ["Palabras posicionadas", filas.length.toLocaleString("es-CL"), ""],
          ["Clics", clics.toLocaleString("es-CL"), ""],
          ["Impresiones", impresiones.toLocaleString("es-CL"), ""],
          ["Posición media", media !== null ? String(media) : "—", ""],
        ].map(([k, v, color]) => (
          <div key={k} className="px-5 py-4">
            <dt className="rotulo">{k}</dt>
            <dd className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{v}</dd>
          </div>
        ))}
      </dl>

      {/* Los tramos son acumulativos, como en cualquier herramienta de SEO: el
          top 10 incluye al top 3. Por franjas sueltas saldrían números que
          nadie suma de cabeza. */}
      <dl className="tarjeta mt-3 grid grid-cols-2 divide-x divide-[color:var(--linea)] overflow-hidden sm:grid-cols-5">
        {[
          ["Top 3", top(3), "text-emerald-600"],
          ["Top 10", top(10), "text-emerald-600"],
          ["Top 20", top(20), ""],
          ["Top 100", top(100), ""],
          ["Canibalizando", canibales.length, canibales.length ? "text-red-600" : ""],
        ].map(([k, v, color]) => (
          <div key={String(k)} className="px-5 py-4">
            <dt className="rotulo">{String(k)}</dt>
            <dd className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>
              {Number(v).toLocaleString("es-CL")}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
        {oportunidades.length > 0 && (
          <>
            <strong className="font-semibold text-[color:var(--tinta)]">{oportunidades.length}</strong>{" "}
            oportunidades: consultas entre los puestos 4 y 20 con impresiones reales, donde Google ya
            considera relevante la página y mejorarla rinde más que atacar algo desde cero.{" "}
          </>
        )}
        {canibales.length > 0 && (
          <>
            Y{" "}
            <strong className="font-semibold text-[color:var(--tinta)]">{canibales.length}</strong>{" "}
            consultas donde dos o más páginas tuyas se reparten las impresiones.
          </>
        )}
      </p>

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

      {vista === "canibal" ? (
        <div className="mt-3 space-y-3">
          {visibles.length === 0 ? (
            <p className="tarjeta px-5 py-8 text-center text-[13px] text-[color:var(--tinta-suave)]">
              Ninguna consulta con dos páginas repartiéndose las impresiones. Buena señal.
            </p>
          ) : (
            visibles.map((f) => (
              <div key={f.consulta} className="tarjeta p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-[14px] font-semibold">{f.consulta}</p>
                  <span
                    className={`pastilla ${
                      dominio(f) < 60 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {f.paginas} páginas
                  </span>
                  <span className="text-[12px] text-[color:var(--tinta-suave)]">
                    la principal se lleva el {dominio(f)}% · posición media {f.posicion} ·{" "}
                    {f.impresiones.toLocaleString("es-CL")} impresiones
                  </span>
                  {puedeEditar && onSeguir && (
                    <button
                      onClick={() => onSeguir(f.consulta)}
                      className="ml-auto text-[12px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
                    >
                      Seguir
                    </button>
                  )}
                </div>

                <ul className="mt-3 divide-y divide-[color:var(--linea)] border-t border-[color:var(--linea)]">
                  {f.urls.map((u, i) => (
                    <li key={u.url} className="flex flex-wrap items-baseline gap-x-3 py-2 text-[13px]">
                      <span
                        className={`pastilla shrink-0 ${
                          i === 0 ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-[color:var(--tinta-media)]"
                        }`}
                      >
                        {i === 0 ? "principal" : "compite"}
                      </span>
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener"
                        className="min-w-0 flex-1 truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                        title={u.url}
                      >
                        {u.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                      </a>
                      <span className="shrink-0 tabular-nums text-[color:var(--tinta-media)]">
                        pos. {u.posicion}
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-[color:var(--tinta-suave)]">
                        {u.impresiones.toLocaleString("es-CL")} impr.
                      </span>
                      <span className="w-16 shrink-0 text-right tabular-nums text-[color:var(--tinta-suave)]">
                        {u.clics} clics
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
                  Decide qué página debe quedarse con esta búsqueda y quítale la intención a las otras:
                  cambia sus títulos y encabezados, o enlázalas hacia la elegida.
                </p>
              </div>
            ))
          )}
        </div>
      ) : (
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
      )}

      <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
        Datos reales de Google, sin coste. La posición es un promedio de todas las veces que el sitio
        se mostró en el periodo, no la foto de un momento — por eso sale con decimales y no coincide
        exactamente con lo que mide DataForSEO. Search Console va con dos o tres días de retraso, así
        que el periodo termina ahí.
      </p>
    </div>
  );
}
