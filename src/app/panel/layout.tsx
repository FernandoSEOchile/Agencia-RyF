import { auth } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import { enlacesDelPanel } from "@/lib/navegacion";
import Barra from "@/components/Barra";
import Riel from "@/components/Riel";

/**
 * El armazón del panel: riel a la izquierda, barra arriba, contenido a todo
 * el ancho.
 *
 * Antes cada página montaba su propia barra y el contenido iba en una columna
 * centrada de 1120 px; eso se leía como una web. Con el riel fijo y el ancho
 * completo se lee como una herramienta, y las tablas anchas —posiciones,
 * competidores, Search Console— dejan de ir con scroll lateral.
 *
 * Sin sesión no hay armazón: la página decide a dónde mandar, con su «volver».
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return <>{children}</>;

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const enlaces = enlacesDelPanel(rol);
  const clientes = (await clientesDe(sesion.user.id, rol)).map((c) => ({ id: c.id, nombre: c.nombre, dominio: c.dominio }));

  return (
    <div className="flex min-h-screen">
      <Riel enlaces={enlaces} usuario={sesion.user.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Barra enlaces={enlaces} clientes={clientes} usuario={sesion.user.name} rol={rol} />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
