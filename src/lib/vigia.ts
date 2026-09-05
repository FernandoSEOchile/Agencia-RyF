import "server-only";
import type { Revision } from "@prisma/client";
import { db } from "@/lib/db";
import { sondear } from "@/lib/clientes";
import { avisar } from "@/lib/avisos";

/**
 * Comprobación periódica de que los sitios siguen en pie.
 *
 * Mira dos cosas que se rompen por separado:
 *
 * - La **portada pública**, que es lo que ve el cliente. Se pide desde fuera, y
 *   ahí está la gracia: un plugin caído no puede avisar de su propia caída, y
 *   un sitio que devuelve 500 lo devuelve igual aunque el conector responda.
 * - El **conector**, que es lo que necesita el panel para trabajar. Puede estar
 *   muerto con la web perfecta.
 *
 * No manda avisos por correo todavía. Deja el rastro en la base para que el
 * panel lo pinte; el aviso es el paso siguiente y necesita decidir a dónde.
 */

/** Cuánto se espera a un sitio antes de darlo por caído. */
const ESPERA = 15000;

/** Cuántos días de histórico se conservan. */
const DIAS = 30;

export interface Resultado {
  clienteId: string;
  nombre: string;
  webOk: boolean;
  webEstado: number | null;
  webMs: number | null;
  conectorOk: boolean | null;
  detalle: string | null;
}

/** La dirección pública del sitio, tal como la escribiría un visitante. */
function direccion(dominio: string) {
  const limpio = dominio.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${limpio}/`;
}

/**
 * Pide la portada y mide.
 *
 * Va con GET y no con HEAD porque hay sitios —y temas de WordPress— que
 * contestan a HEAD con un 405 aunque la web esté perfecta, y eso daría una
 * caída falsa cada diez minutos.
 */
async function verWeb(dominio: string) {
  const arranque = Date.now();

  try {
    const r = await fetch(direccion(dominio), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "AppSEO-Vigia/1.0 (+https://panel.agenciaryf.com)" },
      signal: AbortSignal.timeout(ESPERA),
      cache: "no-store",
    });

    // Se lee el cuerpo y se descarta: sin esto la conexión queda a medias y el
    // tiempo medido es el de las cabeceras, no el de la página.
    await r.text();

    return {
      ok: r.status < 400,
      estado: r.status,
      ms: Date.now() - arranque,
      detalle: r.status < 400 ? null : `La portada devolvió ${r.status}.`,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "error desconocido";
    return {
      ok: false,
      estado: null,
      ms: Date.now() - arranque,
      detalle: mensaje.includes("timeout") || mensaje.includes("abort")
        ? `La portada no contestó en ${ESPERA / 1000} segundos.`
        : `No se pudo abrir la portada: ${mensaje}`,
    };
  }
}

/** Revisa un cliente y guarda el resultado. */
export async function revisar(clienteId: string): Promise<Resultado | null> {
  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nombre: true, dominio: true, plataforma: true, activo: true },
  });

  if (!cliente || !cliente.activo) return null;

  const web = await verWeb(cliente.dominio);

  // El conector solo existe en WordPress. En Shopify se comprueba la conexión
  // con la API, que `sondear` ya sabe hacer, así que se sondea igual.
  let conectorOk: boolean | null = null;
  let fallaConector: string | null = null;

  // Un cliente seguido solo por dominio no tiene conector: se mira la web y ya.
  if (cliente.plataforma !== "dominio") {
    try {
      const s = await sondear(cliente.id);
      conectorOk = s.ok;
      if (!s.ok) fallaConector = s.mensaje;
    } catch (e) {
      conectorOk = false;
      fallaConector = e instanceof Error ? e.message : "error al sondear";
    }
  }

  const detalle =
    [web.detalle, fallaConector ? `Conector: ${fallaConector}` : null]
      .filter(Boolean)
      .join(" · ") || null;

  // Se avisa solo cuando CAMBIA el estado: al caer y al volver. Repetirlo
  // cada diez minutos convertiría el canal en ruido y nadie lo miraría.
  const previa = await db.revision.findFirst({
    where: { clienteId: cliente.id },
    orderBy: { creado: "desc" },
    select: { webOk: true },
  });

  await db.revision.create({
    data: {
      clienteId: cliente.id,
      webOk: web.ok,
      webEstado: web.estado,
      webMs: web.ms,
      conectorOk,
      detalle: detalle?.slice(0, 500) ?? null,
    },
  });

  if (previa && previa.webOk !== web.ok) {
    const enlace = `https://panel.agenciaryf.com/panel/clientes/${cliente.id}`;
    await avisar(
      web.ok
        ? `✅ ${cliente.nombre} (${cliente.dominio}) volvió a responder. ${enlace}`
        : `⚠️ ${cliente.nombre} (${cliente.dominio}) no responde: ${web.detalle ?? "sin detalle"}. ${enlace}`,
      { clienteId: cliente.id, accion: "aviso_caida" }
    ).catch(() => {});
  }

  return {
    clienteId: cliente.id,
    nombre: cliente.nombre,
    webOk: web.ok,
    webEstado: web.estado,
    webMs: web.ms,
    conectorOk,
    detalle,
  };
}

/**
 * Revisa toda la cartera.
 *
 * En serie y no en paralelo a propósito: son pocos sitios, y varias peticiones
 * simultáneas desde la misma IP a hostings compartidos se parecen demasiado a
 * lo que un cortafuegos considera un ataque.
 */
export async function revisarTodos() {
  const clientes = await db.cliente.findMany({
    where: { activo: true },
    select: { id: true },
    orderBy: { nombre: "asc" },
  });

  const resultados: Resultado[] = [];

  for (const c of clientes) {
    const r = await revisar(c.id);
    if (r) resultados.push(r);
  }

  await limpiar();

  return resultados;
}

/** Borra el histórico viejo, que no se mira y ocupa. */
async function limpiar() {
  const corte = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);
  await db.revision.deleteMany({ where: { creado: { lt: corte } } });
}

/**
 * La última revisión de cada cliente, para pintar el estado de un vistazo.
 *
 * Con `distinct` Postgres resuelve esto de una vez. Traer las N más recientes y
 * quedarse con la primera de cada cliente no valdría: si un sitio se revisó
 * cien veces seguidas, sus filas taparían a las de los demás.
 */
export async function ultimas(clienteIds: string[]) {
  if (clienteIds.length === 0) return new Map<string, Revision>();

  const filas = await db.revision.findMany({
    where: { clienteId: { in: clienteIds } },
    orderBy: [{ clienteId: "asc" }, { creado: "desc" }],
    distinct: ["clienteId"],
  });

  return new Map(filas.map((f) => [f.clienteId, f]));
}
