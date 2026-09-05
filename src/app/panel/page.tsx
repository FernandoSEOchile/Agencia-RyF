import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import { cartera } from "@/lib/cartera";
import { db } from "@/lib/db";
import { IconoWordPress } from "@/components/Plataforma";
import Cartera from "@/components/Cartera";
import { dinero, fecha } from "@/lib/formato";

export const metadata = { title: "Clientes · Panel AppSEO" };
export const dynamic = "force-dynamic";

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

  const [filas, versionConector, registro] = await Promise.all([
    cartera(clientes),
    versionPublicada(),
    db.registro.findMany({
      where: rol === "ADMIN" ? {} : { clienteId: { in: clientes.map((c) => c.id) } },
      orderBy: { creado: "desc" },
      take: 6,
      include: { usuario: { select: { nombre: true } }, cliente: { select: { nombre: true } } },
    }),
  ]);

  const caidos = filas.filter((f) => f.estado.nivel === "caido").length;
  const atrasados = filas.filter((f) => f.estado.nivel === "aviso").length;
  const gastoMes = filas.reduce((t, f) => t + f.gastoMes, 0);

  return (
    <main className="contenedor py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight">Clientes</h1>
          <p className="mt-1 text-[15px] text-[color:var(--tinta-media)]">
            {clientes.length} {clientes.length === 1 ? "sitio" : "sitios"}
            {caidos > 0 && <span className="text-red-600"> · {caidos} {caidos === 1 ? "caído" : "caídos"}</span>}
            {atrasados > 0 && <span className="text-amber-600"> · {atrasados} por actualizar</span>}
            {gastoMes > 0 && ` · ${dinero(gastoMes)} gastados este mes`}
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

      {clientes.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-20 text-center">
          <p className="text-[15px] font-medium">Todavía no hay clientes aquí.</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-[color:var(--tinta-media)]">
            {rol === "ADMIN"
              ? "Da de alta un dominio, pega la cadena del plugin de WordPress o autoriza una tienda Shopify."
              : "Pide a un administrador que te asigne los clientes con los que vas a trabajar."}
          </p>
        </div>
      ) : (
        <Cartera filas={filas} />
      )}

      {/* Sin filtro de rol a propósito: quien instala el plugin en el sitio
          del cliente casi nunca administra el panel, y antes tenía que
          pedirle el ZIP a otra persona. El paquete no lleva secretos. */}
      {versionConector && (
        <section className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-[color:var(--linea)] bg-white px-5 py-4">
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

      {registro.length > 0 && (
        <section className="mt-12">
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
  );
}
