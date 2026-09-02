"use client";

import { Fragment, useState } from "react";
import ChatArquitectura from "@/components/ChatArquitectura";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

export interface NodoVista {
  id: string;
  slug: string;
  nombre: string;
  nivel: number;
  volumen: number;
  keywords: number;
  principal: string | null;
  volumenPrincipal: number;
  estado: string;
  urlDestino: string | null;
  confianza: number | null;
  nota: string | null;
  comoSeCotejo: string | null;
}

export interface ArquitecturaVista {
  id: string;
  nombre: string;
  archivo: string;
  creado: string;
  cotejado: string | null;
  nodos: NodoVista[];
}

interface UrlSitio {
  url: string;
  nombre: string;
  tipo: string;
}

const FILTROS = [
  ["todo", "Todo"],
  ["falta", "Por crear"],
  ["dudosa", "Dudosas"],
  ["creada", "Creadas"],
] as const;

type Vista = (typeof FILTROS)[number][0] | "chat";

type ColArq = "nombre" | "principal" | "volumen" | "estado" | "url";

const COLUMNAS: readonly Columna<ColArq>[] = [
  { id: "nombre", texto: "Sección prevista" },
  { id: "principal", texto: "Palabra clave principal" },
  { id: "volumen", texto: "Volumen", clase: "text-right", num: true },
  { id: "estado", texto: "Estado" },
  { id: "url", texto: "URL que la ataca" },
];

/**
 * La instrucción que se manda al chat para crear una sección.
 *
 * Lleva todo lo que el asistente necesitaría preguntar —qué keyword ataca,
 * cuánto volumen tiene, dónde cuelga— porque una orden que obliga a repreguntar
 * gasta dos turnos y se contesta peor.
 */
function ordenDeCrear(n: NodoVista): string {
  return [
    `Crea la sección «${n.nombre}» de la arquitectura SEO de este sitio.`,
    "",
    `- URL prevista: ${n.slug}`,
    n.principal
      ? `- Palabra clave principal: «${n.principal}» (${n.volumenPrincipal.toLocaleString("es-CL")} búsquedas al mes)`
      : "- Sin palabra clave asignada en el Excel",
    n.volumen ? `- Volumen total de la sección: ${n.volumen.toLocaleString("es-CL")}` : "",
    `- Nivel ${n.nivel} de la jerarquía`,
    "",
    "Antes de escribir, analiza los primeros resultados de Google para esa búsqueda.",
    "Crea la categoría con su descripción optimizada y sus campos SEO, déjala sin publicar,",
    "y dime qué creaste y con qué URL para cotejarla.",
  ]
    .filter(Boolean)
    .join(String.fromCharCode(10));
}

function estilo(estado: string) {
  if (estado === "creada") return "bg-emerald-50 text-emerald-700";
  if (estado === "dudosa") return "bg-amber-50 text-amber-700";
  if (estado === "falta") return "bg-red-50 text-red-600";
  return "bg-neutral-100 text-neutral-600";
}

function etiqueta(estado: string) {
  if (estado === "creada") return "creada";
  if (estado === "dudosa") return "dudosa";
  if (estado === "falta") return "por crear";
  return estado;
}

