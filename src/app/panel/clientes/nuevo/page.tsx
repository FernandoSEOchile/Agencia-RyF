import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cifrar, cifradoListo } from "@/lib/cifrado";
import { leerCadena, dominioDe, salud } from "@/lib/conector";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";
import { IconoWordPress, IconoShopify } from "@/components/Plataforma";
import { conectarSitio } from "@/lib/conectarSitio";

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


  return (
    <>
      <Barra usuarioId={sesion.user?.id} usuario={sesion.user.name} rol={rolSesion} />
      <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/panel" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
        ← Clientes
      </Link>

      <h1 className="mt-4 text-[30px] font-semibold leading-tight">Conectar un sitio</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
        WordPress y Shopify se conectan distinto porque funcionan distinto: en WordPress se instala un
        plugin que genera una cadena, y en Shopify no se instala nada dentro de la tienda —se autoriza
        una app desde fuera.
      </p>

      <h2 className="mt-8 flex items-center gap-2 text-[17px] font-semibold">
        <IconoWordPress tam={20} />
        WordPress o WooCommerce
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
        En el escritorio del cliente: <strong>AppSEO → Conexión</strong>, y copia la cadena completa.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
        Sirve también para <strong>reconectar un sitio que ya está aquí</strong>: si el dominio
        coincide, se actualiza la credencial de ese cliente en vez de crear uno nuevo, y no se
        pierde nada de lo que ya tenía.
      </p>

      {!listo && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Falta <code className="font-mono text-xs">APPSEO_CLAVE_CIFRADO</code> en el entorno. Sin ella no se
          pueden guardar credenciales.
        </p>
      )}

      {error && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form action={conectarSitio} className="mt-8 flex flex-col gap-4">
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

      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <IconoShopify tam={20} />
        Shopify
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
        Aquí no se instala nada dentro de la tienda: Shopify no lo permite. Escribes su dominio, te
        lleva a Shopify a autorizar la app <strong>AppSEO</strong>, y al volver la tienda ya está
        conectada. El permiso lo da quien administra la tienda, y puede retirarlo desde su propio
        panel cuando quiera.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--tinta-media)]">
        No hay que copiar ningún token: lo recibe el panel directamente y se guarda cifrado. Si la
        tienda no es tuya, mándale este mismo enlace al cliente y que lo autorice él.
      </p>

      <form action="/api/shopify/instalar" method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
          <span className="rotulo">Dominio de la tienda</span>
          <input
            name="shop"
            required
            spellCheck={false}
            placeholder="mitienda.myshopify.com"
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 font-mono text-[12px] outline-none transition focus:border-[color:var(--acento)]"
          />
          <span className="text-[12px] text-[color:var(--tinta-suave)]">
            El interno, el que sale en la barra del admin de Shopify. Su dominio público —el que ve
            Google— se detecta solo.
          </span>
        </label>

        <button type="submit" disabled={!listo} className="boton-fuerte">
          Autorizar en Shopify
        </button>
      </form>

      </main>
    </>
  );
}
