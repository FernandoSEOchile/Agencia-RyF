"use client";

import { useEffect, useState } from "react";

/**
 * Buscador de la cartera.
 *
 * Con nueve clientes la lista se recorre de un vistazo; con cuarenta, no. Las
 * tarjetas las pinta el servidor, así que aquí no se vuelve a pedir nada:
 * se esconden las que no coinciden, leyendo el nombre y el dominio que cada
 * una lleva en `data-cliente`.
 */
export default function FiltroClientes({ total }: { total: number }) {
  const [texto, setTexto] = useState("");
  const [visibles, setVisibles] = useState(total);

  useEffect(() => {
    const q = texto.trim().toLowerCase();
    let n = 0;
    document.querySelectorAll<HTMLElement>("[data-cliente]").forEach((el) => {
      const coincide = !q || (el.dataset.cliente ?? "").includes(q);
      el.hidden = !coincide;
      if (coincide) n++;
    });
    setVisibles(n);
  }, [texto]);

  if (total < 6) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar cliente por nombre o dominio…"
        aria-label="Buscar cliente"
        className="w-full max-w-sm rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
      />
      {texto && (
        <span className="text-[14px] text-[color:var(--tinta-suave)]">
          {visibles} de {total}
        </span>
      )}
    </div>
  );
}
