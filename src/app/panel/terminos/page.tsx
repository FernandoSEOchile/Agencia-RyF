import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Barra from "@/components/Barra";
import Terminos from "@/components/Terminos";

export const metadata = { title: "Almacén de palabras · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * Todo lo que la agencia ha ido acumulando.
 *
 * No es una pantalla de consulta a un proveedor: es lo que ya se pagó alguna
 * vez, junto y consultable. Por eso mirar aquí no cuesta nada y el único botón
 * que gasta dinero dice lo que hace.
 */
export default async function PaginaTerminos() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  async function salir() {
    "use server";
    await signOut({ redirectTo: "/entrar" });
  }

  return (
    <>
      <Barra
        usuario={sesion.user.name}
        rol={rol}
        acciones={
          <form action={salir}>
            <button className="text-[12px] font-medium text-white/55 transition hover:text-white">
              Salir
            </button>
          </form>
        }
      />

      <main className="contenedor py-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/panel" className="boton-sutil">
            ← Clientes
          </Link>
          <Link href="/panel/keywords" className="boton-sutil">
            Investigar una palabra nueva
          </Link>
        </div>

        <h1 className="mt-4 text-[32px] font-semibold leading-tight">Almacén de palabras</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
          Todo lo que hemos ido encontrando: cada investigación de una palabra y cada dominio
          explorado dejan aquí lo que trajeron. Consultarlo es gratis — ya está pagado.
        </p>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--tinta-suave)]">
          Cada fila lleva la fecha de su dato. En rojo, las que llevan más de seis meses sin
          refrescarse: esas ya no son de fiar para decidir nada.
        </p>

        <div className="mt-7">
          <Terminos puedeActualizar={rol !== "LECTOR"} />
        </div>
      </main>
    </>
  );
}
