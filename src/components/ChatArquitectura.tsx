"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/Markdown";

interface Turno {
  rol: "user" | "assistant";
  contenido: string;
}

const NOMBRES: Record<string, string> = {
  ver_arquitectura: "Revisando las secciones",
  ver_archivo_original: "Mirando el Excel original",
  releer_con_otro_esquema: "Releyendo el archivo",
  editar_seccion: "Editando una sección",
  crear_seccion: "Creando una sección",
  borrar_seccion: "Quitando secciones",
  recotejar: "Cruzando contra el sitio",
};

const SUGERENCIAS = [
  "¿Está bien leído el archivo? Compáralo con el original",
  "Las subcategorías quedaron al mismo nivel que las categorías",
  "Se colaron filas de resumen como si fueran secciones",
];

export default function ChatArquitectura({ arquitecturaId }: { arquitecturaId: string }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [entrada, setEntrada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [actividad, setActividad] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [huboCambios, setHuboCambios] = useState(false);

  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [turnos, actividad]);

  async function enviar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || ocupado) return;

    const nuevos: Turno[] = [...turnos, { rol: "user", contenido: limpio }];
    setTurnos(nuevos);
    setEntrada("");
    setOcupado(true);
    setError(null);
    setActividad(null);

    try {
      const r = await fetch("/api/arquitectura/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquitecturaId, historial: nuevos }),
      });

      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "No se pudo hablar con el asistente.");
      }

      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      let respuesta = "";

      setTurnos([...nuevos, { rol: "assistant", contenido: "" }]);

      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;

        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";

        for (const linea of lineas) {
          if (!linea.trim()) continue;
          let e: Record<string, unknown>;
          try {
            e = JSON.parse(linea);
          } catch {
            continue;
          }

          if (e.tipo === "herramienta") {
            setActividad(NOMBRES[String(e.nombre)] ?? String(e.nombre));
          } else if (e.tipo === "texto") {
            respuesta += String(e.texto);
            setActividad(null);
            setTurnos([...nuevos, { rol: "assistant", contenido: respuesta }]);
          } else if (e.tipo === "error") {
            throw new Error(String(e.mensaje));
          } else if (e.tipo === "fin") {
            if (e.cambios) setHuboCambios(true);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
      setActividad(null);
    }
  }

  return (
    <div className="tarjeta mt-4 p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[15px] font-semibold">Arreglar la arquitectura hablando</h3>
        <p className="text-[12px] text-[color:var(--tinta-suave)]">
          Puede releer el Excel con otro criterio, cambiar niveles, quitar lo que se coló y recotejar.
        </p>
      </div>

      {turnos.length > 0 && (
        <div
          ref={lista}
          className="scroll-fino mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1"
        >
          {turnos.map((t, i) =>
            t.rol === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-[color:var(--tinta)] px-4 py-2 text-[13px] text-white">
                  {t.contenido}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[95%] text-[13px] leading-relaxed">
                {t.contenido ? (
                  <Markdown>{t.contenido}</Markdown>
                ) : (
                  <span className="text-[color:var(--tinta-suave)]">Pensando…</span>
                )}
              </div>
            )
          )}

          {actividad && (
            <p className="flex items-center gap-2 text-[12px] text-[color:var(--tinta-suave)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--acento)]" />
              {actividad}…
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
      )}

      {huboCambios && !ocupado && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          La arquitectura cambió.
          <button
            onClick={() => window.location.reload()}
            className="font-semibold underline underline-offset-2"
          >
            Recargar la tabla
          </button>
        </p>
      )}

      {turnos.length === 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {SUGERENCIAS.map((s) => (
            <li key={s}>
              <button onClick={() => enviar(s)} disabled={ocupado} className="boton !text-[12px]">
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(entrada);
        }}
        className="mt-4 flex gap-2"
      >
        <textarea
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(entrada);
            }
          }}
          rows={2}
          disabled={ocupado}
          placeholder="Cuéntale qué quedó mal…"
          className="flex-1 resize-none rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[13px] outline-none transition focus:border-[color:var(--acento)] disabled:opacity-50"
        />
        <button type="submit" disabled={ocupado || !entrada.trim()} className="boton-fuerte self-end">
          {ocupado ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
