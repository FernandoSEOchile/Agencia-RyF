import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import { db } from "@/lib/db";
import Barra from "@/components/Barra";

export const metadata = { title: "Clientes · Panel AppSEO" };
export const dynamic = "force-dynamic";

function haceCuanto(fecha: Date | null) {
  if (!fecha) return "sin comprobar";
  const min = Math.round((Date.now() - fecha.getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Iniciales del dominio, como marca de agua del cliente. */
function inicial(nombre: string) {
  return nombre.replace(/^www\./, "").slice(0, 2).toUpperCase();
}

export default async function Panel() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const clientes = await clientesDe(sesion.user.id, rol);

  const versiones = [...new Set(clientes.map((c) => c.version).filter(Boolean))].sort((a, b) =>
    String(b).localeCompare(String(a), undefined, { numeric: true })
  );
  const ultima = versiones[0];

  const registro = await db.registro.findMany({
    where: rol === "ADMIN" ? {} : { clienteId: { in: clientes.map((c) => c.id) } },
    orderBy: { creado: "desc" },
    take: 6,
    include: { usuario: { select: { nombre: true } }, cliente: { select: { nombre: true } } },
  });

  async function salir() {
    "use server";
    await signOut({ redirectTo: "/entrar" });
  }

  const conEscritura = clientes.filter((c) => c.soloLectura === false).length;
  const atrasados = clientes.filter((c) => c.version && c.version !== ultima).length;

  return (
    <>
      <Barra
        usuario={sesion.user.name}
        rol={rol}
        acciones={
          <form action={salir}>
            <button className="text-xs font-medium text-white/60 underline-offset-4 transition hover:text-white hover:underline">
              Salir
            </button>
          </form>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Clientes</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              {clientes.length} {clientes.length === 1 ? "sitio conectado" : "sitios conectados"}
              {conEscritura > 0 && ` · ${conEscritura} con escritura`}
              {atrasados > 0 && (
                <span className="text-amber-700"> · {atrasados} por actualizar</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
          {rol === "ADMIN" && (
            <Link
              href="/panel/usuarios"
              className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-[#ff6b00] hover:text-[#ff6b00]"
            >
              Usuarios
            </Link>
          )}
          {(rol === "ADMIN" || rol === "GESTOR") && (
            <Link
              href="/panel/clientes/nuevo"
              className="rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ff6b00]"
            >
              Conectar sitio
            </Link>
          )}
          </div>
        </div>

        {clientes.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-neutral-700">Todavía no hay clientes aquí.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-neutral-500">
              {rol === "ADMIN"
                ? "Instala el plugin AppSEO RyF en el WordPress del cliente y pega su cadena de conexión."
                : "Pide a un administrador que te asigne los clientes con los que vas a trabajar."}
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {clientes.map((c) => {
              const atrasado = c.version && c.version !== ultima;
              const caido = c.estadoSonda && c.estadoSonda !== "ok";
              return (
                <li key={c.id}>
                  <Link
                    href={`/panel/clientes/${c.id}`}
                    className={`group flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff6b00] hover:shadow-md ${
                      caido ? "border-red-200" : "border-neutral-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold tracking-tight ${
                          caido
                            ? "bg-red-50 text-red-600"
                            : "bg-neutral-100 text-neutral-500 group-hover:bg-[#ff6b00]/10 group-hover:text-[#ff6b00]"
                        }`}
                      >
                        {inicial(c.dominio)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-neutral-900">{c.nombre}</p>
                        <p className="truncate text-xs text-neutral-500">{c.dominio}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      {caido ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                          {c.estadoSonda}
                        </span>
                      ) : (
                        <>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                              atrasado ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            v{c.version ?? "?"}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              c.soloLectura
                                ? "bg-neutral-100 text-neutral-600"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {c.soloLectura ? "Solo lectura" : "Escritura"}
                          </span>
                        </>
                      )}
                      <span className="ml-auto text-[11px] text-neutral-400">
                        {haceCuanto(c.ultimaSonda)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {registro.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Actividad del equipo
            </h2>
            <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              {registro.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
                  <span className="w-20 shrink-0 tabular-nums text-[11px] text-neutral-400">
                    {r.creado.toISOString().slice(5, 16).replace("T", " ")}
                  </span>
                  <span className="rounded bg-[#ff6b00]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#ff6b00]">
                    {r.accion}
                  </span>
                  <span className={r.resultado === "ok" ? "text-neutral-700" : "font-medium text-red-600"}>
                    {r.resumen}
                  </span>
                  <span className="ml-auto text-[11px] text-neutral-400">
                    {r.usuario?.nombre ?? "—"}
                    {r.cliente ? ` · ${r.cliente.nombre}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
