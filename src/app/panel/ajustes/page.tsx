import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";
import {
  MODELOS,
  estadoConfig,
  guardarClaveApi,
  borrarClaveApi,
  guardarModelo,
} from "@/lib/config";

export const metadata = { title: "Ajustes · Panel AppSEO" };
export const dynamic = "force-dynamic";

/** Solo un ADMIN pasa: aquí se cambia la llave que paga todo. */
async function exigirAdmin() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");
  if ((sesion.user as { rol?: string }).rol !== "ADMIN") redirect("/panel");
  return sesion;
}

export default async function Ajustes({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sesion = await exigirAdmin();
  const { error, ok } = await searchParams;
  const cfg = await estadoConfig();

  async function guardarClave(datos: FormData) {
    "use server";
    const s = await exigirAdmin();
    const clave = String(datos.get("clave") || "").trim();

    if (!clave) redirect("/panel/ajustes?error=" + encodeURIComponent("Escribe una clave."));

    // Se comprueba la forma antes de guardar: una clave mal pegada se detecta
    // aquí y no dentro de una conversación a medias.
    if (!clave.startsWith("sk-ant-")) {
      redirect(
        "/panel/ajustes?error=" +
          encodeURIComponent("Esa clave no empieza por «sk-ant-». ¿Se copió entera desde console.anthropic.com?")
      );
    }

    // Y se prueba contra la API antes de dejarla puesta: guardar una clave
    // muerta convierte el panel en algo que falla al primer mensaje.
    const r = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": clave, "anthropic-version": "2023-06-01" },
    }).catch(() => null);

    if (!r) {
      redirect("/panel/ajustes?error=" + encodeURIComponent("No se pudo contactar con la API para comprobarla."));
    }
    if (!r.ok) {
      const detalle = r.status === 401 ? "la clave no es válida" : `la API respondió ${r.status}`;
      redirect("/panel/ajustes?error=" + encodeURIComponent(`No se guardó: ${detalle}.`));
    }

    await guardarClaveApi(clave);
    await anotar({
      usuarioId: s.user!.id!,
      accion: "ajustes",
      resumen: `Clave de API actualizada (…${clave.slice(-4)})`,
    });
    redirect("/panel/ajustes?ok=" + encodeURIComponent("Clave guardada y comprobada."));
  }

  async function quitarClave() {
    "use server";
    const s = await exigirAdmin();
    await borrarClaveApi();
    await anotar({ usuarioId: s.user!.id!, accion: "ajustes", resumen: "Clave de API borrada del panel" });
    redirect("/panel/ajustes?ok=" + encodeURIComponent("Clave borrada. Se vuelve a usar la del servidor, si la hay."));
  }

  async function cambiarModelo(datos: FormData) {
    "use server";
    const s = await exigirAdmin();
    const m = String(datos.get("modelo") || "");
    try {
      await guardarModelo(m);
    } catch {
      redirect("/panel/ajustes?error=" + encodeURIComponent("Ese modelo no está en la lista."));
    }
    await anotar({ usuarioId: s.user!.id!, accion: "ajustes", resumen: `Modelo cambiado a ${m}` });
    redirect("/panel/ajustes?ok=" + encodeURIComponent("Modelo actualizado."));
  }

  return (
    <>
      <Barra usuario={sesion.user!.name} rol="ADMIN" />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <Link href="/panel" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
          ← Clientes
        </Link>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Ajustes</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          La clave de la API y el modelo con el que responde el asistente. Solo lo ven los administradores.
        </p>

        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {ok && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</p>}

        {/* --- Clave --- */}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Clave de la API de Anthropic</h2>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {cfg.hayClave ? (
              <>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  configurada
                </span>
                <code className="rounded bg-neutral-100 px-2 py-1 font-mono text-neutral-600">{cfg.rastro}</code>
                <span className="text-neutral-400">
                  {cfg.origen === "panel" ? "guardada en el panel" : "viene del servidor"}
                </span>
              </>
            ) : (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                sin configurar · el chat no funcionará
              </span>
            )}
          </div>

          <form action={guardarClave} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Clave nueva
              </span>
              <input
                name="clave"
                type="password"
                required
                autoComplete="off"
                placeholder="sk-ant-…"
                className="rounded-lg border border-neutral-200 px-3 py-2 font-mono text-xs outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff6b00]"
            >
              Comprobar y guardar
            </button>
          </form>

          <p className="mt-2 text-xs text-neutral-500">
            Se prueba contra la API antes de guardarla, y se almacena cifrada. Nunca vuelve a mostrarse
            entera: si la pierdes, se genera otra en console.anthropic.com.
          </p>

          {cfg.origen === "panel" && (
            <form action={quitarClave} className="mt-3 border-t border-neutral-100 pt-3">
              <button className="text-xs font-medium text-neutral-500 underline-offset-4 hover:text-red-600 hover:underline">
                Borrar la clave del panel
              </button>
            </form>
          )}
        </section>

        {/* --- Modelo --- */}
        <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Modelo</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Cambiarlo afecta a lo que cuesta cada mensaje y a la calidad de lo que escribe. Un modelo menor
            rinde igual en tareas mecánicas y cuesta una fracción.
          </p>

          <form action={cambiarModelo} className="mt-4 grid gap-2">
            {MODELOS.map(([id, nombre, nota]) => (
              <label
                key={id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  cfg.modelo === id
                    ? "border-[#ff6b00] bg-[#ff6b00]/5"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <input
                  type="radio"
                  name="modelo"
                  value={id}
                  defaultChecked={cfg.modelo === id}
                  className="mt-0.5 accent-[#ff6b00]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900">{nombre}</span>
                  <span className="block text-xs text-neutral-500">{nota}</span>
                  <code className="mt-0.5 block font-mono text-[10px] text-neutral-400">{id}</code>
                </span>
              </label>
            ))}
            <button
              type="submit"
              className="mt-1 justify-self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-[#ff6b00] hover:text-[#ff6b00]"
            >
              Guardar modelo
            </button>
          </form>
        </section>

        <p className="mt-5 text-xs text-neutral-400">
          Lo que se guarde aquí manda sobre la configuración del servidor. El archivo del servidor sigue
          sirviendo para que un panel recién instalado arranque sin que nadie lo configure.
        </p>
      </main>
    </>
  );
}
