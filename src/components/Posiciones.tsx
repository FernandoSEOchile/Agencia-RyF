"use client";

import { useConfirmar } from "@/components/Confirmar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchConsole, { type ResumenGsc } from "@/components/SearchConsole";
import Chispa from "@/components/Chispa";
import { dinero, fecha, miles } from "@/lib/formato";
import { descargarCsv } from "@/lib/csv";
import { Cabecera, useOrden, type Columna as ColumnaTabla } from "@/components/Tabla";

/**
 * Posiciones: lo que Google dice que pasa y lo que medimos a propósito.
 *
 * Son dos fuentes distintas y conviene no confundirlas: Search Console es la
 * verdad de Google —gratis, con dos días de retraso, promedios— y la medición
 * directa es una foto exacta de un puesto, que se paga por consulta. Antes
 * había que elegir una fuente con un interruptor y cada una traía sus propias
 * cifras; ahora las dos se leen en la misma cabecera y debajo van apiladas,
 * con lo accionable —qué medir, qué oportunidades, qué canibaliza— arriba.
 */

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
  historial: (number | null)[];
  /** El bloque de IA de Google en esa búsqueda: nulo si no se midió. */
  iaOverview: boolean | null;
  iaCitado: boolean | null;
}

/** La foto de DataForSEO del dominio: lo que ya posiciona, estimado. */
export interface ExploracionVista {
  creado: string;
  resumen: {
    keywords: number;
    trafico: number;
    valor: number;
    tramos: { pos1: number; pos2a3: number; pos4a10: number; pos11a20: number; pos21a50: number; pos51a100: number };
  };
  keywords: { keyword: string; posicion: number; volumen: number; trafico: number; cpc: number; url: string | null }[];
}

type ColEx = "keyword" | "posicion" | "volumen" | "trafico" | "url" | "seguir";
const COL_EX: readonly ColumnaTabla<ColEx>[] = [
  { id: "keyword", texto: "Palabra" },
  { id: "posicion", texto: "Posición", clase: "text-right", num: true },
  { id: "volumen", texto: "Volumen", clase: "text-right", num: true },
  { id: "trafico", texto: "Tráfico est.", clase: "text-right", num: true },
  { id: "url", texto: "URL" },
  { id: "seguir", texto: "", fija: true },
];

const UBICACIONES = [
  [2152, "Chile"],
  [2484, "México"],
  [2032, "Argentina"],
  [2170, "Colombia"],
  [2604, "Perú"],
  [2724, "España"],
  [2840, "Estados Unidos"],
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
  return k.anterior - k.puesto;
}

function colorPuesto(p: number | null) {
  if (p === null) return "text-[color:var(--tinta-suave)]";
  if (p <= 3) return "text-emerald-600";
  if (p <= 10) return "text-[color:var(--tinta)]";
  if (p <= 20) return "text-amber-600";
  return "text-[color:var(--tinta-media)]";
}

/**
 * La distribución por tramos como una barra, no como cinco cifras sueltas.
 *
 * Cuatro tramos y cuatro tonos: cuánto del sitio está en la parte de la
 * página que la gente ve, cuánto está a un empujón, y cuánto no. Se lee en
 * medio segundo; los números van debajo para quien los quiera exactos.
 */
