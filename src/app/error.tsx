"use client";

import Link from "next/link";

/**
 * Algo falló al pintar una página.
 *
 * Next enseñaba su pantalla por defecto, en inglés y sin salida. Aquí se dice
 * qué hacer, y «Reintentar» vuelve a montar la página sin recargar.
 */
export default function Fallo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="rotulo">Error</p>
      <h1 className="mt-2 text-[24px] font-semibold">Esta pantalla no se pudo cargar</h1>
      <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
        Suele ser pasajero: un sitio de cliente que no contestó a tiempo o la base ocupada. Si se repite,
        el detalle está en Fallos.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-[color:var(--tinta-suave)]">ref. {error.digest}</p>
      )}
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={reset} className="boton-fuerte">
          Reintentar
        </button>
        <Link href="/panel" className="boton">
          Ir a la cartera
        </Link>
      </div>
    </main>
  );
}
