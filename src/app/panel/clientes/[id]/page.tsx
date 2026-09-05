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
import { randomBytes } from "node:crypto";
import { fotoDe, costeMedioExploracion } from "@/lib/exploracion";

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
  if (!sesion?.user?.id) redirect("/entrar?volver=" + encodeURIComponent("/panel"));

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

  const puedeEscribir = (rol !== "LECTOR" && cliente.soloLectura === false) && !cliente.escrituraBloqueada;

  // Las consultas seguidas, cada una con sus dos últimas medidas: la actual y
  // la anterior, que es lo que permite mostrar si subió o bajó.
  // Todo lo que no depende entre sí, a la vez. Antes iban en cadena —cinco
  // esperas seguidas— y la ficha tardaba lo que sumaban todas.
  const [keywords, proveedor, gscListo, arq] = await Promise.all([
    db.keyword.findMany({
      where: { clienteId: id, activa: true },
      include: { posiciones: { orderBy: { medido: "desc" }, take: 12 }, _count: { select: { posiciones: true } } },
      orderBy: { creado: "asc" },
    }),
    credenciales(),
    aplicacion().then(Boolean),
    db.arquitectura.findFirst({
      where: { clienteId: id },
      orderBy: { creado: "desc" },
      include: { nodos: { orderBy: { orden: "asc" } } },
    }),
  ]);

  // Se piden en paralelo y ningún fallo bloquea al resto: un endpoint que la
  // versión instalada del conector no tiene no debe vaciar la ficha entera.
  const [log, productos, terminos, registroPanel, totalConversaciones, memorias, rastreosHechos, fichasHechas, enlacesMedidos, bitacorasHechas, promptsIa, rivales, foto, costeExploracion, conversaciones] =
    await Promise.all([
    // Sin conector no hay a quién preguntar: se pasa de largo en vez de esperar
    // tres tiempos de espera para nada.
    cliente.plataforma === "dominio" ? Promise.resolve(null) : api<{ entradas: EntradaLog[]; total: number }>(id, "GET", "/log?por_pagina=50").catch(() => null),
    cliente.plataforma === "dominio" ? Promise.resolve(null) : api<{ total: number }>(id, "GET", "/products?pagina=1").catch(() => null),
    cliente.plataforma === "dominio" ? Promise.resolve(null) : api<{ terminos: { seo_bytes: number }[] }>(id, "GET", "/terms?taxonomia=product_cat").catch(() => null),
    db.registro.findMany({
      where: { clienteId: id },
      orderBy: { creado: "desc" },
      take: 50,
      include: { usuario: { select: { nombre: true } } },
    }),
    // Todos los hilos del cliente, de quien sea. Ver lo que pidió un compañero
    // es la mitad del valor de tener el historial guardado.
    db.conversacion.count({ where: { clienteId: id } }),
    db.memoria.findMany({
      where: { clienteId: id },
      orderBy: { tocado: "desc" },
      select: { id: true, titulo: true, nota: true, tocado: true },
    }),
    db.rastreo.count({ where: { clienteId: id, estado: "terminado" } }),
    db.auditoriaFicha.count({ where: { clienteId: id } }),
    db.backlinks.findUnique({ where: { clienteId: id }, select: { medido: true } }),
    db.bitacora.count({ where: { clienteId: id } }),
    db.promptIa.count({ where: { clienteId: id, activo: true } }),
    db.competidor.count({ where: { clienteId: id } }),
    fotoDe(cliente.dominio),
    costeMedioExploracion(),
    db.conversacion.findMany({
      where: { clienteId: id },
      orderBy: { tocado: "desc" },
      take: 100,
      select: {
        id: true,
        titulo: true,
        tocado: true,
        usuarioId: true,
        _count: { select: { mensajes: true } },
      },
    }),
  ]);


  // La conversación abierta: la pedida por URL, o la última que se tocó. El
  // único filtro es el cliente, para que nadie llegue a un hilo de un sitio al
  // que no tiene acceso poniendo el id en la dirección.
  const conversacion = await db.conversacion.findFirst({
    where: { clienteId: id, ...(c ? { id: c } : {}) },
    orderBy: { tocado: "desc" },
    // Los últimos sesenta: con `asc` + `take` la pantalla enseñaba los sesenta
    // primeros y escondía justo lo más nuevo.
    include: { mensajes: { orderBy: { creado: "desc" }, take: 60 } },
  });

  // Los nombres de quienes abrieron hilos, para poner cara a cada uno. Se
  // piden en una sola consulta y no uno por uno.
  const nombres = new Map(
    (
      await db.usuario.findMany({
        where: {
          id: {
            in: [
              ...new Set([
                ...conversaciones.map((x) => x.usuarioId),
                ...(conversacion?.mensajes ?? []).map((m) => m.usuarioId).filter((u): u is string => Boolean(u)),
              ]),
            ],
          },
        },
        select: { id: true, nombre: true },
      })
    ).map((u) => [u.id, u.nombre])
  );

  const sucesos: Suceso[] = [
    ...(log?.datos?.entradas ?? []).map((e) => ({
      fecha: corto(e.creado),
      accion: e.accion,
      resumen: e.resumen || "—",
      resultado: e.resultado,
      origen: "sitio" as const,
    })),
    ...registroPanel.map((r) => ({
      detalle: r.detalle ?? undefined,
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
    { etiqueta: "Conector", valor: cliente.plataforma === "dominio" ? "Sin conector" : cliente.version ? `v${cliente.version}` : "—" },
    { etiqueta: "Escritura", valor: cliente.plataforma === "dominio" ? "No disponible" : cliente.soloLectura === false ? "Activada" : "Bloqueada" },
    { etiqueta: "Productos", valor: productos?.datos?.total?.toLocaleString("es-CL") ?? "—" },
    { etiqueta: "Categorías", valor: cats ? String(cats.length) : "—" },
    {
      etiqueta: "Con descripción",
      valor: cats?.length ? `${conTexto} · ${Math.round((100 * conTexto) / cats.length)}%` : "—",
    },
    { etiqueta: "Operaciones", valor: log?.datos?.total?.toLocaleString("es-CL") ?? "—" },
  ];

  const historial = [...(conversacion?.mensajes ?? [])].reverse().map((m) => ({
    rol: m.rol as "user" | "assistant",
    contenido: m.contenido,
    usadas: m.usadas ? (JSON.parse(m.usadas) as string[]) : undefined,
    imagenes: m.imagenes ? (JSON.parse(m.imagenes) as string[]) : undefined,
    // En un hilo compartido se dice quién pidió cada cosa; lo propio va sin nombre.
    autor:
      m.rol === "user" && m.usuarioId && m.usuarioId !== sesion.user!.id
        ? (nombres.get(m.usuarioId) ?? "otra persona")
        : undefined,
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
      resumen: r.ok ? (r.salud?.conector ? `Conector v${r.salud.conector}` : "El sitio responde") : `Sin respuesta: ${r.mensaje}`,
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

  async function guardarAjustesCliente(datos: FormData) {
    "use server";
    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || rolAccion === "LECTOR") redirect("/entrar");

    const instrucciones = String(datos.get("instrucciones") ?? "").trim().slice(0, 4000) || null;
    const tarifaBruta = String(datos.get("tarifa") ?? "").replace(",", ".").trim();
    const tarifa = tarifaBruta ? Math.max(0, Number(tarifaBruta)) : null;
    const escrituraBloqueada = datos.get("escrituraBloqueada") === "1";

    await db.cliente.update({
      where: { id },
      data: { instrucciones, tarifa: Number.isFinite(tarifa as number) ? tarifa : null, escrituraBloqueada },
    });
    await anotar({
      usuarioId: s.user.id,
      clienteId: id,
      accion: "cliente_ajustes",
      resumen: `Ajustes del cliente guardados${escrituraBloqueada ? " · escritura bloqueada desde el panel" : ""}`,
    });
    redirect(`/panel/clientes/${id}?ok=${encodeURIComponent("Ajustes guardados.")}&t=datos`);
  }

  /**
   * Dar de baja no borra: el cliente deja de aparecer y el vigía deja de
   * mirarlo, pero su histórico, su gasto y sus hilos siguen ahí. Borrarlo de
   * verdad arrastraría todo eso por la cascada.
   */
  async function darDeBaja() {
    "use server";
    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || (rolAccion !== "ADMIN" && rolAccion !== "GESTOR")) redirect("/entrar");
    await db.cliente.update({ where: { id }, data: { activo: false } });
    await anotar({ usuarioId: s.user.id, clienteId: id, accion: "cliente_baja", resumen: "Cliente dado de baja" });
    redirect("/panel");
  }

  /**
   * El enlace del informe para el cliente final. Crear uno nuevo revoca el
   * anterior: si un enlace se filtró, con generar otro basta.
   */
  async function crearEnlaceInforme() {
    "use server";
    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || rolAccion === "LECTOR") redirect("/entrar");
    const token = randomBytes(24).toString("hex");
    await db.cliente.update({ where: { id }, data: { tokenInforme: token } });
    await anotar({ usuarioId: s.user.id, clienteId: id, accion: "informe_enlace", resumen: "Enlace del informe creado" });
    redirect(`/panel/clientes/${id}?t=datos`);
  }

  async function revocarEnlaceInforme() {
    "use server";
    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || rolAccion === "LECTOR") redirect("/entrar");
    await db.cliente.update({ where: { id }, data: { tokenInforme: null } });
    await anotar({ usuarioId: s.user.id, clienteId: id, accion: "informe_enlace", resumen: "Enlace del informe revocado" });
    redirect(`/panel/clientes/${id}?t=datos`);
  }

  async function olvidarMemoria(datos: FormData) {
    "use server";
    const s = await auth();
    const rolAccion = (s?.user as { rol?: string } | undefined)?.rol;
    if (!s?.user?.id || rolAccion === "LECTOR") redirect("/entrar");
    const memoriaId = String(datos.get("memoriaId") ?? "");
    // Con clienteId en el where: nadie borra un apunte de otro cliente por id.
    await db.memoria.deleteMany({ where: { id: memoriaId, clienteId: id } });
    redirect(`/panel/clientes/${id}?t=datos`);
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
          <h1 className="truncate text-[28px] font-bold leading-tight">{cliente.nombre}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px] text-[color:var(--tinta-media)]">
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
            {cliente.plataforma === "dominio" ? (
              <span title="Sin plugin ni Shopify: se mide todo, no se escribe nada">solo medición</span>
            ) : (
              <>
                <span className="tabular-nums">v{cliente.version ?? "?"}</span>
                <span className="text-black/20">·</span>
                <span className={puedeEscribir ? "text-emerald-600" : ""}>
                  {puedeEscribir ? "escritura" : "solo lectura"}
                </span>
              </>
            )}
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
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-700">{aviso}</p>
      )}
      {exito && (
        <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">{exito}</p>
      )}

      {caido && (
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-700">
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
        medirCada={cliente.medirCada}
        exploracion={
          foto
            ? {
                creado: foto.creado.toISOString(),
                resumen: foto.panorama.resumen,
                // Las doscientas de más tráfico ya vienen ordenadas del proveedor.
                keywords: foto.panorama.keywords.slice(0, 200),
              }
            : null
        }
        costeExploracion={costeExploracion}
        gscConectado={gscListo && Boolean(cliente.gscPropiedad)}
        costePorMedicion={(() => {
          const costes = keywords.map((k) => k.posiciones[0]?.coste).filter((c): c is number => typeof c === "number" && c > 0);
          return costes.length ? costes.reduce((t, c) => t + c, 0) / costes.length : 0.003;
        })()}
        hayGsc={gscListo}
        keywords={keywords.map((k) => ({
          id: k.id,
          termino: k.termino,
          dispositivo: k.dispositivo,
          urlObjetivo: k.urlObjetivo,
          puesto: k.posiciones[0]?.puesto ?? null,
          urlPosicionada: k.posiciones[0]?.url ?? null,
          bloquesArriba: k.posiciones[0]?.bloquesArriba ?? null,
          medido: k.posiciones[0]?.medido.toISOString() ?? null,
          anterior: k.posiciones[1]?.puesto ?? null,
          mediciones: k._count.posiciones,
          // Las últimas doce, en orden cronológico, para el mini-gráfico.
          historial: [...k.posiciones].reverse().map((x) => x.puesto),
          iaOverview: k.posiciones[0]?.iaOverview ?? null,
          iaCitado: k.posiciones[0]?.iaCitado ?? null,
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
        ajustes={{
          instrucciones: cliente.instrucciones ?? "",
          tarifa: cliente.tarifa,
          escrituraBloqueada: cliente.escrituraBloqueada,
        }}
        guardarAjustes={guardarAjustesCliente}
        darDeBaja={darDeBaja}
        puedeDarDeBaja={rol === "ADMIN" || rol === "GESTOR"}
        memorias={memorias.map((m) => ({ id: m.id, titulo: m.titulo, nota: m.nota, fecha: fecha(m.tocado) }))}
        olvidar={olvidarMemoria}
        enlaceInforme={cliente.tokenInforme ? `https://panel.agenciaryf.com/informe/${cliente.tokenInforme}` : null}
        crearEnlace={crearEnlaceInforme}
        revocarEnlace={revocarEnlaceInforme}
        pasos={[
          { texto: cliente.plataforma === "dominio" ? "Conectar el sitio para poder escribir (opcional)" : "Sitio conectado", hecho: Boolean(cliente.version) || cliente.plataforma === "shopify", pestaña: "datos" },
          ...(cliente.plataforma === "dominio" ? [] : [{ texto: "Escritura activada", hecho: cliente.soloLectura === false && !cliente.escrituraBloqueada, pestaña: "datos" }]),
          { texto: "Search Console conectado", hecho: Boolean(cliente.gscPropiedad), pestaña: "posiciones" },
          { texto: "Palabras en seguimiento", hecho: keywords.length > 0, pestaña: "posiciones" },
          { texto: "Primer rastreo técnico", hecho: rastreosHechos > 0, pestaña: "tecnico" },
          { texto: "Backlinks consultados", hecho: Boolean(enlacesMedidos), pestaña: "backlinks" },
          { texto: "Ficha de Google analizada", hecho: fichasHechas > 0, pestaña: "local" },
          { texto: "Instrucciones fijas escritas", hecho: Boolean(cliente.instrucciones), pestaña: "datos" },
          { texto: "Primera bitácora", hecho: bitacorasHechas > 0, pestaña: "bitacora" },
          { texto: "Preguntas de IA definidas", hecho: promptsIa > 0, pestaña: "ia" },
          { texto: "Rivales definidos", hecho: rivales > 0, pestaña: "competidores" },
        ]}
        reconectar={conectarSitio}
        esWordPress={cliente.plataforma !== "shopify"}
        sinConector={cliente.plataforma === "dominio"}
        totalConversaciones={totalConversaciones}
        sucesos={sucesos}
        datos={datos}
      />
      </main>
    </>
  );
}
