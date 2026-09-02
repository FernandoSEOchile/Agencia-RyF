import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "@/lib/db";
import { anotar } from "@/lib/clientes";
import {
  tiendaDe,
  salud,
  listarProductos,
  leerProducto,
  escribirProducto,
  listarColecciones,
  escribirColeccion,
} from "@/lib/shopify";

/**
 * Herramientas para tiendas Shopify.
 *
 * Hacen lo mismo que las de WordPress y se llaman igual a propósito, para que
 * el asistente no tenga que saber en qué plataforma está. Por dentro hablan
 * otro idioma: las categorías son colecciones, y el SEO tiene campos propios en
 * vez de depender de qué plugin lleve instalado el sitio.
 *
 * Dos reglas se mantienen igual que en el otro adaptador, y son las que hacen
 * seguro dejar escribir a un modelo: comprobar el permiso antes de llamar, y
 * devolver siempre el estado anterior para poder deshacer.
 */

export interface Contexto {
  clienteId: string;
  usuarioId: string;
  puedeEscribir: boolean;
}

function problema(mensaje: string) {
  return `ERROR: ${mensaje}`;
}

async function abrir(clienteId: string) {
  const c = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { tienda: true, secreto: true },
  });
  if (!c) throw new Error("Ese cliente no existe.");
  return tiendaDe(c);
}

export function herramientasShopify(ctx: Contexto) {
  const soloLectura = () =>
    problema(
      "No tienes permiso de escritura sobre esta tienda. Un administrador puede activarlo desde el panel."
    );

  const estado = betaZodTool({
    name: "estado_del_sitio",
    description: "Comprueba la conexión con la tienda y devuelve su nombre, dominio y moneda.",
    inputSchema: z.object({}),
    run: async () => {
      try {
        return JSON.stringify(await salud(await abrir(ctx.clienteId)));
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudo conectar con la tienda.");
      }
    },
  });

  const productos = betaZodTool({
    name: "listar_productos",
    description:
      "Los productos de la tienda, con su descripción y sus campos SEO. Devuelve un resumen; para el contenido completo de uno concreto, usa leer_producto.",
    inputSchema: z.object({
      buscar: z.string().optional().describe("Filtra por título, tipo o etiqueta."),
      limite: z.number().int().min(1).max(100).optional().describe("Cuántos traer. Por defecto 25."),
      cursor: z.string().optional().describe("Para seguir donde lo dejaste, del resultado anterior."),
    }),
    run: async (i) => {
      try {
        const r = await listarProductos(await abrir(ctx.clienteId), i);
        return JSON.stringify({
          hayMas: r.hayMas,
          cursor: r.cursor,
          productos: r.productos.map((p) => ({
            id: p.id,
            titulo: p.titulo,
            estado: p.estado,
            url: p.url,
            tieneDescripcion: Boolean(p.descripcionHtml?.trim()),
            seoTitulo: p.seoTitulo,
            seoDescripcion: p.seoDescripcion,
          })),
        });
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudieron listar los productos.");
      }
    },
  });

  const leer = betaZodTool({
    name: "leer_producto",
    description: "El contenido completo de un producto: su descripción en HTML y sus campos SEO.",
    inputSchema: z.object({ id: z.string().describe("El id que devuelve listar_productos.") }),
    run: async (i) => {
      try {
        return JSON.stringify(await leerProducto(await abrir(ctx.clienteId), i.id));
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudo leer el producto.");
      }
    },
  });

  const escribir = betaZodTool({
    name: "escribir_producto",
    description:
      "Cambia la descripción o los campos SEO de un producto. Solo se toca lo que envíes. Devuelve cómo estaba antes, por si hay que deshacerlo.",
    inputSchema: z.object({
      id: z.string(),
      descripcionHtml: z.string().optional().describe("La descripción, en HTML."),
      seoTitulo: z.string().max(70).optional().describe("Título para buscadores. Unos 60 caracteres."),
      seoDescripcion: z
        .string()
        .max(320)
        .optional()
        .describe("Meta descripción. Entre 140 y 160 caracteres funciona bien."),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      try {
        const { id, ...cambios } = i;
        const r = await escribirProducto(await abrir(ctx.clienteId), id, cambios);

        await anotar({
          usuarioId: ctx.usuarioId,
          clienteId: ctx.clienteId,
          accion: "producto",
          resumen: `Producto actualizado: ${r.despues.titulo}`,
        });

        return JSON.stringify({ ok: true, antes: r.antes, despues: r.despues });
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudo escribir el producto.");
      }
    },
  });

  const colecciones = betaZodTool({
    name: "listar_categorias",
    description:
      "Las colecciones de la tienda, que es lo que en otras plataformas son las categorías: su descripción, sus campos SEO y cuántos productos tienen.",
    inputSchema: z.object({
      limite: z.number().int().min(1).max(250).optional().describe("Por defecto 100."),
    }),
    run: async (i) => {
      try {
        const r = await listarColecciones(await abrir(ctx.clienteId), i.limite ?? 100);
        return JSON.stringify({
          total: r.length,
          colecciones: r.map((c) => ({
            id: c.id,
            titulo: c.titulo,
            url: c.url,
            productos: c.productos,
            tieneDescripcion: Boolean(c.descripcionHtml?.trim()),
            seoTitulo: c.seoTitulo,
            seoDescripcion: c.seoDescripcion,
          })),
        });
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudieron listar las colecciones.");
      }
    },
  });

  const escribirCol = betaZodTool({
    name: "escribir_categoria",
    description:
      "Cambia la descripción o los campos SEO de una colección. Devuelve cómo estaba antes, por si hay que deshacerlo.",
    inputSchema: z.object({
      id: z.string(),
      descripcionHtml: z.string().optional(),
      seoTitulo: z.string().max(70).optional(),
      seoDescripcion: z.string().max(320).optional(),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      try {
        const { id, ...cambios } = i;
        const r = await escribirColeccion(await abrir(ctx.clienteId), id, cambios);

        await anotar({
          usuarioId: ctx.usuarioId,
          clienteId: ctx.clienteId,
          accion: "categoria",
          resumen: `Colección actualizada: ${r.despues.titulo}`,
        });

        return JSON.stringify({ ok: true, antes: r.antes, despues: r.despues });
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudo escribir la colección.");
      }
    },
  });

  return [estado, productos, leer, escribir, colecciones, escribirCol];
}
