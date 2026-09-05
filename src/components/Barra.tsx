import Image from "next/image";
import Link from "next/link";
import Navegacion, { type Enlace } from "@/components/Navegacion";
import { clientesDe } from "@/lib/clientes";
import { salir } from "@/lib/salir";

/**
 * Barra superior del panel.
 *
 * Va en negro porque el logo de la agencia es blanco con transparencia: sobre
 * fondo claro no se vería. Y se queda fija arriba: es el único marco constante
 * de la herramienta, y perderla al bajar deja al usuario sin salida.
 *
 * Lleva la navegación entera —pantallas, cliente actual, salir— para que
 * ninguna pantalla dependa de volver a la portada. Los clientes los busca ella
 * misma con el id de quien mira: así ninguna página tiene que acordarse de
 * pasárselos.
 */
export default async function Barra({
  usuario,
  usuarioId,
  rol,
  clienteId,
  acciones,
}: {
  usuario?: string | null;
  usuarioId?: string | null;
  rol?: string;
  clienteId?: string | null;
  acciones?: React.ReactNode;
}) {
  const r = rol ?? "LECTOR";

  const enlaces: Enlace[] = [
    { href: "/panel", texto: "Clientes" },
    { href: "/panel/terminos", texto: "Palabras clave" },
    { href: "/panel/explorar", texto: "Explorar" },
    { href: "/panel/errores", texto: "Fallos" },
    ...(r === "ADMIN" || r === "GESTOR" ? [{ href: "/panel/gasto", texto: "Gasto" }] : []),
    ...(r === "ADMIN"
      ? [
          { href: "/panel/usuarios", texto: "Usuarios" },
          { href: "/panel/ajustes", texto: "Ajustes" },
        ]
      : []),
  ];

  const clientes = usuarioId
    ? (await clientesDe(usuarioId, r)).map((c) => ({ id: c.id, nombre: c.nombre, dominio: c.dominio }))
    : [];

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#111111]">
      <div className="contenedor flex h-12 items-center gap-3 sm:gap-5">
        <Link href="/panel" className="flex shrink-0 items-center gap-3" aria-label="Portada del panel">
          <Image
            src="/ryf.webp"
            alt="Agencia RYF"
            width={512}
            height={199}
            priority
            className="h-[18px] w-auto"
          />
        </Link>

        <Navegacion enlaces={enlaces} clientes={clientes} clienteId={clienteId} />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {usuario && (
            <span className="hidden text-[13px] text-white/55 lg:block" title={rol?.toLowerCase()}>
              {usuario}
            </span>
          )}
          {acciones}
          {usuarioId && (
            <form action={salir}>
              <button className="text-[13px] font-medium text-white/55 transition hover:text-white">
                Salir
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
