"use client";

import { useConfirmar } from "@/components/Confirmar";
import { useEffect, useState } from "react";
import Chat from "@/components/Chat";
import Sitemap from "@/components/Sitemap";
import Arquitectura, { type ArquitecturaVista } from "@/components/Arquitectura";
import Posiciones, { type KeywordVista, type ExploracionVista } from "@/components/Posiciones";
import Gasto from "@/components/Gasto";
import Bitacora from "@/components/Bitacora";
import Backlinks from "@/components/Backlinks";
import Rastreo from "@/components/Rastreo";
import Panorama from "@/components/Panorama";
import Local from "@/components/Local";
import FichaLocal from "@/components/FichaLocal";
import { descargarCsv } from "@/lib/csv";
import VisibilidadIa from "@/components/VisibilidadIa";
import Competidores from "@/components/Competidores";
import { Icono, type NombreIcono } from "@/components/Iconos";
import SearchConsole from "@/components/SearchConsole";

export interface Suceso {
  fecha: string;
  accion: string;
  resumen: string;
  resultado: string;
  /** `sitio` viene del registro del WordPress; `panel`, del nuestro. */
  origen: "sitio" | "panel";
  quien?: string;
  /** Lo largo: el estado anterior de un cambio, para verlo plegado. */
  detalle?: string;
}

interface Turno {
  rol: "user" | "assistant";
  contenido: string;
  usadas?: string[];
  imagenes?: string[];
  autor?: string;
}

export interface ResumenConversacion {
  id: string;
  titulo: string;
  fecha: string;
  mensajes: number;
  /** Quién lo abrió, si no fuiste tú. Nulo en los propios. */
  autor: string | null;
}

/**
 * Doce vistas en cuatro zonas. En una sola fila no cabían: en móvil las
 * últimas cuatro se salían de la pantalla y no había forma de llegar a ellas.
 * Las zonas responden a qué hace la persona: trabajar, medir, revisar y
 * mirar la cuenta.
 */
type Pestaña =
  | "chat"
  | "panorama"
  | "posiciones"
  | "gsc"
  | "local"
  | "backlinks"
  | "ia"
  | "competidores"
  | "tecnico"
  | "sitemap"
  | "arquitectura"
  | "bitacora"
  | "gasto"
  | "registro"
  | "datos";

interface Zona {
  id: string;
  etiqueta: string;
  pestañas: readonly { id: Pestaña; etiqueta: string; icono: NombreIcono }[];
}

const ZONAS: readonly Zona[] = [
  { id: "trabajar", etiqueta: "Trabajar", pestañas: [{ id: "chat", etiqueta: "Asistente", icono: "asistente" }] },
  {
    id: "medir",
    etiqueta: "Medir",
    pestañas: [
      { id: "panorama", etiqueta: "Panorama", icono: "panorama" },
      { id: "gsc", etiqueta: "Search Console", icono: "consola" },
      { id: "posiciones", etiqueta: "Posiciones", icono: "posiciones" },
      { id: "local", etiqueta: "Local", icono: "local" },
      { id: "backlinks", etiqueta: "Backlinks", icono: "backlinks" },
      { id: "ia", etiqueta: "IA", icono: "ia" },
      { id: "competidores", etiqueta: "Competidores", icono: "competidores" },
    ],
  },
  {
    id: "revisar",
    etiqueta: "Revisar",
    pestañas: [
      { id: "tecnico", etiqueta: "Técnico", icono: "tecnico" },
      { id: "sitemap", etiqueta: "Sitemap", icono: "sitemap" },
      { id: "arquitectura", etiqueta: "Arquitectura", icono: "arquitectura" },
    ],
  },
  {
    id: "cuenta",
    etiqueta: "Cuenta",
    pestañas: [
      { id: "bitacora", etiqueta: "Bitácora", icono: "bitacora" },
      { id: "gasto", etiqueta: "Gasto", icono: "recibo" },
      { id: "registro", etiqueta: "Registro", icono: "registro" },
      { id: "datos", etiqueta: "Datos", icono: "datos" },
    ],
  },
];

const PESTAÑAS = ZONAS.flatMap((z) => z.pestañas);

function zonaDe(p: Pestaña) {
  return ZONAS.find((z) => z.pestañas.some((x) => x.id === p))!;
}

