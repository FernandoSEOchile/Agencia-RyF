"use client";

import { useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import { dinero } from "@/lib/formato";
import Esqueleto from "@/components/Esqueleto";

interface Perfil {
  dominio: string;
  resumen: {
    enlaces: number;
    dominiosEnlazantes: number;
    dominiosPrincipales: number;
    rank: number;
    nofollow: number;
    rotos: number;
    paginasEnlazadas: number;
    // Opcionales porque las fotos guardadas antes de medirlos no los traen.
    spam?: number;
    perdidos?: number;
    paises?: { clave: string; enlaces: number }[];
    extensiones?: { clave: string; enlaces: number }[];
  };
  dominios: { dominio: string; enlaces: number; rank: number; primeraVez: string | null; perdido: boolean }[];
  enlaces: { desde: string; hacia: string; ancla: string | null; rank: number; dofollow: boolean; visto: string | null }[];
  anclas: { texto: string; enlaces: number; dominios: number }[];
  coste: number;
  avisos: string[];
}

interface Datos {
  dominio: string;
  medido: string | null;
  coste: number | null;
  perfil: Perfil | null;
}

const VISTAS = [
  ["dominios", "Dominios que enlazan"],
  ["enlaces", "Enlaces"],
  ["anclas", "Textos de enlace"],
] as const;

const numero = (n: number) => n.toLocaleString("es-CL");

type ColDom = "dominio" | "enlaces" | "rank" | "primeraVez";
type ColEnl = "desde" | "ancla" | "hacia" | "dofollow";
type ColAnc = "texto" | "enlaces" | "dominios";

const COL_DOMINIOS: readonly Columna<ColDom>[] = [
  { id: "dominio", texto: "Dominio" },
  { id: "enlaces", texto: "Enlaces", clase: "text-right", num: true },
  { id: "rank", texto: "Fuerza", clase: "text-right", num: true },
  { id: "primeraVez", texto: "Desde" },
];

const COL_ENLACES: readonly Columna<ColEnl>[] = [
  { id: "desde", texto: "Desde" },
  { id: "ancla", texto: "Texto del enlace" },
  { id: "hacia", texto: "Hacia" },
  { id: "dofollow", texto: "Tipo" },
];

const COL_ANCLAS: readonly Columna<ColAnc>[] = [
  { id: "texto", texto: "Texto del enlace" },
  { id: "enlaces", texto: "Enlaces", clase: "text-right", num: true },
  { id: "dominios", texto: "Dominios", clase: "text-right", num: true },
];

export default function Backlinks({
  clienteId,
  puedeEditar,
}: {
  clienteId: string;
  puedeEditar: boolean;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vista, setVista] = useState<(typeof VISTAS)[number][0]>("dominios");
  const [busca, setBusca] = useState("");

  const oDom = useOrden<ColDom>("enlaces", false);
  const oEnl = useOrden<ColEnl>("desde");
  const oAnc = useOrden<ColAnc>("enlaces", false);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch(`/api/backlinks?cliente=${encodeURIComponent(clienteId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo leer el perfil.");
      setDatos(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function actualizar() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/backlinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo consultar.");
      setAviso(
        `Perfil actualizado por ${dinero(Number(j.coste))}.` +
          (j.avisos?.length ? ` Con avisos: ${j.avisos.join(" · ")}` : "")
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  if (cargando && !datos) {
    return <Esqueleto tipo="cifras" />;
  }

  const p = datos?.perfil;

  const filtra = (t: string) => !busca.trim() || t.toLowerCase().includes(busca.trim().toLowerCase());

  const dominios = oDom.ordenarPor((p?.dominios ?? []).filter((d) => filtra(d.dominio)), (d, c) =>
    c === "dominio" ? d.dominio : c === "enlaces" ? d.enlaces : c === "rank" ? d.rank : d.primeraVez ?? ""
  );

  const listaEnlaces = oEnl.ordenarPor(
    (p?.enlaces ?? []).filter((e) => filtra(e.desde + " " + (e.ancla ?? ""))),
    (e, c) =>
      c === "desde" ? e.desde : c === "ancla" ? e.ancla ?? "" : c === "hacia" ? e.hacia : e.dofollow ? 1 : 0
  );

  const anclas = oAnc.ordenarPor((p?.anclas ?? []).filter((a) => filtra(a.texto)), (a, c) =>
    c === "texto" ? a.texto : c === "enlaces" ? a.enlaces : a.dominios
  );

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {puedeEditar && (
          <button onClick={actualizar} disabled={ocupado} className="boton">
            {p ? "Actualizar perfil" : "Consultar backlinks"}
          </button>
        )}
        {datos?.medido && (
          <span className="text-[12px] text-[color:var(--tinta-suave)]">
            medido el {datos.medido.slice(0, 10)}
            {datos.coste ? ` · costó ${dinero(datos.coste)}` : ""}
          </span>
        )}
        {ocupado && (
          <span className="text-[13px] text-[color:var(--tinta-suave)]">
            Consultando el proveedor… puede tardar un minuto.
          </span>
        )}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
      {aviso && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{aviso}</p>
      )}

      {!p ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">Todavía no se ha consultado el perfil de enlaces.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Se guarda como una foto y consultarla después no cuesta nada. Actualízala cuando quieras
            ver si cambió: los enlaces no se mueven de un día para otro, así que una vez al mes suele
            bastar.
          </p>
        </div>
      ) : (
        <>
          <dl className="tarjeta mt-4 grid grid-cols-2 divide-x divide-[color:var(--linea)] overflow-hidden sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Fuerza del dominio", String(p.resumen.rank ?? 0), ""],
              ["Dominios que enlazan", numero(p.resumen.dominiosEnlazantes), ""],
              ["Enlaces totales", numero(p.resumen.enlaces), ""],
              ["Páginas enlazadas", numero(p.resumen.paginasEnlazadas), ""],
              ["Enlaces rotos", numero(p.resumen.rotos), p.resumen.rotos ? "text-amber-600" : ""],
              [
                "Dominios perdidos",
                numero(p.resumen.perdidos ?? 0),
                (p.resumen.perdidos ?? 0) > 0 ? "text-amber-600" : "",
              ],
              [
                "Spam",
                String(p.resumen.spam ?? 0),
                (p.resumen.spam ?? 0) >= 30 ? "text-red-600" : "text-emerald-700",
              ],
            ].map(([k, v, color]) => (
              <div key={String(k)} className="px-5 py-4">
                <dt className="rotulo">{String(k)}</dt>
                <dd className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{v}</dd>
              </div>
            ))}
          </dl>

          {(p.resumen.paises?.length || p.resumen.extensiones?.length) && (
            <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
              {[
                ["De dónde vienen", p.resumen.paises ?? []],
                ["Con qué extensión", p.resumen.extensiones ?? []],
              ].map(([titulo, lista]) => (
                <div key={String(titulo)}>
                  <h3 className="rotulo">{String(titulo)}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(lista as { clave: string; enlaces: number }[]).map((x) => (
                      <span key={x.clave} className="pastilla bg-black/[0.05] text-[color:var(--tinta-media)]">
                        {x.clave} <span className="tabular-nums">{numero(x.enlaces)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
            Lo que pesa es la columna de la izquierda. Mil enlaces desde cinco dominios valen mucho
            menos que cien desde cien sitios distintos, y el número grande de «enlaces totales» es el
            que más engaña en los informes.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
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
              placeholder="Filtrar…"
              className="ml-auto w-56 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-4 py-1.5 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
            />
          </div>

          <div className="tarjeta mt-3 overflow-x-auto">
            {vista === "dominios" && (
              <table className="w-full min-w-[600px] border-collapse text-[13px]">
                <Cabecera columnas={COL_DOMINIOS} orden={oDom.orden} ordenar={oDom.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {dominios.map((d) => (
                    <tr key={d.dominio} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5">
                        <a
                          href={`https://${d.dominio}`}
                          target="_blank"
                          rel="noopener nofollow"
                          className="underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                        >
                          {d.dominio}
                        </a>
                        {d.perdido && (
                          <span className="ml-2 pastilla bg-red-50 text-red-700">perdido</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{numero(d.enlaces)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {d.rank}
                      </td>
                      <td className="px-5 py-2.5 text-[color:var(--tinta-suave)]">{d.primeraVez ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {vista === "enlaces" && (
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <Cabecera columnas={COL_ENLACES} orden={oEnl.orden} ordenar={oEnl.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {listaEnlaces.map((e, i) => (
                    <tr key={`${e.desde}-${i}`} className="transition hover:bg-black/[0.015]">
                      <td className="max-w-[260px] px-5 py-2.5">
                        <a
                          href={e.desde}
                          target="_blank"
                          rel="noopener nofollow"
                          className="block truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                          title={e.desde}
                        >
                          {e.desde.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5" title={e.ancla ?? ""}>
                        {e.ancla || <span className="text-[color:var(--tinta-suave)]">sin texto</span>}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        <span className="block truncate text-[color:var(--tinta-media)]" title={e.hacia}>
                          {e.hacia.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`pastilla ${
                            e.dofollow
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-black/[0.05] text-[color:var(--tinta-media)]"
                          }`}
                        >
                          {e.dofollow ? "sigue" : "nofollow"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {vista === "anclas" && (
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <Cabecera columnas={COL_ANCLAS} orden={oAnc.orden} ordenar={oAnc.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {anclas.map((a, i) => (
                    <tr key={`${a.texto}-${i}`} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5">
                        {a.texto || <span className="text-[color:var(--tinta-suave)]">sin texto</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{numero(a.enlaces)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {numero(a.dominios)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
            De los enlaces se trae uno por dominio: cien enlaces del mismo sitio son un dato, no cien.
            Los textos de enlace dicen si el perfil parece natural — si la mayoría repite la misma
            frase comercial exacta, no lo parece.
          </p>
        </>
      )}
    </div>
  );
}
