import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import { carteraLocal } from "@/lib/carteraLocal";
import CarteraLocal from "@/components/CarteraLocal";

export const metadata = { title: "Local · Panel AppSEO" };
export const dynamic = "force-dynamic";

/**
 * El módulo Local: el SEO local de todos los clientes en una pantalla.
 *
 * Cada cliente ya tiene su pestaña Local con la ficha de Google Business y la
 * cuadrícula; lo que faltaba era verlo de todos a la vez, para saber a quién
 * le toca una auditoría o a quién le está ganando la calle un vecino sin
 * abrir doce fichas.
 */
export default async function Local() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel/local"));

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const clientes = await clientesDe(sesion.user.id, rol);
  const filas = await carteraLocal(clientes);

  const conFicha = filas.filter((f) => f.ficha).length;
  const conMapa = filas.filter((f) => f.barrido).length;
  const enPaquete = filas.filter((f) => f.barrido && f.barrido.enTop3 >= 50).length;
  const sinNada = filas.filter((f) => !f.ficha && !f.barrido).length;

  return (
    <main className="contenedor py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight">Local</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-[color:var(--tinta-media)]">
            Cómo va cada cliente en las búsquedas con mapa: su ficha de Google Business y en cuántos
            puntos de su zona sale entre los tres primeros.
          </p>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-20 text-center">
          <p className="text-[15px] font-medium">Todavía no hay clientes aquí.</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-[color:var(--tinta-media)]">
            Cuando haya clientes, aquí se verá su SEO local de un vistazo.
          </p>
        </div>
      ) : (
        <>
          <dl className="tarjeta mt-6 grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4 [&>*]:ring-1 [&>*]:ring-[color:var(--linea)]">
            {[
              { k: "Con ficha auditada", v: conFicha, de: filas.length },
              { k: "Con cuadrícula medida", v: conMapa, de: filas.length },
              { k: "En el paquete de tres", v: enPaquete, de: conMapa, pie: "en más de la mitad de su zona" },
              { k: "Sin nada medido", v: sinNada, de: filas.length },
            ].map((c) => (
              <div key={c.k} className="bg-[color:var(--panel)] px-5 py-4">
                <dt className="rotulo">{c.k}</dt>
                <dd className="mt-1.5 cifra text-[28px] leading-none">
                  {c.v}
                  <span className="ml-1.5 text-[14px] font-normal text-[color:var(--tinta-media)]">de {c.de}</span>
                </dd>
                {c.pie && <dd className="mt-1.5 text-[13px] text-[color:var(--tinta-suave)]">{c.pie}</dd>}
              </div>
            ))}
          </dl>

          <CarteraLocal filas={filas} />

          <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-[color:var(--tinta-suave)]">
            Todo sale de lo ya medido en la pestaña Local de cada cliente: auditar una ficha o lanzar
            una cuadrícula se hace desde ahí, viendo lo que cuesta. Las variaciones comparan con la
            auditoría o el barrido anterior de la misma búsqueda.{" "}
            <Link href="/panel" className="underline-offset-4 hover:underline">
              Volver a la cartera
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
