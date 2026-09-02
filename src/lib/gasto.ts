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

export function costeClaude(modelo: string, entrada: number, salida: number): number {
  const t = TARIFAS[modelo] ?? POR_DEFECTO;
  return (entrada * t.entrada + salida * t.salida) / 1e6;
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
}) {
  await apuntar({
    clienteId: datos.clienteId,
    usuarioId: datos.usuarioId,
    servicio: "claude",
    concepto: datos.concepto,
    monto: costeClaude(datos.modelo, datos.entrada, datos.salida),
    detalle: `${datos.modelo} · ${datos.entrada.toLocaleString("es-CL")} entrada / ${datos.salida.toLocaleString("es-CL")} salida`,
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
