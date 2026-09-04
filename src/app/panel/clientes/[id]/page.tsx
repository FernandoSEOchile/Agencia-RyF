import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, sondear, anotar, veTodo } from "@/lib/clientes";
import FichaCliente, { type Suceso } from "@/components/FichaCliente";
import { credenciales } from "@/lib/dataforseo";
import { aplicacion } from "@/lib/gsc";
import Barra from "@/components/Barra";
import Plataforma from "@/components/Plataforma";
import { fecha } from "@/lib/formato";
import { conectarSitio } from "@/lib/conectarSitio";

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
  searchParams: Promise<{ c?: string; error?: string; ok?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/entrar");

  const { id } = await params;
  const { c, error: aviso, ok: exito } = await searchParams;
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

  // Las consultas seguidas, cada una con sus dos últimas medidas: la actual y
  // la anterior, que es lo que permite mostrar si subió o bajó.
  const [keywords, proveedor] = await Promise.all([
    db.keyword.findMany({
      where: { clienteId: id, activa: true },
      include: { posiciones: { orderBy: { medido: "desc" }, take: 2 }, _count: { select: { posiciones: true } } },
      orderBy: { creado: "asc" },
    }),
    credenciales(),
  ]);

  const gscListo = Boolean(await aplicacion());

  const arq = await db.arquitectura.findFirst({
        where: { clienteId: id },
        orderBy: { creado: "desc" },
        include: { nodos: { orderBy: { orden: "asc" } } },
      });

  // Se piden en paralelo y ningún fallo bloquea al resto: un endpoint que la
  // versión instalada del conector no tiene no debe vaciar la ficha entera.
  const [log, productos, terminos, registroPanel, totalConversaciones, conversaciones] =
    await Promise.all([
    api<{ entradas: EntradaLog[]; total: number }>(id, "GET", "/log?por_pagina=50").catch(() => null),
    api<{ total: number }>(id, "GET", "/products?pagina=1").catch(() => null),
    api<{ terminos: { seo_bytes: number }[] }>(id, "GET", "/terms?taxonomia=product_cat").catch(() => null),
    db.registro.findMany({
      where: { clienteId: id },
      orderBy: { creado: "desc" },
      take: 50,
      include: { usuario: { select: { nombre: true } } },
    }),
    // Todos los hilos del cliente, de quien sea. Ver lo que pidió un compañero
    // es la mitad del valor de tener el historial guardado.
    db.conversacion.count({ where: { clienteId: id } }),
    db.conversacion.findMany({
      where: { clienteId: id },
      orderBy: { tocado: "desc" },
      take: 30,
      select: {
        id: true,
        titulo: true,
        tocado: true,
        usuarioId: true,
        _count: { select: { mensajes: true } },
      },
    }),
  ]);

  // Los nombres de quienes abrieron hilos, para poner cara a cada uno. Se
  // piden en una sola consulta y no uno por uno.
  const nombres = new Map(
    (
      await db.usuario.findMany({
        where: { id: { in: [...new Set(conversaciones.map((x) => x.usuarioId))] } },
        select: { id: true, nombre: true },
      })
    ).map((u) => [u.id, u.nombre])
  );

  // La conversación abierta: la pedida por URL, o la última que se tocó. El
  // único filtro es el cliente, para que nadie llegue a un hilo de un sitio al
  // que no tiene acceso poniendo el id en la dirección.
  const conversacion = await db.conversacion.findFirst({
    where: { clienteId: id, ...(c ? { id: c } : {}) },
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
      valor: cats?.length ? `${conTexto} · ${Math.round((100 * conTexto) / cats.length)}%` : "—",
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

    // Los hilos se ven entre todos pero no se borran entre todos: cada quien
    // borra los suyos, y un administrador cualquiera. Sin esto, un clic de más
    // en la lista se llevaría el trabajo de un compañero sin preguntar.
    const esAdmin = (s.user as { rol?: string }).rol === "ADMIN";

    await db.conversacion.deleteMany({
      where: { id: convId, clienteId: id, ...(esAdmin ? {} : { usuarioId: s.user.id }) },
    });
    redirect(`/panel/clientes/${id}`);
  }

  /**
   * Se lleva los hilos que no llegaron a nada.
   *
   * Cada vez que alguien pulsa «nueva conversación» y no escribe queda un
   * hilo vacío en la lista. En unos meses son cientos y tapan los que
   * importan. Uno o ningún mensaje es la frontera: con un solo mensaje no
   * hubo respuesta, así que tampoco hay nada que conservar.
   */
  async function limpiarConversaciones() {
    "use server";
    const s = await auth();
    if (!s?.user?.id) redirect("/entrar");
    const esAdmin = (s.user as { rol?: string }).rol === "ADMIN";

    const vacias = await db.conversacion.findMany({
      where: { clienteId: id, ...(esAdmin ? {} : { usuarioId: s.user.id }) },
      select: { id: true, _count: { select: { mensajes: true } } },
    });

    await db.conversacion.deleteMany({
      where: { id: { in: vacias.filter((c) => c._count.mensajes < 2).map((c) => c.id) } },
    });
    redirect(`/panel/clientes/${id}`);
  }

  /** Activa o desactiva la beta de arquitectura en este cliente. */
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
      <Barra usuarioId={sesion.user?.id} usuario={sesion.user.name} rol={rol} />
      <main className="contenedor py-10">
      <Link href="/panel" className="boton-sutil">
        ← Clientes
      </Link>

      <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold leading-tight">{cliente.nombre}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[color:var(--tinta-media)]">
            <Plataforma cual={cliente.plataforma} tam={14} />
            <a
              href={`https://${cliente.dominio}`}
              target="_blank"
              rel="noopener"
              className="underline-offset-4 transition hover:text-[color:var(--acento)] hover:underline"
            >
              {cliente.dominio}
            </a>
            <span className="text-black/20">·</span>
            <span className="tabular-nums">v{cliente.version ?? "?"}</span>
            <span className="text-black/20">·</span>
            <span className={puedeEscribir ? "text-emerald-600" : ""}>
              {puedeEscribir ? "escritura" : "solo lectura"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <form action={nuevaConversacion}>
            <button className="boton">
              Nueva conversación
            </button>
          </form>
          <form action={comprobar}>
            <button className="boton" title="Pregunta al conector si responde y con qué versión">
              Comprobar conexión
            </button>
          </form>
        </div>
      </header>

      {/* Los avisos de las vueltas desde fuera —conectar Google, por ejemplo—
          llegan por la URL. Sin pintarlos, un fallo se ve como si no hubiera
          pasado nada, que es peor que un error. */}
      {aviso && (
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{aviso}</p>
      )}
      {exito && (
        <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{exito}</p>
      )}

      {caido && (
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">
          La última comprobación falló: {cliente.estadoSonda}
        </p>
      )}

      <FichaCliente
        clienteId={cliente.id}
        nombre={cliente.nombre}
        puedeEscribir={puedeEscribir}
        historialInicial={historial}
        conversacionInicial={conversacion?.id ?? null}
        puedeSubir={rol !== "LECTOR"}
        hayProveedor={Boolean(proveedor)}
        hayGsc={gscListo}
        keywords={keywords.map((k) => ({
          id: k.id,
          termino: k.termino,
          dispositivo: k.dispositivo,
          urlObjetivo: k.urlObjetivo,
          puesto: k.posiciones[0]?.puesto ?? null,
          urlPosicionada: k.posiciones[0]?.url ?? null,
          bloquesArriba: k.posiciones[0]?.bloquesArriba ?? null,
          medido: k.posiciones[0] ? k.posiciones[0].medido.toISOString().slice(5, 10) : null,
          anterior: k.posiciones[1]?.puesto ?? null,
          mediciones: k._count.posiciones,
        }))}
        arquitectura={
          arq
            ? {
                id: arq.id,
                nombre: arq.nombre,
                archivo: arq.archivo,
                creado: arq.creado.toISOString(),
                cotejado: arq.cotejado ? arq.cotejado.toISOString() : null,
                nodos: arq.nodos.map((n) => {
                  // Ordenadas por volumen: la primera es la que da nombre a la
                  // intención de esa sección.
                  const kws = (JSON.parse(n.keywords) as { keyword: string; volumen: number }[]).sort(
                    (a, b) => b.volumen - a.volumen
                  );
                  return {
                  id: n.id,
                  slug: n.slug,
                  nombre: n.nombre,
                  nivel: n.nivel,
                  volumen: n.volumen,
                  keywords: kws.length,
                  principal: kws[0]?.keyword ?? null,
                  volumenPrincipal: kws[0]?.volumen ?? 0,
                  estado: n.estado,
                  urlDestino: n.urlDestino,
                  confianza: n.confianza,
                  nota: n.nota,
                  comoSeCotejo: n.comoSeCotejo,
                  };
                }),
              }
            : null
        }
        conversaciones={conversaciones.map((x) => ({
          id: x.id,
          titulo: x.titulo,
          fecha: fecha(x.tocado, { hora: true }),
          mensajes: x._count.mensajes,
          autor: x.usuarioId === sesion.user!.id ? null : (nombres.get(x.usuarioId) ?? "otra persona"),
        }))}
        borrar={borrarConversacion}
        limpiar={limpiarConversaciones}
        reconectar={conectarSitio}
        esWordPress={cliente.plataforma !== "shopify"}
        totalConversaciones={totalConversaciones}
        sucesos={sucesos}
        datos={datos}
      />
      </main>
    </>
  );
}
