import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Palabras from "@/components/Palabras";

export const metadata = { title: "Palabras clave · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * Palabras clave: el almacén y la compra, en una sola pantalla.
 *
 * Estuvieron un rato separados y no funcionaba: para decidir si valía la pena
 * pagar había que mirar antes en la otra pantalla si ya lo teníamos, y esa es
 * justo la decisión que se toma aquí.
 *
 * Va fuera de la ficha de cliente por lo mismo que Explorar: lo que más se
 * investiga son mercados que todavía no son de nadie.
 */
export default async function PaginaPalabras() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel/terminos"));

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";


  return (
    <>
      <main className="contenedor py-10">
        <Link href="/panel" className="boton-sutil">
          ← Clientes
        </Link>

        <h1 className="mt-4 text-[32px] font-bold leading-tight">Palabras clave</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
          Escribe una palabra: sale al instante todo lo que ya tenemos guardado sobre ella, gratis
          porque ya está pagado. Si falta algo, el botón trae lo que no está y se queda aquí.
        </p>
        <p className="mt-2 max-w-2xl text-[14px] text-[color:var(--tinta-suave)]">
          Cada fila lleva la fecha de su dato. En rojo las que llevan más de seis meses sin
          refrescarse: esas ya no sirven para decidir nada.
        </p>

        <div className="mt-7">
          <Palabras puedePagar={rol !== "LECTOR"} />
        </div>
      </main>
    </>
  );
}
