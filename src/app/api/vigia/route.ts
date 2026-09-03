import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth";
import { revisarTodos } from "@/lib/vigia";

/**
 * Dispara una ronda del vigía.
 *
 * La llama el cron del servidor cada diez minutos con una ficha secreta, y
 * también una persona desde el panel cuando quiere comprobar ahora mismo. Son
 * dos formas de autenticarse porque son dos llamantes distintos: el cron no
 * tiene sesión y la persona no debería conocer la ficha.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Comparación en tiempo constante: la ficha no debe poder adivinarse a tientas. */
function fichaValida(recibida: string) {
  const esperada = process.env.VIGIA_TOKEN ?? "";
  if (!esperada || !recibida) return false;

  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const cabecera = req.headers.get("authorization") ?? "";
  const ficha = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";

  if (!fichaValida(ficha)) {
    const sesion = await auth();
    const rol = (sesion?.user as { rol?: string } | undefined)?.rol;

    if (!sesion?.user?.id || rol === "LECTOR") {
      return Response.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const resultados = await revisarTodos();
  const caidos = resultados.filter((r) => !r.webOk || r.conectorOk === false);

  return Response.json({
    revisados: resultados.length,
    caidos: caidos.length,
    detalle: caidos.map((c) => ({ nombre: c.nombre, motivo: c.detalle })),
  });
}
