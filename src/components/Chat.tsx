"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/Markdown";
import { prepararImagen, pesoLegible, FORMATOS, type Adjunta } from "@/lib/imagenes";
import { nombreHerramienta, ESCRIBEN } from "@/lib/nombresHerramientas";
import { dinero } from "@/lib/formato";

interface Turno {
  rol: "user" | "assistant";
  contenido: string;
  usadas?: string[];
  imagenes?: string[];
  /** Lo que razonó antes de contestar. Se guarda plegado bajo la respuesta. */
  pensamiento?: string;
}

/** Nombres cortos, que en el pie no cabe «claude-haiku-4-5». */
const NOMBRE_MODELO: Record<string, string> = {
  "claude-opus-5": "Opus",
  "claude-sonnet-5": "Sonnet",
  "claude-haiku-4-5": "Haiku",
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
  // Con el modelo en automático conviene ver cuál contestó: es la única forma
  // de darse cuenta de que el enrutador se equivocó de carril.
  const [modelo, setModelo] = useState<string | null>(null);
  // El razonamiento en curso, para que la espera no parezca un cuelgue.
  const [pensando, setPensando] = useState("");
  const pensamiento = useRef("");
  // Para «Parar» y para «Reintentar».
  const abortar = useRef<AbortController | null>(null);
  const ultimo = useRef<{ texto: string; envio: string[] } | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  // Lo gastado en esta sesión del hilo, para no ver solo el último mensaje.
  const [totalSesion, setTotalSesion] = useState(0);

  /**
   * Un turno largo puede tardar minutos y la persona se va a otra pestaña.
   * Sin esto nada le dice que terminó: se cambia el título y, si dio permiso,
   * se manda una notificación del navegador.
   */
  function avisarFin() {
    if (typeof document === "undefined" || !document.hidden) return;
    const titulo = document.title;
    document.title = `✓ Listo · ${titulo}`;
    const volver = () => {
      document.title = titulo;
      document.removeEventListener("visibilitychange", volver);
    };
    document.addEventListener("visibilitychange", volver);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("AppSEO", { body: `El asistente terminó en ${nombre}.` });
      }
    } catch {
      // Sin notificaciones no pasa nada: el título ya avisa.
    }
  }
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

  async function enviar(e?: React.FormEvent, reenvio?: { texto: string; envio: string[] }) {
    e?.preventDefault();
    const texto = reenvio ? reenvio.texto : entrada.trim();
    const envio = reenvio ? reenvio.envio : adjuntas.map((a) => a.uri);
    if ((!texto && envio.length === 0) || ocupado) return;

    ultimo.current = { texto, envio };
    if (!reenvio) {
      setEntrada("");
      setAdjuntas([]);
    }
    pensamiento.current = "";
    setPensando("");
    abortar.current = new AbortController();
    setError(null);
    // Se pide permiso la primera vez que se manda algo, no al cargar la página.
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch {
      // Navegadores sin la API: se sigue igual.
    }
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
        signal: abortar.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          conversacionId: conversacion.current,
          mensaje: texto,
          imagenes: envio,
        }),
      });

      if (r.status === 401) {
        throw new Error("Tu sesión caducó. Entra de nuevo y vuelve a mandar el mensaje; el hilo está guardado.");
      }
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
            setActividad(nombreHerramienta(ev.nombre));
            setTurnos((t) => {
              const c = [...t];
              c[c.length - 1] = { ...c[c.length - 1], usadas: [...usadas] };
              return c;
            });
          } else if (ev.tipo === "pensando") {
            pensamiento.current += ev.texto;
            setPensando(pensamiento.current.slice(-400));
          } else if (ev.tipo === "texto") {
            setActividad(null);
            const razonado = pensamiento.current;
            pensamiento.current = "";
            setPensando("");
            setTurnos((t) => {
              const c = [...t];
              const u = c[c.length - 1];
              c[c.length - 1] = {
                ...u,
                contenido: u.contenido + ev.texto,
                pensamiento: razonado ? (u.pensamiento ?? "") + razonado : u.pensamiento,
              };
              return c;
            });
          } else if (ev.tipo === "modelo") {
            setModelo(ev.modelo);
          } else if (ev.tipo === "fin") {
            setCoste(ev.coste);
            setTotalSesion((t) => t + (Number(ev.coste) || 0));
            avisarFin();
          } else if (ev.tipo === "error") {
            setError(ev.mensaje);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setTurnos((t) => {
          const c = [...t];
          const u = c[c.length - 1];
          c[c.length - 1] = { ...u, contenido: u.contenido + (u.contenido ? "\n\n" : "") + "*(detenido)*" };
          return c;
        });
      } else {
        setError(err instanceof Error ? err.message : "Error inesperado.");
      }
    } finally {
      abortar.current = null;
      setOcupado(false);
      setActividad(null);
      setPensando("");
    }
  }

  function parar() {
    abortar.current?.abort();
  }

  function reintentar() {
    if (!ultimo.current || ocupado) return;
    // Se quita el turno vacío que dejó el fallo antes de volver a mandarlo.
    setTurnos((t) => (t.length >= 2 && t[t.length - 1].rol === "assistant" && !t[t.length - 1].contenido ? t.slice(0, -2) : t));
    enviar(undefined, ultimo.current);
  }

  async function copiar(i: number, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(i);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      // Sin portapapeles (http, permisos) no hay nada que hacer.
    }
  }

  /**
   * Deshacer va por el propio asistente: cada escritura le devolvió el estado
   * anterior y lo tiene en la conversación. Se rellena la orden y no se envía,
   * igual que las sugerencias de otras pestañas: que la persona la lea antes.
   */
  function deshacer() {
    setEntrada(
      "Deshaz el último cambio que hiciste en el sitio: vuelve a dejarlo exactamente como estaba antes, usando el estado anterior que te devolvió la herramienta. Luego confírmame qué restauraste."
    );
    campo.current?.focus();
  }

  return (
    <div ref={caja} style={{ height: alto }} className="flex min-h-[24rem] flex-col">
      <div ref={lista} className="flex-1 space-y-4 overflow-y-auto scroll-smooth pr-1">
        {turnos.length === 0 && (
          <div className="rounded-xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-10 text-center">
            <p className="text-sm text-[color:var(--tinta-media)]">
              Pídeme lo que necesites sobre <strong>{nombre}</strong>.
            </p>
            <p className="mt-2 text-xs text-[color:var(--tinta-suave)]">
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
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[color:var(--tinta)] px-4 py-2.5 text-sm text-white"
                  : "max-w-[92%]"
              }
            >
              {t.usadas && t.usadas.length > 0 && (
                <details className="mb-2 group/pasos" open={t.usadas.length <= 4}>
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-[color:var(--tinta-suave)] transition hover:text-[color:var(--tinta)]">
                    {t.usadas.length} {t.usadas.length === 1 ? "paso" : "pasos"}
                    <span className="ml-1 inline-block transition group-open/pasos:rotate-90">▸</span>
                  </summary>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.usadas.map((u, j) => (
                      <li
                        key={j}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          ESCRIBEN.has(u)
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-[color:var(--acento)]/10 text-[color:var(--acento)]"
                        }`}
                      >
                        {nombreHerramienta(u)}
                      </li>
                    ))}
                  </ul>
                </details>
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
                <div className="group/resp text-sm leading-relaxed text-[color:var(--tinta)]">
                  {t.pensamiento && (
                    <details className="mb-2">
                      <summary className="cursor-pointer list-none text-[11px] text-[color:var(--tinta-suave)] transition hover:text-[color:var(--tinta)]">
                        Cómo lo razonó ▸
                      </summary>
                      <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap border-l-2 border-[color:var(--linea-fuerte)] pl-3 text-[12px] leading-relaxed text-[color:var(--tinta-media)]">
                        {t.pensamiento}
                      </p>
                    </details>
                  )}
                  <Markdown>{t.contenido}</Markdown>
                  {ocupado && i === turnos.length - 1 && !t.contenido && !pensando && (
                    <span className="text-[color:var(--tinta-suave)]">…</span>
                  )}
                  {t.contenido && !(ocupado && i === turnos.length - 1) && (
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[color:var(--tinta-suave)] opacity-0 transition focus-within:opacity-100 group-hover/resp:opacity-100">
                      <button type="button" onClick={() => copiar(i, t.contenido)} className="hover:text-[color:var(--tinta)]">
                        {copiado === i ? "Copiado" : "Copiar"}
                      </button>
                      {puedeEscribir && i === turnos.length - 1 && t.usadas?.some((u) => ESCRIBEN.has(u)) && (
                        <button type="button" onClick={deshacer} className="font-medium text-amber-700 hover:text-amber-800">
                          Deshacer lo que escribió
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex items-start gap-2 text-xs text-[color:var(--tinta-suave)]" aria-live="polite">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[color:var(--acento)]" />
            <p className="line-clamp-3 italic leading-relaxed">Pensando… {pensando}</p>
          </div>
        )}

        {actividad && (
          <p className="flex items-center gap-2 text-xs text-[color:var(--tinta-media)]" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--acento)]" />
            {actividad}…
          </p>
        )}

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>
              {error}
              {/sesión caducó/i.test(error) && (
                <>
                  {" "}
                  <a
                    href={`/entrar?volver=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Entrar
                  </a>
                </>
              )}
            </span>
            {ultimo.current && !/sesión caducó/i.test(error) && (
              <button type="button" onClick={reintentar} className="font-semibold underline-offset-2 hover:underline">
                Reintentar
              </button>
            )}
          </div>
        )}

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
          arrastrando ? "border-t-[color:var(--acento)] bg-[color:var(--acento)]/5" : "border-t-[color:var(--linea-fuerte)]"
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
                  className="h-16 w-16 rounded-lg border border-[color:var(--linea-fuerte)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => setAdjuntas((prev) => prev.filter((_, j) => j !== k))}
                  title="Quitar"
                  aria-label={`Quitar ${a.nombre}`}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--tinta)] text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  ×
                </button>
                <span className="mt-0.5 block text-center text-[10px] tabular-nums text-[color:var(--tinta-suave)]">
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
            aria-label="Adjuntar imagen"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--linea-fuerte)] text-[color:var(--tinta-media)] transition hover:border-[color:var(--acento)] hover:text-[color:var(--acento)] disabled:opacity-40"
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
                if (!ocupado) enviar(e as unknown as React.FormEvent);
              } else if (e.key === "Escape" && ocupado) {
                parar();
              }
            }}
            rows={2}
            aria-label={`Instrucción para ${nombre}`}
            placeholder={`Escribe una instrucción para ${nombre}…`}
            className="flex-1 resize-none rounded-xl border border-[color:var(--linea-fuerte)] px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--acento)] focus:ring-2 focus:ring-[color:var(--acento)]/20 disabled:bg-black/[0.03]"
          />
          {ocupado ? (
            <button
              type="button"
              onClick={parar}
              title="Parar (Esc). Lo que ya escribió en el sitio, queda."
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Parar
            </button>
          ) : (
            <button
              type="submit"
              disabled={!entrada.trim() && adjuntas.length === 0}
              className="rounded-xl bg-[color:var(--tinta)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[color:var(--acento)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Enviar
            </button>
          )}
        </div>

        <p className="mt-2 flex items-center justify-between text-xs text-[color:var(--tinta-suave)]">
          <span>
            {puedeEscribir ? "Puede escribir en el sitio." : "Solo lectura: no modificará nada."}
            <span className="ml-1.5 text-[color:var(--tinta-suave)]">· pega o arrastra imágenes</span>
          </span>
          <span className="flex items-center gap-2">
            {modelo && <span title="Modelo que respondió">{NOMBRE_MODELO[modelo] ?? modelo}</span>}
            {coste !== null && (
              <span className="tabular-nums" title={`En esta sesión del hilo: ${dinero(totalSesion)}`}>
                Último mensaje: {dinero(coste)}
                {totalSesion > (coste ?? 0) + 0.00001 && ` · sesión ${dinero(totalSesion)}`}
              </span>
            )}
          </span>
        </p>
      </form>
    </div>
  );
}
