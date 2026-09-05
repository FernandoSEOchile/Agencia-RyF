import Navegacion, { type ClienteBreve } from "@/components/Navegacion";
import { MenuMovil } from "@/components/Riel";
import { salir } from "@/lib/salir";
import type { Enlace } from "@/lib/navegacion";

/**
 * Barra superior del panel.
 *
 * Antes era negra y llevaba toda la navegación; ahora las pantallas van en el
 * riel y la barra se queda con lo que cambia según dónde estés: el cliente
 * actual, el buscador y la salida. Es clara para que el contenido y ella sean
 * una sola superficie, y sigue fija arriba: es el marco constante de la
 * herramienta.
 */
export default function Barra({
  enlaces,
  clientes,
  usuario,
  rol,
}: {
  enlaces: Enlace[];
  clientes: ClienteBreve[];
  usuario?: string | null;
  rol?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--linea)] bg-[color:var(--fondo)]/85 backdrop-blur">
      <div className="flex h-12 items-center gap-3 px-4 lg:px-6">
        <MenuMovil enlaces={enlaces} />

        <Navegacion enlaces={enlaces} clientes={clientes} />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {usuario && (
            <span className="hidden text-[13px] text-[color:var(--tinta-media)] lg:block" title={rol?.toLowerCase()}>
              {usuario}
            </span>
          )}
          <form action={salir}>
            <button className="boton-sutil">Salir</button>
          </form>
        </div>
      </div>
    </header>
  );
}
