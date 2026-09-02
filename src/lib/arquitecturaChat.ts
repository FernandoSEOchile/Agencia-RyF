import "server-only";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "@/lib/db";
import { claveApi, modelo, espacioTrabajo } from "@/lib/config";
import { aplicar, rejillaLegible, aplanar, type Rejilla } from "@/lib/ast";
import { candidatosDe, cotejar } from "@/lib/cotejo";

/**
 * Chat para arreglar una arquitectura mal interpretada.
 *
 * La lectura automática acierta casi siempre, pero «casi» no basta cuando el
 * resultado es el mapa de trabajo de un cliente. Antes la única salida era
 * volver a subir el archivo y esperar suerte. Aquí se puede decir qué está
 * mal y que se corrija.
 *
 * Las herramientas modifican de verdad: reordenan, renombran, cambian de nivel
 * y vuelven a leer el archivo con otro criterio. Hablar sin poder cambiar nada
 * habría sido un adorno.
 */

export interface Ctx {
  arquitecturaId: string;
  clienteId: string;
  usuarioId: string;
}

function problema(m: string) {
  return `ERROR: ${m}`;
}

async function cliente() {
  const apiKey = await claveApi();
  if (!apiKey) throw new Error("No hay clave de la API configurada.");
  const espacio = await espacioTrabajo();
  return new Anthropic({
    apiKey,
    defaultHeaders: espacio ? { "anthropic-workspace-id": espacio } : undefined,
  });
}

