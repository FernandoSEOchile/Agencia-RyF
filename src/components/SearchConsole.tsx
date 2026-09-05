"use client";

import { useEffect, useState } from "react";
import Periodo, { usePeriodo } from "@/components/Periodo";
import Esqueleto from "@/components/Esqueleto";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import { LineasTramos, type MesGsc } from "@/components/Grafico";
import { miles } from "@/lib/formato";
import { descargarCsv } from "@/lib/csv";

/**
 * Search Console: lo que Google dice que pasa con el sitio.
 *
 * Es una pantalla propia y no un apéndice de Posiciones porque son dos cosas
 * distintas: esto es la verdad de Google —gratis, con dos días de retraso,
 * promedios—, y Posiciones es una medición exacta que se paga por consulta.
 * Mezclarlas en una pantalla hacía que las cifras de una se leyeran como si
 * fueran de la otra.
 *
 * Aquí están todas las búsquedas por las que el sitio salió, con su posición,
 * cuánto cambió respecto al periodo anterior, los tramos (top 3, 10, 20, 100)
 * y la curva de cuántas palabras hay en cada tramo mes a mes.
 */

interface Fila {
  consulta: string;
  clics: number;
  impresiones: number;
  ctr: number;
  posicion: number;
  pagina: string | null;
  paginas: number;
  urls: { url: string; impresiones: number; clics: number; posicion: number }[];
  /** La misma consulta en el periodo anterior; nula si es nueva. */
  antes: { posicion: number; clics: number; impresiones: number } | null;
}

interface Resumen {
  consultas: number;
  clics: number;
  impresiones: number;
  media: number | null;
  top3: number;
  top10: number;
  top20: number;
  top100: number;
}

interface Respuesta {
  configurado: boolean;
  cuentas: { id: string; correo: string }[];
  conexion: { id: string; correo: string } | null;
  propiedades: { url: string; permiso: string }[];
  propiedad: string | null;
  dominio: string;
  dias?: number;
  filas: Fila[];
  anterior?: Resumen | null;
  error?: string;
}

type Col = "consulta" | "pagina" | "posicion" | "cambio" | "clics" | "impresiones" | "ctr" | "seguir";

/** La posición arranca por la mejor: es lo que se quiere ver primero. */
const COLUMNAS: readonly Columna<Col>[] = [
  { id: "consulta", texto: "Consulta" },
  { id: "pagina", texto: "URL que posiciona" },
  { id: "posicion", texto: "Posición", clase: "text-right" },
  { id: "cambio", texto: "Cambio", clase: "text-right", num: true },
  { id: "clics", texto: "Clics", clase: "text-right", num: true },
  { id: "impresiones", texto: "Impresiones", clase: "text-right", num: true },
  { id: "ctr", texto: "CTR", clase: "text-right", num: true },
  { id: "seguir", texto: "", fija: true },
];

const VISTAS = [
  ["todo", "Todas las búsquedas"],
  ["oportunidades", "Oportunidades"],
  ["canibal", "Canibalizaciones"],
] as const;

/** Los tramos con los que se filtra la tabla. Sueltos, no acumulados: cada uno es una franja. */
const TRAMOS = [
  ["todas", "Todas las posiciones"],
  ["top3", "1 a 3"],
  ["top10", "4 a 10"],
  ["top20", "11 a 20"],
  ["top50", "21 a 50"],
  ["top100", "51 a 100"],
  ["nuevas", "Nuevas en el periodo"],
  ["subieron", "Subieron"],
  ["bajaron", "Bajaron"],
] as const;
type Tramo = (typeof TRAMOS)[number][0];

const PAGINA = 100;

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

/** Puestos ganados (positivo) o perdidos respecto al periodo anterior. */
function cambio(f: Fila): number | null {
  return f.antes ? Math.round((f.antes.posicion - f.posicion) * 10) / 10 : null;
}

