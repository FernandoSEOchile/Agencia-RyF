import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cifrar, cifradoListo } from "@/lib/cifrado";
import { leerCadena, dominioDe, salud } from "@/lib/conector";
import { salud as saludShopify } from "@/lib/shopify";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";

export const metadata = { title: "Conectar sitio · AppSEO" };

export default async function NuevoCliente({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");
  const rolSesion = (sesion.user as { rol?: string }).rol;
  if (rolSesion !== "ADMIN" && rolSesion !== "GESTOR") redirect("/panel");

  const { error } = await searchParams;
  const listo = cifradoListo();

  /**
   * Alta de una tienda Shopify.
   *
   * Shopify no permite instalar nada dentro de la tienda, así que en vez de una
   * cadena que genera un plugin, aquí se pega el token de una «app
   * personalizada» que el propio dueño crea en su admin. El efecto es el mismo:
   * una credencial que el panel guarda cifrada y comprueba antes de aceptar.
   */
  async function conectarShopify(datos: FormData) {
    "use server";

    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || (rolAccion !== "ADMIN" && rolAccion !== "GESTOR")) redirect("/entrar");

    const nombre = String(datos.get("nombre") || "").trim();
    const token = String(datos.get("token") || "").trim();
    const tienda = String(datos.get("tienda") || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    const fallar = (m: string) =>
      redirect("/panel/clientes/nuevo?error=" + encodeURIComponent(m));

    if (!/\.myshopify\.com$/.test(tienda)) {
      fallar("El dominio debe terminar en .myshopify.com. Lo encuentras en la barra del admin de la tienda.");
    }
    if (!token) fallar("Falta el token de acceso de la app.");

    // Se comprueba contra la tienda ANTES de guardar: un cliente que aparece
    // en la lista con una credencial que no sirve es peor que no tenerlo.
    let info;
    try {
      info = await saludShopify({ dominio: tienda, token });
    } catch (e) {
      fallar(e instanceof Error ? e.message : "La tienda no aceptó el token.");
    }

    // El dominio público es el que ve Google y con el que se cotejan las URLs;
    // el .myshopify.com es solo la puerta de la API.
    const publico = dominioDe(info!.url);

    const cliente = await db.cliente.upsert({
      where: { dominio: publico },
      update: {
        plataforma: "shopify",
        tienda,
        secreto: cifrar(token),
        activo: true,
        version: info!.version,
        soloLectura: false,
        ultimaSonda: new Date(),
        estadoSonda: "ok",
      },
      create: {
        nombre: nombre || info!.nombre || publico,
        dominio: publico,
        plataforma: "shopify",
        tienda,
        secreto: cifrar(token),
        version: info!.version,
        soloLectura: false,
        ultimaSonda: new Date(),
        estadoSonda: "ok",
      },
    });

    await anotar({
      usuarioId: s.user.id,
      clienteId: cliente.id,
      accion: "cliente_conectar",
      resumen: `${publico} conectado · Shopify (${tienda})`,
    });

    redirect(`/panel/clientes/${cliente.id}`);
  }

  async function conectar(datos: FormData) {
    "use server";

    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || (rolAccion !== "ADMIN" && rolAccion !== "GESTOR")) redirect("/entrar");

    const cadena = String(datos.get("cadena") || "");
    const nombre = String(datos.get("nombre") || "").trim();

    let cfg;
    try {
      cfg = leerCadena(cadena);
    } catch (e) {
      redirect("/panel/clientes/nuevo?error=" + encodeURIComponent((e as Error).message));
    }

    // Se comprueba contra el sitio ANTES de guardar. Un cliente que aparece en
    // la lista pero cuya credencial no sirve es peor que no tenerlo.
    const prueba = await salud({ urlRest: cfg.rest, keyId: cfg.key_id, secreto: cfg.secret });
    if (!prueba.ok) {
      redirect(
        "/panel/clientes/nuevo?error=" +
          encodeURIComponent(
            "El sitio no aceptó la credencial: " + (prueba.mensaje || prueba.codigo || `HTTP ${prueba.estado}`)
          )
      );
    }

    const dominio = dominioDe(cfg.site);

    const cliente = await db.cliente.upsert({
      where: { dominio },
      update: {
        urlRest: cfg.rest,
        keyId: cfg.key_id,
        secreto: cifrar(cfg.secret),
        activo: true,
        version: prueba.datos?.conector,
        soloLectura: prueba.datos?.solo_lectura,
        ultimaSonda: new Date(),
        estadoSonda: "ok",
      },
      create: {
        nombre: nombre || dominio,
        dominio,
        plataforma: "wordpress",
        urlRest: cfg.rest,
        keyId: cfg.key_id,
        secreto: cifrar(cfg.secret),
        version: prueba.datos?.conector,
        soloLectura: prueba.datos?.solo_lectura,
        ultimaSonda: new Date(),
        estadoSonda: "ok",
      },
    });

    await anotar({
      usuarioId: s.user.id,
      clienteId: cliente.id,
      accion: "cliente_conectar",
      resumen: `${dominio} conectado · conector v${prueba.datos?.conector}`,
    });

    redirect(`/panel/clientes/${cliente.id}`);
  }

  return (
    <>
      <Barra usuario={sesion.user.name} rol={rolSesion} />
      <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/panel" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
        ← Clientes
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900">Conectar un sitio</h1>
      <p className="mt-2 text-sm text-neutral-500">
        En el WordPress del cliente: AppSEO → Conexión, y copia la cadena completa.
      </p>

      {!listo && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Falta <code className="font-mono text-xs">APPSEO_CLAVE_CIFRADO</code> en el entorno. Sin ella no se
          pueden guardar credenciales.
        </p>
      )}

      {error && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form action={conectar} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Nombre del cliente <span className="normal-case text-neutral-400">(opcional)</span>
          </span>
          <input
            name="nombre"
            placeholder="Beepromo"
            className="rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Cadena de conexión</span>
          <textarea
            name="cadena"
            required
            rows={5}
            spellCheck={false}
            placeholder="appseo_eyJ2IjoxLCJzaXRlIjoi..."
            className="rounded-lg border border-neutral-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
          />
          <span className="text-xs text-neutral-500">
            Se comprueba contra el sitio antes de guardarla, y se almacena cifrada.
          </span>
        </label>

        <button type="submit" disabled={!listo} className="boton-fuerte mt-2">
          Comprobar y conectar
        </button>
      </form>

      <hr className="my-10 border-[color:var(--linea)]" />

      <h2 className="text-[17px] font-semibold">Conectar una tienda Shopify</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
        Shopify no deja instalar plugins, así que en vez de una cadena se pega el token de una app
        personalizada. En el admin de la tienda: <strong>Configuración → Apps y canales de venta →
        Desarrollar apps → Crear una app</strong>. Dale permisos de lectura y escritura sobre
        productos y contenido, instálala, y copia el token de acceso de la API de Admin.
      </p>

      <form action={conectarShopify} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="rotulo">
            Nombre del cliente <span className="font-normal normal-case">(opcional)</span>
          </span>
          <input
            name="nombre"
            placeholder="Mi Tienda"
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[13px] outline-none transition focus:border-[color:var(--acento)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Dominio de la tienda</span>
          <input
            name="tienda"
            required
            spellCheck={false}
            placeholder="mitienda.myshopify.com"
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 font-mono text-[12px] outline-none transition focus:border-[color:var(--acento)]"
          />
          <span className="text-[12px] text-[color:var(--tinta-suave)]">
            El interno, el que sale en la barra del admin. El dominio público se detecta solo.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="rotulo">Token de acceso de la API de Admin</span>
          <input
            name="token"
            type="password"
            required
            spellCheck={false}
            placeholder="shpat_…"
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 font-mono text-[12px] outline-none transition focus:border-[color:var(--acento)]"
          />
          <span className="text-[12px] text-[color:var(--tinta-suave)]">
            Shopify solo lo enseña una vez, al instalar la app. Se comprueba contra la tienda antes de
            guardarlo, y se almacena cifrado.
          </span>
        </label>

        <button type="submit" disabled={!listo} className="boton-fuerte mt-2">
          Comprobar y conectar
        </button>
      </form>
      </main>
    </>
  );
}
