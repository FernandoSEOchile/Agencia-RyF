import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { clientesDe } from "@/lib/clientes";
import { db } from "@/lib/db";
import Barra from "@/components/Barra";
import Errores, { type Fallo } from "@/components/Errores";
import Revisar from "@/components/Revisar";

export const metadata = { title: "Fallos · Panel AppSEO" };
export const dynamic = "force-dynamic";

/** Cuánto se mira hacia atrás. Más de una semana ya es arqueología. */
const DIAS = 7;

export default async function PaginaErrores() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  // Solo los sitios a los que llega quien mira. Un fallo es información del
  // cliente, y quien no ve el cliente tampoco ve lo que le pasó.
  const clientes = await clientesDe(sesion.user.id, rol);
  const ids = clientes.map((c) => c.id);
  const nombre = new Map(clientes.map((c) => [c.id, c.nombre]));

  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);

  const [revisiones, anotados] = await Promise.all([
    db.revision.findMany({
      where: {
        clienteId: { in: ids },
        creado: { gte: desde },
        OR: [{ webOk: false }, { conectorOk: false }],
      },
      orderBy: { creado: "desc" },
      take: 200,
    }),
    db.registro.findMany({
      where: {
        clienteId: { in: ids },
        creado: { gte: desde },
        resultado: { not: "ok" },
      },
      orderBy: { creado: "desc" },
      take: 200,
      include: { usuario: { select: { nombre: true } } },
    }),
  ]);

  const fallos: Fallo[] = [
    ...revisiones.map((r) => ({
      id: r.id,
      cuando: r.creado.toISOString(),
      origen: "vigia" as const,
      cliente: nombre.get(r.clienteId) ?? "—",
      que: !r.webOk ? "web caída" : "conector",
      detalle: r.detalle ?? "Sin detalle.",
    })),
    ...anotados.map((a) => ({
      id: a.id,
      cuando: a.creado.toISOString(),
      origen: "herramienta" as const,
      cliente: a.clienteId ? (nombre.get(a.clienteId) ?? "—") : "—",
      que: a.accion,
      detalle: `${a.resumen}${a.usuario?.nombre ? ` · ${a.usuario.nombre}` : ""}`,
    })),
  ];

  async function salir() {
    "use server";
    await signOut({ redirectTo: "/entrar" });
  }

  const sitiosCaidos = new Set(
    revisiones.filter((r) => !r.webOk).map((r) => r.clienteId)
  ).size;

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

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Fallos</h1>
            <p className="mt-1 text-[15px] text-[color:var(--tinta-media)]">
              Los últimos {DIAS} días
              {fallos.length > 0 && ` · ${fallos.length} anotados`}
              {sitiosCaidos > 0 && (
                <span className="text-red-600">
                  {" "}
                  · {sitiosCaidos} {sitiosCaidos === 1 ? "sitio se cayó" : "sitios se cayeron"}
                </span>
              )}
            </p>
          </div>

          {rol !== "LECTOR" && <Revisar />}
        </div>

        <Errores fallos={fallos} />
      </main>
    </>
  );
}
