/**
 * Herramientas que el asistente puede usar sobre un sitio WordPress.
 *
 * Cada una envuelve un endpoint del conector. Dos reglas de diseño que
 * conviene no romper:
 *
 * 1. Las de lectura devuelven resúmenes, no volcados completos. Traer 2000
 *    productos con sus descripciones a la conversación la llena de ruido y
 *    cuesta dinero en cada turno posterior.
 *
 * 2. Las de escritura comprueban el permiso ANTES de llamar, y devuelven el
 *    estado anterior. Que el modelo pueda deshacer lo que hizo es lo que hace
 *    seguro dejarle escribir.
 */
import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { api, anotar } from "@/lib/clientes";
import { analizarCompetencia } from "@/lib/competencia";
import { db } from "@/lib/db";
import { consultas as consultasGsc } from "@/lib/gsc";
import { apuntar } from "@/lib/gasto";
import { herramientasShopify } from "@/lib/herramientasShopify";

export interface Contexto {
  clienteId: string;
  usuarioId: string;
  /** Si es falso, las herramientas de escritura se niegan sin llamar al sitio. */
  puedeEscribir: boolean;
  /** «wordpress» o «shopify». Cambia solo cómo se escribe en el sitio. */
  plataforma?: string;
}

/** Error legible para el modelo: se le devuelve como texto, no como excepción. */
function problema(mensaje: string) {
  return `ERROR: ${mensaje}`;
}

