import "server-only";
import { db } from "@/lib/db";

/**
 * Registro de lo que cuesta operar cada cliente.
 *
 * Se apunta en el momento y con el importe ya calculado. Guardar solo los
 * tokens y recalcular después parece más limpio, pero las tarifas cambian y el
 * resultado sería una cifra que nunca se pagó: para saber si un cliente sale
 * rentable hace falta lo que costó de verdad, no lo que costaría hoy.
 *
 * Un fallo apuntando nunca detiene la operación. Perder el registro de un
 * gasto es molesto; perder el trabajo que ya se pagó, mucho peor.
 */

/** Dólares por millón de tokens, por modelo. */
const TARIFAS: Record<string, { entrada: number; salida: number }> = {
  "claude-opus-5": { entrada: 5, salida: 25 },
  "claude-sonnet-5": { entrada: 3, salida: 15 },
  "claude-haiku-4-5": { entrada: 1, salida: 5 },
};

const POR_DEFECTO = TARIFAS["claude-opus-5"];

/**
 * Lo que cuesta un turno de conversación.
 *
 * Los tokens de caché no valen lo mismo que los normales: escribir en la caché
 * cuesta un 25% más y leerla, la décima parte. Contarlos todos igual da una
 * cifra que no se parece a la factura, y justo en el sentido peor: con la caché
 * puesta, el panel diría que se gasta diez veces lo que se gasta.
 */
export function costeClaude(
  modelo: string,
  entrada: number,
  salida: number,
  cacheEscritura = 0,
  cacheLectura = 0
): number {
  const t = TARIFAS[modelo] ?? POR_DEFECTO;
  return (
    (entrada * t.entrada +
      cacheEscritura * t.entrada * 1.25 +
      cacheLectura * t.entrada * 0.1 +
      salida * t.salida) /
    1e6
  );
}

export async function apuntar(datos: {
  clienteId?: string | null;
  usuarioId?: string | null;
  servicio: "claude" | "dataforseo";
  concepto: string;
  monto: number;
  detalle?: string;
}) {
  if (!datos.monto || datos.monto <= 0) return;

  try {
    await db.gasto.create({
      data: {
        clienteId: datos.clienteId ?? null,
        usuarioId: datos.usuarioId ?? null,
        servicio: datos.servicio,
        concepto: datos.concepto,
        monto: datos.monto,
        detalle: datos.detalle,
      },
    });
  } catch (e) {
    console.error("[gasto] no se pudo apuntar:", e);
  }
}

/** Apunta el coste de una llamada al modelo, calculándolo de los tokens. */
export async function apuntarClaude(datos: {
  clienteId?: string | null;
  usuarioId?: string | null;
  concepto: string;
  modelo: string;
  entrada: number;
  salida: number;
  cacheEscritura?: number;
  cacheLectura?: number;
}) {
  const escritura = datos.cacheEscritura ?? 0;
  const lectura = datos.cacheLectura ?? 0;
  const n = (x: number) => x.toLocaleString("es-CL");

  await apuntar({
    clienteId: datos.clienteId,
    usuarioId: datos.usuarioId,
    servicio: "claude",
    concepto: datos.concepto,
    monto: costeClaude(datos.modelo, datos.entrada, datos.salida, escritura, lectura),
    detalle:
      `${datos.modelo} · ${n(datos.entrada)} entrada / ${n(datos.salida)} salida` +
      (escritura || lectura ? ` · caché ${n(lectura)} leída / ${n(escritura)} escrita` : ""),
  });
}

export interface ResumenGasto {
  total: number;
  claude: number;
  dataforseo: number;
  porConcepto: { servicio: string; concepto: string; monto: number; veces: number }[];
  porDia: { dia: string; claude: number; dataforseo: number }[];
}

/**
 * Lo gastado por un cliente entre dos fechas.
 *
 * El desglose por concepto es lo que de verdad se mira: saber que se fueron
 * treinta dólares no dice nada; saber que veintiocho fueron en medir
 * posiciones sí dice qué tocar.
 */
