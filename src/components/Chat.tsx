"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/Markdown";

interface Turno {
  rol: "user" | "assistant";
  contenido: string;
  usadas?: string[];
}

/** Nombres legibles de las herramientas, para no enseñar identificadores. */
const NOMBRES: Record<string, string> = {
  estado_del_sitio: "Comprobando el sitio",
  auditar_contenido: "Auditando el contenido",
  listar_productos: "Listando productos",
  leer_producto: "Leyendo un producto",
  escribir_producto: "Escribiendo un producto",
  listar_categorias: "Listando categorías",
  escribir_categoria: "Escribiendo una categoría",
  escribir_contenido: "Escribiendo contenido",
  leer_css: "Leyendo el CSS",
  escribir_css: "Escribiendo CSS",
  reconocer_tema: "Reconociendo el tema",
  ver_registro: "Revisando el registro",
};

export default function Chat({
  clienteId,
  nombre,
  puedeEscribir,
  historialInicial,
  conversacionInicial,
}: {
  clienteId: string;
  nombre: string;
  puedeEscribir: boolean;
  historialInicial: Turno[];
  conversacionInicial: string | null;
}) {
  const [turnos, setTurnos] = useState<Turno[]>(historialInicial);
  const [entrada, setEntrada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [actividad, setActividad] = useState<string | null>(null);
  const [coste, setCoste] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversacion = useRef<string | null>(conversacionInicial);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnos, actividad]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = entrada.trim();
    if (!texto || ocupado) return;

    setEntrada("");
    setError(null);
    setCoste(null);
    setOcupado(true);
    setTurnos((t) => [...t, { rol: "user", contenido: texto }, { rol: "assistant", contenido: "" }]);

    const usadas: string[] = [];

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, conversacionId: conversacion.current, mensaje: texto }),
      });

      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({ error: "No se pudo conectar." }));
        throw new Error(j.error ?? "No se pudo conectar.");
      }

      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";

      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;

        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";

        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const ev = JSON.parse(linea);

          if (ev.tipo === "inicio") {
            conversacion.current = ev.conversacionId;
          } else if (ev.tipo === "herramienta") {
            usadas.push(ev.nombre);
            setActividad(NOMBRES[ev.nombre] ?? ev.nombre);
            setTurnos((t) => {
              const c = [...t];
              c[c.length - 1] = { ...c[c.length - 1], usadas: [...usadas] };
              return c;
            });
          } else if (ev.tipo === "texto") {
            setActividad(null);
            setTurnos((t) => {
              const c = [...t];
              c[c.length - 1] = { ...c[c.length - 1], contenido: c[c.length - 1].contenido + ev.texto };
              return c;
            });
          } else if (ev.tipo === "fin") {
            setCoste(ev.coste);
          } else if (ev.tipo === "error") {
            setError(ev.mensaje);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setOcupado(false);
      setActividad(null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {turnos.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center">
            <p className="text-sm text-neutral-600">
              Pídeme lo que necesites sobre <strong>{nombre}</strong>.
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              «¿Qué categorías no tienen descripción?» · «Revisa el SEO de la home» ·{" "}
              {puedeEscribir ? "«Escribe la descripción de la categoría X»" : "Este sitio está en solo lectura."}
            </p>
          </div>
        )}

        {turnos.map((t, i) => (
          <div key={i} className={t.rol === "user" ? "flex justify-end" : ""}>
            <div
              className={
                t.rol === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-2.5 text-sm text-white"
                  : "max-w-[92%]"
              }
            >
              {t.usadas && t.usadas.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {t.usadas.map((u, j) => (
                    <li
                      key={j}
                      className="rounded bg-[#ff6b00]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#ff6b00]"
                    >
                      {NOMBRES[u] ?? u}
                    </li>
                  ))}
                </ul>
              )}
              {t.rol === "user" ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{t.contenido}</p>
              ) : (
                <div className="text-sm leading-relaxed text-neutral-700">
                  <Markdown>{t.contenido}</Markdown>
                  {ocupado && i === turnos.length - 1 && !t.contenido && (
                    <span className="text-neutral-400">…</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {actividad && (
          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff6b00]" />
            {actividad}…
          </p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div ref={fondo} />
      </div>

      <form onSubmit={enviar} className="mt-4 border-t border-neutral-200 pt-4">
        <div className="flex items-end gap-2">
          <textarea
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(e as unknown as React.FormEvent);
              }
            }}
            rows={2}
            disabled={ocupado}
            placeholder={`Escribe una instrucción para ${nombre}…`}
            className="flex-1 resize-none rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20 disabled:bg-neutral-50"
          />
          <button
            type="submit"
            disabled={ocupado || !entrada.trim()}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff6b00] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {ocupado ? "…" : "Enviar"}
          </button>
        </div>

        <p className="mt-2 flex items-center justify-between text-xs text-neutral-400">
          <span>
            {puedeEscribir ? "Puede escribir en el sitio." : "Solo lectura: no modificará nada."}
          </span>
          {coste !== null && <span className="tabular-nums">Último mensaje: {coste.toFixed(4)} USD</span>}
        </p>
      </form>
    </div>
  );
}
