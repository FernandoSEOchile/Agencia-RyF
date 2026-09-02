import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Barra from "@/components/Barra";
import Explorar from "@/components/Explorar";

export const metadata = { title: "Explorar dominio · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * Investigación de un dominio cualquiera.
 *
 * Va fuera de la ficha de cliente a propósito: el uso que de verdad importa es
 * mirar dominios que todavía NO son clientes —uno potencial, su competencia— y
 * colgarlo de una ficha habría impedido justo eso.
 */
export default async function PaginaExplorar() {
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
        <Link href="/panel" className="boton-sutil">
          ← Clientes
        </Link>

        <h1 className="mt-4 text-[32px] font-semibold leading-tight">Explorar dominio</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
          Qué posiciona un sitio cualquiera, cuánto tráfico vale y contra quién compite. Sirve para
          estudiar a la competencia de un cliente y para preparar una propuesta antes de tenerlo.
        </p>

        <div className="mt-7">
          <Explorar puedeExplorar={rol !== "LECTOR"} />
        </div>
      </main>
    </>
  );
}
