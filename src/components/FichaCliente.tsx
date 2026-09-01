"use client";

import { useState } from "react";
import Chat from "@/components/Chat";
import Sitemap from "@/components/Sitemap";
import Arquitectura, { type ArquitecturaVista } from "@/components/Arquitectura";

export interface Suceso {
  fecha: string;
  accion: string;
  resumen: string;
  resultado: string;
  /** `sitio` viene del registro del WordPress; `panel`, del nuestro. */
  origen: "sitio" | "panel";
  quien?: string;
}

interface Turno {
  rol: "user" | "assistant";
  contenido: string;
  usadas?: string[];
  imagenes?: string[];
}

export interface ResumenConversacion {
  id: string;
  titulo: string;
  fecha: string;
  mensajes: number;
}

const PESTAÑAS = [
  { id: "chat", etiqueta: "Conversación" },
  { id: "sitemap", etiqueta: "Sitemap" },
  { id: "arquitectura", etiqueta: "Arquitectura" },
  { id: "registro", etiqueta: "Registro" },
  { id: "datos", etiqueta: "Datos" },
] as const;

type Pestaña = (typeof PESTAÑAS)[number]["id"];

function Contador({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{valor}</dd>
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
  arquitectura,
  puedeSubir,
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
  /** La arquitectura es beta: si el cliente no la tiene, la pestaña no existe. */
  arquitectura: ArquitecturaVista | null;
  puedeSubir: boolean;
}) {
  const [activa, setActiva] = useState<Pestaña>("chat");
  const [sitemapVisto, setSitemapVisto] = useState(false);
  if (activa === "sitemap" && !sitemapVisto) setSitemapVisto(true);
  const [filtro, setFiltro] = useState<"todo" | "sitio" | "panel">("todo");

  const visibles = sucesos.filter((s) => filtro === "todo" || s.origen === filtro);

  return (
    <div className="mt-7">
      {/* Control segmentado en vez de pestañas subrayadas: agrupa las vistas en
          un solo objeto en lugar de dejar cinco palabras sueltas sobre una raya. */}
      <div className="segmentos">
        {PESTAÑAS.map((p) => (
          <button
            key={p.id}
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

      {/* El chat se oculta en lugar de desmontarse: cambiar de pestaña no debe
          perder una respuesta a medio escribir ni cortar un envío en curso. */}
      <div className={activa === "chat" ? "block" : "hidden"}>
        <div className="mt-5 flex gap-6">
          {conversaciones.length > 1 && (
            <aside className="hidden w-52 shrink-0 sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Conversaciones
              </p>
              <ul className="mt-2 space-y-1">
                {conversaciones.map((cv) => {
                  const abierta = cv.id === conversacionInicial;
                  return (
                    <li key={cv.id} className="group relative">
                      <a
                        href={`?c=${cv.id}`}
                        className={`block rounded-lg px-3 py-2 pr-7 text-xs transition ${
                          abierta
                            ? "bg-[#ff6b00]/10 font-semibold text-neutral-900"
                            : "text-neutral-600 hover:bg-neutral-100"
                        }`}
                      >
                        <span className="line-clamp-2">{cv.titulo}</span>
                        <span className="mt-0.5 block text-[10px] tabular-nums text-neutral-400">
                          {cv.fecha} · {cv.mensajes} msj
                        </span>
                      </a>
                      {/* Borrar: visible al pasar el ratón, nunca sobre el hilo abierto
                          con una respuesta en curso. */}
                      <form action={borrar} className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100">
                        <input type="hidden" name="conversacionId" value={cv.id} />
                        <button
                          type="submit"
                          title="Borrar conversación"
                          className="grid h-5 w-5 place-items-center rounded text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        >
                          ×
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {/* En pantallas chicas la lista pasa a un desplegable. */}
            {conversaciones.length > 1 && (
              <select
                defaultValue={conversacionInicial ?? ""}
                onChange={(e) => { if (e.target.value) window.location.search = "?c=" + e.target.value; }}
                className="mb-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs sm:hidden"
              >
                {conversaciones.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.titulo} · {cv.fecha}
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
        <Arquitectura clienteId={clienteId} actual={arquitectura} puedeSubir={puedeSubir} />
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
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filtro === id
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {texto}
              </button>
            ))}
            <p className="ml-auto text-xs text-neutral-400">
              {visibles.length} {visibles.length === 1 ? "operación" : "operaciones"}
            </p>
          </div>

          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
              Sin operaciones registradas.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {visibles.map((s, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-xs text-neutral-400">{s.fecha}</span>

                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      s.origen === "panel"
                        ? "bg-[#ff6b00]/10 text-[#ff6b00]"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                    title={s.origen === "panel" ? "Hecho desde el panel" : "Registrado por el conector"}
                  >
                    {s.accion}
                  </span>

                  <span className={s.resultado === "ok" ? "text-neutral-700" : "font-medium text-red-600"}>
                    {s.resumen}
                  </span>

                  {s.quien && <span className="ml-auto text-xs text-neutral-400">{s.quien}</span>}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-neutral-400">
            «En el sitio» es lo que el conector anotó dentro de WordPress. «Desde el panel» es lo que hizo
            tu equipo desde aquí, con nombre.
          </p>
        </div>
      )}

      {activa === "datos" && (
        <div className="mt-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-3">
            {datos.map((d) => (
              <Contador key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} />
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