/**
 * La pestaña vive en la URL (`?t=tecnico`).
 *
 * Con un estado de React, recargar devolvía a la primera y no había forma de
 * mandarle a un compañero «mira el Técnico de Fontus» con un enlace.
 */
function pestañaDeUrl(): Pestaña | null {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("t");
  return PESTAÑAS.some((p) => p.id === t) ? (t as Pestaña) : null;
}

function Contador({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--tinta-media)]">{etiqueta}</dt>
      <dd className="mt-0.5 cifra text-[22px] font-semibold tabular-nums text-[color:var(--tinta)]">{valor}</dd>
    </div>
  );
}

export default function FichaCliente({
  clienteId,
  nombre,
  puedeEscribir,
  historialInicial,
  conversacionInicial,
  sucesos,
  datos,
  conversaciones,
  borrar,
  limpiar,
  ajustes,
  guardarAjustes,
  darDeBaja,
  puedeDarDeBaja,
  memorias,
  olvidar,
  enlaceInforme,
  crearEnlace,
  revocarEnlace,
  pasos,
  reconectar,
  esWordPress,
  sinConector,
  totalConversaciones,
  arquitectura,
  keywords,
  hayProveedor,
  hayGsc,
  puedeSubir,
  medirCada,
  costePorMedicion,
  exploracion,
  costeExploracion,
}: {
  clienteId: string;
  nombre: string;
  puedeEscribir: boolean;
  historialInicial: Turno[];
  conversacionInicial: string | null;
  sucesos: Suceso[];
  datos: { etiqueta: string; valor: string }[];
  conversaciones: ResumenConversacion[];
  borrar: (datos: FormData) => Promise<void>;
  limpiar: () => Promise<void>;
  ajustes: { instrucciones: string; tarifa: number | null; escrituraBloqueada: boolean };
  guardarAjustes: (datos: FormData) => Promise<void>;
  darDeBaja: () => Promise<void>;
  puedeDarDeBaja: boolean;
  memorias: { id: string; titulo: string; nota: string; fecha: string }[];
  olvidar: (datos: FormData) => Promise<void>;
  enlaceInforme: string | null;
  crearEnlace: () => Promise<void>;
  revocarEnlace: () => Promise<void>;
  pasos: { texto: string; hecho: boolean; pestaña: string }[];
  reconectar: (datos: FormData) => Promise<void>;
  esWordPress: boolean;
  /** Dado de alta solo por dominio: se mide todo, no se escribe nada. */
  sinConector: boolean;
  totalConversaciones: number;
  arquitectura: ArquitecturaVista | null;
  keywords: KeywordVista[];
  hayProveedor: boolean;
  hayGsc: boolean;
  puedeSubir: boolean;
  medirCada: number | null;
  costePorMedicion: number;
  exploracion: ExploracionVista | null;
  costeExploracion: number;
}) {
  const [activa, setActivaEstado] = useState<Pestaña>("chat");

  useEffect(() => {
    const t = pestañaDeUrl();
    if (t) setActivaEstado(t);
  }, []);

  function setActiva(p: Pestaña) {
    setActivaEstado(p);
    const url = new URL(window.location.href);
    if (p === "chat") url.searchParams.delete("t");
    else url.searchParams.set("t", p);
    window.history.replaceState(window.history.state, "", url);
  }
  const { confirmar, dialogo } = useConfirmar();

  // Lo que llega desde otra pestaña al campo del chat. El sello permite repetir
  // la misma instrucción dos veces y que la segunda también se note.
  const [sugerida, setSugerida] = useState<{ texto: string; sello: number } | null>(null);

  function llevarAlChat(texto: string) {
    setSugerida({ texto, sello: Date.now() });
    setActiva("chat");
  }
  const [sitemapVisto, setSitemapVisto] = useState(false);
  if (activa === "sitemap" && !sitemapVisto) setSitemapVisto(true);
  const [filtro, setFiltro] = useState<"todo" | "sitio" | "panel">("todo");
  const [buscaRegistro, setBuscaRegistro] = useState("");
  const [quien, setQuien] = useState("");

  const personas = [...new Set(sucesos.map((s) => s.quien).filter((q): q is string => Boolean(q)))].sort();
  const q = buscaRegistro.trim().toLowerCase();
  const visibles = sucesos.filter(
    (s) =>
      (filtro === "todo" || s.origen === filtro) &&
      (!quien || s.quien === quien) &&
      (!q || `${s.accion} ${s.resumen}`.toLowerCase().includes(q))
  );

  return (
    <div className="mt-6 flex items-start gap-8">
      {dialogo}

      {/* La columna de secciones, como en cualquier herramienta de escritorio:
          fija mientras se baja, agrupada por lo que se va a hacer. En pantallas
          estrechas no cabe y se vuelve a los segmentos de siempre. */}
      <aside className="sticky top-16 hidden w-48 shrink-0 lg:block">
        <nav aria-label="Secciones del cliente" className="flex flex-col gap-4">
          {ZONAS.map((z) => (
            <div key={z.id}>
              <p className="rotulo px-3 pb-1.5">{z.etiqueta}</p>
              <ul className="flex flex-col gap-px">
                {z.pestañas.map((p) => {
                  const aqui = activa === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setActiva(p.id)}
                        aria-current={aqui ? "page" : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-[7px] text-left text-[13.5px] font-medium transition ${
                          aqui
                            ? "bg-white text-[color:var(--tinta)] shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                            : "text-[color:var(--tinta-media)] hover:bg-black/[0.04] hover:text-[color:var(--tinta)]"
                        }`}
                      >
                        <Icono nombre={p.icono} tam={17} className={aqui ? "text-[color:var(--acento)]" : "text-[color:var(--tinta-suave)]"} />
                        <span className="truncate">{p.etiqueta}</span>
                        {p.id === "registro" && sucesos.length > 0 && (
                          <span className="ml-auto text-[12px] tabular-nums text-[color:var(--tinta-suave)]">{sucesos.length}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
      {/* Control segmentado en vez de pestañas subrayadas: agrupa las vistas en
          un solo objeto en lugar de dejar cinco palabras sueltas sobre una raya. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:hidden">
        <div className="segmentos" role="tablist" aria-label="Zona">
          {ZONAS.map((z) => {
            const activaAqui = zonaDe(activa).id === z.id;
            return (
              <button
                key={z.id}
                role="tab"
                aria-selected={activaAqui}
                onClick={() => setActiva(z.pestañas[0].id)}
                className={`segmento ${activaAqui ? "segmento-activo" : ""}`}
              >
                {z.etiqueta}
              </button>
            );
          })}
        </div>

        {zonaDe(activa).pestañas.length > 1 && (
          <div className="segmentos" role="tablist" aria-label="Vista">
            {zonaDe(activa).pestañas.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={activa === p.id}
                onClick={() => setActiva(p.id)}
                className={`segmento ${activa === p.id ? "segmento-activo" : ""}`}
              >
                {p.etiqueta}
                {p.id === "registro" && sucesos.length > 0 && (
                  <span className="ml-1.5 tabular-nums text-[color:var(--tinta-suave)]">
                    {sucesos.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* El chat se oculta en lugar de desmontarse: cambiar de pestaña no debe
          perder una respuesta a medio escribir ni cortar un envío en curso. */}
      <div className={activa === "chat" ? "block" : "hidden"}>
        <div className="mt-5 flex gap-6">
          {conversaciones.length >= 1 && (
            <aside className="hidden w-52 shrink-0 sm:block">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--tinta-suave)]">
                Conversaciones del equipo
              </p>
              {totalConversaciones > conversaciones.length && (
                <p className="mt-1 text-[11px] text-[color:var(--tinta-suave)]">
                  Se ven las {conversaciones.length} últimas de {totalConversaciones}.
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {conversaciones.map((cv) => {
                  const abierta = cv.id === conversacionInicial;
                  return (
                    <li key={cv.id} className="group relative">
                      <a
                        href={`?c=${cv.id}`}
                        className={`block rounded-lg px-3 py-2 pr-7 text-[13px] transition ${
                          abierta
                            ? "bg-[color:var(--acento)]/10 font-semibold text-[color:var(--tinta)]"
                            : "text-[color:var(--tinta-media)] hover:bg-black/[0.04]"
                        }`}
                      >
                        <span className="line-clamp-2">{cv.titulo}</span>
                        <span className="mt-0.5 block text-[11px] tabular-nums text-[color:var(--tinta-suave)]">
                          {cv.fecha} · {cv.mensajes} msj
                        </span>
                        {cv.autor && (
                          <span className="mt-0.5 block text-[11px] font-medium text-[color:var(--acento)]">
                            {cv.autor}
                          </span>
                        )}
                      </a>
                      {/* Borrar: visible al pasar el ratón, y solo en los hilos
                          propios. Los de otros se leen, no se borran. */}
                      <div
                        className={`absolute right-1.5 top-1.5 transition ${
                          cv.autor ? "hidden" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            if (!(await confirmar({ titulo: `¿Borrar «${cv.titulo}»?`, detalle: "Se pierde la conversación entera. No se puede deshacer." }))) return;
                            const datos = new FormData();
                            datos.set("conversacionId", cv.id);
                            await borrar(datos);
                          }}
                          title="Borrar conversación"
                          aria-label={`Borrar la conversación «${cv.titulo}»`}
                          className="grid h-5 w-5 place-items-center rounded text-[color:var(--tinta-suave)] transition hover:bg-red-50 hover:text-red-600 group-hover:text-[color:var(--tinta-media)]"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Los hilos vacíos se acumulan solos: cada «nueva conversación»
                  que no se llegó a usar deja uno. Borrarlos de uno en uno no es
                  trabajo de nadie. */}
              {conversaciones.some((cv) => !cv.autor && cv.mensajes < 2) && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirmar({ titulo: "¿Borrar los hilos vacíos?", detalle: "Se van los que quedaron con cero o un mensaje. No se puede deshacer.", boton: "Limpiar" })) await limpiar();
                    }}
                    className="w-full rounded-lg border border-[color:var(--linea-fuerte)] px-3 py-1.5 text-[12px] text-[color:var(--tinta-media)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    Limpiar hilos vacíos
                  </button>
                </div>
              )}
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {/* En pantallas chicas la lista pasa a un desplegable. */}
            {conversaciones.length > 1 && (
              <select
                defaultValue={conversacionInicial ?? ""}
                onChange={(e) => { if (e.target.value) window.location.search = "?c=" + e.target.value; }}
                className="mb-3 w-full rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] sm:hidden"
              >
                {conversaciones.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.titulo} · {cv.fecha}
                    {cv.autor ? ` · ${cv.autor}` : ""}
                  </option>
                ))}
              </select>
            )}
            <Chat
              key={conversacionInicial ?? "nueva"}
              clienteId={clienteId}
              nombre={nombre}
              puedeEscribir={puedeEscribir}
              historialInicial={historialInicial}
              conversacionInicial={conversacionInicial}
              visible={activa === "chat"}
              sugerida={sugerida}
            />
          </div>
        </div>
      </div>

      {sitemapVisto && (
        <div className={activa === "sitemap" ? "block" : "hidden"}>
          <Sitemap clienteId={clienteId} />
        </div>
      )}

      {activa === "arquitectura" && (
        <Arquitectura
          clienteId={clienteId}
          actual={arquitectura}
          puedeSubir={puedeSubir}
          onCrear={llevarAlChat}
        />
      )}

      {activa === "panorama" && <Panorama clienteId={clienteId} irA={(t) => setActiva(t as Pestaña)} puedeEditar={puedeSubir} />}

      {activa === "gsc" && <SearchConsole clienteId={clienteId} puedeEditar={puedeSubir} irA={(t) => setActiva(t as Pestaña)} />}

      {activa === "local" && (
        <>
          <FichaLocal clienteId={clienteId} nombreCliente={nombre} puedeAuditar={puedeSubir} />
          <div className="mt-12 border-t border-[color:var(--linea)] pt-8">
            <Local clienteId={clienteId} nombreCliente={nombre} puedeBuscar={puedeSubir} />
          </div>
        </>
      )}

      {/* Velocidad y canibalizaciones viven dentro de Rastreo, como dos cuadros
          más de su rejilla: son comprobaciones técnicas y se miran ahí. */}
      {activa === "tecnico" && <Rastreo clienteId={clienteId} puedeLanzar={puedeSubir} onPedir={llevarAlChat} />}

      {activa === "backlinks" && <Backlinks clienteId={clienteId} puedeEditar={puedeSubir} />}

      {activa === "ia" && <VisibilidadIa clienteId={clienteId} puedeEditar={puedeSubir} hayProveedor={hayProveedor} />}

      {activa === "competidores" && (
        <Competidores
          clienteId={clienteId}
          puedeEditar={puedeSubir}
          hayProveedor={hayProveedor}
          onSeguir={async (termino) => {
            const r = await fetch("/api/posiciones", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clienteId, terminos: termino, ubicacion: 2152, dispositivo: "desktop" }),
            });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo seguir.");
          }}
        />
      )}

      {activa === "bitacora" && <Bitacora clienteId={clienteId} puedeEditar={puedeSubir} />}

      {activa === "gasto" && <Gasto clienteId={clienteId} tarifa={ajustes.tarifa} />}

      {activa === "posiciones" && (
        <Posiciones
          clienteId={clienteId}
          keywords={keywords}
          puedeEditar={puedeSubir}
          hayProveedor={hayProveedor}
          hayGsc={hayGsc}
          medirCada={medirCada}
          costePorMedicion={costePorMedicion}
          exploracion={exploracion}
          costeExploracion={costeExploracion}
          irA={(t) => setActiva(t as Pestaña)}
        />
      )}

      {activa === "registro" && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(
              [
                ["todo", "Todo"],
                ["sitio", "En el sitio"],
                ["panel", "Desde el panel"],
              ] as const
            ).map(([id, texto]) => (
              <button
                key={id}
                onClick={() => setFiltro(id)}
                className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${
                  filtro === id
                    ? "bg-[color:var(--tinta)] text-white"
                    : "bg-black/[0.04] text-[color:var(--tinta-media)] hover:bg-black/[0.08]"
                }`}
              >
                {texto}
              </button>
            ))}
            <input
              value={buscaRegistro}
              onChange={(e) => setBuscaRegistro(e.target.value)}
              placeholder="Buscar en el registro…"
              aria-label="Buscar en el registro"
              className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
            />
            {personas.length > 1 && (
              <select
                value={quien}
                onChange={(e) => setQuien(e.target.value)}
                aria-label="Filtrar por persona"
                className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[13px] outline-none focus:border-[color:var(--acento)]"
              >
                <option value="">Cualquier persona</option>
                {personas.map((per) => (
                  <option key={per} value={per}>
                    {per}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() =>
                descargarCsv(
                  `registro-${nombre}`,
                  visibles.map((s) => ({ fecha: s.fecha, accion: s.accion, resumen: s.resumen, resultado: s.resultado, origen: s.origen, quien: s.quien ?? "" }))
                )
              }
              className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--acento)]"
            >
              Descargar CSV
            </button>
            <p className="ml-auto text-[13px] text-[color:var(--tinta-suave)]">
              {visibles.length} {visibles.length === 1 ? "operación" : "operaciones"}
            </p>
          </div>

          {visibles.length === 0 ? (
            <p className="rounded-xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-10 text-center text-sm text-[color:var(--tinta-media)]">
              Sin operaciones registradas.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--linea-fuerte)] overflow-hidden rounded-xl border border-[color:var(--linea-fuerte)] bg-white">
              {visibles.map((s, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-[13px] text-[color:var(--tinta-suave)]">{s.fecha}</span>

                  <span
                    className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${
                      s.origen === "panel"
                        ? "bg-[color:var(--acento)]/10 text-[color:var(--acento)]"
                        : "bg-black/[0.04] text-[color:var(--tinta-media)]"
                    }`}
                    title={s.origen === "panel" ? "Hecho desde el panel" : "Registrado por el conector"}
                  >
                    {s.accion}
                  </span>

                  <span className={s.resultado === "ok" ? "text-[color:var(--tinta)]" : "font-medium text-red-600"}>
                    {s.resumen}
                  </span>
                  {s.detalle && (
                    <details className="basis-full">
                      <summary className="cursor-pointer text-[12px] text-[color:var(--tinta-suave)] hover:text-[color:var(--tinta)]">
                        Ver cómo estaba antes
                      </summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.04] p-3 font-mono text-[12px] leading-relaxed">
                        {s.detalle}
                      </pre>
                    </details>
                  )}

                  {s.quien && <span className="ml-auto text-[13px] text-[color:var(--tinta-suave)]">{s.quien}</span>}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
            «En el sitio» es lo que el conector anotó dentro de WordPress. «Desde el panel» es lo que hizo
            tu equipo desde aquí, con nombre.
          </p>
        </div>
      )}

      {activa === "datos" && (
        <div className="mt-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--linea-fuerte)] bg-black/[0.08] sm:grid-cols-3">
            {datos.map((d) => (
              <Contador key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} />
            ))}
          </dl>

          {/* La puesta en marcha de un cliente nuevo era conectar el sitio y
              caer en el chat con todo lo demás repartido por pestañas. Esto
              dice qué falta, y lleva a cada cosa. Desaparece cuando está todo. */}
          {pasos.some((x) => !x.hecho) && (
            <div className="tarjeta mt-4 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-medium">Puesta en marcha</p>
                <p className="text-[13px] tabular-nums text-[color:var(--tinta-suave)]">
                  {pasos.filter((x) => x.hecho).length} de {pasos.length}
                </p>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {pasos.map((x) => (
                  <li key={x.texto} className="flex items-center gap-2 text-[14px]">
                    <span className={x.hecho ? "text-emerald-600" : "text-[color:var(--tinta-suave)]"}>
                      {x.hecho ? "✓" : "○"}
                    </span>
                    {x.hecho ? (
                      <span className="text-[color:var(--tinta-media)]">{x.texto}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiva(x.pestaña as Pestaña)}
                        className="text-left underline-offset-4 hover:text-[color:var(--acento)] hover:underline"
                      >
                        {x.texto}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Ajustes del cliente: el brief fijo, la tarifa y el candado. */}
          <form action={guardarAjustes} className="tarjeta mt-4 p-5">
            <p className="text-[14px] font-medium">Ajustes de {nombre}</p>

            <label className="mt-4 block">
              <span className="rotulo">Instrucciones fijas para el asistente</span>
              <textarea
                name="instrucciones"
                defaultValue={ajustes.instrucciones}
                rows={4}
                maxLength={4000}
                disabled={!puedeSubir}
                placeholder="Tono de la marca, qué no tocar, productos estrella, cómo firman los textos… Se lo dice al asistente en cada turno, sin que haya que repetirlo."
                className="mt-1.5 w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[14px] leading-relaxed outline-none transition focus:border-[color:var(--acento)] disabled:bg-black/[0.03]"
              />
            </label>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="rotulo">Tarifa mensual (US$)</span>
                <input
                  name="tarifa"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={ajustes.tarifa ?? ""}
                  disabled={!puedeSubir}
                  placeholder="0"
                  className="mt-1.5 block w-36 rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] tabular-nums outline-none transition focus:border-[color:var(--acento)] disabled:bg-black/[0.03]"
                />
              </label>

              <label className="flex items-center gap-2 pb-2 text-[14px]">
                <input
                  type="checkbox"
                  name="escrituraBloqueada"
                  value="1"
                  defaultChecked={ajustes.escrituraBloqueada}
                  disabled={!puedeSubir}
                  className="accent-[color:var(--acento)]"
                />
                Bloquear la escritura desde el panel
              </label>
            </div>
            <p className="mt-1.5 text-[13px] text-[color:var(--tinta-suave)]">
              La tarifa sirve para leer si el cliente sale rentable en Gasto. El bloqueo frena al asistente
              aunque el sitio permita escribir; vale también para Shopify, donde no hay plugin.
            </p>

            {puedeSubir && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="submit" className="boton-fuerte">
                  Guardar ajustes
                </button>
                {puedeDarDeBaja && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await confirmar({
                          titulo: `¿Dar de baja a ${nombre}?`,
                          detalle: "Desaparece de la cartera y el vigía deja de mirarlo. Su histórico, su gasto y sus hilos se conservan; un administrador puede reactivarlo desde la base.",
                          boton: "Dar de baja",
                        })
                      )
                        await darDeBaja();
                    }}
                    className="ml-auto text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
                  >
                    Dar de baja este cliente
                  </button>
                )}
              </div>
            )}
          </form>

          {/* El informe para el cliente final: un enlace privado con lo hecho
              este mes y el anterior, y cómo van los clics. Sin gasto ni
              herramientas. */}
          <div className="tarjeta mt-4 p-5">
            <p className="text-[14px] font-medium">Informe para el cliente</p>
            <p className="mt-0.5 text-[14px] text-[color:var(--tinta-media)]">
              Un enlace privado que enseña la bitácora de este mes y del anterior, y los clics desde Google.
              Se puede revocar cuando quieras; crear uno nuevo anula el anterior.
            </p>
            {enlaceInforme ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={enlaceInforme}
                  aria-label="Enlace del informe"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-[260px] flex-1 rounded-xl border border-[color:var(--linea-fuerte)] bg-black/[0.03] px-3.5 py-2 font-mono text-[13px]"
                />
                <a href={enlaceInforme} target="_blank" rel="noopener" className="boton">
                  Abrir
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(enlaceInforme).catch(() => {})}
                  className="boton"
                >
                  Copiar
                </button>
                {puedeSubir && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirmar({ titulo: "¿Revocar el enlace del informe?", detalle: "Quien lo tenga dejará de ver el informe. Puedes crear otro después.", boton: "Revocar" })) await revocarEnlace();
                    }}
                    className="text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
                  >
                    Revocar
                  </button>
                )}
              </div>
            ) : (
              puedeSubir && (
                <button type="button" onClick={() => crearEnlace()} className="boton mt-3">
                  Crear enlace
                </button>
              )
            )}
          </div>

          {/* La memoria del asistente, que era invisible: lo que aprendió del
              sitio en hilos anteriores y lo que se le cuela en cada turno. */}
          <div className="tarjeta mt-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium">Lo que el asistente recuerda de este sitio</p>
              <p className="text-[13px] tabular-nums text-[color:var(--tinta-suave)]">{memorias.length} apuntes</p>
            </div>
            {memorias.length === 0 ? (
              <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
                Todavía nada. Guarda apuntes durante las conversaciones: cómo está montado el sitio, qué decidió
                el cliente, qué no hay que tocar.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[color:var(--linea)]">
                {memorias.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{m.titulo}</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">{m.nota}</p>
                      <p className="mt-0.5 text-[12px] text-[color:var(--tinta-suave)]">{m.fecha}</p>
                    </div>
                    {puedeSubir && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!(await confirmar({ titulo: `¿Olvidar «${m.titulo}»?`, detalle: "El asistente dejará de tenerlo en cuenta en los próximos turnos.", boton: "Olvidar" }))) return;
                          const d = new FormData();
                          d.set("memoriaId", m.id);
                          await olvidar(d);
                        }}
                        className="shrink-0 text-[13px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
                      >
                        Olvidar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* La reconexión vivía solo en «Conectar sitio», donde nadie la
              buscaba: quien acaba de regenerar la cadena está mirando la ficha
              del cliente, no la pantalla de dar de alta. El alta ya actualiza
              por dominio en vez de duplicar, así que basta con traer el enlace
              hasta aquí y decir qué hace. */}
          {puedeSubir && (
            <div className="tarjeta mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="max-w-xl">
                <p className="text-[14px] font-medium">{sinConector ? "Conectar el sitio" : "Volver a conectar el sitio"}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
                  {sinConector ? (
                    <>
                      Este cliente se sigue solo por su dominio: se mide todo, pero el asistente no puede
                      escribir. Para que pueda, instala el plugin AppSEO en su WordPress y pega aquí la
                      cadena, o autoriza la app en Shopify. El histórico se conserva.
                    </>
                  ) : (
                    <>
                      Si regeneraste la cadena de conexión en el WordPress, o el panel dejó de tener
                      acceso, pega la nueva aquí. Se actualiza este mismo cliente:{" "}
                      <span className="font-medium text-[color:var(--tinta)]">no se pierde nada</span>{" "}
                      —conversaciones, bitácora, posiciones y gasto siguen donde están.
                    </>
                  )}
                </p>
              </div>

              {esWordPress ? (
                <form action={reconectar} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input type="hidden" name="volver" value={`/panel/clientes/${clienteId}`} />
                  <input
                    name="cadena"
                    required
                    placeholder="Pega aquí la cadena de conexión"
                    aria-label="Cadena de conexión"
                    className="min-w-[260px] flex-1 rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 font-mono text-[13px] outline-none transition focus:border-[color:var(--acento)]"
                  />
                  <button type="submit" className="boton shrink-0">
                    {sinConector ? "Conectar WordPress" : "Reconectar"}
                  </button>
                  {sinConector && (
                    <a href="/panel/clientes/nuevo" className="text-[13px] text-[color:var(--tinta-suave)] underline-offset-4 hover:underline">
                      ¿Es Shopify? Autorízala desde aquí
                    </a>
                  )}
                </form>
              ) : (
                <a href="/panel/clientes/nuevo" className="boton shrink-0">
                  {sinConector ? "Autorizar en Shopify" : "Volver a autorizar en Shopify"}
                </a>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