export function herramientasArquitectura(ctx: Ctx) {
  const ver = betaZodTool({
    name: "ver_arquitectura",
    description:
      "Las secciones tal como están guardadas ahora mismo: nombre, slug, nivel, volumen, estado y la URL asignada. Úsala antes de cambiar nada.",
    inputSchema: z.object({
      filtro: z
        .enum(["todo", "creada", "dudosa", "falta"])
        .optional()
        .describe("Limita a un estado. Por defecto, todo."),
      buscar: z.string().optional().describe("Solo las secciones cuyo nombre o slug contenga esto."),
    }),
    run: async (i) => {
      const nodos = await db.nodoArquitectura.findMany({
        where: {
          arquitecturaId: ctx.arquitecturaId,
          ...(i.filtro && i.filtro !== "todo" ? { estado: i.filtro } : {}),
          ...(i.buscar
            ? {
                OR: [
                  { nombre: { contains: i.buscar, mode: "insensitive" } },
                  { slug: { contains: i.buscar, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { orden: "asc" },
        select: {
          id: true,
          slug: true,
          nombre: true,
          nivel: true,
          volumen: true,
          estado: true,
          urlDestino: true,
          comoSeCotejo: true,
        },
      });

      return JSON.stringify({ total: nodos.length, secciones: nodos });
    },
  });

  const verArchivo = betaZodTool({
    name: "ver_archivo_original",
    description:
      "Las filas del Excel tal como se leyeron, con su número de fila y de columna. Úsala cuando sospeches que la estructura se interpretó mal, para comprobar contra el original.",
    inputSchema: z.object({
      desde: z.number().int().min(1).optional().describe("Fila por la que empezar. Por defecto la 1."),
      cuantas: z.number().int().min(10).max(150).optional().describe("Cuántas filas traer. Por defecto 60."),
    }),
    run: async (i) => {
      const a = await db.arquitectura.findUnique({
        where: { id: ctx.arquitecturaId },
        select: { rejilla: true, esquema: true },
      });
      if (!a?.rejilla) {
        return problema(
          "Esta arquitectura se subió antes de que se guardara el archivo leído. Para poder revisarlo hay que volver a subir el Excel."
        );
      }

      const rej: Rejilla = JSON.parse(a.rejilla);
      return JSON.stringify({
        hoja: rej.hoja,
        totalFilas: rej.filas.length,
        esquemaUsado: a.esquema ? JSON.parse(a.esquema) : null,
        filas: rejillaLegible(rej, i.desde ?? 1, i.cuantas ?? 60),
      });
    },
  });

  const releer = betaZodTool({
    name: "releer_con_otro_esquema",
    description:
      "Vuelve a leer el Excel guardado aplicando un esquema corregido, y reemplaza TODAS las secciones. Úsala cuando el problema no sea una sección suelta sino la interpretación entera: columnas equivocadas, niveles cambiados, o la regla de qué es una sección. Después hay que recotejar.",
    inputSchema: z.object({
      filaInicio: z.number().int().min(1).describe("Primera fila con datos."),
      niveles: z
        .array(
          z.object({
            nivel: z.number().int().min(1).max(6),
            columnaNombre: z.number().int().min(1),
            columnaVolumen: z.number().int().min(0),
          })
        )
        .min(1),
      marcaSeccion: z.enum(["sin_volumen", "empieza_por_barra", "todas"]),
      textosIgnorar: z.array(z.string()),
      descripcion: z.string().describe("Una frase describiendo la plantilla corregida."),
    }),
    run: async (i) => {
      const a = await db.arquitectura.findUnique({
        where: { id: ctx.arquitecturaId },
        select: { rejilla: true },
      });
      if (!a?.rejilla) return problema("No se guardó el archivo de esta arquitectura. Vuelve a subir el Excel.");

      const rej: Rejilla = JSON.parse(a.rejilla);
      const esquema = { ...i, hoja: rej.hoja };
      const leido = aplicar(rej, esquema);
      const planos = aplanar(leido);

      if (planos.length === 0) {
        return problema("Con ese esquema no sale ninguna sección. Revisa las columnas antes de volver a intentarlo.");
      }

      // Se borra y se recrea en una transacción: quedarse a medias dejaría la
      // arquitectura mezclando dos lecturas distintas, que es peor que
      // cualquiera de las dos.
      await db.$transaction([
        db.nodoArquitectura.deleteMany({ where: { arquitecturaId: ctx.arquitecturaId } }),
        db.arquitectura.update({
          where: { id: ctx.arquitecturaId },
          data: { esquema: JSON.stringify(esquema), cotejado: null },
        }),
        db.nodoArquitectura.createMany({
          data: planos.map((n) => ({
            arquitecturaId: ctx.arquitecturaId,
            slug: n.slug,
            nombre: n.nombre,
            nivel: n.nivel,
            orden: n.orden,
            keywords: JSON.stringify(n.keywords),
            volumen: n.volumen,
            estado: "pendiente",
          })),
        }),
      ]);

      return `Releído: ${planos.length} secciones. Ahora hay que llamar a recotejar para cruzarlas con el sitio.`;
    },
  });

  const editar = betaZodTool({
    name: "editar_seccion",
    description:
      "Cambia una sección concreta: su nombre, su slug, su nivel de jerarquía o la URL que la ataca. Solo se toca lo que envíes.",
    inputSchema: z.object({
      id: z.string().describe("El id de la sección, tal como lo devuelve ver_arquitectura."),
      nombre: z.string().optional(),
      slug: z.string().optional().describe("Debe empezar por «/»."),
      nivel: z.number().int().min(1).max(6).optional(),
      urlDestino: z.string().optional().describe("URL completa, o cadena vacía para quitarla."),
    }),
    run: async (i) => {
      const nodo = await db.nodoArquitectura.findFirst({
        where: { id: i.id, arquitecturaId: ctx.arquitecturaId },
      });
      if (!nodo) return problema("No existe esa sección en esta arquitectura.");

      const datos: Record<string, unknown> = {};
      if (i.nombre !== undefined) datos.nombre = i.nombre;
      if (i.nivel !== undefined) datos.nivel = i.nivel;
      if (i.slug !== undefined) {
        if (!i.slug.startsWith("/")) return problema("El slug debe empezar por «/».");
        datos.slug = i.slug;
      }
      if (i.urlDestino !== undefined) {
        if (i.urlDestino === "") {
          Object.assign(datos, {
            urlDestino: null,
            estado: "falta",
            confianza: 0,
            comoSeCotejo: null,
            nota: null,
          });
        } else if (!/^https?:\/\//.test(i.urlDestino)) {
          return problema("La URL debe empezar por http:// o https://");
        } else {
          Object.assign(datos, {
            urlDestino: i.urlDestino,
            estado: "creada",
            confianza: 100,
            comoSeCotejo: "manual",
            nota: "Asignada desde el chat.",
          });
        }
      }

      await db.nodoArquitectura.update({ where: { id: nodo.id }, data: datos });
      return `Actualizada «${i.nombre ?? nodo.nombre}».`;
    },
  });

  const crear = betaZodTool({
    name: "crear_seccion",
    description: "Añade una sección que faltaba en el archivo.",
    inputSchema: z.object({
      nombre: z.string(),
      slug: z.string().describe("Debe empezar por «/»."),
      nivel: z.number().int().min(1).max(6),
      volumen: z.number().int().min(0).optional(),
      despuesDe: z.string().optional().describe("Id de la sección tras la cual colocarla."),
    }),
    run: async (i) => {
      if (!i.slug.startsWith("/")) return problema("El slug debe empezar por «/».");

      let orden = 0;
      if (i.despuesDe) {
        const ref = await db.nodoArquitectura.findFirst({
          where: { id: i.despuesDe, arquitecturaId: ctx.arquitecturaId },
        });
        orden = ref ? ref.orden + 1 : 0;
      } else {
        const ultimo = await db.nodoArquitectura.findFirst({
          where: { arquitecturaId: ctx.arquitecturaId },
          orderBy: { orden: "desc" },
        });
        orden = (ultimo?.orden ?? 0) + 1;
      }

      await db.nodoArquitectura.create({
        data: {
          arquitecturaId: ctx.arquitecturaId,
          slug: i.slug,
          nombre: i.nombre,
          nivel: i.nivel,
          orden,
          keywords: "[]",
          volumen: i.volumen ?? 0,
          estado: "falta",
        },
      });

      return `Creada «${i.nombre}».`;
    },
  });

  const borrar = betaZodTool({
    name: "borrar_seccion",
    description:
      "Quita una sección de la arquitectura. Úsala para lo que se coló por error: filas de resumen, cabeceras o texto suelto que se leyó como si fuera una sección.",
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).describe("Ids de las secciones a quitar."),
    }),
    run: async (i) => {
      const { count } = await db.nodoArquitectura.deleteMany({
        where: { id: { in: i.ids }, arquitecturaId: ctx.arquitecturaId },
      });
      return `Quitadas ${count} secciones.`;
    },
  });

  const recotejar = betaZodTool({
    name: "recotejar",
    description:
      "Vuelve a cruzar las secciones contra las URLs que existen en el sitio, respetando las que se asignaron a mano. Llámala después de releer o de cambiar slugs.",
    inputSchema: z.object({}),
    run: async () => {
      const cliente = await db.cliente.findUnique({ where: { id: ctx.clienteId } });
      if (!cliente) return problema("No se encontró el cliente.");

      const candidatos = await candidatosDe(ctx.clienteId, cliente.dominio);
      const nodos = await db.nodoArquitectura.findMany({ where: { arquitecturaId: ctx.arquitecturaId } });

      let tocados = 0;
      for (const n of nodos) {
        // Lo asignado a mano manda sobre el cruce automático: si alguien se
        // molestó en decidirlo, no se le pisa.
        if (n.comoSeCotejo === "manual") continue;

        const v = cotejar(n.slug, n.nombre, candidatos);
        await db.nodoArquitectura.update({
          where: { id: n.id },
          data: {
            estado: v.estado,
            urlDestino: v.urlDestino,
            objetoId: v.objetoId,
            tipoObjeto: v.tipoObjeto,
            confianza: v.confianza,
            comoSeCotejo: v.comoSeCotejo,
            nota: v.nota,
          },
        });
        tocados++;
      }

      await db.arquitectura.update({
        where: { id: ctx.arquitecturaId },
        data: { cotejado: new Date() },
      });

      const resumen = await db.nodoArquitectura.groupBy({
        by: ["estado"],
        where: { arquitecturaId: ctx.arquitecturaId },
        _count: true,
      });

      return `Recotejadas ${tocados} secciones. ${resumen.map((r) => `${r.estado}: ${r._count}`).join(", ")}.`;
    },
  });

  return [ver, verArchivo, releer, editar, crear, borrar, recotejar];
}

export function instruccionesArquitectura(nombre: string, dominio: string) {
  return `Ayudas a un especialista SEO a dejar bien la arquitectura del sitio ${nombre} (${dominio}).

QUÉ ES ESTO
Se subió un Excel con la arquitectura prevista del sitio: las secciones que debería tener, con sus keywords objetivo y su volumen. El panel lo leyó automáticamente y cruzó cada sección contra las URLs que existen de verdad, para saber cuáles están creadas y cuáles faltan.

Esa lectura automática a veces se equivoca, y tú estás aquí para arreglarla hablando.

CÓMO TRABAJAS
- Antes de cambiar nada, mira. Usa ver_arquitectura para ver cómo está, y ver_archivo_original cuando sospeches que la interpretación del Excel fue mala.
- Distingue los dos tipos de problema. Si son dos o tres secciones sueltas, se arreglan una a una con editar_seccion, crear_seccion o borrar_seccion. Si lo que está mal es la interpretación entera —columnas cambiadas, niveles al revés, filas de resumen leídas como secciones— no vayas parcheando: comprueba el archivo original y usa releer_con_otro_esquema.
- Después de releer o de cambiar slugs, llama a recotejar. Si no, la tabla sigue mostrando el cruce viejo.
- Lo que alguien asignó a mano no se toca al recotejar. Está así a propósito.

CÓMO HABLAS
Español de Chile, directo. Di qué vas a hacer antes de hacerlo cuando sea un cambio grande —releer reemplaza todas las secciones— y confirma con la persona antes de ejecutarlo. Para cambios pequeños, hazlos y cuenta qué cambió.

Cuando termines, resume en una o dos frases qué quedó distinto. Y si algo que te piden no se puede hacer con las herramientas que tienes, dilo claro en vez de fingir que lo hiciste.`;
}

export async function conversarArquitectura(
  ctx: Ctx,
  sistema: string,
  historial: { rol: "user" | "assistant"; contenido: string }[],
  emitir: (e: { tipo: string; [k: string]: unknown }) => void
) {
  const anthropic = await cliente();

  const runner = anthropic.beta.messages.toolRunner({
    model: await modelo(),
    max_tokens: 16000,
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    tools: herramientasArquitectura(ctx),
    messages: historial.map((t) => ({ role: t.rol, content: t.contenido })),
    stream: true,
  });

  let texto = "";
  let entrada = 0;
  let salida = 0;

  for await (const flujo of runner) {
    for await (const evento of flujo) {
      if (evento.type === "content_block_start" && evento.content_block.type === "tool_use") {
        emitir({ tipo: "herramienta", nombre: evento.content_block.name });
      } else if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
        texto += evento.delta.text;
        emitir({ tipo: "texto", texto: evento.delta.text });
      }
    }

    const mensaje = await flujo.finalMessage();
    entrada += mensaje.usage.input_tokens ?? 0;
    salida += mensaje.usage.output_tokens ?? 0;

    if (mensaje.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: mensaje.content });
    }
  }

  return { texto, entrada, salida };
}
