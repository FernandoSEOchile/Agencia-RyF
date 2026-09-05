import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { porDia } from "@/lib/gsc";
import { CATEGORIAS, mesLegible, mesDe } from "@/lib/bitacora";
import { fecha, miles } from "@/lib/formato";

/**
 * El informe que ve el cliente final, por enlace.
 *
 * La bitácora solo se copiaba como texto o se imprimía; no había forma de
 * darle al cliente un enlace. Esta página es pública para quien tenga la
 * ficha —un token largo que se crea y se revoca desde Datos—, no lleva
 * barra ni sesión, y enseña solo lo que un cliente debe ver: qué se hizo
 * este mes y el anterior, y cómo van los clics. Nada de gasto, nada de
 * herramientas.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Informe", robots: { index: false, follow: false } };

export default async function Informe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,64}$/.test(token)) notFound();

  const cliente = await db.cliente.findFirst({
    where: { tokenInforme: token, activo: true },
    select: { id: true, nombre: true, dominio: true, gscConexionId: true, gscPropiedad: true },
  });
  if (!cliente) notFound();

  const ahora = new Date();
  const mesActual = mesDe(ahora);
  const mesAnterior = mesDe(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1));

  const entradas = await db.bitacora.findMany({
    where: { clienteId: cliente.id, mes: { in: [mesActual, mesAnterior] } },
    orderBy: [{ mes: "desc" }, { creado: "asc" }],
    select: { mes: true, categoria: true, titulo: true, detalle: true },
  });

  let trafico: { clics: number; impresiones: number; posicion: number | null; anterior: number | null } | null = null;
  if (cliente.gscConexionId && cliente.gscPropiedad) {
    try {
      const dias = await porDia(cliente.gscConexionId, cliente.gscPropiedad, 56);
      const corte = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
      const ult = dias.filter((d) => d.fecha >= corte);
      const ant = dias.filter((d) => d.fecha < corte);
      const suma = (v: typeof dias) => v.reduce((t, d) => t + d.clics, 0);
      trafico = {
        clics: suma(ult),
        impresiones: ult.reduce((t, d) => t + d.impresiones, 0),
        posicion: ult.length ? Math.round((ult.reduce((t, d) => t + d.posicion, 0) / ult.length) * 10) / 10 : null,
        anterior: ant.length ? suma(ant) : null,
      };
    } catch {
      trafico = null;
    }
  }

  const categoria = (id: string) => CATEGORIAS.find((c) => c[0] === id)?.[1] ?? id;
  const meses = [mesActual, mesAnterior].filter((m) => entradas.some((e) => e.mes === m));

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="rotulo">Informe de trabajo SEO</p>
      <h1 className="mt-1 text-[30px] font-bold leading-tight">{cliente.nombre}</h1>
      <p className="mt-1 text-[14px] text-[color:var(--tinta-media)]">
        {cliente.dominio} · actualizado {fecha(ahora)}
      </p>

      {trafico && (
        <dl className="tarjeta mt-8 grid grid-cols-3 divide-x divide-[color:var(--linea)] overflow-hidden">
          <div className="px-5 py-4">
            <dt className="rotulo">Clics desde Google</dt>
            <dd className="mt-1 text-[26px] cifra font-semibold tabular-nums">{miles(trafico.clics)}</dd>
            {trafico.anterior !== null && trafico.anterior > 0 && (
              <p className={`text-[13px] tabular-nums ${trafico.clics >= trafico.anterior ? "text-emerald-700" : "text-red-600"}`}>
                {trafico.clics >= trafico.anterior ? "▲" : "▼"} {Math.abs(Math.round(((trafico.clics - trafico.anterior) / trafico.anterior) * 100))}% vs. 28 días antes
              </p>
            )}
          </div>
          <div className="px-5 py-4">
            <dt className="rotulo">Veces que apareció</dt>
            <dd className="mt-1 text-[26px] cifra font-semibold tabular-nums">{miles(trafico.impresiones)}</dd>
            <p className="text-[13px] text-[color:var(--tinta-suave)]">últimos 28 días</p>
          </div>
          <div className="px-5 py-4">
            <dt className="rotulo">Posición media</dt>
            <dd className="mt-1 text-[26px] cifra font-semibold tabular-nums">{trafico.posicion ?? "—"}</dd>
            <p className="text-[13px] text-[color:var(--tinta-suave)]">en Google</p>
          </div>
        </dl>
      )}

      {meses.length === 0 ? (
        <p className="mt-10 text-[14px] text-[color:var(--tinta-media)]">Todavía no hay trabajo anotado este mes.</p>
      ) : (
        meses.map((m) => (
          <section key={m} className="mt-10">
            <h2 className="text-[18px] font-semibold">{mesLegible(m)}</h2>
            <ul className="mt-3 divide-y divide-[color:var(--linea)]">
              {entradas
                .filter((e) => e.mes === m)
                .map((e, i) => (
                  <li key={i} className="py-3">
                    <p className="text-[14px] font-medium">
                      {e.titulo}
                      <span className="ml-2 pastilla bg-black/[0.05] text-[color:var(--tinta-media)]">{categoria(e.categoria)}</span>
                    </p>
                    {e.detalle && <p className="mt-0.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">{e.detalle}</p>}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}

      <p className="mt-14 border-t border-[color:var(--linea)] pt-4 text-[13px] text-[color:var(--tinta-suave)]">
        Preparado por Agencia RYF con AppSEO. Este enlace es privado: no lo compartas fuera de tu empresa.
      </p>
    </main>
  );
}
