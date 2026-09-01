import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, sondear, anotar, veTodo } from "@/lib/clientes";
import FichaCliente, { type Suceso } from "@/components/FichaCliente";
import Barra from "@/components/Barra";

export const dynamic = "force-dynamic";

interface EntradaLog {
  creado: string;
  accion: string;
  resumen: string;
  resultado: string;
}

const corto = (f: string | Date) =>
  (typeof f === "string" ? f : f.toISOString().replace("T", " ")).slice(5, 16);

export default async function Ficha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const { id } = await params;
  const { c } = await searchParams;
  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  const cliente = await db.cliente.findUnique({ where: { id } });
  if (!cliente) notFound();

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId: id } },
    });
    if (!acceso) redirect("/panel");
  }

  const puedeEscribir = rol !== "LECTOR" && cliente.soloLectura === false;

  // Se piden en paralelo y ningún fallo bloquea al resto: un endpoint que la
  // versión instalada del conector no tiene no debe vaciar la ficha entera.
  const [log, productos, terminos, registroPanel, conversaciones] = await Promise.all([
    api<{ entradas: EntradaLog[]; total: number }>(id, "GET", "/log?por_pagina=50").catch(() => null),
    api<{ total: number }>(id, "GET", "/products?pagina=1").catch(() => null),
    api<{ terminos: { seo_bytes: number }[] }>(id, "GET", "/terms?taxonomia=product_cat").catch(() => null),
    db.registro.findMany({
      where: { clienteId: id },
      orderBy: { creado: "desc" },
      take: 50,
      include: { usuario: { select: { nombre: true } } },
    }),
    db.conversacion.findMany({
      where: { clienteId: id, usuarioId: sesion.user.id },
      orderBy: { tocado: "desc" },
      take: 30,
      select: { id: true, titulo: true, tocado: true, _count: { select: { mensajes: true } } },
    }),
  ]);

  // La conversación abierta: la pedida por URL si es de esta persona y este
  // cliente, o la más reciente. Las de otros usuarios no se abren nunca:
  // cada quien tiene sus hilos, como en cualquier chat.
  const conversacion = await db.conversacion.findFirst({
    where: {
      clienteId: id,
      usuarioId: sesion.user.id,
      ...(c ? { id: c } : {}),
    },
    orderBy: { tocado: "desc" },
    include: { mensajes: { orderBy: { creado: "asc" }, take: 60 } },
  });

  const sucesos: Suceso[] = [
    ...(log?.datos?.entradas ?? []).map((e) => ({
      fecha: corto(e.creado),
      accion: e.accion,
      resumen: e.resumen || "—",
      resultado: e.resultado,
      origen: "sitio" as const,
    })),
    ...registroPanel.map((r) => ({
      fecha: corto(r.creado),
      accion: r.accion,
      resumen: r.resumen,
      resultado: r.resultado,
      origen: "panel" as const,
      quien: r.usuario?.nombre,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const cats = terminos?.datos?.terminos;
  const conTexto = cats?.filter((c) => c.seo_bytes).length ?? 0;

  const datos = [
    { etiqueta: "Conector", valor: cliente.version ? `v${cliente.version}` : "—" },
    { etiqueta: "Escritura", valor: cliente.soloLectura === false ? "Activada" : "Bloqueada" },
    { etiqueta: "Productos", valor: productos?.datos?.total?.toLocaleString("es-CL") ?? "—" },
    { etiqueta: "Categorías", valor: cats ? String(cats.length) : "—" },
    {
      etiqueta: "Con descripción",
      valor: cats?.length ? `${conTexto} · ${Math.round((100 * conTexto) / cats.length)} %` : "—",
    },
    { etiqueta: "Operaciones", valor: log?.datos?.total?.toLocaleString("es-CL") ?? "—" },
  ];

  const historial = (conversacion?.mensajes ?? []).map((m) => ({
    rol: m.rol as "user" | "assistant",
    contenido: m.contenido,
    usadas: m.usadas ? (JSON.parse(m.usadas) as string[]) : undefined,
    imagenes: m.imagenes ? (JSON.parse(m.imagenes) as string[]) : undefined,
  }));

  async function comprobar() {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/entrar");
    const r = await sondear(id);
    await anotar({
      usuarioId: s.user.id,
      clienteId: id,
      accion: "sondeo",
      resumen: r.ok ? `Conector v${r.salud?.conector}` : `Sin respuesta: ${r.mensaje}`,
      resultado: r.ok ? "ok" : "error",
    });
    redirect(`/panel/clientes/${id}`);
  }

  async function borrarConversacion(datos: FormData) {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/entrar");
    const convId = String(datos.get("conversacionId") || "");
    // Solo el dueño borra sus hilos; el filtro por usuario lo garantiza.
    await db.conversacion.deleteMany({ where: { id: convId, usuarioId: s.user.id } });
    redirect(`/panel/clientes/${id}`);
  }

  async function nuevaConversacion() {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/entrar");
    await db.conversacion.create({
      data: { clienteId: id, usuarioId: s.user.id, titulo: "Nueva conversación" },
    });
    redirect(`/panel/clientes/${id}`);
  }

  const caido = cliente.estadoSonda && cliente.estadoSonda !== "ok";

  return (
    <>
      <Barra usuario={sesion.user.name} rol={rol} />
      <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/panel" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
        ← Clientes
      </Link>

      <header className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-neutral-900">{cliente.nombre}</h1>
          <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <a
              href={`https://${cliente.dominio}`}
              target="_blank"
              rel="noopener"
              className="underline-offset-4 hover:text-[#ff6b00] hover:underline"
            >
              {cliente.dominio}
            </a>
            <span className="text-neutral-300">·</span>
            <span className="tabular-nums">v{cliente.version ?? "?"}</span>
            <span className="text-neutral-300">·</span>
            <span className={puedeEscribir ? "text-emerald-700" : "text-neutral-500"}>
              {puedeEscribir ? "escritura" : "solo lectura"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <form action={nuevaConversacion}>
            <button className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-[#ff6b00] hover:text-[#ff6b00]">
              Nueva conversación
            </button>
          </form>
          <form action={comprobar}>
            <button className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-[#ff6b00] hover:text-[#ff6b00]">
              Comprobar
            </button>
          </form>
        </div>
      </header>

      {caido && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          La última comprobación falló: {cliente.estadoSonda}
        </p>
      )}

      <FichaCliente
        clienteId={cliente.id}
        nombre={cliente.nombre}
        puedeEscribir={puedeEscribir}
        historialInicial={historial}
        conversacionInicial={conversacion?.id ?? null}
        conversaciones={conversaciones.map((x) => ({
          id: x.id,
          titulo: x.titulo,
          fecha: x.tocado.toISOString().slice(5, 16).replace("T", " "),
          mensajes: x._count.mensajes,
        }))}
        borrar={borrarConversacion}
        sucesos={sucesos}
        datos={datos}
      />
      </main>
    </>
  );
}
