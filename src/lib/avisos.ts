import "server-only";
import { db } from "@/lib/db";
import { webhookAvisos } from "@/lib/config";

/**
 * Avisos fuera del panel.
 *
 * El vigía detectaba caídas cada diez minutos y no se lo decía a nadie: se
 * enteraba quien abría el panel, es decir, el lunes. Esto manda el aviso a un
 * webhook entrante —Slack, Discord y Google Chat aceptan el mismo POST— que
 * se guarda cifrado desde Ajustes. Un solo canal a propósito: el correo
 * llegará cuando haga falta, no antes.
 *
 * Cada aviso enviado queda en el Registro, para poder responder «¿y por qué
 * nadie avisó?» con la hora exacta.
 */
export async function avisar(
  texto: string,
  datos?: { clienteId?: string; accion?: string }
): Promise<boolean> {
  const url = await webhookAvisos();
  if (!url) return false;

  let ok = false;
  let detalle = "";

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` lo leen Slack y Google Chat; `content`, Discord. Mandar los dos
      // evita tener que preguntar cuál es.
      body: JSON.stringify({ text: texto, content: texto }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    ok = r.ok;
    if (!r.ok) detalle = `el webhook respondió ${r.status}`;
  } catch (e) {
    detalle = e instanceof Error ? e.message : "sin respuesta";
  }

  await db.registro
    .create({
      data: {
        accion: datos?.accion ?? "aviso",
        resumen: (ok ? texto : `No se pudo avisar (${detalle}): ${texto}`).slice(0, 500),
        resultado: ok ? "ok" : "error",
        clienteId: datos?.clienteId,
      },
    })
    .catch(() => {
      // Apuntar el aviso nunca puede tumbar lo que lo provocó.
    });

  return ok;
}
