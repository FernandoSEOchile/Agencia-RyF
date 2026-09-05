"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icono } from "@/components/Iconos";
import type { Enlace } from "@/lib/navegacion";

/**
 * El selector de cliente y la paleta de Ctrl+K, en la barra de arriba.
 *
 * Las pantallas del panel ya no van aquí: están en el riel. Lo que queda es
 * lo que cambia con el contexto —en qué cliente estás y a cuál quieres ir— y
 * el buscador, que llega a clientes y pantallas por igual.
 */

export interface ClienteBreve {
  id: string;
  nombre: string;
  dominio: string;
}

export default function Navegacion({ enlaces, clientes }: { enlaces: Enlace[]; clientes: ClienteBreve[] }) {
  const ruta = usePathname();
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcado, setMarcado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  // El cliente actual se deduce de la ruta: así ninguna página tiene que
  // decírselo a la barra, y el selector lo enseña en cuanto entras en su ficha.
  const clienteId = ruta.match(/^\/panel\/clientes\/([^/]+)/)?.[1] ?? null;
  const actual = clientes.find((c) => c.id === clienteId) ?? null;

  // Ctrl+K (o Cmd+K) abre la paleta; Escape la cierra.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((v) => !v);
        setBusca("");
        setMarcado(0);
      } else if (e.key === "Escape" && abierta) {
        setAbierta(false);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierta]);

  useEffect(() => {
    if (abierta) campo.current?.focus();
  }, [abierta]);

  // Los clientes van primero: es lo que se busca nueve de cada diez veces.
  const opciones = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const todo = [
      ...clientes.map((c) => ({
        href: `/panel/clientes/${c.id}`,
        texto: c.nombre,
        pista: c.dominio,
        tipo: "cliente" as const,
      })),
      ...enlaces.map((e) => ({ href: e.href, texto: e.texto, pista: "pantalla", tipo: "pantalla" as const })),
    ];
    if (!q) return todo.slice(0, 12);
    return todo.filter((o) => `${o.texto} ${o.pista}`.toLowerCase().includes(q)).slice(0, 12);
  }, [busca, clientes, enlaces]);

  function ir(href: string) {
    setAbierta(false);
    router.push(href);
  }

  return (
    <>
      {clientes.length > 0 && (
        <label className="relative block min-w-0">
          <span className="sr-only">Ir a un cliente</span>
          <select
            value={actual?.id ?? ""}
            onChange={(e) => e.target.value && ir(`/panel/clientes/${e.target.value}`)}
            className={`h-8 max-w-[220px] cursor-pointer appearance-none truncate rounded-full border py-0 pl-3 pr-8 text-[13px] font-medium outline-none transition focus:border-[color:var(--acento)] ${
              actual
                ? "border-[color:var(--tinta)] bg-[color:var(--tinta)] text-white"
                : "border-[color:var(--linea-fuerte)] bg-white text-[color:var(--tinta-media)] hover:border-[color:var(--tinta)]"
            }`}
          >
            <option value="" className="text-black">
              {actual ? "Cambiar de cliente…" : "Ir a un cliente…"}
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.nombre}
              </option>
            ))}
          </select>
          <span aria-hidden className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${actual ? "text-white/70" : "text-[color:var(--tinta-suave)]"}`}>
            <Icono nombre="abajo" tam={14} />
          </span>
        </label>
      )}

      {actual && (
        <span className="hidden truncate text-[13px] text-[color:var(--tinta-suave)] lg:block">{actual.dominio}</span>
      )}

      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="Buscar cliente o pantalla (Ctrl+K)"
        className="hidden h-8 items-center gap-2 rounded-full border border-[color:var(--linea-fuerte)] bg-white pl-3 pr-2 text-[13px] text-[color:var(--tinta-suave)] transition hover:border-[color:var(--tinta)] hover:text-[color:var(--tinta)] sm:flex"
      >
        <Icono nombre="buscar" tam={15} />
        <span className="hidden md:inline">Cliente o pantalla…</span>
        <kbd className="ml-1 rounded-md border border-[color:var(--linea)] bg-black/[0.03] px-1.5 py-0.5 font-sans text-[10.5px] text-[color:var(--tinta-suave)]">
          Ctrl K
        </kbd>
      </button>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]"
          onClick={() => setAbierta(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="Ir a"
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={campo}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setMarcado(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMarcado((m) => Math.min(m + 1, opciones.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMarcado((m) => Math.max(m - 1, 0));
                } else if (e.key === "Enter" && opciones[marcado]) {
                  ir(opciones[marcado].href);
                }
              }}
              placeholder="Cliente o pantalla…"
              aria-label="Cliente o pantalla"
              className="w-full border-b border-[color:var(--linea)] px-4 py-3 text-[15px] outline-none"
            />
            <ul role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {opciones.map((o, i) => (
                <li key={o.href} role="option" aria-selected={i === marcado}>
                  <button
                    type="button"
                    onMouseEnter={() => setMarcado(i)}
                    onClick={() => ir(o.href)}
                    className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-[14px] ${
                      i === marcado ? "bg-[color:var(--acento)]/10" : ""
                    }`}
                  >
                    <span className="truncate">{o.texto}</span>
                    <span className="shrink-0 text-[12px] text-[color:var(--tinta-suave)]">{o.pista}</span>
                  </button>
                </li>
              ))}
              {opciones.length === 0 && (
                <li className="px-4 py-3 text-[14px] text-[color:var(--tinta-suave)]">Nada con «{busca}».</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
