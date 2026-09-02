"use client";

import { useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

interface Tramos {
  pos1: number;
  pos2a3: number;
  pos4a10: number;
  pos11a20: number;
  pos21a50: number;
  pos51a100: number;
}

interface Panorama {
  dominio: string;
  resumen: { keywords: number; trafico: number; valor: number; tramos: Tramos };
  historico: { mes: string; keywords: number; trafico: number; valor: number }[];
  keywords: { keyword: string; posicion: number; volumen: number; trafico: number; cpc: number; url: string | null }[];
  competidores: { dominio: string; coincidencias: number; posicionMedia: number; trafico: number }[];
  coste: number;
  avisos: string[];
}

const PAISES = [
  [2152, "Chile"],
  [2724, "España"],
  [2484, "México"],
  [2032, "Argentina"],
  [2170, "Colombia"],
  [2604, "Perú"],
  [2840, "Estados Unidos"],
] as const;

type ColKw = "keyword" | "posicion" | "volumen" | "trafico" | "cpc" | "url";
type ColComp = "dominio" | "coincidencias" | "posicionMedia" | "trafico";

const COL_KW: readonly Columna<ColKw>[] = [
  { id: "keyword", texto: "Palabra clave" },
  { id: "posicion", texto: "Posición", clase: "text-right", num: true },
  { id: "volumen", texto: "Volumen", clase: "text-right", num: true },
  { id: "trafico", texto: "Tráfico est.", clase: "text-right", num: true },
  { id: "cpc", texto: "CPC", clase: "text-right", num: true },
  { id: "url", texto: "URL" },
];

const COL_COMP: readonly Columna<ColComp>[] = [
  { id: "dominio", texto: "Dominio" },
  { id: "coincidencias", texto: "Keywords en común", clase: "text-right", num: true },
  { id: "posicionMedia", texto: "Posición media", clase: "text-right", num: true },
  { id: "trafico", texto: "Tráfico est.", clase: "text-right", num: true },
];

const numero = (n: number) => n.toLocaleString("es-CL");

const limpiar = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Curva de visibilidad, dibujada a mano: es una línea, no hace falta librería. */
function Curva({ datos }: { datos: { mes: string; trafico: number }[] }) {
  if (datos.length < 2) return null;

  const ancho = 700;
  const alto = 130;
  const cima = Math.max(...datos.map((d) => d.trafico), 1);

  const punto = (i: number, v: number) => {
    const x = (i / (datos.length - 1)) * ancho;
    const y = alto - (v / cima) * (alto - 12) - 6;
    return [x, y] as const;
  };

  const linea = datos.map((d, i) => punto(i, d.trafico).join(",")).join(" ");
  const area = `0,${alto} ${linea} ${ancho},${alto}`;

  const etiquetas = datos.filter((_, i) => i % Math.ceil(datos.length / 6) === 0 || i === datos.length - 1);

  return (
    <div className="tarjeta mt-3 p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="rotulo">Tráfico orgánico estimado</p>
        <p className="text-[12px] text-[color:var(--tinta-suave)]">
          máximo {numero(cima)} visitas al mes
        </p>
      </div>

      <svg viewBox={`0 0 ${ancho} ${alto}`} className="mt-3 w-full" preserveAspectRatio="none" height={alto}>
        <polygon points={area} fill="var(--acento)" opacity="0.09" />
        <polyline
          points={linea}
          fill="none"
          stroke="var(--acento)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {datos.map((d, i) => {
          const [x, y] = punto(i, d.trafico);
          return <circle key={d.mes} cx={x} cy={y} r="2.5" fill="var(--acento)" />;
        })}
      </svg>

      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-[color:var(--tinta-suave)]">
        {etiquetas.map((d) => {
          const [a, m] = d.mes.split("-");
          return (
            <span key={d.mes}>
              {MESES_CORTOS[Number(m) - 1]} {a.slice(2)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function Explorar({ puedeExplorar }: { puedeExplorar: boolean }) {
  const [dominio, setDominio] = useState("");
  const [pais, setPais] = useState(2152);
  const [datos, setDatos] = useState<{
    medido: string | null;
    coste: number | null;
    fresca: boolean;
    panorama: Panorama | null;
  } | null>(null);
  const [recientes, setRecientes] = useState<{ dominio: string; pais: number; creado: string }[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vista, setVista] = useState<"keywords" | "competidores">("keywords");
  const [busca, setBusca] = useState("");

  const oKw = useOrden<ColKw>("trafico", false);
  const oComp = useOrden<ColComp>("coincidencias", false);

  useEffect(() => {
    fetch("/api/explorar")
      .then((r) => r.json())
      .then((j) => setRecientes(j.recientes ?? []))
      .catch(() => {});
  }, []);

  async function mirar(d: string, p: number) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch(`/api/explorar?dominio=${encodeURIComponent(d)}&pais=${p}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo consultar.");
      setDatos(j);
      if (!j.panorama) {
        setAviso("No hay datos guardados de este dominio. Pulsa «Consultar» para pedirlos al proveedor.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  async function consultar() {
    const d = dominio.trim();
    if (!d) return;

    const guardado = datos?.panorama && datos.panorama.dominio === limpiar(d) ? datos : null;
    if (guardado?.medido) {
      const dias = Math.round((Date.now() - new Date(guardado.medido).getTime()) / 86_400_000);
      const antes = guardado.coste ? `US$${guardado.coste.toFixed(4)}` : "algo";
      const ok = confirm(
        [
          `Ya tienes ${d} guardado, consultado hace ${dias} ${dias === 1 ? "día" : "días"} y costó ${antes}.`,
          "",
          "Verlo no cuesta nada. Volver a consultarlo se paga otra vez.",
          "",
          "¿Consultar de nuevo?",
        ].join(String.fromCharCode(10))
      );
      if (!ok) return;
    }

    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/explorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dominio: d, pais }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo explorar.");
      setAviso(
        `Consultado por US$${Number(j.coste).toFixed(4)}.` +
          (j.avisos?.length ? ` Avisos: ${j.avisos.join(" · ")}` : "")
      );
      await mirar(d, pais);
      fetch("/api/explorar")
        .then((x) => x.json())
        .then((x) => setRecientes(x.recientes ?? []))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setOcupado(false);
    }
  }

  const p = datos?.panorama;
  const filtra = (t: string) => !busca.trim() || t.toLowerCase().includes(busca.trim().toLowerCase());

  const keywords = oKw.ordenarPor((p?.keywords ?? []).filter((k) => filtra(k.keyword)), (k, c) =>
    c === "keyword" ? k.keyword : c === "url" ? k.url ?? "" : k[c]
  );

  const competidores = oComp.ordenarPor(
    (p?.competidores ?? []).filter((x) => filtra(x.dominio)),
    (x, c) => (c === "dominio" ? x.dominio : x[c])
  );

  const t = p?.resumen.tramos;
  const totalTramos = t ? t.pos1 + t.pos2a3 + t.pos4a10 + t.pos11a20 + t.pos21a50 + t.pos51a100 : 0;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mirar(dominio, pais);
        }}
        className="tarjeta flex flex-wrap items-center gap-2 p-3"
      >
        <input
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          placeholder="Escribe un dominio: beepromo.cl"
          autoFocus
          className="min-w-[220px] flex-1 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-5 py-2.5 text-[15px] outline-none transition focus:border-[color:var(--acento)]"
        />
        <select
          value={pais}
          onChange={(e) => setPais(Number(e.target.value))}
          className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-2.5 text-[13px] outline-none"
        >
          {PAISES.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <button type="submit" disabled={ocupado || !dominio.trim()} className="boton">
          Ver guardado
        </button>
        {puedeExplorar && (
          <button
            type="button"
            onClick={consultar}
            disabled={ocupado || !dominio.trim()}
            className="boton-fuerte"
          >
            {ocupado ? "Consultando…" : "Consultar · cuesta"}
          </button>
        )}
      </form>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
      {aviso && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{aviso}</p>
      )}

      {recientes.length > 0 && (
        <div className="mt-6">
          <p className="rotulo">
            Guardados · verlos no cuesta nada
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recientes.map((r) => (
              <li key={`${r.dominio}-${r.pais}`}>
                <button
                  onClick={() => {
                    setDominio(r.dominio);
                    setPais(r.pais);
                    mirar(r.dominio, r.pais);
                  }}
                  className={`boton font-mono !text-[12px] ${
                    p?.dominio === r.dominio ? "!border-[color:var(--acento)] !text-[color:var(--acento)]" : ""
                  }`}
                  title={`Consultado el ${r.creado.slice(0, 10)}`}
                >
                  {r.dominio}
                  <span className="ml-1.5 font-sans text-[10px] text-[color:var(--tinta-suave)]">
                    {r.creado.slice(5, 10)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p && (
        <>
          <div className="mt-6 flex flex-wrap items-baseline gap-3">
            <h2 className="text-[22px] font-semibold">{p.dominio}</h2>
            {datos?.medido && (
              <span className="text-[12px] text-[color:var(--tinta-suave)]">
                consultado el {datos.medido.slice(0, 10)}
                {!datos.fresca && " · conviene actualizarlo"}
              </span>
            )}
          </div>

          <dl className="tarjeta mt-3 grid grid-cols-3 divide-x divide-[color:var(--linea)] overflow-hidden">
            {[
              ["Palabras clave", numero(p.resumen.keywords)],
              ["Tráfico estimado", `${numero(p.resumen.trafico)}/mes`],
              ["Valor del tráfico", `US$${numero(p.resumen.valor)}`],
            ].map(([k, v]) => (
              <div key={k} className="px-5 py-4">
                <dt className="rotulo">{k}</dt>
                <dd className="mt-1 text-[24px] font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          {totalTramos > 0 && t && (
            <div className="tarjeta mt-3 p-5">
              <p className="rotulo">Reparto por posición</p>
              <div className="mt-3 flex h-6 overflow-hidden rounded-full">
                {[
                  ["1", t.pos1, "#0f9d58"],
                  ["2-3", t.pos2a3, "#37b24d"],
                  ["4-10", t.pos4a10, "#94c93d"],
                  ["11-20", t.pos11a20, "#f0a500"],
                  ["21-50", t.pos21a50, "#e07b39"],
                  ["51-100", t.pos51a100, "#cbd0d6"],
                ].map(([etq, n, color]) => (
                  <div
                    key={String(etq)}
                    style={{ width: `${(Number(n) / totalTramos) * 100}%`, background: String(color) }}
                    title={`${etq}: ${numero(Number(n))} keywords`}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[color:var(--tinta-media)]">
                {[
                  ["1", t.pos1, "#0f9d58"],
                  ["2-3", t.pos2a3, "#37b24d"],
                  ["4-10", t.pos4a10, "#94c93d"],
                  ["11-20", t.pos11a20, "#f0a500"],
                  ["21-50", t.pos21a50, "#e07b39"],
                  ["51-100", t.pos51a100, "#cbd0d6"],
                ].map(([etq, n, color]) => (
                  <span key={String(etq)} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: String(color) }}
                    />
                    {etq}: <strong className="font-semibold tabular-nums">{numero(Number(n))}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <Curva datos={p.historico} />

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="segmentos">
              {[
                ["keywords", `Palabras clave (${p.keywords.length})`],
                ["competidores", `Competencia (${p.competidores.length})`],
              ].map(([id, n]) => (
                <button
                  key={id}
                  onClick={() => setVista(id as "keywords" | "competidores")}
                  className={`segmento ${vista === id ? "segmento-activo" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar…"
              className="ml-auto w-56 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-1.5 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
            />
          </div>

          <div className="tarjeta mt-3 overflow-x-auto">
            {vista === "keywords" ? (
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <Cabecera columnas={COL_KW} orden={oKw.orden} ordenar={oKw.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {keywords.slice(0, 300).map((k, i) => (
                    <tr key={`${k.keyword}-${i}`} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5">{k.keyword}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                          k.posicion <= 3 ? "text-emerald-600" : k.posicion <= 10 ? "" : "text-[color:var(--tinta-media)]"
                        }`}
                      >
                        {k.posicion || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{numero(k.volumen)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {numero(k.trafico)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {k.cpc ? `US$${k.cpc}` : "—"}
                      </td>
                      <td className="max-w-[240px] px-3 py-2.5">
                        {k.url ? (
                          <a
                            href={k.url}
                            target="_blank"
                            rel="noopener nofollow"
                            className="block truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                            title={k.url}
                          >
                            {k.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                          </a>
                        ) : (
                          <span className="text-[color:var(--tinta-suave)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[600px] border-collapse text-[13px]">
                <Cabecera columnas={COL_COMP} orden={oComp.orden} ordenar={oComp.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {competidores.map((x) => (
                    <tr key={x.dominio} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5">
                        <button
                          onClick={() => {
                            setDominio(x.dominio);
                            mirar(x.dominio, pais);
                          }}
                          className="underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                        >
                          {x.dominio}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{numero(x.coincidencias)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {x.posicionMedia || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {numero(x.trafico)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
            Estos números son estimaciones calculadas por el proveedor sobre su propio rastreo, no
            medidas. En Chile su cobertura es más corta que en mercados grandes, así que sirven para
            comparar dominios y priorizar, no para prometer cifras. Para un sitio tuyo, Search Console
            da el dato real y gratis.
          </p>
        </>
      )}
    </div>
  );
}
