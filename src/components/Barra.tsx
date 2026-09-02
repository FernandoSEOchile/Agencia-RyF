import Image from "next/image";
import Link from "next/link";

/**
 * Barra superior del panel.
 *
 * Va en negro porque el logo de la agencia es blanco con transparencia: sobre
 * fondo claro no se vería. Y se queda fija arriba: es el único marco constante
 * de la herramienta, y perderla al bajar deja al usuario sin salida.
 */
export default function Barra({
  usuario,
  rol,
  acciones,
}: {
  usuario?: string | null;
  rol?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[color:var(--oscuro)]">
      <div className="contenedor flex h-14 flex-wrap items-center gap-5">
        <Link href="/panel" className="flex items-center gap-3">
          <Image
            src="/ryf.webp"
            alt="Agencia RYF"
            width={512}
            height={199}
            priority
            className="h-5 w-auto"
          />
          <span
            className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/55"
            style={{ fontFamily: "var(--titular)" }}
          >
            Panel
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          {usuario && (
            <span className="hidden text-[12px] text-white/55 sm:block">
              {usuario}
              {rol && <span className="ml-1.5 text-white/30">{rol.toLowerCase()}</span>}
            </span>
          )}
          {acciones}
        </div>
      </div>
    </header>
  );
}
