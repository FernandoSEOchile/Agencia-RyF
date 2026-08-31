"use client";

import { useState } from "react";
import Chat from "@/components/Chat";

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
}

const PESTAÑAS = [
  { id: "chat", etiqueta: "Conversación" },
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
}: {
  clienteId: string;
  nombre: string;
  puedeEscribir: boolean;
  historialInicial: Turno[];
  conversacionInicial: string | null;
  sucesos: Suceso[];
  datos: { etiqueta: string; valor: string }[];
}) {
  const [activa, setActiva] = useState<Pestaña>("chat");
  const [filtro, setFiltro] = useState<"todo" | "sitio" | "panel">("todo");

  const visibles = sucesos.filter((s) => filtro === "todo" || s.origen === filtro);

  return (
    <div className="mt-5">
      <div className="flex gap-1 border-b border-neutral-200">
        {PESTAÑAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiva(p.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              activa === p.id
                ? "border-[#ff6b00] text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {p.etiqueta}
            {p.id === "registro" && sucesos.length > 0 && (
              <span className="ml-1.5 text-xs tabular-nums text-neutral-400">{sucesos.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* El chat se oculta en lugar de desmontarse: cambiar de pestaña no debe
          perder una respuesta a medio escribir ni cortar un envío en curso. */}
      <div className={activa === "chat" ? "block" : "hidden"}>
        <div className="mt-4">
          <Chat
            clienteId={clienteId}
            nombre={nombre}
            puedeEscribir={puedeEscribir}
            historialInicial={historialInicial}
            conversacionInicial={conversacionInicial}
          />
        </div>
      </div>

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
