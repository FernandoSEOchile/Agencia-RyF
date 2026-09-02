import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";
import { db } from "@/lib/db";
import {
  MODELOS,
  estadoConfig,
  guardarClaveApi,
  borrarClaveApi,
  guardarModelo,
  guardarEspacioTrabajo,
  espacioTrabajo,
} from "@/lib/config";
import { credenciales, guardarCredenciales, borrarCredenciales, saldo, estadoCuenta } from "@/lib/dataforseo";
import { aplicacion, urlRedireccion } from "@/lib/gsc";

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
  const dfs = await credenciales();
  const cuenta = await estadoCuenta();
  const gsc = await aplicacion();
  const cuentasGsc = await db.conexionGoogle.findMany({
    select: { correo: true, creado: true, _count: { select: { clientes: true } } },
    orderBy: { creado: "asc" },
  });
  async function guardarDataForSeo(datos: FormData) {
    "use server";
    const s = await exigirAdmin();
    const login = String(datos.get("dfsLogin") || "").trim();
    const clave = String(datos.get("dfsClave") || "").trim();
    const pruebas = datos.get("dfsPruebas") === "si";

    if (!login || !clave) {
      redirect("/panel/ajustes?error=" + encodeURIComponent("Faltan el usuario o la contraseña."));
    }

    // Se comprueban antes de guardarlas: unas credenciales malas guardadas en
    // silencio se descubren cuando alguien intenta medir y no entiende el fallo.
    let mensaje: string;
    try {
      const c = await saldo({ login, clave, pruebas });
      mensaje = `DataForSEO conectado. Saldo: ${c.dinero.toFixed(2)} ${c.moneda}.`;
    } catch (e) {
      redirect(
        "/panel/ajustes?error=" +
          encodeURIComponent(e instanceof Error ? e.message : "No se pudo conectar con DataForSEO.")
      );
    }

    await guardarCredenciales(login, clave, pruebas);
    await anotar({ usuarioId: s.user!.id, accion: "ajustes", resumen: "Credenciales de DataForSEO guardadas" });
    redirect("/panel/ajustes?ok=" + encodeURIComponent(mensaje));
  }

  async function quitarDataForSeo() {
    "use server";
    const s = await exigirAdmin();
    await borrarCredenciales();
    await anotar({ usuarioId: s.user!.id, accion: "ajustes", resumen: "Credenciales de DataForSEO borradas" });
    redirect("/panel/ajustes?ok=" + encodeURIComponent("DataForSEO desconectado."));
  }

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

    // Se prueba contra la API antes de dejarla puesta, pero lo que se comprueba
    // es si AUTENTICA, no si esta consulta concreta funciona.
    //
    // Las claves ligadas a identidad responden 400 pidiendo un identificador de
    // espacio de trabajo que aquí no viene al caso: la clave es buena y la
    // petición es la que está incompleta. Y un 400 por saldo agotado también
    // significa que la clave sirve. Rechazar por el código de estado dejaba
    // fuera claves perfectamente válidas.
    const espacio = await espacioTrabajo();
    const r = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": clave,
        "anthropic-version": "2023-06-01",
        ...(espacio ? { "anthropic-workspace-id": espacio } : {}),
      },
    }).catch(() => null);

    if (!r) {
      redirect("/panel/ajustes?error=" + encodeURIComponent("No se pudo contactar con la API para comprobarla."));
    }

    if (r.status === 401 || r.status === 403) {
      redirect(
        "/panel/ajustes?error=" +
          encodeURIComponent("Esa clave no es válida o fue revocada. Genera otra en console.anthropic.com.")
      );
    }

    // Si ya sabemos que no hay saldo, mejor decirlo al guardar que dejar que
    // lo descubra en mitad de una conversación.
    const cuerpo = r.status === 200 ? "" : await r.text().catch(() => "");
    const sinSaldo = /credit balance is too low/i.test(cuerpo);
    const faltaEspacio = /anthropic-workspace-id is required/i.test(cuerpo);

    await guardarClaveApi(clave);
    await anotar({
      usuarioId: s.user!.id!,
      accion: "ajustes",
      resumen: `Clave de API actualizada (…${clave.slice(-4)})`,
    });
    redirect(
      "/panel/ajustes?ok=" +
        encodeURIComponent(
          faltaEspacio
            ? "Clave guardada, pero es de las que exigen un espacio de trabajo. Rellena el campo de abajo con su identificador o el chat seguirá fallando."
            : sinSaldo
              ? "Clave guardada. Ojo: la cuenta no tiene saldo, así que el chat seguirá fallando hasta que recargues."
              : "Clave guardada y comprobada."
        )
    );
  }

  async function quitarClave() {
    "use server";
    const s = await exigirAdmin();
    await borrarClaveApi();
    await anotar({ usuarioId: s.user!.id!, accion: "ajustes", resumen: "Clave de API borrada del panel" });
    redirect("/panel/ajustes?ok=" + encodeURIComponent("Clave borrada. Se vuelve a usar la del servidor, si la hay."));
  }

  async function cambiarEspacio(datos: FormData) {
    "use server";
    const s = await exigirAdmin();
    const v = String(datos.get("espacio") || "").trim();
    try {
      await guardarEspacioTrabajo(v);
    } catch (e) {
      redirect(
        "/panel/ajustes?error=" + encodeURIComponent(e instanceof Error ? e.message : "Valor no válido.")
      );
    }
    await anotar({
      usuarioId: s.user!.id!,
      accion: "ajustes",
      resumen: v ? `Espacio de trabajo: ${v}` : "Espacio de trabajo borrado",
    });
    redirect("/panel/ajustes?ok=" + encodeURIComponent(v ? "Espacio de trabajo guardado." : "Espacio de trabajo borrado."));
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

        <h1 className="text-[30px] font-semibold leading-tight">Ajustes</h1>
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

        {/* --- Espacio de trabajo --- */}
        <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Espacio de trabajo</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Solo hace falta si tu clave es de las que van ligadas a una identidad: esas rechazan cualquier
            petición que no diga en qué espacio actúa, aunque la clave sea válida y haya saldo. Lo
            encuentras en la URL de la consola de Anthropic al entrar en el espacio, o en sus ajustes.
          </p>

          <form action={cambiarEspacio} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Identificador <span className="normal-case text-neutral-400">(vacío para no enviarlo)</span>
              </span>
              <input
                name="espacio"
                defaultValue={cfg.espacio}
                placeholder="wrkspc_…"
                className="rounded-lg border border-neutral-200 px-3 py-2 font-mono text-xs outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-[#ff6b00] hover:text-[#ff6b00]"
            >
              Guardar
            </button>
          </form>
        </section>

        {/* --- Search Console --- */}
        <section className="tarjeta mt-5 p-5">
          <h2 className="text-[15px] font-semibold">Search Console</h2>
          <p className="mt-1 text-[13px] text-[color:var(--tinta-media)]">
            Las posiciones reales de lo que cada sitio ya posiciona, gratis y directamente de Google.
            La aplicación de Google se configura en el servidor y no aquí: es la misma para todo el
            panel y no cambia nunca. Cada persona autoriza su cuenta desde la ficha del cliente.
          </p>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            {gsc ? (
              <>
                <span className="pastilla bg-emerald-50 text-emerald-700">activo</span>
                <span className="break-all font-mono text-[12px] text-[color:var(--tinta-media)]">
                  {gsc.id}
                </span>
              </>
            ) : (
              <span className="pastilla bg-amber-50 text-amber-700">sin configurar en el servidor</span>
            )}
          </p>

          {!gsc && (
            <p className="mt-3 rounded-xl bg-black/[0.03] px-4 py-3 text-[12px] leading-relaxed text-[color:var(--tinta-media)]">
              Faltan <code className="font-mono">GSC_CLIENT_ID</code> y{" "}
              <code className="font-mono">GSC_CLIENT_SECRET</code> en el entorno del servidor.
            </p>
          )}

          <div className="mt-3 rounded-xl bg-black/[0.03] px-4 py-3">
            <p className="rotulo">URI de redirección autorizada en Google</p>
            <p className="mt-1 break-all font-mono text-[12px]">{urlRedireccion()}</p>
          </div>

          {cuentasGsc.length > 0 && (
            <div className="mt-5 border-t border-[color:var(--linea)] pt-4">
              <p className="rotulo">Cuentas de Google autorizadas</p>
              <ul className="mt-2 divide-y divide-[color:var(--linea)]">
                {cuentasGsc.map((c) => (
                  <li key={c.correo} className="flex flex-wrap items-baseline gap-2 py-2 text-[13px]">
                    <span className="font-mono text-[12px]">{c.correo}</span>
                    <span className="text-[12px] text-[color:var(--tinta-suave)]">
                      {c._count.clientes} {c._count.clientes === 1 ? "cliente" : "clientes"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* --- DataForSEO --- */}
        <section className="tarjeta mt-5 p-5">
          <h2 className="text-[15px] font-semibold">Posiciones en Google · DataForSEO</h2>
          <p className="mt-1 text-[13px] text-[color:var(--tinta-media)]">
            Mide en qué puesto aparece cada cliente para las consultas que le sigas. Se paga por
            consulta, con saldo prepagado. El gasto real lo ves aquí abajo, leído de su cuenta. Las
            credenciales son las de su panel, no las de tu correo.
          </p>

          {dfs ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="pastilla bg-emerald-50 text-emerald-700">conectado</span>
              <span className="font-mono text-[12px] text-[color:var(--tinta-media)]">{dfs.login}</span>
              {dfs.pruebas && (
                <span className="pastilla bg-amber-50 text-amber-700">modo de pruebas</span>
              )}
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">Sin conectar.</p>
          )}

          {/* El gasto se lee del propio proveedor, no de lo que anotamos: si
              nuestra cuenta y la suya no coinciden, hay que verlo. */}
          {cuenta && (
            <dl className="mt-4 grid grid-cols-3 divide-x divide-[color:var(--linea)] overflow-hidden rounded-xl border border-[color:var(--linea)]">
              {[
                ["Saldo", `${cuenta.dinero.toFixed(2)} ${cuenta.moneda}`],
                ["Depositado", `${cuenta.depositado.toFixed(2)}`],
                ["Gastado", `${cuenta.gastado.toFixed(3)}`],
              ].map(([k, v]) => (
                <div key={k} className="px-4 py-3">
                  <dt className="rotulo">{k}</dt>
                  <dd className="mt-1 text-[17px] font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <form action={guardarDataForSeo} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <span className="rotulo">Usuario</span>
              <input
                name="dfsLogin"
                defaultValue={dfs?.login ?? ""}
                placeholder="correo@ejemplo.com"
                className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
              />
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <span className="rotulo">Contraseña de la API</span>
              <input
                name="dfsClave"
                type="password"
                placeholder="••••••••"
                className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-[13px] text-[color:var(--tinta-media)]">
              <input type="checkbox" name="dfsPruebas" value="si" defaultChecked={dfs?.pruebas ?? false} />
              Modo de pruebas
            </label>
            <button type="submit" className="boton-fuerte">
              Comprobar y guardar
            </button>
          </form>

          <p className="mt-2 text-[12px] text-[color:var(--tinta-suave)]">
            El modo de pruebas usa su entorno gratuito: devuelve datos falsos con la forma real, sirve
            para verificar que todo funciona sin gastar saldo.
          </p>

          {dfs && (
            <form action={quitarDataForSeo} className="mt-3 border-t border-[color:var(--linea)] pt-3">
              <button className="text-[12px] text-[color:var(--tinta-suave)] transition hover:text-red-600">
                Desconectar DataForSEO
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
