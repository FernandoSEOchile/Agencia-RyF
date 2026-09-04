/**
 * Turno de conversación sobre un cliente.
 *
 * Devuelve un flujo de líneas JSON —una por evento— en vez de esperar a la
 * respuesta completa: una tanda con varias herramientas puede tardar minutos, y
 * dejar la pantalla en blanco todo ese rato es inaceptable.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversar, usoVacio, instrucciones, mensajeDeError, type Turno } from "@/lib/asistente";
import { veTodo, memoriasDe } from "@/lib/clientes";
import { apuntarClaude, costeClaude } from "@/lib/gasto";
import { modelo as modeloActual } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return Response.json({ error: "Sesión no iniciada." }, { status: 401 });
  }

  const { clienteId, conversacionId, mensaje, imagenes } = await req.json();

  const adjuntas: string[] = Array.isArray(imagenes) ? imagenes.filter((x) => typeof x === "string") : [];

  // Un mensaje puede ser solo una imagen —«mira esto»— pero no puede estar
  // vacío del todo.
  if (!clienteId || (!mensaje?.trim() && adjuntas.length === 0)) {
    return Response.json({ error: "Faltan datos." }, { status: 400 });
  }

  if (adjuntas.length > 5) {
    return Response.json({ error: "Máximo 5 imágenes por mensaje." }, { status: 400 });
  }

  // El navegador ya reduce las imágenes antes de enviarlas; este tope es la
  // segunda barrera, por si alguien llama a la API directamente.
  const pesoTotal = adjuntas.reduce((a, x) => a + x.length, 0);
  if (pesoTotal > 12_000_000) {
    return Response.json({ error: "Las imágenes pesan demasiado." }, { status: 413 });
  }

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  const usuarioId = sesion.user.id;

  const cliente = await db.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente || !cliente.activo) {
    return Response.json({ error: "Cliente no disponible." }, { status: 404 });
  }

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId, clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso a este cliente." }, { status: 403 });
  }

  // Un LECTOR nunca escribe, aunque el sitio lo permita. Y si el sitio está en
  // solo lectura, tampoco escribe nadie: manda el ajuste del cliente.
  const puedeEscribir = rol !== "LECTOR" && cliente.soloLectura === false;

  // Conversación: se reutiliza la que venga, o se abre una nueva.
  const conversacion = conversacionId
    ? await db.conversacion.findUnique({ where: { id: conversacionId } })
    : await db.conversacion.create({
        data: {
          clienteId,
          usuarioId,
          titulo: (mensaje?.trim() || "Imagen").slice(0, 60),
        },
      });

  if (!conversacion || conversacion.clienteId !== clienteId) {
    return Response.json({ error: "Conversación no válida." }, { status: 400 });
  }

  const previos = await db.mensaje.findMany({
    where: { conversacionId: conversacion.id },
    orderBy: { creado: "asc" },
    // Se recortan los turnos más antiguos: el historial completo de una
    // conversación larga se paga entero en cada mensaje nuevo.
    take: 40,
  });

  // El primer mensaje da nombre al hilo, como en cualquier chat: un hilo
  // pre-creado con el botón «Nueva conversación» dejaría ese título genérico
  // para siempre.
  if (previos.length === 0 && conversacion.titulo === "Nueva conversación") {
    await db.conversacion.update({
      where: { id: conversacion.id },
      data: { titulo: (mensaje?.trim() || "Imagen").slice(0, 60) },
    });
  }

  await db.mensaje.create({
    data: {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: mensaje ?? "",
      imagenes: adjuntas.length ? JSON.stringify(adjuntas) : null,
      // Los hilos son del cliente y en uno pueden escribir varios, así que
      // «quién dijo esto» deja de ser obvio y hay que anotarlo.
      usuarioId,
    },
  });

  // Las imágenes solo viajan en los dos últimos turnos que las llevaban: una
  // captura de 1 MB reenviada en cada mensaje convierte una conversación larga
  // en una factura larga. Las anteriores se sustituyen por una nota.
  const conImagen = previos.filter((m) => m.imagenes);
  const recientes = new Set(conImagen.slice(-2).map((m) => m.id));

  const historial: Turno[] = [
    ...previos.map((m) => ({
      rol: m.rol as "user" | "assistant",
      contenido:
        m.imagenes && !recientes.has(m.id)
          ? (m.contenido || "") + " [imagen adjunta en un mensaje anterior]"
          : m.contenido,
      imagenes: m.imagenes && recientes.has(m.id) ? (JSON.parse(m.imagenes) as string[]) : undefined,
    })),
    { rol: "user" as const, contenido: mensaje ?? "", imagenes: adjuntas.length ? adjuntas : undefined },
  ];

  // El criterio de diseño son casi mil palabras: se cargan cuando el hilo
  // habla de maquetación, y una vez cargadas se quedan para el resto de la
  // conversación —a mitad de un rediseño nadie quiere que el asistente pierda
  // el criterio porque el último mensaje fue «sí, dale».
  const PALABRAS_DISENO =
    /diseñ|maqueta|elementor|landing|página de (venta|servicio|inicio)|home|plantilla|sección|hero|cta|convertir|conversión|cro|banner|columna|botón/i;
  const conDiseno =
    PALABRAS_DISENO.test(mensaje) || previos.some((m) => PALABRAS_DISENO.test(m.contenido));

  // Redacción: el criterio pesa lo suyo, así que solo viaja cuando el encargo
  // va de escribir. Se mira también en los mensajes previos porque un «hazlo
  // más largo» tres turnos después sigue siendo el mismo encargo.
  const PALABRAS_CONTENIDO =
    /escrib|redact|conten|text|descripc|art[íi]culo|post|blog|categor[íi]a|ficha|copy|t[íi]tulo|meta|párrafo|parrafo|faq|preguntas frecuentes|optimiz|posicion|palabra clave|keyword/i;
  const conContenido =
    PALABRAS_CONTENIDO.test(mensaje) || previos.some((m) => PALABRAS_CONTENIDO.test(m.contenido));

  // Solo las de este cliente: la consulta lleva su identificador y no existe
  // una variante que las traiga todas.
  const memorias = await memoriasDe(clienteId);

  const sistema = instrucciones({
    nombre: cliente.nombre,
    dominio: cliente.dominio,
    version: cliente.version,
    puedeEscribir,
    plataforma: cliente.plataforma,
    conDiseno,
    conContenido,
    memorias,
  });

  const codificador = new TextEncoder();
  const usadas: string[] = [];

  const flujo = new ReadableStream({
    async start(control) {
      const enviar = (e: Record<string, unknown>) =>
        control.enqueue(codificador.encode(JSON.stringify(e) + "\n"));

      enviar({ tipo: "inicio", conversacionId: conversacion.id });

      // Se llena mientras el asistente trabaja, no al terminar: si esto se
      // corta a mitad, los tokens ya generados se pagan igual y hay que
      // apuntarlos. Antes se perdían justo en el caso en que peor sienta.
      const uso = usoVacio();

      try {
        await conversar(
          { clienteId, usuarioId, puedeEscribir, plataforma: cliente.plataforma },
          sistema,
          historial,
          (e) => {
            if (e.tipo === "herramienta") usadas.push(String(e.nombre));
            enviar(e);
          },
          uso
        );

        await db.mensaje.create({
          data: {
            conversacionId: conversacion.id,
            rol: "assistant",
            contenido: uso.texto,
            usadas: usadas.length ? JSON.stringify(usadas) : null,
            entrada: uso.entrada,
            salida: uso.salida,
          },
        });

        // El coste se muestra al terminar: es la única forma de que quien usa
        // el panel sepa lo que va gastando antes de que llegue la factura.
        enviar({
          tipo: "fin",
          entrada: uso.entrada,
          salida: uso.salida,
          coste: costeClaude(
            await modeloActual(),
            uso.entrada,
            uso.salida,
            uso.cacheEscritura,
            uso.cacheLectura
          ),
        });
      } catch (e) {
        enviar({ tipo: "error", mensaje: mensajeDeError(e) });
      } finally {
        // Fuera del try a propósito: una respuesta cortada también se cobra.
        if (uso.entrada || uso.salida || uso.cacheLectura || uso.cacheEscritura) {
          await apuntarClaude({
            clienteId,
            usuarioId,
            concepto: "chat",
            modelo: await modeloActual(),
            entrada: uso.entrada,
            salida: uso.salida,
            cacheEscritura: uso.cacheEscritura,
            cacheLectura: uso.cacheLectura,
          }).catch(() => {
            // Apuntar el gasto nunca puede tumbar la respuesta.
          });
        }
        control.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