function Distribucion({ top3, top10, top20, total }: { top3: number; top10: number; top20: number; total: number }) {
  if (total <= 0) return null;
  const tramos: [number, string, string][] = [
    [top3, "bg-emerald-600", "1–3"],
    [top10 - top3, "bg-emerald-400", "4–10"],
    [top20 - top10, "bg-amber-400", "11–20"],
    [total - top20, "bg-black/[0.14]", "21+"],
  ];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.05]" aria-hidden>
        {tramos.map(([n, c, t]) => n > 0 && <div key={t} className={c} style={{ width: `${(100 * n) / total}%` }} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-[color:var(--tinta-media)]">
        {tramos.map(([n, c, t]) => (
          <span key={t} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${c}`} />
            {t} <span className="font-medium text-[color:var(--tinta)]">{miles(n)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Posiciones({
  clienteId,
  keywords,
  puedeEditar,
  hayProveedor,
  hayGsc,
  medirCada,
  costePorMedicion,
  exploracion,
  costeExploracion,
  gscConectado,
}: {
  clienteId: string;
  keywords: KeywordVista[];
  puedeEditar: boolean;
  hayProveedor: boolean;
  hayGsc: boolean;
  /** Cada cuántos días se mide sola; nulo, solo a mano. */
  medirCada: number | null;
  /** Lo que costó de media la última consulta, para estimar cada pasada. */
  costePorMedicion: number;
  /** La exploración del dominio, si se hizo. */
  exploracion: ExploracionVista | null;
  costeExploracion: number;
  /** Este cliente tiene propiedad de Search Console elegida: el dato real existe aunque tarde en llegar. */
  gscConectado: boolean;
}) {
  const { confirmar, dialogo } = useConfirmar();
  const router = useRouter();
  const [programada, setProgramada] = useState<number | null>(medirCada);
  const [gsc, setGsc] = useState<ResumenGsc | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [ubicacion, setUbicacion] = useState(2152);
  const [dispositivo, setDispositivo] = useState("desktop");
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "puesto", asc: true });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscaKw, setBuscaKw] = useState("");
  const [buscaEx, setBuscaEx] = useState("");
  const [verEx, setVerEx] = useState(25);
  const [seguidas, setSeguidas] = useState<Set<string>>(new Set());
  const [siguiendo, setSiguiendo] = useState<string | null>(null);
  const [explorando, setExplorando] = useState(false);
  const oEx = useOrden<ColEx>("trafico", false);

  /** Al cambiar de columna se arranca por lo útil; volver a pulsar invierte. */
  function ordenar(col: Columna) {
    setOrden((o) =>
      o.col === col ? { col, asc: !o.asc } : { col, asc: col === "puesto" || col === "termino" }
    );
  }

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

  async function programar(dias: number | null) {
    setError(null);
    try {
      await llamar("PUT", { clienteId, medirCada: dias });
      setProgramada(dias);
      setAviso(
        dias
          ? `Se medirá sola cada ${dias} días, ≈ ${dinero(keywords.length * costePorMedicion)} por pasada.`
          : "Medición automática desactivada."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo programar.");
    }
  }

  async function explorarDominio() {
    if (!(await confirmar({ titulo: `¿${exploracion ? "Volver a explorar" : "Explorar"} el dominio?`, detalle: `Trae las palabras por las que ya posiciona, su tráfico estimado y sus rivales, de DataForSEO. Ha costado ≈ ${dinero(costeExploracion)} las últimas veces; verlo después no cuesta nada.`, boton: "Explorar", peligroso: false }))) return;
    setExplorando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/competidores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, dominio: "propio" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo explorar.");
      setAviso(`Dominio explorado: ${miles(j.keywords)} palabras por ${dinero(Number(j.coste))}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setExplorando(false);
    }
  }

  /** Pasa una consulta de Search Console al seguimiento medido. */
  async function seguirDesdeGsc(consulta: string): Promise<boolean> {
    setError(null);
    setAviso(null);
    try {
      await llamar("POST", { clienteId, terminos: consulta, ubicacion: 2152, dispositivo: "desktop" });
      setAviso(`«${consulta}» añadida al seguimiento. Pulsa «Medir las nuevas» arriba.`);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      return false;
    }
  }

  async function añadir() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const j = await llamar("POST", { clienteId, terminos: texto, ubicacion, dispositivo });
      const repes = j.recibidas - j.añadidas;
      setAviso(`${j.añadidas} consultas añadidas${repes > 0 ? ` (${repes} ya estaban)` : ""}. Ahora pulsa «Medir las nuevas».`);
      setTexto("");
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
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
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(id: string, termino: string) {
    if (!(await confirmar({ titulo: `¿Quitar «${termino}» del seguimiento?`, detalle: "Se pierde su histórico de posiciones.", boton: "Quitar" }))) return;
    setOcupado(true);
    try {
      await llamar("DELETE", { keywordId: id });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  /* ---------------- Lo que se deduce del seguimiento ---------------- */
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
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
    return orden.asc ? cmp : -cmp;
  });
  const qKw = buscaKw.trim().toLowerCase();
  const visiblesKw = qKw
    ? ordenadas.filter((k) => `${k.termino} ${k.urlPosicionada ?? ""} ${k.urlObjetivo ?? ""}`.toLowerCase().includes(qKw))
    : ordenadas;

  const medidas = keywords.filter((k) => k.puesto !== null);
  const sinMedir = keywords.filter((k) => k.mediciones === 0).length;
  const fuera = keywords.filter((k) => k.mediciones > 0 && k.puesto === null).length;
  const media = medidas.length
    ? Math.round((medidas.reduce((s, k) => s + (k.puesto ?? 0), 0) / medidas.length) * 10) / 10
    : null;
  const top = (n: number) => medidas.filter((k) => (k.puesto ?? 999) <= n).length;
  const bajaron = keywords.filter((k) => (delta(k) ?? 0) <= -3).length;
  const subieron = keywords.filter((k) => (delta(k) ?? 0) >= 3).length;
  const ultimaMedicion = keywords.map((k) => k.medido).filter((m): m is string => Boolean(m)).sort().pop() ?? null;

  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mt-5">
      {dialogo}

      {error && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}
      {aviso && <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">{aviso}</p>}

      {/* ---------------- La cabecera: las dos fuentes y qué hacer ---------------- */}
      <div className="tarjeta tarjeta-destacada grid gap-px overflow-hidden lg:grid-cols-3 [&>*]:ring-1 [&>*]:ring-[color:var(--linea)]">
        <div className="bg-[color:var(--panel)] px-5 py-4">
          <p className="rotulo">En Google{gsc ? ` · últimos ${gsc.dias} días` : ""}</p>
          {gscConectado && gsc ? (
            <>
              <p className="mt-1.5 cifra text-[28px] leading-none">
                {miles(gsc.consultas)}
                <span className="ml-1.5 text-[14px] font-normal text-[color:var(--tinta-media)]">búsquedas por las que apareces</span>
              </p>
              <div className="mt-3">
                <Distribucion top3={gsc.top3} top10={gsc.top10} top20={gsc.top20} total={gsc.consultas} />
              </div>
              <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">
                posición media {gsc.media ?? "—"} · datos de Google, con dos o tres días de retraso
              </p>
            </>
          ) : gscConectado ? (
            <p className="mt-2 text-[14px] text-[color:var(--tinta-suave)]">Leyendo Search Console…</p>
          ) : exploracion ? (
            <>
              <p className="mt-1.5 cifra text-[28px] leading-none">
                {miles(exploracion.resumen.keywords)}
                <span className="ml-1.5 text-[14px] font-normal text-[color:var(--tinta-media)]">palabras por las que apareces, estimadas</span>
              </p>
              <div className="mt-3">
                <Distribucion
                  top3={exploracion.resumen.tramos.pos1 + exploracion.resumen.tramos.pos2a3}
                  top10={exploracion.resumen.tramos.pos1 + exploracion.resumen.tramos.pos2a3 + exploracion.resumen.tramos.pos4a10}
                  top20={exploracion.resumen.tramos.pos1 + exploracion.resumen.tramos.pos2a3 + exploracion.resumen.tramos.pos4a10 + exploracion.resumen.tramos.pos11a20}
                  total={exploracion.resumen.keywords}
                />
              </div>
              <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">
                ≈ {miles(exploracion.resumen.trafico)} visitas al mes · estimación de DataForSEO · explorado {fecha(exploracion.creado)}
                {hayGsc ? " · conecta Search Console para el dato real" : " · Search Console no está habilitado en este panel"}
              </p>
            </>
          ) : !hayGsc ? (
            <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
              Search Console no está habilitado en este panel.
            </p>
          ) : (
            <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
              Sin conectar todavía: conecta Search Console más abajo para ver las búsquedas reales.
            </p>
          )}
        </div>

        <div className="bg-[color:var(--panel)] px-5 py-4">
          <p className="rotulo">Seguimiento medido</p>
          <p className="mt-1.5 cifra text-[28px] leading-none">
            {miles(keywords.length)}
            <span className="ml-1.5 text-[14px] font-normal text-[color:var(--tinta-media)]">
              {keywords.length === 1 ? "palabra seguida" : "palabras seguidas"}
            </span>
          </p>
          {keywords.length > 0 ? (
            <>
              <div className="mt-3">
                <Distribucion top3={top(3)} top10={top(10)} top20={top(20)} total={medidas.length} />
              </div>
              {keywords.some((k) => k.iaOverview !== null) && (
                <p className="mt-2 text-[13px] text-[color:var(--tinta-media)]">
                  Bloque de IA de Google en {keywords.filter((k) => k.iaOverview).length} de {keywords.filter((k) => k.iaOverview !== null).length} búsquedas
                  {keywords.filter((k) => k.iaOverview).length > 0 && ` · te cita en ${keywords.filter((k) => k.iaCitado).length}`}
                </p>
              )}
              <p className="mt-2 text-[13px] text-[color:var(--tinta-suave)]">
                {media !== null ? `puesto medio ${media}` : "sin medir"}
                {fuera > 0 && ` · ${fuera} fuera del top 100`}
                {ultimaMedicion && ` · última medición ${fecha(ultimaMedicion)}`}
                {programada && ` · se mide sola cada ${programada} días`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
              Puesto exacto en Google para las palabras que elijas. Se paga por consulta: unas milésimas de dólar cada una.
            </p>
          )}
        </div>

        <div className="bg-[color:var(--panel)] px-5 py-4">
          <p className="rotulo">Qué hacer</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[14px]">
            {sinMedir > 0 && puedeEditar && (
              <li>
                <button type="button" onClick={() => medir(true)} disabled={ocupado || !hayProveedor} className="text-left underline-offset-4 hover:text-[color:var(--acento)] hover:underline disabled:opacity-50">
                  <span className="cifra mr-1.5 text-amber-700">{sinMedir}</span>
                  {sinMedir === 1 ? "palabra sin medir" : "palabras sin medir"} · medir ahora
                </button>
              </li>
            )}
            {bajaron > 0 && (
              <li>
                <button type="button" onClick={() => { setOrden({ col: "cambio", asc: true }); ir("seguimiento"); }} className="text-left underline-offset-4 hover:text-[color:var(--acento)] hover:underline">
                  <span className="cifra mr-1.5 text-red-600">{bajaron}</span>
                  {bajaron === 1 ? "palabra bajó" : "palabras bajaron"} 3 puestos o más
                </button>
              </li>
            )}
            {subieron > 0 && (
              <li className="text-[color:var(--tinta-media)]">
                <span className="cifra mr-1.5 text-emerald-700">{subieron}</span>
                {subieron === 1 ? "subió" : "subieron"} 3 puestos o más
              </li>
            )}
            {gsc && gsc.oportunidades > 0 && (
              <li>
                <button type="button" onClick={() => ir("oportunidades")} className="text-left underline-offset-4 hover:text-[color:var(--acento)] hover:underline">
                  <span className="cifra mr-1.5 text-[color:var(--tinta)]">{miles(gsc.oportunidades)}</span>
                  oportunidades entre el puesto 4 y el 20
                </button>
              </li>
            )}
            {gsc && gsc.canibales > 0 && (
              <li>
                <button type="button" onClick={() => ir("canibalizaciones")} className="text-left underline-offset-4 hover:text-[color:var(--acento)] hover:underline">
                  <span className="cifra mr-1.5 text-amber-700">{miles(gsc.canibales)}</span>
                  {gsc.canibales === 1 ? "canibalización" : "canibalizaciones"}
                </button>
              </li>
            )}
            {sinMedir === 0 && bajaron === 0 && !(gsc && (gsc.oportunidades > 0 || gsc.canibales > 0)) && (
              <li className="text-[color:var(--tinta-media)]">Nada urgente por aquí.</li>
            )}
          </ul>
        </div>
      </div>

      {!hayProveedor && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
          Falta conectar DataForSEO. Un administrador puede hacerlo en Ajustes; hasta entonces se
          pueden añadir consultas pero no medirlas.
        </p>
      )}

      {/* ---------------- Seguimiento medido ---------------- */}
      <section id="seguimiento" className="mt-8 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold">Seguimiento medido</h3>
            <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
              Puesto exacto entre los resultados orgánicos, medido cuando tú lo pides o cuando lo programas.
            </p>
          </div>
          {puedeEditar && (
            <div className="flex flex-wrap items-center gap-2">
              {keywords.length > 0 && (
                <>
                  <button onClick={() => medir(true)} disabled={ocupado || !sinMedir || !hayProveedor} className="boton">
                    Medir las nuevas{sinMedir > 0 && ` (${sinMedir})`}
                  </button>
                  <button onClick={() => medir(false)} disabled={ocupado || !hayProveedor} className="boton">
                    Medir todo
                  </button>
                  <label className="flex items-center gap-2 text-[13px] text-[color:var(--tinta-media)]">
                    Medir sola
                    <select
                      value={programada ?? ""}
                      onChange={(e) => programar(e.target.value ? Number(e.target.value) : null)}
                      aria-label="Medir automáticamente"
                      className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-[color:var(--acento)]"
                    >
                      <option value="">no</option>
                      <option value="7">cada semana</option>
                      <option value="14">cada 15 días</option>
                      <option value="30">cada mes</option>
                    </select>
                    {programada && (
                      <span className="tabular-nums" title="Estimado con lo que costó la última medición">
                        ≈ {dinero(keywords.length * costePorMedicion)} por pasada
                      </span>
                    )}
                  </label>
                </>
              )}
              <button onClick={() => setAbierto(!abierto)} className={abierto ? "boton" : "boton-fuerte"}>
                {abierto ? "Cerrar" : "Añadir consultas"}
              </button>
            </div>
          )}
        </div>

        {ocupado && (
          <p className="mt-3 text-[14px] text-[color:var(--tinta-suave)]">Consultando Google… puede tardar un minuto.</p>
        )}

        {abierto && (
          <div className="tarjeta mt-4 p-5">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder={"Una consulta por línea:\nregalos corporativos\ntermos personalizados\nmochilas para notebook"}
              className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[14px]">
                <span className="text-[color:var(--tinta-media)]">País</span>
                <select
                  value={ubicacion}
                  onChange={(e) => setUbicacion(Number(e.target.value))}
                  className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1.5 text-[14px] outline-none"
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
                  <button key={id} onClick={() => setDispositivo(id)} className={`segmento ${dispositivo === id ? "segmento-activo" : ""}`}>
                    {n}
                  </button>
                ))}
              </div>
              <button onClick={añadir} disabled={ocupado || texto.trim().length === 0} className="boton-fuerte ml-auto">
                Añadir
              </button>
            </div>
            <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
              La misma consulta en escritorio y en móvil son dos seguimientos distintos, porque Google
              devuelve resultados distintos. En ecommerce suele importar más el móvil.
            </p>
          </div>
        )}

        {keywords.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-12 text-center">
            <p className="text-[15px] font-medium">Todavía no se sigue ninguna consulta.</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-[color:var(--tinta-media)]">
              Añade las palabras por las que este cliente quiere posicionar, o pulsa «Seguir» en cualquier
              búsqueda de Search Console más abajo.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={buscaKw}
                onChange={(e) => setBuscaKw(e.target.value)}
                placeholder="Buscar palabra o URL…"
                aria-label="Buscar palabra o URL"
                className="w-full max-w-xs rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-1.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
              />
              {qKw && (
                <span className="text-[13px] text-[color:var(--tinta-suave)]">
                  {visiblesKw.length} de {keywords.length}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  descargarCsv(
                    "posiciones",
                    visiblesKw.map((k) => ({
                      palabra: k.termino,
                      dispositivo: k.dispositivo,
                      puesto: k.mediciones === 0 ? "" : (k.puesto ?? "+100"),
                      anterior: k.anterior ?? "",
                      url: k.urlPosicionada ?? "",
                      url_objetivo: k.urlObjetivo ?? "",
                      medido: k.medido ? fecha(k.medido) : "",
                    }))
                  )
                }
                className="ml-auto text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
              >
                Descargar CSV
              </button>
            </div>

            <div className="tarjeta mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-[color:var(--linea)] text-left">
                    {COLUMNAS.map((c) => (
                      <th key={c.id} className={`rotulo px-3 py-3 first:px-5 ${c.ancho}`}>
                        <button
                          onClick={() => ordenar(c.id)}
                          className={`rotulo transition hover:text-[color:var(--tinta)] ${orden.col === c.id ? "!text-[color:var(--tinta)]" : ""}`}
                        >
                          {c.texto}
                          <span className="ml-1 inline-block w-2 text-[10px]">{orden.col === c.id ? (orden.asc ? "▲" : "▼") : ""}</span>
                        </button>
                      </th>
                    ))}
                    <th className="rotulo px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {visiblesKw.map((k) => {
                    const d = delta(k);
                    return (
                      <tr key={k.id} className="align-top transition hover:bg-black/[0.015]">
                        <td className="px-5 py-3">
                          <p className="font-medium">{k.termino}</p>
                          <p className="mt-0.5 text-[12px] text-[color:var(--tinta-suave)]">
                            {k.dispositivo === "mobile" ? "móvil" : "escritorio"}
                            {k.medido && ` · ${fecha(k.medido)}`}
                            {k.mediciones === 0 && " · sin medir"}
                          </p>
                        </td>

                        <td className={`px-3 py-3 text-right text-[16px] font-semibold tabular-nums ${colorPuesto(k.puesto)}`}>
                          {k.mediciones === 0 ? "—" : (k.puesto ?? "+100")}
                          {k.historial.filter((x) => x !== null).length >= 2 && (
                            <span className="ml-2 inline-block align-middle" title={`Últimas ${k.historial.length} mediciones`}>
                              <Chispa valores={k.historial} invertido ancho={56} alto={16} />
                            </span>
                          )}
                          {k.bloquesArriba !== null && k.bloquesArriba > 0 && (
                            <span
                              className="ml-1 text-[12px] font-normal text-[color:var(--tinta-suave)]"
                              title={`${k.bloquesArriba} bloques de Google (anuncios, mapas, preguntas) por encima`}
                            >
                              +{k.bloquesArriba}
                            </span>
                          )}
                          {k.iaOverview && (
                            <span
                              className={`ml-1.5 pastilla align-middle ${k.iaCitado ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-[color:var(--tinta-media)]"}`}
                              title={k.iaCitado ? "Google puso un bloque de IA y cita a este sitio" : "Google puso un bloque de IA y no cita a este sitio"}
                            >
                              IA{k.iaCitado ? " ✓" : ""}
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
                              className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
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

            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[color:var(--tinta-suave)]">
              El número pequeño junto al puesto cuenta los bloques de Google que van por encima —anuncios,
              mapa local, «otras preguntas»—, porque ser tercero debajo de tres bloques no es lo mismo que
              ser tercero. Cada pasada a mano mide como máximo 40 consultas para que el gasto sea previsible.
            </p>
          </>
        )}
      </section>

      {/* ---------------- Lo que ya posiciona, según DataForSEO ---------------- */}
      <section id="exploracion" className="mt-10 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold">
              Palabras por las que ya posicionas
              {exploracion && <span className="cifra ml-2 text-[color:var(--tinta-media)]">{miles(exploracion.resumen.keywords)}</span>}
            </h3>
            <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
              La foto de DataForSEO del dominio: por qué búsquedas sale, en qué puesto y cuánto se busca. Es una estimación,
              no una medición; sirve para elegir qué seguir y qué atacar. La misma que ves en Explorar dominio.
            </p>
          </div>
          {puedeEditar && hayProveedor && (
            <button onClick={explorarDominio} disabled={explorando || ocupado} className={exploracion ? "boton" : "boton-fuerte"}>
              {explorando ? "Explorando…" : exploracion ? `Actualizar · explorado ${fecha(exploracion.creado)}` : `Explorar el dominio · ≈ ${dinero(costeExploracion)}`}
            </button>
          )}
        </div>

        {explorando && (
          <p className="mt-3 text-[14px] text-[color:var(--tinta-suave)]">Explorando el dominio en DataForSEO… puede tardar un minuto.</p>
        )}

        {!exploracion ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-12 text-center">
            <p className="text-[15px] font-medium">Este dominio no se ha explorado.</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-[color:var(--tinta-media)]">
              Explorarlo trae en un minuto las palabras por las que ya posiciona, con volumen y puesto, para empezar el
              seguimiento con datos en vez de en blanco.
            </p>
          </div>
        ) : exploracion.keywords.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-12 text-center">
            <p className="text-[15px] font-medium">DataForSEO no tiene palabras para este dominio en Chile.</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-[color:var(--tinta-media)]">
              Explorado {fecha(exploracion.creado)}. Suele pasar con sitios nuevos o con muy poco tráfico; Search Console sí las verá.
            </p>
          </div>
        ) : (() => {
            const q = buscaEx.trim().toLowerCase();
            const lista = oEx.ordenarPor(
              exploracion.keywords.filter((k) => !q || k.keyword.toLowerCase().includes(q) || (k.url ?? "").toLowerCase().includes(q)),
              (k, c) => (c === "seguir" ? "" : c === "url" ? (k.url ?? "") : k[c])
            );
            const yaSeguidas = new Set(keywords.map((k) => k.termino.toLowerCase()));
            return (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    value={buscaEx}
                    onChange={(e) => setBuscaEx(e.target.value)}
                    placeholder="Buscar palabra o URL…"
                    aria-label="Buscar en las palabras exploradas"
                    className="w-full max-w-xs rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-1.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
                  />
                  <span className="text-[13px] text-[color:var(--tinta-suave)]">
                    {q ? `${lista.length} de ${exploracion.keywords.length}` : `las ${exploracion.keywords.length} de más tráfico`}
                  </span>
                  <button
                    type="button"
                    onClick={() => descargarCsv("palabras-posicionadas", lista.map((k) => ({ palabra: k.keyword, puesto: k.posicion, volumen: k.volumen, trafico_estimado: k.trafico, cpc: k.cpc, url: k.url ?? "" })))}
                    className="ml-auto text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
                  >
                    Descargar CSV
                  </button>
                </div>
                <div className="tarjeta mt-2 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-[14px]">
                    <Cabecera columnas={COL_EX} orden={oEx.orden} ordenar={oEx.ordenar} />
                    <tbody className="divide-y divide-[color:var(--linea)]">
                      {lista.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-[14px] text-[color:var(--tinta-suave)]">
                            Nada coincide con «{buscaEx}».
                          </td>
                        </tr>
                      )}
                      {lista.slice(0, verEx).map((k, i) => {
                        const seguida = yaSeguidas.has(k.keyword.toLowerCase()) || seguidas.has(k.keyword);
                        return (
                          <tr key={`${k.keyword}-${k.url ?? ""}-${i}`} className="transition hover:bg-black/[0.015]">
                            <td className="px-5 py-2.5">{k.keyword}</td>
                            <td className={`px-3 py-2.5 text-right tabular-nums ${colorPuesto(k.posicion)}`}>{k.posicion}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{miles(k.volumen)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">{miles(k.trafico)}</td>
                            <td className="px-3 py-2.5">
                              {k.url ? (
                                <a href={k.url} target="_blank" rel="noopener" className="block max-w-[260px] truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline" title={k.url}>
                                  {k.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                                </a>
                              ) : (
                                <span className="text-[color:var(--tinta-suave)]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {puedeEditar && (
                                seguida ? (
                                  <span className="text-[13px] text-emerald-700">seguida</span>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      setSiguiendo(k.keyword);
                                      try {
                                        if (await seguirDesdeGsc(k.keyword)) setSeguidas((x) => new Set(x).add(k.keyword));
                                      } finally {
                                        setSiguiendo(null);
                                      }
                                    }}
                                    disabled={siguiendo !== null}
                                    className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)] disabled:opacity-50"
                                    title="Añadir al seguimiento medido"
                                  >
                                    {siguiendo === k.keyword ? "Añadiendo…" : "Seguir"}
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {lista.length > verEx && (
                  <button onClick={() => setVerEx(lista.length)} className="mt-2 text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]">
                    Ver las {lista.length}
                  </button>
                )}
              </>
            );
          })()}
      </section>

      {/* ---------------- Search Console, apilado ---------------- */}
      {hayGsc && (
        <section className="mt-10">
          <SearchConsole clienteId={clienteId} puedeEditar={puedeEditar} onSeguir={seguirDesdeGsc} apilado onResumen={setGsc} />
        </section>
      )}
    </div>
  );
}
