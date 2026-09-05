import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cifrar, cifradoListo } from "@/lib/cifrado";
import { leerCadena, dominioDe, salud } from "@/lib/conector";
import { anotar } from "@/lib/clientes";
import Barra from "@/components/Barra";
import { IconoWordPress, IconoShopify, IconoDominio } from "@/components/Plataforma";
import { conectarSitio, crearSoloDominio } from "@/lib/conectarSitio";
import { costeMedioExploracion } from "@/lib/exploracion";
import { dinero } from "@/lib/formato";

export const metadata = { title: "Conectar sitio · AppSEO" };

export default async function NuevoCliente({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel/clientes/nuevo"));
  const rolSesion = (sesion.user as { rol?: string }).rol;
  if (rolSesion !== "ADMIN" && rolSesion !== "GESTOR") redirect("/panel");

  const { error } = await searchParams;
  const listo = cifradoListo();
  const costeExploracion = await costeMedioExploracion();


  return (
    <>
      <Barra usuarioId={sesion.user?.id} usuario={sesion.user.name} rol={rolSesion} />
      <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/panel" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
        ← Clientes
      </Link>

      <h1 className="mt-4 text-[30px] font-bold leading-tight">Conectar un sitio</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
        Hay tres formas. Con el plugin de WordPress o con la app de Shopify el asistente puede leer y
        escribir en el sitio. Solo con el dominio no se instala nada y se puede medir todo lo demás:
        posiciones, Search Console, IA, rastreo técnico, backlinks, SEO local y bitácora.
      </p>

      <h2 className="mt-8 flex items-center gap-2 text-[17px] font-semibold">
        <IconoWordPress tam={20} />
        WordPress o WooCommerce
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
        En el escritorio del cliente: <strong>AppSEO → Conexión</strong>, y copia la cadena completa.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
        Sirve también para <strong>reconectar un sitio que ya está aquí</strong>: si el dominio
        coincide, se actualiza la credencial de ese cliente en vez de crear uno nuevo, y no se
        pierde nada de lo que ya tenía.
      </p>

      {!listo && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Falta <code className="font-mono text-[13px]">APPSEO_CLAVE_CIFRADO</code> en el entorno. Sin ella no se
          pueden guardar credenciales.
        </p>
      )}

      {error && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <h2 className="mt-8 flex items-center gap-2 text-[17px] font-semibold">
        <IconoDominio tam={20} />
        Solo el dominio
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
        Para un prospecto, un sitio que no es WordPress ni Shopify, o un cliente al que todavía no se
        le va a tocar nada. No se instala nada y el alta es gratis; explorar el dominio es opcional y
        cuesta unos centavos. Si más adelante se conecta el plugin o Shopify, el cliente se convierte
        sin perder el histórico.
      </p>
      <form action={crearSoloDominio} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="rotulo">Nombre <span className="normal-case tracking-normal text-[color:var(--tinta-suave)]">(opcional)</span></span>
          <input
            name="nombre"
            placeholder="Aguas del Sur"
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[color:var(--acento)]"
          />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="rotulo">Dominio</span>
          <input
            name="dominio"
            required
            spellCheck={false}
            placeholder="aguasdelsur.cl"
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 font-mono text-[13px] outline-none transition focus:border-[color:var(--acento)]"
          />
        </label>
        <label className="flex w-full items-start gap-2 text-[13px] text-[color:var(--tinta-media)]">
          <input type="checkbox" name="explorar" value="1" className="mt-0.5 accent-[color:var(--acento)]" />
          <span>
            Explorar el dominio al darlo de alta · ≈ {dinero(costeExploracion)}. Trae las palabras por las que ya
            posiciona, su tráfico estimado y sus rivales, para empezar con datos en vez de en blanco.
          </span>
        </label>
        <button type="submit" className="boton-fuerte">
          Dar de alta
        </button>
      </form>

      <hr className="my-10 border-[color:var(--linea)]" />

      <form action={conectarSitio} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">
            Nombre del cliente <span className="normal-case text-neutral-400">(opcional)</span>
          </span>
          <input
            name="nombre"
            placeholder="Beepromo"
            className="rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">Cadena de conexión</span>
          <textarea
            name="cadena"
            required
            rows={5}
            spellCheck={false}
            placeholder="appseo_eyJ2IjoxLCJzaXRlIjoi..."
            className="rounded-lg border border-neutral-200 px-3 py-2.5 font-mono text-[13px] outline-none focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
          />
          <span className="text-[13px] text-neutral-500">
            Se comprueba contra el sitio antes de guardarla, y se almacena cifrada.
          </span>
        </label>

        <label className="flex items-start gap-2 text-[13px] text-[color:var(--tinta-media)]">
          <input type="checkbox" name="explorar" value="1" className="mt-0.5 accent-[color:var(--acento)]" />
          <span>
            Explorar el dominio si el cliente es nuevo · ≈ {dinero(costeExploracion)}. Al reconectar uno que ya existe no se explora ni se cobra. Trae las palabras por las que ya
            posiciona, su tráfico estimado y sus rivales, para empezar con datos en vez de en blanco.
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
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
        Aquí no se instala nada dentro de la tienda: Shopify no lo permite. Escribes su dominio, te
        lleva a Shopify a autorizar la app <strong>AppSEO</strong>, y al volver la tienda ya está
        conectada. El permiso lo da quien administra la tienda, y puede retirarlo desde su propio
        panel cuando quiera.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
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
            className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2.5 font-mono text-[13px] outline-none transition focus:border-[color:var(--acento)]"
          />
          <span className="text-[13px] text-[color:var(--tinta-suave)]">
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