/** Texto comparable: sin tildes, sin mayúsculas, sin barras ni guiones. */
function limpiar(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palabras útiles de un texto, en singular aproximado. */
function trocear(t: string) {
  return limpiar(t)
    .split(" ")
    .filter((w) => w.length > 2)
    .map((w) => (w.endsWith("s") ? w.slice(0, -1) : w));
}

/** Cómo se llegó a esa URL, para que nadie confunda un acierto de la IA con un dato comprobado. */
function origen(como: string | null) {
  if (como === "slug") return "por slug";
  if (como === "nombre") return "por nombre";
  if (como === "ia") return "por IA";
  if (como === "manual") return "a mano";
  return null;
}

export default function Arquitectura({
  clienteId,
  actual,
  puedeSubir,
  onCrear,
}: {
  clienteId: string;
  actual: ArquitecturaVista | null;
  puedeSubir: boolean;
  /** Lleva una instrucción al chat, para crear la sección que falta. */
  onCrear?: (texto: string) => void;
}) {
  const [filtro, setFiltro] = useState<Vista>("todo");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Asignación manual: qué fila está abierta, qué se busca, y el catálogo del
  // sitio, que se pide una sola vez y se reutiliza mientras dure la pantalla.
  const [abierta, setAbierta] = useState<NodoVista | null>(null);
  const [busca, setBusca] = useState("");
  const [urls, setUrls] = useState<UrlSitio[] | null>(null);
  const [cargandoUrls, setCargandoUrls] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { orden, ordenar, ordenarPor } = useOrden<ColArq>("nombre");

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    setSubiendo(true);
    setError(null);
    setAviso(null);

    const cuerpo = new FormData();
    cuerpo.append("cliente", clienteId);
    cuerpo.append("archivo", f);

    try {
      const r = await fetch("/api/arquitectura", { method: "POST", body: cuerpo });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo procesar el archivo.");
      setAviso(
        `Leídas ${j.secciones} secciones y cotejadas contra ${j.candidatos} URLs del sitio.` +
          (j.plantilla
            ? ` Formato ${j.reconocida ? "ya conocido" : "nuevo, aprendido"}: ${j.plantilla}`
            : "")
      );
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSubiendo(false);
    }
  }

  async function recotejar() {
    if (!actual) return;
    setSubiendo(true);
    setError(null);
    try {
      const r = await fetch("/api/arquitectura", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquitecturaId: actual.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo recotejar.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setSubiendo(false);
    }
  }

  /** Abre el selector de una fila y, la primera vez, trae las URLs del sitio. */
  async function abrir(nodo: NodoVista) {
    if (abierta?.id === nodo.id) {
      setAbierta(null);
      return;
    }
    setAbierta(nodo);
    // La caja arranca vacía a propósito: la lista ya viene ordenada por
    // cercanía a esta sección, así que escribir suele sobrar. Rellenarla con
    // el nombre solo conseguía que no casara nada y pareciera que el sitemap
    // estaba vacío.
    setBusca("");

    if (urls || cargandoUrls) return;
    setCargandoUrls(true);
    try {
      const r = await fetch(`/api/arquitectura?cliente=${encodeURIComponent(clienteId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudieron leer las URLs del sitio.");
      setUrls(j.urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargandoUrls(false);
    }
  }

  async function asignar(nodoId: string, url: string) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/arquitectura", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodoId, url }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setGuardando(false);
    }
  }

  const nodos = actual?.nodos ?? [];
  const filtrados =
    filtro === "todo" || filtro === "chat" ? nodos : nodos.filter((n) => n.estado === filtro);

  // El orden del Excel es el que trae la jerarquía, así que ordenar por
  // «Sección prevista» respeta ese orden en vez de alfabetizar y romperla.
  const visibles = ordenarPor(filtrados, (n, col) =>
    col === "nombre"
      ? n.nivel * 100000 + n.volumen * -1
      : col === "principal"
      ? n.principal ?? ""
      : col === "volumen"
      ? n.volumen
      : col === "estado"
      ? n.estado
      : n.urlDestino ?? ""
  );

  const cuenta = (e: string) => nodos.filter((n) => n.estado === e).length;
  const volumenPerdido = nodos.filter((n) => n.estado === "falta").reduce((s, n) => s + n.volumen, 0);

  const listadas = (() => {
    if (!urls || !abierta) return [];

    // Se puntúa cada URL por las palabras que comparte con la sección, y se
    // ordena por eso. Así la lista es un desplegable del sitemap entero donde
    // lo probable está arriba, en vez de un filtro que puede dejarlo vacío.
    const palabras = trocear(abierta.nombre + " " + abierta.slug);
    const puntuadas = urls
      .map((u) => {
        const texto = limpiar(u.nombre + " " + u.url);
        let punto = 0;
        for (const w of palabras) if (texto.includes(w)) punto++;
        return { u, punto };
      })
      .sort((a, b) => b.punto - a.punto);

    const q = busca.trim();
    if (!q) return puntuadas.map((x) => x.u);

    const partes = trocear(q);
    return puntuadas
      .filter(({ u }) => {
        const texto = limpiar(u.nombre + " " + u.url);
        return partes.every((p) => texto.includes(p));
      })
      .map((x) => x.u);
  })();

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {puedeSubir && (
          <label className="boton cursor-pointer">
            {subiendo ? "Procesando…" : actual ? "Subir otra versión" : "Subir Excel AST"}
            <input
              type="file"
              accept=".xlsx,.xlsm"
              hidden
              disabled={subiendo}
              onChange={subir}
            />
          </label>
        )}

        {actual && puedeSubir && (
          <button onClick={recotejar} disabled={subiendo} className="boton">
            Volver a cotejar
          </button>
        )}

        {subiendo && (
          <span className="text-[13px] text-[color:var(--tinta-suave)]">
            Leyendo el sitemap y cotejando con la IA; puede tardar un par de minutos.
          </span>
        )}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
      {aviso && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{aviso}</p>}

      {!actual ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-20 text-center">
          <p className="text-[15px] font-medium">
            No hay ninguna arquitectura cargada para este cliente.
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Sube el Excel con la hoja «AST». Se leerán las secciones previstas y se cruzarán con el
            sitemap del sitio para ver qué está creado, con qué URL, y qué falta.
          </p>
        </div>
      ) : (
        <>
          <dl className="tarjeta mt-5 grid grid-cols-2 divide-x divide-[color:var(--linea)] overflow-hidden sm:grid-cols-4">
            {[
              ["Secciones", String(nodos.length), ""],
              ["Creadas", String(cuenta("creada")), "text-emerald-700"],
              ["Dudosas", String(cuenta("dudosa")), "text-amber-700"],
              ["Por crear", String(cuenta("falta")), "text-red-700"],
            ].map(([k, v, color]) => (
              <div key={k} className="px-5 py-4">
                <dt className="rotulo">{k}</dt>
                <dd className={`mt-1 text-[26px] font-semibold tabular-nums ${color || ""}`}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          {volumenPerdido > 0 && (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
              Las secciones por crear suman{" "}
              <strong className="font-semibold tabular-nums text-[color:var(--tinta)]">
                {volumenPerdido.toLocaleString("es-CL")}
              </strong>{" "}
              búsquedas mensuales que hoy el sitio no puede capturar.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="segmentos">
              {FILTROS.map(([id, texto]) => (
                <button
                  key={id}
                  onClick={() => setFiltro(id)}
                  className={`segmento ${filtro === id ? "segmento-activo" : ""}`}
                >
                  {texto}
                </button>
              ))}

              {puedeSubir && (
                <>
                  <span className="mx-1 h-4 w-px bg-black/10" />
                  <button
                    onClick={() => setFiltro("chat")}
                    className={`segmento ${filtro === "chat" ? "segmento-activo" : ""}`}
                  >
                    Asistente
                  </button>
                </>
              )}
            </div>
            <span className="ml-auto text-[12px] text-[color:var(--tinta-suave)]">
              {actual.archivo}
              {actual.cotejado && ` · cotejado ${actual.cotejado.slice(0, 16).replace("T", " ")}`}
            </span>
          </div>

          {filtro === "chat" ? (
            <ChatArquitectura arquitecturaId={actual.id} />
          ) : (
          <div className="tarjeta mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
              <tbody className="divide-y divide-[color:var(--linea)]">
                {visibles.map((n) => (
                  <Fragment key={n.id}>
                  <tr className="align-top transition hover:bg-black/[0.015]">
                    <td className="w-[34%] px-5 py-3">
                      {/* La sangría hace visible la jerarquía sin una columna extra. */}
                      <div style={{ paddingLeft: (n.nivel - 1) * 14 }}>
                        <p className="truncate font-medium">{n.nombre}</p>
                        <p className="truncate font-mono text-[11px] text-[color:var(--tinta-suave)]">
                          {n.slug}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {n.principal ? (
                        <>
                          <p className="max-w-[240px] truncate" title={n.principal}>
                            {n.principal}
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums text-[color:var(--tinta-suave)]">
                            {n.volumenPrincipal.toLocaleString("es-CL")} búsquedas
                            {n.keywords > 1 && ` · +${n.keywords - 1} más`}
                          </p>
                        </>
                      ) : (
                        <span className="text-[color:var(--tinta-suave)]">sin keywords</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[color:var(--tinta-media)]">
                      {n.volumen ? n.volumen.toLocaleString("es-CL") : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`pastilla whitespace-nowrap ${estilo(n.estado)}`}>
                        {etiqueta(n.estado)}
                      </span>
                      {n.estado === "dudosa" && n.confianza !== null && (
                        <span className="ml-1.5 text-[11px] tabular-nums text-[color:var(--tinta-suave)]">
                          {n.confianza}%
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {n.urlDestino ? (
                        <>
                          <a
                            href={n.urlDestino}
                            target="_blank"
                            rel="noopener"
                            className="block truncate underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                            title={n.urlDestino}
                          >
                            {n.urlDestino.replace(/^https?:\/\/[^/]+/, "")}
                          </a>
                          <p className="mt-0.5 text-[11px] text-[color:var(--tinta-suave)]">
                            {origen(n.comoSeCotejo) && (
                              <span className="mr-1 text-[color:var(--tinta-media)]">
                                {origen(n.comoSeCotejo)}
                              </span>
                            )}
                            {n.nota}
                          </p>
                        </>
                      ) : (
                        <span className="text-[color:var(--tinta-suave)]">sin URL — hay que crearla</span>
                      )}

                      {puedeSubir && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => abrir(n)}
                            className="text-[12px] font-medium text-[color:var(--tinta-media)] transition hover:text-[color:var(--acento)]"
                          >
                            {abierta?.id === n.id ? "Cerrar" : n.urlDestino ? "Cambiar URL" : "Asignar URL"}
                          </button>

                          {n.estado !== "creada" && onCrear && (
                            <button
                              onClick={() => onCrear(ordenDeCrear(n))}
                              className="text-[12px] font-semibold text-[color:var(--acento)] underline-offset-2 hover:underline"
                              title="Lleva la orden al chat, con su keyword y su volumen, para revisarla antes de enviar"
                            >
                              Crear con la IA
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* El selector va en su propia fila y a todo lo ancho: dentro
                      de la celda de URL se quedaba en 340 px y no cabía. */}
                  {abierta?.id === n.id && (
                    <tr>
                      <td colSpan={5} className="bg-black/[0.02] px-5 pb-5 pt-2">
                        <input
                          autoFocus
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Filtrar las URLs del sitio, o pegar una entera"
                          className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
                        />

                        {cargandoUrls && (
                          <p className="mt-2 text-[12px] text-[color:var(--tinta-suave)]">
                            Leyendo el sitemap del sitio…
                          </p>
                        )}

                        {urls && (
                          <>
                            <p className="mt-3 text-[12px] text-[color:var(--tinta-suave)]">
                              {listadas.length === urls.length
                                ? `${urls.length} URLs del sitio, las más parecidas a «${n.nombre}» arriba`
                                : `${listadas.length} de ${urls.length} URLs`}
                            </p>
                            <div className="scroll-fino mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-[color:var(--linea)] bg-white">
                              {listadas.length === 0 ? (
                                <p className="px-4 py-5 text-[12px] text-[color:var(--tinta-suave)]">
                                  Ninguna URL del sitio coincide con ese filtro. Borra el texto para ver
                                  el sitemap completo.
                                </p>
                              ) : (
                                listadas.map((u) => (
                                  <button
                                    key={u.url}
                                    disabled={guardando}
                                    onClick={() => asignar(n.id, u.url)}
                                    className="flex w-full items-baseline gap-3 border-b border-[color:var(--linea)] px-4 py-2.5 text-left transition last:border-0 hover:bg-[color:var(--acento)]/5 disabled:opacity-40"
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] font-medium">
                                        {u.nombre}
                                      </span>
                                      <span className="block truncate font-mono text-[11px] text-[color:var(--tinta-suave)]">
                                        {u.url.replace(/^https?:\/\/[^/]+/, "")}
                                      </span>
                                    </span>
                                    <span className="pastilla shrink-0 bg-black/[0.05] text-[color:var(--tinta-media)]">
                                      {u.tipo === "product_cat"
                                        ? "categoría"
                                        : u.tipo === "page"
                                        ? "página"
                                        : u.tipo === "post"
                                        ? "entrada"
                                        : "sitemap"}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        )}

                        <div className="mt-2 flex flex-wrap gap-2">
                          {/^https?:\/\//.test(busca.trim()) && (
                            <button
                              disabled={guardando}
                              onClick={() => asignar(n.id, busca.trim())}
                              className="boton-fuerte"
                            >
                              Usar «{busca.trim()}»
                            </button>
                          )}
                          {n.urlDestino && (
                            <button
                              disabled={guardando}
                              onClick={() => asignar(n.id, "")}
                              className="boton"
                            >
                              Quitar la URL
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          )}

          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
            El cruce va en tres pasos: coincidencia exacta de slug, parecido por nombre, y lo que quede
            sin resolver lo decide la IA sobre las URLs del sitemap. Lo que ni así queda claro se marca
            como dudoso en vez de decidirlo por ti, y siempre puedes asignar la URL a mano.
          </p>
        </>
      )}
    </div>
  );
}
