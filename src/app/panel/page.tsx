import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import { ultimas } from "@/lib/vigia";
import { db } from "@/lib/db";
import Barra from "@/components/Barra";
import Plataforma, { IconoWordPress } from "@/components/Plataforma";
import { fecha } from "@/lib/formato";
import FiltroClientes from "@/components/FiltroClientes";

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

/**
 * Versión del conector publicada en este servidor.
 *
 * Se lee del archivo que de verdad se descarga, no de la base: así el número
 * que se anuncia y el ZIP que se entrega no pueden separarse.
 */
async function versionPublicada() {
  try {
    const bruto = await readFile(
      join(process.cwd(), "public", "plugin", "version.json"),
      "utf8"
    );
    return (JSON.parse(bruto) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

export default async function Panel() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel"));

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const clientes = await clientesDe(sesion.user.id, rol);
  const versionConector = await versionPublicada();

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

  const conEscritura = clientes.filter((c) => c.soloLectura === false).length;
  const atrasados = clientes.filter((c) => c.version && c.version !== ultima).length;

  // Lo que vio el vigía en su última pasada. Se cuenta aparte del sondeo del
  // conector porque son cosas distintas: la web puede estar caída con el
  // conector respondiendo, y al cliente le importa la primera.
  const revisiones = await ultimas(clientes.map((c) => c.id));
  const caidos = [...revisiones.values()].filter((r) => !r.webOk).length;

  return (
    <>
      <Barra usuarioId={sesion.user?.id}
        usuario={sesion.user.name}
        rol={rol}
      />

      <main className="contenedor py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold leading-tight">Clientes</h1>
            <p className="mt-1 text-[15px] text-[color:var(--tinta-media)]">
              {clientes.length} {clientes.length === 1 ? "sitio conectado" : "sitios conectados"}
              {conEscritura > 0 && ` · ${conEscritura} con escritura`}
              {atrasados > 0 && (
                <span className="text-amber-600"> · {atrasados} por actualizar</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {caidos > 0 && (
              <Link href="/panel/errores" className="boton-alerta">
                Fallos · {caidos}
              </Link>
            )}
            {(rol === "ADMIN" || rol === "GESTOR") && (
              <Link href="/panel/clientes/nuevo" className="boton-fuerte">
                Conectar sitio
              </Link>
            )}
          </div>
        </div>

        {/* Sin filtro de rol a propósito: quien instala el plugin en el sitio
            del cliente casi nunca administra el panel, y antes tenía que
            pedirle el ZIP a otra persona. El paquete no lleva secretos. */}
        {versionConector && (
          <section className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-[color:var(--linea)] bg-white px-5 py-4 shadow-sm">
            <IconoWordPress tam={22} />

            <div className="min-w-[220px] flex-1">
              <p className="text-[14px] font-medium">
                Conector para WordPress{" "}
                <span className="ml-1 pastilla bg-black/[0.05] tabular-nums text-[color:var(--tinta-media)]">
                  v{versionConector}
                </span>
              </p>
              <p className="mt-0.5 text-[14px] text-[color:var(--tinta-media)]">
                El plugin que conecta un WordPress o WooCommerce con este panel. Esta es siempre la
                última versión.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/panel/conector" className="boton">
                Cómo se instala
              </Link>
              <a href="/api/plugin/descargar" className="boton-fuerte">
                Descargar
              </a>
            </div>
          </section>
        )}

        {clientes.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-20 text-center">
            <p className="text-[15px] font-medium">Todavía no hay clientes aquí.</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] text-[color:var(--tinta-media)]">
              {rol === "ADMIN"
                ? "Instala el plugin AppSEO RyF en el WordPress del cliente y pega su cadena de conexión."
                : "Pide a un administrador que te asigne los clientes con los que vas a trabajar."}
            </p>
          </div>
        ) : (
          <>
          <FiltroClientes total={clientes.length} />
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clientes.map((c) => {
              const atrasado = c.version && c.version !== ultima;
              const caido = c.estadoSonda && c.estadoSonda !== "ok";
              return (
                <li key={c.id} data-cliente={`${c.nombre} ${c.dominio}`.toLowerCase()}>
                  <Link
                    href={`/panel/clientes/${c.id}`}
                    className={`tarjeta-pulsable group flex h-full flex-col p-5 ${
                      caido ? "!border-red-200" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold tracking-tight transition ${
                          caido
                            ? "bg-red-50 text-red-600"
                            : "bg-black/[0.05] text-[color:var(--tinta-media)] group-hover:bg-[color:var(--acento)]/10 group-hover:text-[color:var(--acento)]"
                        }`}
                      >
                        {inicial(c.dominio)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{c.nombre}</p>
                        <p className="flex items-center gap-1.5 text-[14px] text-[color:var(--tinta-suave)]">
                          <Plataforma cual={c.plataforma} tam={14} />
                          <span className="truncate">{c.dominio}</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-1.5">
                      {caido ? (
                        <span className="pastilla bg-red-50 text-red-700">
                          {c.estadoSonda}
                        </span>
                      ) : (
                        <>
                          <span
                            className={`pastilla tabular-nums ${
                              atrasado
                                ? "bg-amber-50 text-amber-700"
                                : "bg-black/[0.05] text-[color:var(--tinta-media)]"
                            }`}
                          >
                            v{c.version ?? "?"}
                          </span>
                          <span
                            className={`pastilla ${
                              c.soloLectura
                                ? "bg-black/[0.05] text-[color:var(--tinta-media)]"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {c.soloLectura ? "Solo lectura" : "Escritura"}
                          </span>
                        </>
                      )}
                      <span className="ml-auto text-[12px] text-[color:var(--tinta-suave)]">
                        {haceCuanto(c.ultimaSonda)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          </>
        )}

        {registro.length > 0 && (
          <section className="mt-14">
            <h2 className="rotulo">Actividad del equipo</h2>
            <ul className="tarjeta mt-3 divide-y divide-[color:var(--linea)] overflow-hidden">
              {registro.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-[14px]">
                  <span className="w-20 shrink-0 tabular-nums text-[12px] text-[color:var(--tinta-suave)]">
                    {fecha(r.creado, { hora: true })}
                  </span>
                  <span className="pastilla bg-[color:var(--acento)]/10 text-[color:var(--acento)]">
                    {r.accion}
                  </span>
                  <span className={r.resultado === "ok" ? "text-[color:var(--tinta)]" : "font-medium text-red-600"}>
                    {r.resumen}
                  </span>
                  <span className="ml-auto text-[12px] text-[color:var(--tinta-suave)]">
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
