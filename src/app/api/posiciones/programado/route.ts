import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fichaDeCronValida } from "@/lib/cron";
import { medirPosiciones, caidas } from "@/lib/medicion";
import { avisar } from "@/lib/avisos";
import { anotar } from "@/lib/clientes";
import { tomar, soltar } from "@/lib/candado";
import { medirIa, desaparecidas, MODELOS } from "@/lib/ia";

/**
 * La pasada programada de posiciones.
 *
 * La llama el cron una vez al día. Mide solo los clientes que tienen la
 * medición automática activada en su ficha —eso lo decidió una persona,
 * viendo lo que cuesta— y solo si ya pasó su plazo desde la última medición.
 * Después compara con la anterior y avisa de las caídas que importan.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PANEL = "https://panel.agenciaryf.com";

export async function POST(req: NextRequest) {
  if (!fichaDeCronValida(req.headers.get("authorization"))) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const clientes = await db.cliente.findMany({
    where: { activo: true, medirCada: { not: null } },
    select: { id: true, nombre: true, dominio: true, medirCada: true },
    orderBy: { nombre: "asc" },
  });

  const hechos: { cliente: string; medidas: number; coste: number; caidas: number }[] = [];
  const saltados: string[] = [];

  for (const c of clientes) {
    const ultima = await db.posicion.findFirst({
      where: { keyword: { clienteId: c.id } },
      orderBy: { medido: "desc" },
      select: { medido: true },
    });

    // Una hora de margen: el cron corre a la misma hora cada día y sin esto
    // una pasada de siete días caería justo unos minutos antes de cumplirse.
    const plazo = (c.medirCada ?? 7) * 86_400_000 - 3_600_000;
    if (ultima && Date.now() - ultima.medido.getTime() < plazo) {
      saltados.push(c.nombre);
      continue;
    }

    const candado = `posiciones:${c.id}`;
    if (!tomar(candado)) {
      saltados.push(`${c.nombre} (ya en curso)`);
      continue;
    }

    try {
      const r = await medirPosiciones({
        clienteId: c.id,
        dominio: c.dominio,
        usuarioId: null,
        tope: 200,
        concepto: "posiciones_programadas",
      });

      const bajaron = caidas(r.cambios);
      hechos.push({ cliente: c.nombre, medidas: r.medidas, coste: r.coste, caidas: bajaron.length });

      // Las preguntas a la IA van en la misma pasada, si el cliente tiene.
      const conPrompts = await db.promptIa.count({ where: { clienteId: c.id, activo: true } });
      if (conPrompts > 0) {
        try {
          const ia = await medirIa({ clienteId: c.id, usuarioId: null, concepto: "ia_programada" });
          const perdidas = desaparecidas(ia.cambios);
          if (perdidas.length > 0) {
            const lista = perdidas
              .slice(0, 4)
              .map((x) => `${MODELOS[x.plataforma].nombre}: «${x.prompt.slice(0, 70)}»`)
              .join(" · ");
            await avisar(
              `🤖 ${c.nombre} dejó de aparecer en ${perdidas.length} ${perdidas.length === 1 ? "respuesta" : "respuestas"} de IA: ${lista}${perdidas.length > 4 ? "…" : ""}. ${PANEL}/panel/clientes/${c.id}?t=ia`,
              { clienteId: c.id, accion: "aviso_ia" }
            );
          }
        } catch (e) {
          await anotar({ clienteId: c.id, accion: "ia_programada", resumen: `No se pudo medir la IA: ${e instanceof Error ? e.message : "error"}`, resultado: "error" });
        }
      }

      if (bajaron.length > 0) {
        const lista = bajaron
          .slice(0, 5)
          .map((x) => `«${x.termino}» ${x.antes}→${x.ahora ?? "fuera"}`)
          .join(", ");
        await avisar(
          `📉 ${c.nombre}: ${bajaron.length} ${bajaron.length === 1 ? "palabra cayó" : "palabras cayeron"} desde la última medición: ${lista}${bajaron.length > 5 ? "…" : ""}. ${PANEL}/panel/clientes/${c.id}?t=posiciones`,
          { clienteId: c.id, accion: "aviso_posiciones" }
        );
      }
    } catch (e) {
      await anotar({
        clienteId: c.id,
        accion: "posiciones_programadas",
        resumen: `No se pudo medir: ${e instanceof Error ? e.message : "error"}`,
        resultado: "error",
      });
    } finally {
      soltar(candado);
    }
  }

  return Response.json({ medidos: hechos, saltados });
}
