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

export interface Contexto {
  clienteId: string;
  usuarioId: string;
  /** Si es falso, las herramientas de escritura se niegan sin llamar al sitio. */
  puedeEscribir: boolean;
}

/** Error legible para el modelo: se le devuelve como texto, no como excepción. */
function problema(mensaje: string) {
  return `ERROR: ${mensaje}`;
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

  return [
    salud,
    competencia,
    auditar,
    leerContenido,
    leerDisenoElementor,
    disenarElementor,
    listarProductos,
    leerProducto,
    escribirProducto,
    listarCategorias,
    escribirCategoria,
    escribirContenido,
    leerCss,
    escribirCss,
    tema,
    registro,
  ];
}
