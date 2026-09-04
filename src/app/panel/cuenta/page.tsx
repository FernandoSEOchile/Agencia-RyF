import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";
import { fecha } from "@/lib/formato";

export const metadata = { title: "Mi cuenta · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * La cuenta propia: nombre y contraseña.
 *
 * Hasta ahora nadie podía cambiar su contraseña; había que pedírselo a un
 * administrador, y por eso aparecían cuentas duplicadas «para probar». Cambiarla
 * exige la actual: una sesión abierta en un computador ajeno no debe bastar
 * para quedarse con la cuenta.
 */
export default async function Cuenta({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel/cuenta"));
  const { ok, error } = await searchParams;

  const yo = await db.usuario.findUnique({
    where: { id: sesion.user.id },
    select: { nombre: true, email: true, rol: true, ultimoAcceso: true, creado: true },
  });
  if (!yo) redirect("/entrar");

  async function cambiarNombre(datos: FormData) {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/entrar");
    const nombre = String(datos.get("nombre") ?? "").trim().slice(0, 80);
    if (!nombre) redirect("/panel/cuenta?error=" + encodeURIComponent("El nombre no puede quedar vacío."));
    await db.usuario.update({ where: { id: s.user.id }, data: { nombre } });
    redirect("/panel/cuenta?ok=" + encodeURIComponent("Nombre guardado."));
  }

  async function cambiarClave(datos: FormData) {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/entrar");

    const actual = String(datos.get("actual") ?? "");
    const nueva = String(datos.get("nueva") ?? "");
    const otraVez = String(datos.get("otraVez") ?? "");

    const fallo = (m: string) => redirect("/panel/cuenta?error=" + encodeURIComponent(m));

    if (nueva.length < 10) fallo("La contraseña nueva necesita al menos diez caracteres.");
    if (nueva !== otraVez) fallo("Las dos contraseñas nuevas no coinciden.");

    const u = await db.usuario.findUnique({ where: { id: s.user.id }, select: { clave: true } });
    if (!u || !(await bcrypt.compare(actual, u.clave))) fallo("La contraseña actual no es correcta.");

    await db.usuario.update({
      where: { id: s.user.id },
      data: { clave: await bcrypt.hash(nueva, 10) },
    });
    await anotar({ usuarioId: s.user.id, accion: "clave_propia", resumen: "Cambió su contraseña" });
    redirect("/panel/cuenta?ok=" + encodeURIComponent("Contraseña cambiada."));
  }

  const campo =
    "rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none transition focus:border-[color:var(--acento)]";

  return (
    <>
      <Barra usuarioId={sesion.user.id} usuario={sesion.user.name} rol={yo.rol} />
      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="text-[28px] font-semibold leading-tight">Mi cuenta</h1>
        <p className="mt-1 text-[13px] text-[color:var(--tinta-media)]">
          {yo.email} · {yo.rol.toLowerCase()} · en el panel desde {fecha(yo.creado)}
        </p>

        {ok && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{ok}</p>}
        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}

        <section className="tarjeta mt-6 p-5">
          <h2 className="text-[15px] font-semibold">Nombre</h2>
          <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">
            Así te ven tus compañeros en los hilos y en el registro.
          </p>
          <form action={cambiarNombre} className="mt-3 flex flex-wrap gap-2">
            <input name="nombre" defaultValue={yo.nombre} required maxLength={80} aria-label="Nombre" className={`${campo} flex-1`} />
            <button type="submit" className="boton">
              Guardar
            </button>
          </form>
        </section>

        <section className="tarjeta mt-4 p-5">
          <h2 className="text-[15px] font-semibold">Contraseña</h2>
          <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">
            Mínimo diez caracteres. Hace falta la actual para cambiarla.
          </p>
          <form action={cambiarClave} className="mt-3 grid gap-2">
            <input name="actual" type="password" required autoComplete="current-password" placeholder="Contraseña actual" aria-label="Contraseña actual" className={campo} />
            <input name="nueva" type="password" required minLength={10} autoComplete="new-password" placeholder="Contraseña nueva" aria-label="Contraseña nueva" className={campo} />
            <input name="otraVez" type="password" required minLength={10} autoComplete="new-password" placeholder="Repite la nueva" aria-label="Repite la contraseña nueva" className={campo} />
            <button type="submit" className="boton-fuerte justify-self-start">
              Cambiar contraseña
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