export async function resumenGasto(
  clienteId: string,
  desde: Date,
  hasta: Date
): Promise<ResumenGasto> {
  const filas = await db.gasto.findMany({
    where: { clienteId, creado: { gte: desde, lte: hasta } },
    select: { servicio: true, concepto: true, monto: true, creado: true },
    orderBy: { creado: "asc" },
  });

  const porConcepto = new Map<string, { servicio: string; concepto: string; monto: number; veces: number }>();
  const porDia = new Map<string, { dia: string; claude: number; dataforseo: number }>();

  let claude = 0;
  let dataforseo = 0;

  for (const f of filas) {
    if (f.servicio === "claude") claude += f.monto;
    else dataforseo += f.monto;

    const clave = `${f.servicio}·${f.concepto}`;
    const c = porConcepto.get(clave) ?? { servicio: f.servicio, concepto: f.concepto, monto: 0, veces: 0 };
    c.monto += f.monto;
    c.veces++;
    porConcepto.set(clave, c);

    const dia = f.creado.toISOString().slice(0, 10);
    const d = porDia.get(dia) ?? { dia, claude: 0, dataforseo: 0 };
    if (f.servicio === "claude") d.claude += f.monto;
    else d.dataforseo += f.monto;
    porDia.set(dia, d);
  }

  return {
    total: claude + dataforseo,
    claude,
    dataforseo,
    porConcepto: [...porConcepto.values()].sort((a, b) => b.monto - a.monto),
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

export interface ResumenGlobal {
  desde: string;
  hasta: string;
  total: number;
  claude: number;
  dataforseo: number;
  porCliente: { id: string | null; nombre: string; dominio: string | null; claude: number; dataforseo: number; total: number }[];
  porUsuario: { id: string | null; nombre: string; claude: number; dataforseo: number; total: number; operaciones: number }[];
  porConcepto: { servicio: string; concepto: string; monto: number; veces: number }[];
  porDia: { dia: string; claude: number; dataforseo: number }[];
}

/**
 * Lo que gasta la agencia entera, repartido por cliente y por persona.
 *
 * El reparto por cliente es el que dice si una cuenta sale rentable. El
 * reparto por persona no es para vigilar a nadie: sirve para detectar que
 * alguien está midiendo posiciones cada día porque nadie le explicó que
 * cuesta, que es un problema de formación y no de intención.
 *
 * La exploración de dominios no tiene cliente a propósito —se hace sobre
 * sitios que aún no lo son— y se agrupa aparte como prospección, que es
 * exactamente lo que es: coste comercial, no coste de operación.
 */
export async function resumenGlobal(desde: Date, hasta: Date): Promise<ResumenGlobal> {
  const filas = await db.gasto.findMany({
    where: { creado: { gte: desde, lte: hasta } },
    select: { clienteId: true, usuarioId: true, servicio: true, concepto: true, monto: true, creado: true },
    orderBy: { creado: "asc" },
  });

  const [clientes, usuarios] = await Promise.all([
    db.cliente.findMany({ select: { id: true, nombre: true, dominio: true } }),
    db.usuario.findMany({ select: { id: true, nombre: true } }),
  ]);

  const nombreCliente = new Map(clientes.map((c) => [c.id, c]));
  const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));

  const porCliente = new Map<string, ResumenGlobal["porCliente"][number]>();
  const porUsuario = new Map<string, ResumenGlobal["porUsuario"][number]>();
  const porConcepto = new Map<string, ResumenGlobal["porConcepto"][number]>();
  const porDia = new Map<string, { dia: string; claude: number; dataforseo: number }>();

  let claude = 0;
  let dataforseo = 0;

  for (const f of filas) {
    const esClaude = f.servicio === "claude";
    if (esClaude) claude += f.monto;
    else dataforseo += f.monto;

    const cid = f.clienteId ?? "";
    const c =
      porCliente.get(cid) ??
      {
        id: f.clienteId,
        nombre: f.clienteId ? nombreCliente.get(f.clienteId)?.nombre ?? "cliente borrado" : "Prospección",
        dominio: f.clienteId ? nombreCliente.get(f.clienteId)?.dominio ?? null : null,
        claude: 0,
        dataforseo: 0,
        total: 0,
      };
    if (esClaude) c.claude += f.monto;
    else c.dataforseo += f.monto;
    c.total += f.monto;
    porCliente.set(cid, c);

    const uid = f.usuarioId ?? "";
    const u =
      porUsuario.get(uid) ??
      {
        id: f.usuarioId,
        nombre: f.usuarioId ? nombreUsuario.get(f.usuarioId) ?? "usuario borrado" : "automático",
        claude: 0,
        dataforseo: 0,
        total: 0,
        operaciones: 0,
      };
    if (esClaude) u.claude += f.monto;
    else u.dataforseo += f.monto;
    u.total += f.monto;
    u.operaciones++;
    porUsuario.set(uid, u);

    const kc = `${f.servicio}·${f.concepto}`;
    const k = porConcepto.get(kc) ?? { servicio: f.servicio, concepto: f.concepto, monto: 0, veces: 0 };
    k.monto += f.monto;
    k.veces++;
    porConcepto.set(kc, k);

    const dia = f.creado.toISOString().slice(0, 10);
    const d = porDia.get(dia) ?? { dia, claude: 0, dataforseo: 0 };
    if (esClaude) d.claude += f.monto;
    else d.dataforseo += f.monto;
    porDia.set(dia, d);
  }

  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
    total: claude + dataforseo,
    claude,
    dataforseo,
    porCliente: [...porCliente.values()].sort((a, b) => b.total - a.total),
    porUsuario: [...porUsuario.values()].sort((a, b) => b.total - a.total),
    porConcepto: [...porConcepto.values()].sort((a, b) => b.monto - a.monto),
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}
