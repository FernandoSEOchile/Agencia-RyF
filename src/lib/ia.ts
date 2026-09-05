import "server-only";
import { db } from "@/lib/db";
import { credenciales, type Credenciales } from "@/lib/dataforseo";
import { apuntar } from "@/lib/gasto";
import { anotar } from "@/lib/clientes";
import { detectar, type Anotacion, type Deteccion } from "@/lib/iaTexto";

/**
 * Visibilidad en las respuestas de IA.
 *
 * La unidad no es la palabra clave sino el prompt: lo que una persona le
 * pregunta a ChatGPT o a Gemini («¿qué purificador de agua me recomiendan
 * en Santiago?»). Se lanza la pregunta con búsqueda web, se guarda la
 * respuesta y se mira si nombra o cita al cliente. Cada pregunta se paga al
 * proveedor —unos tres centavos con búsqueda—, así que se hace cuando alguien
 * lo pide o lo programa, nunca sola.
 */

export type Plataforma = "chatgpt" | "gemini";

/** Los modelos baratos con búsqueda web; medidos en vivo: ~US$0,03 el prompt. */
export const MODELOS: Record<Plataforma, { ruta: string; modelo: string; nombre: string }> = {
  chatgpt: { ruta: "chat_gpt", modelo: "gpt-4o-mini", nombre: "ChatGPT" },
  gemini: { ruta: "gemini", modelo: "gemini-2.5-flash", nombre: "Gemini" },
};

export const PLATAFORMAS = Object.keys(MODELOS) as Plataforma[];

/** Lo que costó de media un prompt en la prueba real, para estimar antes de lanzar. */
export const COSTE_ESTIMADO_PROMPT = 0.032;

function cabecera(c: Credenciales) {
  return "Basic " + Buffer.from(`${c.login}:${c.clave}`).toString("base64");
}

export interface Respuesta extends Deteccion {
  plataforma: Plataforma;
  modelo: string;
  texto: string;
  coste: number;
}

export async function preguntar(
  c: Credenciales,
  plataforma: Plataforma,
  prompt: string,
  cliente: { dominio: string; marca: string }
): Promise<Respuesta> {
  const m = MODELOS[plataforma];
  const base = c.pruebas ? "https://sandbox.dataforseo.com" : "https://api.dataforseo.com";

  const r = await fetch(`${base}/v3/ai_optimization/${m.ruta}/llm_responses/live`, {
    method: "POST",
    headers: { Authorization: cabecera(c), "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        user_prompt: prompt.slice(0, 500),
        model_name: m.modelo,
        web_search: true,
        max_output_tokens: 700,
      },
    ]),
    signal: AbortSignal.timeout(130000),
    cache: "no-store",
  });

  if (r.status === 401) throw new Error("Usuario o contraseña de DataForSEO incorrectos.");
  if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const tarea = j?.tasks?.[0];
  if (tarea?.status_code && tarea.status_code !== 20000) {
    throw new Error(`DataForSEO: ${tarea.status_message ?? tarea.status_code}`);
  }

  const res = tarea?.result?.[0] ?? {};
  type Seccion = { text?: string; annotations?: Anotacion[] };
  const secciones: Seccion[] = (res.items ?? []).flatMap((i: { sections?: Seccion[] }) => i.sections ?? []);
  const texto = secciones.map((s) => s.text ?? "").join("\n").trim();
  const anotaciones = secciones.flatMap((s) => s.annotations ?? []);

  return {
    plataforma,
    modelo: String(res.model_name ?? m.modelo),
    texto: texto.slice(0, 6000),
    coste: typeof j?.cost === "number" ? j.cost : 0,
    ...detectar(texto, anotaciones, cliente),
  };
}

export interface CambioIa {
  prompt: string;
  plataforma: Plataforma;
  antes: boolean | null;
  ahora: boolean;
}

/**
 * Lanza todos los prompts activos de un cliente en las plataformas pedidas.
 *
 * En serie por plataforma y de dos en dos por prompt: cada llamada tarda
 * hasta un minuto y el proveedor no premia la prisa. El gasto se apunta al
 * final con el importe real acumulado.
 */
export async function medirIa(o: {
  clienteId: string;
  usuarioId?: string | null;
  plataformas?: Plataforma[];
  concepto?: string;
}) {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO. Un administrador puede hacerlo en Ajustes.");

  const cliente = await db.cliente.findUnique({
    where: { id: o.clienteId },
    select: { dominio: true, nombre: true, marca: true },
  });
  if (!cliente) throw new Error("Ese cliente no existe.");
  const marca = cliente.marca?.trim() || cliente.nombre;

  const prompts = await db.promptIa.findMany({
    where: { clienteId: o.clienteId, activo: true },
    orderBy: { creado: "asc" },
    include: { respuestas: { orderBy: { medido: "desc" }, take: PLATAFORMAS.length * 2 } },
  });

  const plataformas = o.plataformas?.length ? o.plataformas : PLATAFORMAS;
  const cambios: CambioIa[] = [];
  const fallos: string[] = [];
  let hechas = 0;
  let coste = 0;

  for (let i = 0; i < prompts.length; i += 2) {
    const tanda = prompts.slice(i, i + 2);
    await Promise.all(
      tanda.map(async (p) => {
        for (const plataforma of plataformas) {
          try {
            const r = await preguntar(c, plataforma, p.texto, { dominio: cliente.dominio, marca });
            await db.respuestaIa.create({
              data: {
                promptId: p.id,
                plataforma,
                modelo: r.modelo,
                aparece: r.aparece,
                citado: r.citado,
                posicion: r.posicion,
                url: r.url,
                dominios: JSON.stringify(r.dominios.slice(0, 20)),
                texto: r.texto,
                coste: r.coste,
              },
            });
            const previa = p.respuestas.find((x) => x.plataforma === plataforma);
            cambios.push({ prompt: p.texto, plataforma, antes: previa ? previa.aparece : null, ahora: r.aparece });
            hechas++;
            coste += r.coste;
          } catch (e) {
            fallos.push(`${MODELOS[plataforma].nombre} · «${p.texto.slice(0, 60)}»: ${e instanceof Error ? e.message : "error"}`);
          }
        }
      })
    );
    // Sin saldo o con la clave mal, todo falla igual: no vale la pena seguir.
    if (fallos.length >= 4 && hechas === 0) break;
  }

  if (coste > 0) {
    await apuntar({
      clienteId: o.clienteId,
      usuarioId: o.usuarioId ?? undefined,
      servicio: "dataforseo",
      concepto: o.concepto ?? "ia",
      monto: coste,
      detalle: `${hechas} respuestas de IA (${plataformas.map((p) => MODELOS[p].nombre).join(", ")})`,
    });
  }

  await anotar({
    usuarioId: o.usuarioId ?? undefined,
    clienteId: o.clienteId,
    accion: o.concepto ?? "ia",
    resumen: `${hechas} respuestas de IA · US$${coste.toFixed(4)}${fallos.length ? ` · ${fallos.length} con error` : ""}`,
    resultado: hechas > 0 ? "ok" : "error",
  });

  return { hechas, coste, fallos, cambios };
}

/** Las que dejaron de aparecer: estaban y ya no. Es lo único que merece aviso. */
export function desaparecidas(cambios: CambioIa[]): CambioIa[] {
  return cambios.filter((x) => x.antes === true && !x.ahora);
}