function enTramo(f: Fila, t: Tramo): boolean {
  switch (t) {
    case "todas":
      return true;
    case "top3":
      return f.posicion <= 3;
    case "top10":
      return f.posicion > 3 && f.posicion <= 10;
    case "top20":
      return f.posicion > 10 && f.posicion <= 20;
    case "top50":
      return f.posicion > 20 && f.posicion <= 50;
    case "top100":
      return f.posicion > 50 && f.posicion <= 100;
    case "nuevas":
      return f.antes === null;
    case "subieron":
      return (cambio(f) ?? 0) >= 1;
    case "bajaron":
      return (cambio(f) ?? 0) <= -1;
  }
}

function resumir(filas: Fila[]): Resumen {
  const top = (n: number) => filas.filter((f) => f.posicion <= n).length;
  return {
    consultas: filas.length,
    clics: filas.reduce((s, f) => s + f.clics, 0),
    impresiones: filas.reduce((s, f) => s + f.impresiones, 0),
    media: filas.length ? Math.round((filas.reduce((s, f) => s + f.posicion, 0) / filas.length) * 10) / 10 : null,
    top3: top(3),
    top10: top(10),
    top20: top(20),
    top100: top(100),
  };
}

/** Variación en porcentaje contra el periodo anterior; nula sin base. */
function variacion(ahora: number, antes: number | null | undefined): number | null {
  if (antes == null || antes === 0) return null;
  return Math.round(((ahora - antes) / antes) * 100);
}

function Delta({ n, invertido = false, sufijo = "" }: { n: number | null; invertido?: boolean; sufijo?: string }) {
  if (n === null) return null;
  if (n === 0) return <span className="text-[12px] text-[color:var(--tinta-suave)]">= vs. anterior</span>;
  const bien = invertido ? n < 0 : n > 0;
  return (
    <span className={`text-[12px] font-medium tabular-nums ${bien ? "text-emerald-700" : "text-red-600"}`}>
      {n > 0 ? "▲" : "▼"} {miles(Math.abs(n))}
      {sufijo} <span className="font-normal text-[color:var(--tinta-suave)]">vs. anterior</span>
    </span>
  );
}

