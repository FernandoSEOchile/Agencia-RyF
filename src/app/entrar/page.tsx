import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Entrar · AppSEO" };

/**
 * Pantalla de acceso.
 *
 * El formulario se envía a una acción del servidor: la contraseña no pasa por
 * JavaScript del navegador ni queda en el estado de ningún componente.
 */
export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (sesion?.user) redirect("/panel");

  const { error } = await searchParams;
  const sinUsuarios = (await db.usuario.count()) === 0;

  async function entrar(datos: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: datos.get("email"),
        clave: datos.get("clave"),
        redirectTo: "/panel",
      });
    } catch (e) {
      // signIn lanza una redirección interna cuando va bien; hay que dejarla pasar.
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
      if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      redirect("/entrar?error=1");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 overflow-hidden rounded-2xl bg-[#111111] px-6 py-7 text-center">
        <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} priority className="mx-auto h-8 w-auto" />
        <p className="mt-3 text-sm font-semibold text-white">Panel AppSEO</p>
        <p className="mt-0.5 text-xs text-white/50">Gestión de clientes conectados</p>
      </div>

      {sinUsuarios && (
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No hay ningún usuario todavía. Crea el primero con{" "}
          <code className="font-mono text-xs">npm run panel:usuario</code>.
        </p>
      )}

      {error && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Correo o contraseña incorrectos.
        </p>
      )}

      <form action={entrar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Correo</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Contraseña</span>
          <input
            name="clave"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ff6b00]"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
