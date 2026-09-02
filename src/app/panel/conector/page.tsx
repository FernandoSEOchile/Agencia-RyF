import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import Barra from "@/components/Barra";
import { IconoWordPress } from "@/components/Plataforma";
import SitiosConector from "@/components/SitiosConector";

export const metadata = { title: "Conector · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * Descarga del conector, abierta a cualquiera que entre al panel.
 *
 * Vivía solo dentro de Ajustes, que es de administradores, y eso dejaba a quien
 * instala el plugin en el sitio del cliente —normalmente no un administrador
 * del panel— pidiéndole el ZIP a otra persona. El paquete no lleva secretos:
 * las credenciales las genera cada WordPress al activarlo.
 *
 * Lo que sigue siendo de administradores es qué clientes van atrasados, que
 * está en Ajustes: eso sí es información de la cartera entera.
 */
async function paquete() {
  try {
    const carpeta = join(process.cwd(), "public", "plugin");
    const [meta, info] = await Promise.all([
      readFile(join(carpeta, "version.json"), "utf8"),
      stat(join(carpeta, "appseo-ryf.zip")),
    ]);
    const d = JSON.parse(meta) as { version: string; notas?: string; publicado?: string };
    return {
      version: d.version,
      notas: d.notas ?? "",
      publicado: d.publicado ? new Date(d.publicado) : null,
      kb: Math.round(info.size / 1024),
    };
  } catch {
    return null;
  }
}

const PASOS = [
  {
    titulo: "Sube el ZIP a WordPress",
    detalle:
      "En el escritorio del sitio: Plugins → Añadir nuevo → Subir plugin. Elige el archivo y actívalo. Si ya hay una versión instalada, WordPress avisa y la reemplaza sin perder los ajustes.",
  },
  {
    titulo: "Copia la cadena de conexión",
    detalle:
      "Aparece un menú AppSEO en el escritorio. En AppSEO → Conexión está la cadena completa, que empieza por appseo_. Cópiala entera.",
  },
  {
    titulo: "Pégala en «Conectar sitio»",
    detalle:
      "El panel la comprueba contra el sitio antes de guardarla y la almacena cifrada. A partir de ahí el sitio se actualiza solo cuando publicamos una versión nueva.",
  },
];

export default async function PaginaConector() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const p = await paquete();

  // Solo los sitios a los que llega quien mira: un LECTOR con dos clientes
  // asignados no debe enterarse aquí de cuántos tiene la agencia.
  const sitios = (await clientesDe(sesion.user.id, rol))
    .filter((c) => c.plataforma !== "shopify")
    .map((c) => ({ id: c.id, nombre: c.nombre, dominio: c.dominio, version: c.version }));

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

        <h1 className="mt-4 flex items-center gap-2.5 text-[32px] font-semibold leading-tight">
          <IconoWordPress tam={26} />
          Conector para WordPress
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
          El plugin que conecta un WordPress o WooCommerce con este panel. Solo hace falta para
          WordPress: las tiendas Shopify se autorizan desde fuera y no instalan nada.
        </p>

        {p ? (
          <>
            <section className="mt-8 rounded-2xl border border-[color:var(--linea)] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <a href="/api/plugin/descargar" className="boton-fuerte">
                  Descargar la versión {p.version}
                </a>
                <span className="text-[13px] tabular-nums text-[color:var(--tinta-suave)]">
                  {p.kb} KB
                  {p.publicado && ` · publicada el ${p.publicado.toISOString().slice(0, 10)}`}
                </span>
              </div>

              {p.notas && (
                <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
                  <span className="font-medium text-[color:var(--tinta)]">Novedades:</span> {p.notas}
                </p>
              )}

              <p className="mt-4 border-t border-[color:var(--linea)] pt-4 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
                Esta es siempre la última versión publicada. Los sitios ya conectados con la
                actualización automática activada se ponen al día solos en unas horas; este ZIP es
                para instalarlo por primera vez, o cuando haya que hacerlo a mano.
              </p>
            </section>

            {sitios.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[17px] font-semibold">Tus sitios</h2>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
                  El botón le pide al sitio que compruebe ahora, sin esperar a que caduque su caché.
                  Instalar lo decide él: si tiene desactivada la gestión de plugins, te lo dirá y
                  tendrás que actualizarlo desde su escritorio, donde ya aparecerá.
                </p>
                <SitiosConector
                  sitios={sitios}
                  ultima={p.version}
                  puedeActualizar={rol !== "LECTOR"}
                />
              </section>
            )}

            <h2 className="mt-10 text-[17px] font-semibold">Cómo se instala</h2>
            <ol className="mt-4 flex flex-col gap-4">
              {PASOS.map((paso, i) => (
                <li
                  key={paso.titulo}
                  className="flex gap-4 rounded-2xl border border-[color:var(--linea)] bg-white p-5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--tinta)] text-[13px] font-semibold tabular-nums text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[14px] font-medium">{paso.titulo}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
                      {paso.detalle}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {rol !== "LECTOR" && (
              <p className="mt-6 text-[13px] text-[color:var(--tinta-media)]">
                Cuando tengas la cadena,{" "}
                <Link href="/panel/clientes/nuevo" className="font-medium underline underline-offset-4">
                  conecta el sitio
                </Link>
                .
              </p>
            )}
          </>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center text-[14px] text-[color:var(--tinta-media)]">
            Todavía no hay ningún paquete publicado en este servidor.
          </p>
        )}
      </main>
    </>
  );
}
