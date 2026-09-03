import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Barra from "@/components/Barra";
import Keywords from "@/components/Keywords";

export const metadata = { title: "Palabras clave · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * Investigación de palabras clave.
 *
 * Va fuera de la ficha de cliente por la misma razón que Explorar: lo que más
 * se investiga son mercados que todavía no son de nadie —una propuesta, una
 * categoría que quizá abramos—, y colgarlo de un cliente obligaría a inventarse
 * uno para poder mirar.
 */
export default async function PaginaKeywords() {
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

        <h1 className="mt-4 text-[32px] font-semibold leading-tight">Palabras clave</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
          Escribe una palabra y sale todo lo que la gente busca alrededor: la cola larga que la
          contiene y los términos vecinos que no. Con su volumen mensual, su tendencia y qué quiere
          quien la busca.
        </p>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--tinta-suave)]">
          Cada consulta nueva cuesta unos céntimos y queda guardada: volver a mirarla después es
          gratis.
        </p>

        <div className="mt-7">
          <Keywords puedeBuscar={rol !== "LECTOR"} />
        </div>
      </main>
    </>
  );
}