/**
 * Deja anotado en el registro todo fallo de una herramienta.
 *
 * Se envuelve la lista entera en vez de anotar dentro de cada `run` por una
 * razón práctica: un registro que depende de que quien escribe la herramienta
 * se acuerde de anotar acaba con la mitad de los fallos sin anotar, y son
 * justo los de las herramientas nuevas —las que más fallan—.
 *
 * Se muta `run` sobre el mismo objeto y no se devuelve una copia porque el SDK
 * espera la forma exacta que produce `betaZodTool`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function conRegistro<T extends { name: string; run: (...a: any[]) => unknown }>(
  herramientas: T[],
  ctx: Contexto
): T[] {
  for (const h of herramientas) {
    const original = h.run.bind(h);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h.run = (async (...args: any[]) => {
      const guardar = (resumen: string) =>
        anotar({
          usuarioId: ctx.usuarioId,
          clienteId: ctx.clienteId,
          accion: h.name,
          resumen,
          resultado: "error",
        }).catch(() => {
          // Si ni siquiera se puede anotar el fallo, no se convierte eso en un
          // segundo fallo que tape al primero.
        });

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const salida = await original(...(args as any));

        if (typeof salida === "string" && salida.startsWith("ERROR: ")) {
          await guardar(salida.slice(7));
        }

        return salida;
      } catch (e) {
        await guardar(e instanceof Error ? e.message : "fallo sin mensaje");
        throw e;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  }

  return herramientas;
}

export function herramientasDe(ctx: Contexto) {
  const soloLectura = () =>
    problema(
      "No tienes permiso de escritura sobre este cliente. Explícaselo a la persona y sugiérele activarlo en AppSEO → Alcance, dentro del WordPress del cliente."
    );

  const salud = betaZodTool({
    name: "estado_del_sitio",
    description:
      "Estado del sitio: versión del conector, WordPress, PHP y si permite escritura. Úsala al empezar si necesitas saber qué puedes hacer.",
    inputSchema: z.object({}),
    run: async () => {
      const r = await api(ctx.clienteId, "GET", "/health");
      return r.ok ? JSON.stringify(r.datos) : problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
    },
  });

  const listarProductos = betaZodTool({
    name: "listar_productos",
    description:
      "Lista productos de WooCommerce con sus metadatos: nombre, SKU, precio, categorías, conteo de palabras de las descripciones y si tienen meta description. NO devuelve el texto de las descripciones; para eso usa leer_producto.",
    inputSchema: z.object({
      pagina: z.number().int().min(1).default(1).describe("Página, de 100 en 100."),
      estado: z.string().optional().describe("publish, draft… Vacío para todos."),
    }),
    run: async (i) => {
      const r = await api<{ productos: unknown[]; total: number; paginas: number }>(
        ctx.clienteId,
        "GET",
        `/products?pagina=${i.pagina}${i.estado ? `&estado=${encodeURIComponent(i.estado)}` : ""}`
      );
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      return JSON.stringify({
        total: r.datos?.total,
        paginas: r.datos?.paginas,
        pagina: i.pagina,
        productos: r.datos?.productos,
      });
    },
  });

  const leerProducto = betaZodTool({
    name: "leer_producto",
    description:
      "Devuelve un producto completo, incluidas su descripción larga y corta. Léelo antes de reescribirlo: nunca escribas encima de un texto que no has visto.",
    inputSchema: z.object({ id: z.number().int().describe("ID del producto.") }),
    run: async (i) => {
      const r = await api(ctx.clienteId, "GET", `/products/${i.id}`);
      return r.ok ? JSON.stringify(r.datos) : problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
    },
  });

  const escribirProducto = betaZodTool({
    name: "escribir_producto",
    description:
      "Actualiza campos editoriales de un producto. Devuelve el estado anterior para poder deshacer. Los precios y el stock están bloqueados salvo que el cliente lo permita expresamente.",
    inputSchema: z.object({
      id: z.number().int(),
      nombre: z.string().optional(),
      descripcion: z.string().optional().describe("HTML de la descripción larga."),
      descripcion_corta: z.string().optional(),
      meta: z
        .record(z.string(), z.string())
        .optional()
        .describe("Metadatos de Yoast: _yoast_wpseo_metadesc, _yoast_wpseo_title, _yoast_wpseo_focuskw."),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      const r = await api(ctx.clienteId, "POST", "/products", i);
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: "producto_escribir",
        resumen: `Producto ${i.id} actualizado`,
      });
      return JSON.stringify(r.datos);
    },
  });

  const crearProducto = betaZodTool({
    name: "crear_producto",
    description:
      "Crea un producto nuevo en WooCommerce. Nace como borrador salvo que pidas otro estado, y el sitio puede tener desactivada la publicación directa. No escribe precio, stock ni SKU: eso se pone a mano en la tienda.",
    inputSchema: z.object({
      nombre: z.string().describe("Nombre del producto, tal como lo verá el visitante."),
      descripcion: z.string().optional().describe("HTML de la descripción larga."),
      descripcion_corta: z.string().optional(),
      slug: z
        .string()
        .optional()
        .describe("Parte final de la URL. Sin esto, WordPress la deduce del nombre."),
      categorias: z
        .array(z.number().int())
        .optional()
        .describe("IDs de categorías de producto, los que devuelve listar_categorias."),
      etiquetas: z.array(z.string()).optional(),
      estado: z
        .enum(["draft", "pending", "private", "publish"])
        .optional()
        .describe("Por omisión, draft."),
      meta: z
        .record(z.string(), z.string())
        .optional()
        .describe("Metadatos de Yoast: _yoast_wpseo_metadesc, _yoast_wpseo_title, _yoast_wpseo_focuskw."),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      const r = await api<{ id: number; url: string; editar: string }>(
        ctx.clienteId,
        "POST",
        "/products",
        i
      );
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: "producto_crear",
        resumen: `${i.nombre} → ${r.datos?.url ?? ""}`,
      });
      return JSON.stringify(r.datos);
    },
  });

  const crearCategoria = betaZodTool({
    name: "crear_categoria",
    description:
      "Crea una categoría de producto en WooCommerce, opcionalmente colgando de otra. Es lo que levanta las secciones que faltan de la arquitectura. Si ya existe una con ese nombre, el sitio responde con su id para que escribas encima en vez de duplicarla.",
    inputSchema: z.object({
      nombre: z.string().describe("Nombre de la categoría."),
      seo: z
        .string()
        .optional()
        .describe("HTML de la descripción SEO que se muestra al pie de la categoría."),
      slug: z.string().optional().describe("Parte final de la URL. Sin esto se deduce del nombre."),
      padre: z
        .number()
        .int()
        .optional()
        .describe("ID de la categoría madre. Omítelo para dejarla en el primer nivel."),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      const r = await api<{ id: number; nombre: string; url: string; editar: string }>(
        ctx.clienteId,
        "POST",
        "/terms",
        { ...i, taxonomia: "product_cat" }
      );
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: "categoria_crear",
        resumen: `${i.nombre} → ${r.datos?.url ?? ""}`,
      });
      return JSON.stringify(r.datos);
    },
  });

  const listarCategorias = betaZodTool({
    name: "listar_categorias",
    description:
      "Categorías de producto con cuántos productos tiene cada una y cuántos bytes ocupa su descripción SEO. Sirve para saber cuáles faltan por escribir.",
    inputSchema: z.object({
      con_texto: z.boolean().default(false).describe("Incluir el texto completo. Úsalo solo si lo necesitas: infla mucho la respuesta."),
    }),
    run: async (i) => {
      const r = await api(ctx.clienteId, "GET", `/terms?taxonomia=product_cat&con_texto=${i.con_texto}`);
      return r.ok ? JSON.stringify(r.datos) : problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
    },
  });

  const escribirCategoria = betaZodTool({
    name: "escribir_categoria",
    description:
      "Escribe la descripción SEO de una categoría de producto, la que se muestra al pie de la página. Admite HTML: encabezados, listas, tablas y bloques <details> para preguntas frecuentes. Devuelve el texto anterior.",
    inputSchema: z.object({
      id: z.number().int().describe("ID del término."),
      seo: z.string().describe("HTML de la descripción."),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      const r = await api<{ nombre: string; bytes: number }>(ctx.clienteId, "POST", "/terms", {
        id: i.id,
        taxonomia: "product_cat",
        seo: i.seo,
      });
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: "categoria_escribir",
        resumen: `${r.datos?.nombre} · ${r.datos?.bytes} bytes`,
      });
      return JSON.stringify(r.datos);
    },
  });

  const auditar = betaZodTool({
    name: "auditar_contenido",
    description:
      "Inventario de páginas y entradas: título, URL, estado, palabras, editor usado, metadatos SEO y marcadores de texto de relleno. Úsala para encontrar contenido vacío o pobre.",
    inputSchema: z.object({
      por_pagina: z.number().int().min(1).max(500).default(100),
    }),
    run: async (i) => {
      const r = await api<{ content: unknown[]; site: unknown }>(
        ctx.clienteId,
        "GET",
        `/audit?por_pagina=${i.por_pagina}`
      );
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      // El campo `site` trae el inventario entero de plugins y es enorme; se
      // recorta para no gastar contexto en cada llamada.
      const d = r.datos as { content?: unknown[]; site?: Record<string, unknown> };
      return JSON.stringify({
        sitio: { nombre: d.site?.nombre, url: d.site?.url, tema: d.site?.tema },
        contenidos: d.content,
      });
    },
  });

  const escribirContenido = betaZodTool({
    name: "escribir_contenido",
    description:
      "Crea o actualiza una página o entrada. Con `id` actualiza; sin `id` crea. Usa marcado de bloques de Gutenberg en el contenido.",
    inputSchema: z.object({
      id: z.number().int().optional(),
      tipo: z.enum(["post", "page"]).optional(),
      titulo: z.string().optional(),
      slug: z.string().optional(),
      contenido: z.string().optional(),
      estado: z.enum(["draft", "publish", "pending", "private"]).optional(),
      meta: z.record(z.string(), z.string()).optional(),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      const r = await api<{ id: number; url: string }>(ctx.clienteId, "POST", "/content", i);
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: i.id ? "contenido_editar" : "contenido_crear",
        resumen: `${i.titulo ?? "#" + i.id} → ${r.datos?.url ?? ""}`,
      });
      return JSON.stringify(r.datos);
    },
  });

  const leerContenido = betaZodTool({
    name: "leer_contenido",
    description:
      "Devuelve una página o entrada completa: su HTML, su editor (gutenberg o elementor), y si es de Elementor, el JSON de su diseño. Léela antes de rediseñar: nunca escribas encima de una maqueta que no has visto.",
    inputSchema: z.object({ id: z.number().int() }),
    run: async (i) => {
      const r = await api<{ elementor?: { bytes: number; datos: string } }>(
        ctx.clienteId,
        "GET",
        `/content/${i.id}`
      );
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      const d = r.datos as Record<string, unknown> & { elementor?: { bytes: number; datos: string } };
      // Un diseño grande llenaría la conversación y se pagaría en cada turno
      // posterior: se avisa del tamaño en vez de traerlo entero sin pedirlo.
      if (d.elementor && d.elementor.bytes > 60000) {
        return JSON.stringify({
          ...d,
          elementor: {
            ...d.elementor,
            datos: "",
            aviso: `El diseño ocupa ${d.elementor.bytes} bytes y no se ha traído. Usa leer_diseno_elementor si de verdad necesitas el JSON completo.`,
          },
        });
      }
      return JSON.stringify(d);
    },
  });

  const leerDisenoElementor = betaZodTool({
    name: "leer_diseno_elementor",
    description:
      "El JSON completo del diseño de Elementor de una página. Solo cuando vayas a editar una maqueta existente y leer_contenido te haya avisado de que era grande.",
    inputSchema: z.object({ id: z.number().int() }),
    run: async (i) => {
      const r = await api<{ elementor?: { datos: string } }>(ctx.clienteId, "GET", `/content/${i.id}`);
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      return r.datos?.elementor?.datos || problema("Esa página no está maquetada con Elementor.");
    },
  });

  const disenarElementor = betaZodTool({
    name: "disenar_con_elementor",
    description:
      "Crea o rediseña una página con Elementor, escribiendo su maqueta directamente. Recibe la estructura como JSON de Elementor. Úsala cuando el sitio use Elementor y el encargo sea de diseño —una landing, una página de servicio, una home—, no cuando sea solo texto.",
    inputSchema: z.object({
      id: z.number().int().optional().describe("Sin id crea una página nueva; con id rediseña la existente."),
      titulo: z.string().optional(),
      slug: z.string().optional(),
      estado: z.enum(["draft", "publish"]).default("draft"),
      diseno: z
        .string()
        .describe(
          "JSON de Elementor: un array de secciones. Cada sección lleva elType 'section' con 'elements' de elType 'column', y dentro widgets con widgetType y settings. Debe ser JSON válido, sin envolver en markdown."
        ),
      meta: z.record(z.string(), z.string()).optional().describe("Metadatos de Yoast."),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();

      // Se valida aquí y no en el sitio: un JSON roto guardado en
      // `_elementor_data` deja la página en blanco y solo se nota al abrirla.
      let estructura: unknown;
      try {
        estructura = JSON.parse(i.diseno);
      } catch (e) {
        return problema(
          "El diseño no es JSON válido: " + (e instanceof Error ? e.message : "error de sintaxis")
        );
      }
      if (!Array.isArray(estructura)) {
        return problema("El diseño debe ser un array de secciones de Elementor, no un objeto suelto.");
      }

      const r = await api<{ id: number; url: string }>(ctx.clienteId, "POST", "/content", {
        id: i.id,
        tipo: "page",
        titulo: i.titulo,
        slug: i.slug,
        estado: i.estado,
        meta: {
          ...(i.meta ?? {}),
          _elementor_edit_mode: "builder",
          _elementor_data: JSON.stringify(estructura),
          // Sin plantilla asignada Elementor renderiza con la del tema y la
          // maqueta aparece encajonada dentro del contenido.
          _wp_page_template: "elementor_header_footer",
        },
      });

      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: i.id ? "diseno_editar" : "diseno_crear",
        resumen: `${i.titulo ?? "#" + i.id} · ${(estructura as unknown[]).length} secciones`,
      });
      return JSON.stringify({
        ...r.datos,
        aviso:
          "Elementor guarda su propia caché de CSS. Si la página se ve sin estilos, hay que regenerarla desde Elementor → Herramientas.",
      });
    },
  });

  const leerCss = betaZodTool({
    name: "leer_css",
    description: "CSS adicional del sitio, el del personalizador de WordPress.",
    inputSchema: z.object({}),
    run: async () => {
      const r = await api(ctx.clienteId, "GET", "/css");
      return r.ok ? JSON.stringify(r.datos) : problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
    },
  });

  const escribirCss = betaZodTool({
    name: "escribir_css",
    description:
      "Escribe el CSS adicional. `anexar` añade al final; `reemplazar` sustituye todo. WordPress guarda revisiones, así que siempre se puede volver atrás.",
    inputSchema: z.object({
      css: z.string(),
      modo: z.enum(["anexar", "reemplazar"]).default("anexar"),
    }),
    run: async (i) => {
      if (!ctx.puedeEscribir) return soloLectura();
      const r = await api<{ bytes: number; modo: string }>(ctx.clienteId, "POST", "/css", i);
      if (!r.ok) return problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
      await anotar({
        usuarioId: ctx.usuarioId,
        clienteId: ctx.clienteId,
        accion: "css_escribir",
        resumen: `${r.datos?.modo} · ${r.datos?.bytes} bytes`,
      });
      return JSON.stringify(r.datos);
    },
  });

  const registro = betaZodTool({
    name: "ver_registro",
    description: "Últimas operaciones que el conector ha hecho en este sitio, con su resultado.",
    inputSchema: z.object({ por_pagina: z.number().int().min(1).max(100).default(20) }),
    run: async (i) => {
      const r = await api(ctx.clienteId, "GET", `/log?por_pagina=${i.por_pagina}`);
      return r.ok ? JSON.stringify(r.datos) : problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
    },
  });

  const tema = betaZodTool({
    name: "reconocer_tema",
    description:
      "Tema activo, su paleta de colores, si sobrescribe plantillas de WooCommerce, y si el marcado estándar llega a renderizarse. Consúltala antes de escribir CSS: cada tienda monta las fichas de forma distinta.",
    inputSchema: z.object({
      url: z.string().optional().describe("Página concreta a analizar. Vacío para que elija una representativa."),
    }),
    run: async (i) => {
      const r = await api(ctx.clienteId, "GET", `/theme${i.url ? `?url=${encodeURIComponent(i.url)}` : ""}`);
      return r.ok ? JSON.stringify(r.datos) : problema(r.mensaje || r.codigo || `HTTP ${r.estado}`);
    },
  });

  const competencia = betaZodTool({
    name: "analizar_competencia",
    description:
      "Trae los primeros resultados de Google para una consulta y los desarma: extensión de cada uno, sus encabezados, el vocabulario que comparten y las preguntas que responden. ÚSALA SIEMPRE antes de escribir cualquier contenido: sin esto estarías adivinando qué espera Google. Cuesta unos centavos por consulta, así que llámala una vez por tema, no una vez por párrafo.",
    inputSchema: z.object({
      consulta: z.string().describe("La búsqueda por la que quieres competir, tal como la escribiría una persona."),
      ubicacion: z
        .number()
        .int()
        .optional()
        .describe("Código de país de Google Ads. 2152 Chile (por defecto), 2724 España, 2484 México, 2032 Argentina."),
      cuantos: z.number().int().min(1).max(5).optional().describe("Cuántos resultados analizar. Por defecto 3."),
    }),
    run: async (i) => {
      try {
        const r = await analizarCompetencia(i.consulta, i.ubicacion ?? 2152, i.cuantos ?? 3);

        await apuntar({
          clienteId: ctx.clienteId,
          usuarioId: ctx.usuarioId,
          servicio: "dataforseo",
          concepto: "analisis de serp",
          monto: r.coste ?? 0,
          detalle: `«${i.consulta}» · ${r.rivales.length} rivales`,
        });

        await anotar({
          usuarioId: ctx.usuarioId,
          clienteId: ctx.clienteId,
          accion: "competencia",
          resumen: `SERP analizado: «${i.consulta}» · ${r.rivales.length} rivales · US$${(r.coste ?? 0).toFixed(3)}`,
        });

        // Se devuelve la anatomía, no el texto de los rivales: volcar tres
        // páginas enteras llenaría la conversación y se pagaría en cada turno
        // siguiente sin aportar nada que no esté aquí resumido.
        return JSON.stringify({
          consulta: r.consulta,
          palabrasObjetivo: r.palabrasObjetivo,
          bloquesDeGoogle: r.bloques,
          preguntasDelSerp: r.preguntasSerp,
          vocabularioCompartido: r.vocabulario,
          rivales: r.rivales.map((x) => ({
            puesto: x.puesto,
            url: x.url,
            titulo: x.titulo,
            palabras: x.palabras,
            h1: x.h1,
            encabezados: x.encabezados,
            preguntas: x.preguntas,
            error: x.error,
          })),
        });
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudo analizar el SERP.");
      }
    },
  });

  /**
   * Lo que Google dice de este sitio.
   *
   * Se devuelve resumido y ya interpretado —tramos, oportunidades, consultas
   * canibalizadas— en vez del volcado de mil filas: la conversación necesita
   * el panorama para decidir, no la tabla entera, que además se pagaría en
   * cada turno posterior.
   */
  const searchConsole = betaZodTool({
    name: "ver_search_console",
    description:
      "Datos reales de Google Search Console para este sitio: cuántas palabras posiciona y en qué tramos, qué consultas están entre los puestos 4 y 20 con margen de mejora, y en cuáles hay dos páginas del sitio compitiendo entre sí. Úsala antes de decidir qué contenido escribir o mejorar: te dice dónde ya hay visibilidad que aprovechar.",
    inputSchema: z.object({
      dias: z.number().int().min(7).max(180).optional().describe("Periodo en días. Por defecto 28."),
      foco: z
        .enum(["resumen", "oportunidades", "canibalizacion"])
        .optional()
        .describe("Qué mirar. Por defecto «resumen», que trae un poco de todo."),
      buscar: z.string().optional().describe("Solo las consultas que contengan este texto."),
    }),
    run: async (i) => {
      const cliente = await db.cliente.findUnique({
        where: { id: ctx.clienteId },
        select: { gscConexionId: true, gscPropiedad: true },
      });

      if (!cliente?.gscConexionId || !cliente.gscPropiedad) {
        return problema(
          "Este cliente no tiene Search Console conectado. Se conecta desde la pestaña Posiciones."
        );
      }

      let filas;
      try {
        filas = await consultasGsc(cliente.gscConexionId, cliente.gscPropiedad, i.dias ?? 28);
      } catch (e) {
        return problema(e instanceof Error ? e.message : "No se pudo leer Search Console.");
      }

      if (i.buscar) {
        const q = i.buscar.toLowerCase();
        filas = filas.filter((f) => f.consulta.includes(q));
      }

      const top = (n: number) => filas.filter((f) => f.posicion <= n).length;

      const oportunidades = filas
        .filter((f) => f.posicion >= 4 && f.posicion <= 20 && f.impresiones >= 20)
        .sort((a, b) => b.impresiones - a.impresiones);

      const canibales = filas
        .filter((f) => {
          if (f.paginas < 2 || f.impresiones < 20) return false;
          const segunda = f.urls[1];
          return Boolean(segunda && segunda.impresiones / f.impresiones >= 0.2);
        })
        .sort((a, b) => b.impresiones - a.impresiones);

      const foco = i.foco ?? "resumen";
      const cuantas = foco === "resumen" ? 15 : 40;

      return JSON.stringify({
        periodoDias: i.dias ?? 28,
        propiedad: cliente.gscPropiedad,
        resumen: {
          palabrasPosicionadas: filas.length,
          clics: filas.reduce((s, f) => s + f.clics, 0),
          impresiones: filas.reduce((s, f) => s + f.impresiones, 0),
          top3: top(3),
          top10: top(10),
          top20: top(20),
          top100: top(100),
          oportunidades: oportunidades.length,
          canibalizando: canibales.length,
        },
        ...(foco !== "canibalizacion"
          ? {
              oportunidades: oportunidades.slice(0, cuantas).map((f) => ({
                consulta: f.consulta,
                posicion: f.posicion,
                impresiones: f.impresiones,
                clics: f.clics,
                url: f.pagina,
              })),
            }
          : {}),
        ...(foco !== "oportunidades"
          ? {
              canibalizacion: canibales.slice(0, cuantas).map((f) => ({
                consulta: f.consulta,
                impresiones: f.impresiones,
                paginasEnPugna: f.urls.map((u) => ({
                  url: u.url,
                  posicion: u.posicion,
                  impresiones: u.impresiones,
                })),
              })),
            }
          : {}),
      });
    },
  });

  const posiciones = betaZodTool({
    name: "ver_posiciones",
    description:
      "Las consultas que este cliente tiene en seguimiento medido, con su puesto actual en Google, cuánto se movió desde la medición anterior y qué URL está posicionando.",
    inputSchema: z.object({
      buscar: z.string().optional().describe("Solo las que contengan este texto."),
    }),
    run: async (i) => {
      const keywords = await db.keyword.findMany({
        where: {
          clienteId: ctx.clienteId,
          activa: true,
          ...(i.buscar ? { termino: { contains: i.buscar, mode: "insensitive" } } : {}),
        },
        include: { posiciones: { orderBy: { medido: "desc" }, take: 2 } },
        orderBy: { creado: "asc" },
      });

      if (keywords.length === 0) {
        return "No hay ninguna consulta en seguimiento medido para este cliente.";
      }

      return JSON.stringify({
        total: keywords.length,
        consultas: keywords.map((k) => ({
          termino: k.termino,
          dispositivo: k.dispositivo,
          puesto: k.posiciones[0]?.puesto ?? null,
          anterior: k.posiciones[1]?.puesto ?? null,
          url: k.posiciones[0]?.url ?? null,
          medido: k.posiciones[0]?.medido.toISOString().slice(0, 10) ?? null,
        })),
      });
    },
  });

  const arquitectura = betaZodTool({
    name: "ver_arquitectura",
    description:
      "La arquitectura SEO prevista para este sitio y su estado: qué secciones existen ya y con qué URL, y cuáles faltan por crear con cuántas búsquedas mensuales se están perdiendo. Úsala para saber qué contenido tiene sentido crear y con qué prioridad.",
    inputSchema: z.object({
      estado: z
        .enum(["todo", "falta", "dudosa", "creada"])
        .optional()
        .describe("Filtra por estado. Por defecto «falta», que es lo accionable."),
      cuantas: z.number().int().min(5).max(100).optional().describe("Cuántas devolver. Por defecto 30."),
    }),
    run: async (i) => {
      const a = await db.arquitectura.findFirst({
        where: { clienteId: ctx.clienteId },
        orderBy: { creado: "desc" },
        include: { nodos: { orderBy: { volumen: "desc" } } },
      });

      if (!a) return "Este cliente no tiene ninguna arquitectura cargada.";

      const estado = i.estado ?? "falta";
      const filtrados = estado === "todo" ? a.nodos : a.nodos.filter((n) => n.estado === estado);
      const cuenta = (e: string) => a.nodos.filter((n) => n.estado === e).length;

      return JSON.stringify({
        archivo: a.archivo,
        resumen: {
          secciones: a.nodos.length,
          creadas: cuenta("creada"),
          dudosas: cuenta("dudosa"),
          faltan: cuenta("falta"),
          volumenSinCapturar: a.nodos
            .filter((n) => n.estado === "falta")
            .reduce((s, n) => s + n.volumen, 0),
        },
        mostrando: estado,
        secciones: filtrados.slice(0, i.cuantas ?? 30).map((n) => {
          const kws = JSON.parse(n.keywords) as { keyword: string; volumen: number }[];
          return {
            nombre: n.nombre,
            slug: n.slug,
            nivel: n.nivel,
            volumen: n.volumen,
            keywordPrincipal: kws.sort((x, y) => y.volumen - x.volumen)[0]?.keyword ?? null,
            estado: n.estado,
            url: n.urlDestino,
          };
        }),
      });
    },
  });

  /**
   * Memoria del sitio.
   *
   * Todo lo que aprende de un cliente se guarda contra su identificador y solo
   * se lee con él: mezclar lo de un dominio con lo de otro sería peor que no
   * recordar nada, porque le haría afirmar sobre un sitio cosas que son
   * ciertas en otro.
   */
  const recordar = betaZodTool({
    name: "recordar",
    description:
      "Guarda algo que has aprendido de ESTE sitio y que te servirá en próximas conversaciones: una particularidad del tema, el tratamiento que usa (tú o usted), una decisión que tomó el cliente, algo que no hay que tocar, o qué funcionó y qué no. Guarda solo lo duradero, no lo de hoy. Si ya existe una nota con el mismo título, la reemplaza.",
    inputSchema: z.object({
      titulo: z
        .string()
        .max(80)
        .describe("Clave corta del asunto, para poder actualizarla después. Ej: «tratamiento», «tema y maquetación»."),
      nota: z.string().max(1200).describe("Lo aprendido, en una o dos frases, con el porqué."),
    }),
    run: async (i) => {
      await db.memoria.upsert({
        where: { clienteId_titulo: { clienteId: ctx.clienteId, titulo: i.titulo.trim() } },
        update: { nota: i.nota.trim() },
        create: { clienteId: ctx.clienteId, titulo: i.titulo.trim(), nota: i.nota.trim() },
      });
      return `Anotado sobre este sitio: «${i.titulo.trim()}».`;
    },
  });

  const olvidar = betaZodTool({
    name: "olvidar",
    description:
      "Borra una nota de la memoria de este sitio, cuando dejó de ser cierta. Es tan importante como recordar: una nota equivocada dirige mal todo lo que venga después.",
    inputSchema: z.object({ titulo: z.string().describe("El título exacto de la nota.") }),
    run: async (i) => {
      const { count } = await db.memoria.deleteMany({
        where: { clienteId: ctx.clienteId, titulo: i.titulo.trim() },
      });
      return count ? `Olvidado: «${i.titulo.trim()}».` : problema("No existe esa nota.");
    },
  });

  const bitacora = betaZodTool({
    name: "anotar_en_bitacora",
    description:
      "Anota en la bitácora mensual del cliente un trabajo que acabas de completar sobre el sitio. Es lo que la agencia le enseña al cliente a fin de mes, así que escríbelo en su lenguaje y con cifras: «Optimización de contenido en 12 fichas de producto», no «escribir_producto x12». Anota solo trabajo terminado y visible en el sitio, nunca consultas ni análisis que no cambiaron nada.",
    inputSchema: z.object({
      titulo: z.string().max(200).describe("Qué se hizo, en una frase sin jerga y sin punto final."),
      categoria: z
        .enum(["contenido", "arquitectura", "tecnico", "diseno", "analisis", "otro"])
        .describe("Tipo de trabajo."),
      detalle: z.string().max(400).optional().describe("Una frase más de contexto, si hace falta."),
      urls: z.array(z.string()).max(50).optional().describe("URLs afectadas, como prueba."),
    }),
    run: async (i) => {
      await db.bitacora.create({
        data: {
          clienteId: ctx.clienteId,
          mes: new Date().toISOString().slice(0, 7),
          categoria: i.categoria,
          titulo: i.titulo.replace(/\.$/, ""),
          detalle: i.detalle,
          urls: i.urls?.length ? JSON.stringify(i.urls) : null,
          automatico: true,
        },
      });
      return `Anotado en la bitácora: «${i.titulo}».`;
    },
  });

  const enlaces = betaZodTool({
    name: "ver_backlinks",
    description:
      "El perfil de enlaces entrantes del sitio: cuántos dominios distintos lo enlazan, los principales, y con qué textos. Lee la última foto guardada, no consulta al proveedor, así que no cuesta nada. Si no hay ninguna, dilo y sugiere consultarla desde la pestaña Backlinks.",
    inputSchema: z.object({}),
    run: async () => {
      const foto = await db.backlinks.findUnique({ where: { clienteId: ctx.clienteId } });
      if (!foto) {
        return "No hay ninguna foto del perfil de enlaces. Se consulta desde la pestaña Backlinks del cliente, y cuesta unos centavos.";
      }

      const p = JSON.parse(foto.datos);
      return JSON.stringify({
        medido: foto.medido.toISOString().slice(0, 10),
        resumen: p.resumen,
        dominiosPrincipales: (p.dominios ?? []).slice(0, 25),
        anclasPrincipales: (p.anclas ?? []).slice(0, 20),
      });
    },
  });

  const verPagina = betaZodTool({
    name: "ver_pagina",
    description:
      "Abre una URL y devuelve lo que ve un visitante: código de respuesta, cuánto tardó, título, meta description, encabezados y el texto visible. Úsala para comprobar que lo que acabas de crear se ve de verdad, para mirar una página que da problemas, o para leer una web ajena. No pasa por el conector: pide la página desde fuera, como Google.",
    inputSchema: z.object({
      url: z.string().describe("Dirección completa, con https://"),
      texto: z
        .boolean()
        .default(true)
        .describe("Traer el texto visible. Ponlo en falso si solo quieres saber si responde."),
    }),
    run: async (i) => {
      let destino: URL;
      try {
        destino = new URL(i.url);
      } catch {
        return problema(`«${i.url}» no es una dirección válida. Tiene que empezar por https://`);
      }

      if (destino.protocol !== "https:" && destino.protocol !== "http:") {
        return problema("Solo se pueden abrir direcciones http o https.");
      }

      const arranque = Date.now();

      let r: Response;
      try {
        r = await fetch(destino, {
          redirect: "follow",
          headers: { "User-Agent": "AppSEO/1.0 (+https://panel.agenciaryf.com)" },
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : "error desconocido";
        return problema(
          m.includes("timeout") || m.includes("abort")
            ? "La página no contestó en 20 segundos."
            : `No se pudo abrir: ${m}`
        );
      }

      const ms = Date.now() - arranque;
      const html = await r.text();

      const buscar = (re: RegExp) => (html.match(re)?.[1] ?? "").trim();

      // Se recorta el texto porque una página larga traída entera se paga en
      // cada turno posterior de la conversación, no solo en este.
      const limpio = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return JSON.stringify({
        url: r.url,
        estado: r.status,
        ok: r.status < 400,
        redirigida: r.url !== destino.toString() ? r.url : undefined,
        ms,
        titulo: buscar(/<title[^>]*>([\s\S]*?)<\/title>/i),
        descripcion: buscar(
          /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i
        ),
        h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
          .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
          .slice(0, 5),
        h2: [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
          .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
          .slice(0, 20),
        palabras: limpio ? limpio.split(" ").length : 0,
        texto: i.texto ? limpio.slice(0, 6000) : undefined,
      });
    },
  });

  // Lo que no toca el sitio sirve igual en WordPress y en Shopify: analizar la
  // competencia, leer Search Console, la memoria, la bitácora. Solo cambia la
  // capa que lee y escribe contenido.
  const transversales = [
    verPagina,
    competencia,
    enlaces,
    bitacora,
    recordar,
    olvidar,
    searchConsole,
    posiciones,
    arquitectura,
  ];

  if (ctx.plataforma === "shopify") {
    return conRegistro([...herramientasShopify(ctx), ...transversales], ctx);
  }

  return conRegistro([
    salud,
    ...transversales,
    auditar,
    leerContenido,
    leerDisenoElementor,
    disenarElementor,
    listarProductos,
    leerProducto,
    escribirProducto,
    crearProducto,
    listarCategorias,
    escribirCategoria,
    crearCategoria,
    escribirContenido,
    leerCss,
    escribirCss,
    tema,
    registro,
  ], ctx);
}
