import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";
import { fecha } from "@/lib/formato";

export const metadata = { title: "Usuarios · Panel AppSEO" };
export const dynamic = "force-dynamic";

const ROLES = [
  ["ADMIN", "Admin", "Todo, incluida la gestión de usuarios"],
  ["GESTOR", "Gestor", "Toda la cartera y todas las operaciones, salvo usuarios"],
  ["EDITOR", "Editor", "Solo los clientes que se le asignen"],
  ["LECTOR", "Lector", "Consulta, sin escribir nunca"],
] as const;

/** Solo un ADMIN pasa de aquí; cualquier otro vuelve al panel. */
async function exigirAdmin() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel/usuarios"));
  if ((sesion.user as { rol?: string }).rol !== "ADMIN") redirect("/panel");
  return sesion;
}

export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sesion = await exigirAdmin();
  const { error, ok } = await searchParams;
  const miId = sesion.user!.id!;

  const [usuarios, clientes] = await Promise.all([
    db.usuario.findMany({
      orderBy: { creado: "asc" },
      include: { accesos: { select: { clienteId: true } } },
    }),
    db.cliente.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);

  async function crear(datos: FormData) {
    "use server";
    const s = await exigirAdmin();

    const email = String(datos.get("email") || "").trim().toLowerCase();
    const nombre = String(datos.get("nombre") || "").trim();
    const rol = String(datos.get("rol") || "EDITOR");
    const clave = String(datos.get("clave") || "");

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/panel/usuarios?error=" + encodeURIComponent("Ese correo no es válido."));
    if (clave.length < 10) redirect("/panel/usuarios?error=" + encodeURIComponent("La contraseña necesita al menos 10 caracteres."));
    if (!ROLES.some(([r]) => r === rol)) redirect("/panel/usuarios?error=" + encodeURIComponent("Rol no válido."));
    if (await db.usuario.findUnique({ where: { email } })) redirect("/panel/usuarios?error=" + encodeURIComponent("Ya existe un usuario con ese correo."));

    await db.usuario.create({
      data: { email, nombre: nombre || email, rol: rol as "ADMIN", clave: await bcrypt.hash(clave, 12) },
    });
    await anotar({ usuarioId: s.user!.id!, accion: "usuario_crear", resumen: `${email} · rol ${rol.toLowerCase()}` });
    redirect("/panel/usuarios?ok=" + encodeURIComponent(`${email} creado.`));
  }

  async function actualizar(datos: FormData) {
    "use server";
    const s = await exigirAdmin();
    const id = String(datos.get("id") || "");
    const rol = String(datos.get("rol") || "");
    const activo = datos.get("activo") === "1";
    const clave = String(datos.get("clave") || "");

    // Nadie se quita a sí mismo el rol de admin ni se desactiva: quedaría un
    // panel sin nadie que pueda administrarlo.
    if (id === s.user!.id! && (rol !== "ADMIN" || !activo)) {
      redirect("/panel/usuarios?error=" + encodeURIComponent("No puedes quitarte a ti mismo el acceso de administrador."));
    }
    if (!ROLES.some(([r]) => r === rol)) redirect("/panel/usuarios?error=" + encodeURIComponent("Rol no válido."));
    if (clave && clave.length < 10) redirect("/panel/usuarios?error=" + encodeURIComponent("La contraseña nueva necesita al menos 10 caracteres."));

    const u = await db.usuario.update({
      where: { id },
      data: { rol: rol as "ADMIN", activo, ...(clave ? { clave: await bcrypt.hash(clave, 12) } : {}) },
    });

    // Con visión completa no hacen falta asignaciones; se limpian para que al
    // bajar de rol no queden accesos heredados sin querer.
    const asignados = datos.getAll("acceso").map(String);
    if (rol === "ADMIN" || rol === "GESTOR") {
      await db.acceso.deleteMany({ where: { usuarioId: id } });
    } else {
      await db.acceso.deleteMany({ where: { usuarioId: id, clienteId: { notIn: asignados } } });
      for (const clienteId of asignados) {
        await db.acceso.upsert({
          where: { usuarioId_clienteId: { usuarioId: id, clienteId } },
          update: {},
          create: { usuarioId: id, clienteId },
        });
      }
    }

    await anotar({
      usuarioId: s.user!.id!,
      accion: "usuario_editar",
      resumen: `${u.email} · rol ${rol.toLowerCase()}${activo ? "" : " · desactivado"}${clave ? " · contraseña cambiada" : ""}`,
    });
    revalidatePath("/panel/usuarios");
    redirect("/panel/usuarios?ok=" + encodeURIComponent(`${u.email} actualizado.`));
  }

  return (
    <>
      <Barra usuarioId={sesion.user?.id} usuario={sesion.user!.name} rol="ADMIN" />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Link href="/panel" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
          ← Clientes
        </Link>

        <h1 className="text-[30px] font-semibold leading-tight">Usuarios</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Quién entra al panel y qué puede hacer. Solo los administradores ven esta pantalla.
        </p>

        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {ok && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</p>}

        {/* --- Alta --- */}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Nuevo usuario</h2>
          <form action={crear} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input name="email" type="email" required placeholder="correo@empresa.com"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20" />
            <input name="nombre" placeholder="Nombre"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20" />
            <select name="rol" defaultValue="EDITOR"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#ff6b00]">
              {ROLES.map(([v, t, d]) => (
                <option key={v} value={v}>{t} — {d}</option>
              ))}
            </select>
            <input name="clave" type="password" required minLength={10} placeholder="Contraseña (mínimo 10)"
              autoComplete="new-password"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20" />
            <button type="submit"
              className="sm:col-span-2 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff6b00]">
              Crear usuario
            </button>
          </form>
        </section>

        {/* --- Lista --- */}
        <section className="mt-6 grid gap-4">
          {usuarios.map((u) => {
            const soyYo = u.id === miId;
            const conAsignacion = u.rol === "EDITOR" || u.rol === "LECTOR";
            return (
              <form key={u.id} action={actualizar}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${u.activo ? "border-neutral-200" : "border-neutral-200 opacity-60"}`}>
                <input type="hidden" name="id" value={u.id} />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">
                      {u.nombre}
                      {soyYo && <span className="ml-2 rounded bg-[#ff6b00]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#ff6b00]">tú</span>}
                      {!u.activo && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">desactivado</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {u.email}
                      {u.ultimoAcceso && ` · último acceso ${fecha(u.ultimoAcceso, { hora: true })}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select name="rol" defaultValue={u.rol} disabled={soyYo}
                      className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-[#ff6b00] disabled:bg-neutral-50 disabled:text-neutral-400">
                      {ROLES.map(([v, t]) => (
                        <option key={v} value={v}>{t}</option>
                      ))}
                    </select>
                    {/* Un select deshabilitado no viaja en el formulario: el
                        valor real va en este campo oculto. */}
                    {soyYo && <input type="hidden" name="rol" value={u.rol} />}

                    <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                      <input type="checkbox" name="activo" value="1" defaultChecked={u.activo} disabled={soyYo}
                        className="accent-[#ff6b00]" />
                      Activo
                    </label>
                    {soyYo && <input type="hidden" name="activo" value="1" />}
                  </div>
                </div>

                {conAsignacion && clientes.length > 0 && (
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Clientes asignados
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {clientes.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-sm text-neutral-700">
                          <input type="checkbox" name="acceso" value={c.id}
                            defaultChecked={u.accesos.some((a) => a.clienteId === c.id)}
                            className="accent-[#ff6b00]" />
                          {c.nombre}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  <input name="clave" type="password" minLength={10} placeholder="Nueva contraseña (opcional)"
                    autoComplete="new-password"
                    className="w-56 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs outline-none focus:border-[#ff6b00]" />
                  <button type="submit"
                    className="ml-auto rounded-lg border border-neutral-300 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-[#ff6b00] hover:text-[#ff6b00]">
                    Guardar cambios
                  </button>
                </div>
              </form>
            );
          })}
        </section>
      </main>
    </>
  );
}
