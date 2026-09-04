"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * La navegación del panel: los enlaces de arriba, el selector de cliente y la
 * paleta de Ctrl+K.
 *
 * Antes la barra solo tenía el logo y «Salir»; Gasto, Fallos o Ajustes vivían
 * únicamente como botones en la portada, y desde cualquier otra pantalla la
 * salida era «← Clientes». Cambiar de cliente eran tres clics y una recarga.
 * Aquí es un desplegable en la barra, o dos teclas.
 */

export interface Enlace {
  href: string;
  texto: string;
}

export interface ClienteBreve {
  id: string;
  nombre: string;
  dominio: string;
}

export default function Navegacion({
  enlaces,
  clientes,
  clienteId,
}: {
  enlaces: Enlace[];
  clientes: ClienteBreve[];
  clienteId?: string | null;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcado, setMarcado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

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

  const activo = (href: string) =>
    href === "/panel" ? ruta === "/panel" || ruta.startsWith("/panel/clientes") : ruta.startsWith(href);

  return (
    <>
      <nav aria-label="Principal" className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {enlaces.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo(e.href) ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
              activo(e.href) ? "bg-white/[0.12] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {e.texto}
          </Link>
        ))}
      </nav>

      {clientes.length > 0 && (
        <label className="relative hidden sm:block">
          <span className="sr-only">Ir a un cliente</span>
          <select
            value={clienteId ?? ""}
            onChange={(e) => e.target.value && ir(`/panel/clientes/${e.target.value}`)}
            className="h-8 max-w-[200px] cursor-pointer appearance-none rounded-full border border-white/15 bg-white/[0.06] py-0 pl-3 pr-8 text-[12.5px] font-medium text-white outline-none transition hover:bg-white/[0.12] focus:border-white/40"
          >
            <option value="" className="text-black">
              {clienteId ? "Cambiar de cliente…" : "Ir a un cliente…"}
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.nombre}
              </option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/50">
            ▼
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="Buscar cliente o pantalla (Ctrl+K)"
        aria-label="Buscar cliente o pantalla"
        className="hidden h-8 items-center gap-1.5 rounded-full border border-white/15 px-2.5 text-[11px] text-white/50 transition hover:text-white md:flex"
      >
        <kbd className="font-sans">Ctrl</kbd>
        <kbd className="font-sans">K</kbd>
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
                    <span className="shrink-0 text-[11px] text-[color:var(--tinta-suave)]">{o.pista}</span>
                  </button>
                </li>
              ))}
              {opciones.length === 0 && (
                <li className="px-4 py-3 text-[13px] text-[color:var(--tinta-suave)]">Nada con «{busca}».</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
