import Image from "next/image";
import Link from "next/link";

/**
 * Barra superior del panel.
 *
 * Va en oscuro porque el logo de la agencia es blanco con transparencia: sobre
 * fondo claro no se vería. Y porque separa con claridad el marco de la
 * herramienta del contenido de cada cliente, que sí es claro.
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
    <header className="border-b border-black/10 bg-[#111111]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-3.5">
        <Link href="/panel" className="flex items-center gap-3">
          <Image
            src="/ryf.webp"
            alt="Agencia RYF"
            width={512}
            height={199}
            priority
            className="h-6 w-auto"
          />
          <span className="border-l border-white/20 pl-3 text-sm font-semibold tracking-tight text-white">
            Panel
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          {usuario && (
            <span className="hidden text-xs text-white/50 sm:block">
              {usuario}
              {rol && <span className="ml-1.5 text-white/30">· {rol.toLowerCase()}</span>}
            </span>
          )}
          {acciones}
        </div>
      </div>
    </header>
  );
}
