"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/Markdown";
import { prepararImagen, pesoLegible, FORMATOS, type Adjunta } from "@/lib/imagenes";

interface Turno {
  rol: "user" | "assistant";
  contenido: string;
  usadas?: string[];
  imagenes?: string[];
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
  visible,
  sugerida,
}: {
  clienteId: string;
  nombre: string;
  puedeEscribir: boolean;
  historialInicial: Turno[];
  conversacionInicial: string | null;
  visible: boolean;
  /** Instrucción que llega desde otra pestaña, lista para revisar y enviar. */
  sugerida?: { texto: string; sello: number } | null;
}) {
  const [turnos, setTurnos] = useState<Turno[]>(historialInicial);
  const [entrada, setEntrada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [actividad, setActividad] = useState<string | null>(null);
  const [coste, setCoste] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjuntas, setAdjuntas] = useState<Adjunta[]>([]);
  const [arrastrando, setArrastrando] = useState(false);

  const campo = useRef<HTMLTextAreaElement>(null);

  /**
   * Se rellena el campo pero no se envía.
   *
   * La orden acaba escribiendo en el sitio de un cliente, y un clic de más en
   * la tabla de arquitectura no debería disparar eso sin que nadie lo lea. Con
   * el texto puesto y el cursor dentro, enviarlo es una tecla.
   */
  useEffect(() => {
    if (!sugerida?.texto) return;
    setEntrada(sugerida.texto);
    campo.current?.focus();
  }, [sugerida?.sello, sugerida?.texto]);

  const caja = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;

    const medir = () => {
      const el = caja.current;
      if (!el) return;
      // Se descuenta el pie de la página (pb-10) para que el chat llegue justo
      // al borde inferior sin provocar scroll de la ventana entera.
      setAlto(Math.max(384, window.innerHeight - el.getBoundingClientRect().top - 40));
    };

    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [visible]);
  const archivos = useRef<HTMLInputElement>(null);
  const conversacion = useRef<string | null>(conversacionInicial);
  const lista = useRef<HTMLDivElement>(null);

  // Se desplaza SOLO la caja de mensajes. scrollIntoView movería también la
  // página entera y dejaría la barra superior fuera de la vista al entrar.
  useEffect(() => {
    const caja = lista.current;
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [turnos, actividad]);

  async function anadir(lista: FileList | File[] | null) {
    if (!lista) return;
    const imagenes = [...lista].filter((f) => FORMATOS.includes(f.type));
    if (imagenes.length === 0) return;

    if (adjuntas.length + imagenes.length > 5) {
      setError("Máximo 5 imágenes por mensaje.");
      return;
    }

    setError(null);
    for (const archivo of imagenes) {
      try {
        const a = await prepararImagen(archivo);
        setAdjuntas((prev) => [...prev, a]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo procesar la imagen.");
      }
    }
  }

  /** Pegar con Ctrl+V es la forma natural de mandar una captura. */
  function alPegar(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.items]
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length) {
      e.preventDefault();
      anadir(files);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = entrada.trim();
    if ((!texto && adjuntas.length === 0) || ocupado) return;

    const envio = adjuntas.map((a) => a.uri);
    setEntrada("");
    setAdjuntas([]);
    setError(null);
    setCoste(null);
    setOcupado(true);
    setTurnos((t) => [
      ...t,
      { rol: "user", contenido: texto, imagenes: envio.length ? envio : undefined },
      { rol: "assistant", contenido: "" },
    ]);

    const usadas: string[] = [];

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          conversacionId: conversacion.current,
          mensaje: texto,
          imagenes: envio,
        }),
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
    <div ref={caja} style={{ height: alto }} className="flex min-h-[24rem] flex-col">
      <div ref={lista} className="flex-1 space-y-4 overflow-y-auto scroll-smooth pr-1">
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
                <>
                  {t.imagenes && t.imagenes.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {t.imagenes.map((src, k) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={k}
                          src={src}
                          alt="Imagen adjunta"
                          className="max-h-40 rounded-lg border border-white/20 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {t.contenido && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{t.contenido}</p>
                  )}
                </>
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

      </div>

      <form
        onSubmit={enviar}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          anadir(e.dataTransfer.files);
        }}
        className={`mt-4 rounded-xl border-t pt-4 transition ${
          arrastrando ? "border-t-[#ff6b00] bg-[#ff6b00]/5" : "border-t-neutral-200"
        }`}
      >
        {adjuntas.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {adjuntas.map((a, k) => (
              <div key={k} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.uri}
                  alt={a.nombre}
                  className="h-16 w-16 rounded-lg border border-neutral-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setAdjuntas((prev) => prev.filter((_, j) => j !== k))}
                  title="Quitar"
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  ×
                </button>
                <span className="mt-0.5 block text-center text-[10px] tabular-nums text-neutral-400">
                  {pesoLegible(a.bytes)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={archivos}
            type="file"
            accept={FORMATOS.join(",")}
            multiple
            hidden
            onChange={(e) => {
              anadir(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => archivos.current?.click()}
            disabled={ocupado}
            title="Adjuntar imagen"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-500 transition hover:border-[#ff6b00] hover:text-[#ff6b00] disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={campo}
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onPaste={alPegar}
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
            disabled={ocupado || (!entrada.trim() && adjuntas.length === 0)}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff6b00] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {ocupado ? "…" : "Enviar"}
          </button>
        </div>

        <p className="mt-2 flex items-center justify-between text-xs text-neutral-400">
          <span>
            {puedeEscribir ? "Puede escribir en el sitio." : "Solo lectura: no modificará nada."}
            <span className="ml-1.5 text-neutral-300">· pega o arrastra imágenes</span>
          </span>
          {coste !== null && <span className="tabular-nums">Último mensaje: {coste.toFixed(4)} USD</span>}
        </p>
      </form>
    </div>
  );
}
