"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "@/components/Iconos";
import { enlaceActivo, type Enlace } from "@/lib/navegacion";

/**
 * El riel: la columna de iconos pegada a la izquierda.
 *
 * Sustituye a los enlaces que iban en la barra de arriba. Con siete pantallas,
 * un selector de cliente y el buscador, la barra no daba más de sí, y una
 * navegación que se mueve al bajar deja al usuario sin marco. El riel es
 * negro por lo mismo que lo era la barra: el logo de la agencia es blanco
 * con transparencia.
 */
export default function Riel({ enlaces, usuario }: { enlaces: Enlace[]; usuario?: string | null }) {
  const ruta = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center bg-[#111111] py-3 md:flex">
      <Link href="/panel" className="mb-3 grid h-9 w-12 place-items-center" aria-label="Portada del panel">
        <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} priority className="h-[15px] w-auto" />
      </Link>

      <nav aria-label="Principal" className="flex flex-col items-center gap-0.5">
        {enlaces.map((e) => {
          const activo = enlaceActivo(e.href, ruta);
          return (
            <Link
              key={e.href}
              href={e.href}
              aria-current={activo ? "page" : undefined}
              className={`relative flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] font-medium leading-none transition ${
                activo ? "bg-white/[0.1] text-white" : "text-white/50 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {activo && <span aria-hidden className="absolute -left-1 top-2.5 h-[calc(100%-20px)] w-[3px] rounded-full bg-[color:var(--acento)]" />}
              <Icono nombre={e.icono} />
              <span>{e.texto}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        href="/panel/cuenta"
        title={usuario ? `${usuario} · mi cuenta` : "Mi cuenta"}
        aria-current={ruta.startsWith("/panel/cuenta") ? "page" : undefined}
        className={`mt-auto grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold transition ${
          ruta.startsWith("/panel/cuenta") ? "bg-white text-black" : "bg-white/[0.1] text-white/80 hover:bg-white/20 hover:text-white"
        }`}
      >
        {(usuario ?? "?").trim().slice(0, 1).toUpperCase()}
      </Link>
    </aside>
  );
}

/** En móvil el riel no cabe: el mismo menú, abierto desde la barra. */
export function MenuMovil({ enlaces }: { enlaces: Enlace[] }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Navegar cierra el menú: si no, la pantalla nueva aparece tapada.
  useEffect(() => setAbierto(false), [ruta]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el menú"
        className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--tinta-media)] transition hover:bg-black/[0.05] hover:text-[color:var(--tinta)]"
      >
        <Icono nombre="menu" />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setAbierto(false)} role="presentation">
          <nav
            aria-label="Principal"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-64 flex-col bg-[#111111] px-3 py-4"
          >
            <div className="mb-4 flex items-center justify-between px-2">
              <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} className="h-[16px] w-auto" />
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar el menú" className="text-white/60 hover:text-white">
                <Icono nombre="cerrar" />
              </button>
            </div>
            {enlaces.map((e) => {
              const activo = enlaceActivo(e.href, ruta);
              return (
                <Link
                  key={e.href}
                  href={e.href}
                  aria-current={activo ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${
                    activo ? "bg-white/[0.1] text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icono nombre={e.icono} />
                  {e.texto}
                </Link>
              );
            })}
            <Link href="/panel/cuenta" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-white/60 hover:text-white">
              <Icono nombre="cuenta" />
              Mi cuenta
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
