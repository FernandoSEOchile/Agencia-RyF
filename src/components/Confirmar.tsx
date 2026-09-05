"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Un «¿seguro?» propio, en vez del `confirm()` del navegador.
 *
 * El nativo se ve distinto en cada navegador, no se puede estilar y no deja
 * decir con claridad qué se va a perder. Este dice lo que se borra, pinta el
 * botón peligroso en rojo y se cierra con Escape.
 *
 * Se usa como promesa para que el código que pregunta se lea igual que antes:
 *
 *   const { confirmar, dialogo } = useConfirmar();
 *   if (!(await confirmar({ titulo: "¿Borrar «X»?", detalle: "No se puede deshacer." }))) return;
 *   …
 *   return <>{dialogo}…</>;
 */

interface Pregunta {
  titulo: string;
  detalle?: string;
  /** Texto del botón que confirma. Por defecto, «Borrar». */
  boton?: string;
  /** Si es falso, el botón no va en rojo: no todo lo que se confirma destruye. */
  peligroso?: boolean;
}

export function useConfirmar() {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback((p: Pregunta) => {
    setPregunta(p);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const cerrar = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPregunta(null);
  }, []);

  useEffect(() => {
    if (!pregunta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pregunta, cerrar]);

  const dialogo = pregunta ? (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onClick={() => cerrar(false)}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirmar-titulo" className="text-[15px] font-semibold leading-snug">
          {pregunta.titulo}
        </p>
        {pregunta.detalle && (
          <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
            {pregunta.detalle}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => cerrar(false)} className="boton">
            Cancelar
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => cerrar(true)}
            className={
              pregunta.peligroso === false
                ? "boton-fuerte"
                : "inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-1.5 text-[14px] font-semibold text-white transition hover:bg-red-700"
            }
          >
            {pregunta.boton ?? "Borrar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmar, dialogo };
}