export default function SearchConsole({
  clienteId,
  puedeEditar,
  onSeguir,
  soloCanibal,
  irA,
}: {
  clienteId: string;
  puedeEditar: boolean;
  /** Qué hacer al pulsar «Seguir». Sin esto, la consulta se añade al seguimiento de Posiciones. */
  onSeguir?: (consulta: string) => void;
  /**
   * Solo las canibalizaciones.
   *
   * Lo usa la pestaña Técnico, donde la canibalización es una comprobación más
   * y no el sitio donde uno se pone a explorar Search Console. Es el mismo
   * componente a propósito: dos implementaciones de «qué páginas compiten
   * entre sí» acabarían dando dos números distintos.
   */
  soloCanibal?: boolean;
  /** Para saltar a otra pestaña de la ficha, como Posiciones tras «Seguir». */
  irA?: (pestaña: string) => void;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const { dias, setDias, permitidos } = usePeriodo(28, [28, 90, 180, 365]);
  const [vista, setVista] = useState<(typeof VISTAS)[number][0]>("todo");
  const [tramo, setTramo] = useState<Tramo>("todas");
  const [busca, setBusca] = useState("");
  const [buscaProp, setBuscaProp] = useState("");
  const [ver, setVer] = useState(PAGINA);
  const [siguiendo, setSiguiendo] = useState<string | null>(null);
  const [meses, setMeses] = useState<MesGsc[] | null>(null);
  const [mesesError, setMesesError] = useState(false);
  const { orden, ordenar, ordenarPor } = useOrden<Col>("impresiones", false);

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
    setVer(PAGINA);
    cargar(dias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  // La curva mensual va aparte y después: la primera vez puede tardar, porque
  // cada mes que no esté guardado es una llamada a Google, y la tabla no
  // tiene por qué esperarla.
  const hayPropiedad = Boolean(datos?.conexion && datos?.propiedad);
  useEffect(() => {
    if (!hayPropiedad || soloCanibal || meses) return;
    let vivo = true;
    fetch(`/api/gsc/tramos?cliente=${encodeURIComponent(clienteId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (Array.isArray(j?.meses)) setMeses(j.meses);
        else setMesesError(true);
      })
      .catch(() => vivo && setMesesError(true));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayPropiedad, clienteId]);

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
      setMeses(null);
      await cargar(dias);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCargando(false);
    }
  }

  /** Pasa una consulta al seguimiento medido de Posiciones. */
  async function seguir(consulta: string) {
    if (onSeguir) {
      onSeguir(consulta);
      return;
    }
    setSiguiendo(consulta);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/posiciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, terminos: consulta, ubicacion: 2152, dispositivo: "desktop" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se pudo seguir.");
      setAviso(`«${consulta}» añadida al seguimiento medido. Mídela desde Posiciones.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSiguiendo(null);
    }
  }

  if (cargando && !datos) {
    return (
      <>
        <Esqueleto tipo="cifras" />
        <Esqueleto tipo="tabla" />
      </>
    );
  }

  const avisoError = error && (
    <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>
  );

  if (!datos?.configurado) {
    return (
      <p className="mt-4 rounded-2xl bg-black/[0.03] px-4 py-3 text-[14px] text-[color:var(--tinta-media)]">
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
        {avisoError}
        <div className="rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] p-6 text-center">
          <p className="text-[15px] font-medium">Conecta Search Console</p>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-[color:var(--tinta-media)]">
            Autoriza la cuenta de Google que tiene acceso a este sitio. El panel solo podrá leer los
            datos de búsqueda, y puedes revocar el permiso desde tu cuenta de Google cuando quieras.
          </p>

          {puedeEditar ? (
            <a href={`/api/gsc/conectar?cliente=${encodeURIComponent(clienteId)}`} className="boton-fuerte mt-4">
              Conectar con Google
            </a>
          ) : (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
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
                      className="boton !text-[13px]"
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
        {avisoError}
        <div className="rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] p-5">
          <p className="text-[14px] font-medium">¿Qué propiedad corresponde a este cliente?</p>
          <p className="mt-1 text-[13px] text-[color:var(--tinta-suave)]">
            Conectado como {datos.conexion.correo}
          </p>

          {datos.propiedades.length === 0 ? (
            <p className="mt-3 text-[14px] text-[color:var(--tinta-media)]">
              Esa cuenta de Google no tiene ninguna propiedad verificada en Search Console. Prueba con
              otra cuenta.
            </p>
          ) : (
            <>
              <input
                value={buscaProp}
                onChange={(e) => setBuscaProp(e.target.value)}
                placeholder="Buscar propiedad…"
                className="mt-3 w-full max-w-sm rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-1.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
              />

              <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">
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
                      className="boton font-mono !text-[13px]"
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
              className="mt-4 text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
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
  const ahora = resumir(filas);
  const antes = datos.anterior ?? null;

  const q = busca.trim().toLowerCase();
  const coincide = (f: Fila) => !q || f.consulta.includes(q) || (f.pagina ?? "").toLowerCase().includes(q);

  const conjunto = vista === "oportunidades" ? oportunidades : vista === "canibal" ? canibales : filas;
  const filtradas = conjunto.filter((f) => coincide(f) && enTramo(f, tramo));
  const ordenadas = ordenarPor(filtradas, (f, c) => {
    switch (c) {
      case "consulta":
        return f.consulta;
      case "pagina":
        return f.pagina ?? "";
      case "posicion":
        return f.posicion;
      case "cambio":
        // Las nuevas van al final en cualquier sentido: no tienen cambio.
        return cambio(f) ?? (orden.asc ? 9999 : -9999);
      case "clics":
        return f.clics;
      case "impresiones":
        return f.impresiones;
      case "ctr":
        return f.ctr;
      case "seguir":
        return "";
    }
  });
  const visibles = ordenadas.slice(0, ver);

  const barra = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Periodo dias={dias} setDias={setDias} permitidos={permitidos} />
      <span className="font-mono text-[12px] text-[color:var(--tinta-suave)]">{datos.propiedad}</span>
      {cargando && <span className="text-[13px] text-[color:var(--tinta-suave)]">actualizando…</span>}
      {puedeEditar && (
        <button
          onClick={() => guardar({ propiedad: "" })}
          className="ml-auto text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
          title={`Conectado como ${datos.conexion.correo}`}
        >
          Cambiar propiedad
        </button>
      )}
    </div>
  );

  const botonSeguir = (f: Fila) =>
    puedeEditar && (
      <button
        onClick={() => seguir(f.consulta)}
        disabled={siguiendo !== null}
        className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)] disabled:opacity-50"
        title="Añadir al seguimiento medido de Posiciones"
      >
        {siguiendo === f.consulta ? "Añadiendo…" : "Seguir"}
      </button>
    );

  const tarjetasCanibal = (lista: Fila[]) => (
    <div className="mt-3 space-y-3">
      {lista.length === 0 ? (
        <p className="tarjeta px-5 py-8 text-center text-[14px] text-[color:var(--tinta-suave)]">
          Ninguna consulta con dos páginas repartiéndose las impresiones. Buena señal.
        </p>
      ) : (
        lista.map((f) => (
          <div key={f.consulta} className="tarjeta p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[14px] font-semibold">{f.consulta}</p>
              <span className={`pastilla ${dominio(f) < 60 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                {f.paginas} páginas
              </span>
              <span className="text-[13px] text-[color:var(--tinta-suave)]">
                la principal se lleva el {dominio(f)}% · posición media {f.posicion} · {miles(f.impresiones)} impresiones
              </span>
              <span className="ml-auto">{botonSeguir(f)}</span>
            </div>

            <ul className="mt-3 divide-y divide-[color:var(--linea)] border-t border-[color:var(--linea)]">
              {f.urls.map((u, i) => (
                <li key={u.url} className="flex flex-wrap items-baseline gap-x-3 py-2 text-[14px]">
                  <span className={`pastilla shrink-0 ${i === 0 ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-[color:var(--tinta-media)]"}`}>
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
                  <span className="shrink-0 tabular-nums text-[color:var(--tinta-media)]">pos. {u.posicion}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-[color:var(--tinta-suave)]">{miles(u.impresiones)} impr.</span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-[color:var(--tinta-suave)]">{u.clics} clics</span>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--tinta-suave)]">
              Decide qué página debe quedarse con esta búsqueda y quítale la intención a las otras:
              cambia sus títulos y encabezados, o enlázalas hacia la elegida.
            </p>
          </div>
        ))
      )}
    </div>
  );

  if (soloCanibal) {
    return (
      <div className="mt-4">
        {barra}
        {avisoError}
        {tarjetasCanibal([...canibales].sort((a, b) => b.impresiones - a.impresiones))}
      </div>
    );
  }

  const tabla = (
    <div className="tarjeta mt-3 overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-[14px]">
        <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
        <tbody className="divide-y divide-[color:var(--linea)]">
          {visibles.length === 0 ? (
            <tr>
              <td colSpan={COLUMNAS.length} className="px-5 py-8 text-center text-[14px] text-[color:var(--tinta-suave)]">
                {filas.length === 0
                  ? "Search Console no devolvió datos para este periodo."
                  : vista === "oportunidades" && !q && tramo === "todas"
                    ? "No hay consultas entre los puestos 4 y 20 con impresiones suficientes."
                    : "Nada coincide con ese filtro."}
              </td>
            </tr>
          ) : (
            visibles.map((f) => {
              const c = cambio(f);
              return (
                <tr key={f.consulta} className="align-top transition hover:bg-black/[0.015]">
                  <td className="px-5 py-2.5">
                    {f.consulta}
                    {f.paginas > 1 && (
                      <span className="ml-2 pastilla bg-amber-50 text-amber-700" title={`${f.paginas} páginas del sitio compiten por esta consulta`}>
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
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${f.posicion <= 3 ? "text-emerald-600" : f.posicion <= 10 ? "" : "text-[color:var(--tinta-media)]"}`}>
                    {f.posicion}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {c === null ? (
                      <span className="pastilla bg-[color:var(--acento)]/10 text-[color:var(--acento)]" title="No aparecía en el periodo anterior">nueva</span>
                    ) : c === 0 ? (
                      <span className="text-[color:var(--tinta-suave)]">=</span>
                    ) : (
                      <span className={c > 0 ? "text-emerald-700" : "text-red-600"} title={`Antes en el puesto ${f.antes?.posicion}`}>
                        {c > 0 ? "▲" : "▼"} {Math.abs(c)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{miles(f.clics)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">{miles(f.impresiones)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">{(f.ctr * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right">{botonSeguir(f)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="mt-4">
      {barra}
      {avisoError}
      {aviso && (
        <p className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">
          {aviso}
          {irA && (
            <button type="button" onClick={() => irA("posiciones")} className="font-medium underline-offset-4 hover:underline">
              Ir a Posiciones →
            </button>
          )}
        </p>
      )}

      {/* Las cifras del periodo, cada una contra el periodo anterior de verdad
          —el mismo número de días justo antes—, no contra la mitad del mismo. */}
      <dl className="tarjeta tarjeta-destacada mt-4 grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4 [&>*]:ring-1 [&>*]:ring-[color:var(--linea)]">
        {(
          [
            { k: "Palabras posicionadas", v: miles(ahora.consultas), d: variacion(ahora.consultas, antes?.consultas) },
            { k: "Clics", v: miles(ahora.clics), d: variacion(ahora.clics, antes?.clics) },
            { k: "Impresiones", v: miles(ahora.impresiones), d: variacion(ahora.impresiones, antes?.impresiones) },
            {
              k: "Posición media",
              v: ahora.media !== null ? String(ahora.media) : "—",
              d: ahora.media !== null && antes?.media != null ? Math.round((ahora.media - antes.media) * 10) / 10 : null,
              invertido: true,
              sufijo: " puestos",
            },
          ] as { k: string; v: string; d: number | null; invertido?: boolean; sufijo?: string }[]
        ).map((c) => (
          <div key={c.k} className="bg-[color:var(--panel)] px-5 py-4">
            <dt className="rotulo">{c.k}</dt>
            <dd className="mt-1.5 cifra text-[28px] leading-none">{c.v}</dd>
            <dd className="mt-1.5 min-h-[18px]">
              <Delta n={c.d} invertido={c.invertido} sufijo={c.sufijo ?? "%"} />
            </dd>
          </div>
        ))}
      </dl>

      {/* Los tramos son acumulativos, como en cualquier herramienta de SEO: el
          top 10 incluye al top 3. Por franjas sueltas saldrían números que
          nadie suma de cabeza. */}
      <dl className="tarjeta mt-3 grid gap-px overflow-hidden sm:grid-cols-3 lg:grid-cols-5 [&>*]:ring-1 [&>*]:ring-[color:var(--linea)]">
        {[
          { k: "Top 3", v: ahora.top3, d: antes ? ahora.top3 - antes.top3 : null, color: "text-emerald-600", filtro: "top3" as Tramo },
          { k: "Top 10", v: ahora.top10, d: antes ? ahora.top10 - antes.top10 : null, color: "text-emerald-600", filtro: "top10" as Tramo },
          { k: "Top 20", v: ahora.top20, d: antes ? ahora.top20 - antes.top20 : null, color: "", filtro: "top20" as Tramo },
          { k: "Top 100", v: ahora.top100, d: antes ? ahora.top100 - antes.top100 : null, color: "", filtro: "top100" as Tramo },
          { k: "Canibalizando", v: canibales.length, d: null, color: canibales.length ? "text-red-600" : "", filtro: null },
        ].map((c) => (
          <div key={c.k} className="bg-[color:var(--panel)] px-5 py-4">
            <dt className="rotulo">{c.k}</dt>
            <dd className={`mt-1.5 cifra text-[24px] leading-none ${c.color}`}>
              {miles(c.v)}
              <span className="ml-1.5 text-[13px] font-normal text-[color:var(--tinta-suave)]">{pct(c.v, ahora.consultas)}%</span>
            </dd>
            <dd className="mt-1.5 min-h-[18px]">
              {c.filtro ? <Delta n={c.d} /> : null}
            </dd>
          </div>
        ))}
      </dl>

      {/* La curva mensual. Sale de lo guardado mes a mes: la primera vez tarda
          lo que tarde Google, las siguientes ya está. */}
      <div className="mt-4">
        {meses === null && !mesesError && <Esqueleto tipo="grafico" />}
        {meses && meses.length > 1 && <LineasTramos meses={meses} />}
        {meses && meses.length <= 1 && (
          <p className="text-[13px] text-[color:var(--tinta-suave)]">
            La curva mensual necesita al menos dos meses con datos en Search Console.
          </p>
        )}
        {mesesError && (
          <p className="text-[13px] text-[color:var(--tinta-suave)]">No se pudo leer la curva mensual; la tabla no depende de ella.</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="segmentos">
          {VISTAS.map(([id, n]) => (
            <button
              key={id}
              onClick={() => {
                setVista(id);
                setVer(PAGINA);
              }}
              className={`segmento ${vista === id ? "segmento-activo" : ""}`}
            >
              {n}
              <span className="ml-1.5 tabular-nums text-[color:var(--tinta-suave)]">
                {miles(id === "todo" ? filas.length : id === "oportunidades" ? oportunidades.length : canibales.length)}
              </span>
            </button>
          ))}
        </div>
        {vista !== "canibal" && (
          <select
            value={tramo}
            onChange={(e) => {
              setTramo(e.target.value as Tramo);
              setVer(PAGINA);
            }}
            aria-label="Tramo de posición"
            className="h-9 cursor-pointer rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 text-[13.5px] font-medium outline-none transition focus:border-[color:var(--acento)]"
          >
            {TRAMOS.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        )}
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setVer(PAGINA);
          }}
          placeholder="Filtrar consultas o URL…"
          aria-label="Filtrar consultas"
          className="w-60 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-1.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
        />
        <span className="text-[13px] text-[color:var(--tinta-suave)]">
          {miles(filtradas.length)} {filtradas.length === 1 ? "consulta" : "consultas"}
        </span>
        {vista !== "canibal" && filtradas.length > 0 && (
          <button
            type="button"
            onClick={() =>
              descargarCsv(
                `search-console-${dias}d`,
                ordenadas.map((f) => ({
                  consulta: f.consulta,
                  url: f.pagina ?? "",
                  posicion: f.posicion,
                  posicion_anterior: f.antes?.posicion ?? "",
                  clics: f.clics,
                  impresiones: f.impresiones,
                  ctr: Math.round(f.ctr * 1000) / 10,
                  paginas: f.paginas,
                }))
              )
            }
            className="ml-auto text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
          >
            Descargar CSV
          </button>
        )}
      </div>

      {vista === "canibal" ? (
        tarjetasCanibal(ordenadas.length > ver ? ordenadas.slice(0, ver) : ordenadas)
      ) : (
        tabla
      )}
      {ordenadas.length > ver && (
        <button
          type="button"
          onClick={() => setVer((v) => v + 200)}
          className="mt-2 text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
        >
          Ver 200 más · quedan {miles(ordenadas.length - ver)}
        </button>
      )}

      <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-[color:var(--tinta-suave)]">
        Datos reales de Google, sin coste. La posición es un promedio de todas las veces que el sitio
        se mostró en el periodo, no la foto de un momento — por eso sale con decimales y no coincide
        exactamente con lo que mide DataForSEO en Posiciones. «Cambio» compara con los {dias} días
        anteriores al periodo. Search Console va con dos o tres días de retraso, así que el periodo
        termina ahí.
      </p>
    </div>
  );
}
