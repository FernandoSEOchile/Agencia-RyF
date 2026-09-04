import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { veTodo } from "@/lib/clientes";
import Barra from "@/components/Barra";
import GastoGeneral from "@/components/GastoGeneral";

export const metadata = { title: "Gasto · Panel AppSEO" };
export const dynamic = "force-dynamic";

/** El gasto de toda la agencia. Solo lo ve quien responde de la factura. */
export default async function PaginaGasto() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel/gasto"));

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (!veTodo(rol)) redirect("/panel");

  async function salir() {
    "use server";
    await signOut({ redirectTo: "/entrar" });
  }

  return (
    <>
      <Barra usuarioId={sesion.user?.id}
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

        <h1 className="mt-4 text-[32px] font-semibold leading-tight">Gasto</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
          Lo que cuesta operar la cartera entera, repartido por cliente, por concepto y por persona.
        </p>

        <div className="mt-7">
          <GastoGeneral />
        </div>
      </main>
    </>
  );
}
