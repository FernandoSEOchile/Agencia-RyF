import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { veTodo, anotar } from "@/lib/clientes";
import { medir, type Medicion } from "@/lib/velocidad";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Mide unas pocas páginas representativas con PageSpeed.
 *
 * Pocas y no todas porque cada medición tarda entre quince y cuarenta segundos:
 * Google carga la página de verdad en un navegador. Medir un catálogo entero
 * serían horas, y tampoco haría falta — las fichas de producto de una tienda
 * pesan casi lo mismo entre ellas, así que con una basta para saber cómo van
 * todas.
 */
async function permiso(clienteId: string) {
  const sesion = await auth();
  if (!sesion?.user?.id) return { error: "Sesión no iniciada.", codigo: 401 as const };

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";

  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return { error: "Sin acceso a este cliente.", codigo: 403 as const };
  }

  return { usuarioId: sesion.user.id, rol };
}

/**
 * Elige qué páginas medir del último rastreo.
 *
 * La portada siempre, y luego la más lenta y la más pesada de lo que se
 * rastreó: si esas dos van bien, el resto también. Medir tres páginas buenas no
 * dice nada; medir las peores dice dónde está el techo.
 */
async function representativas(clienteId: string, dominio: string) {
  const rastreo = await db.rastreo.findFirst({
    where: { clienteId, estado: "terminado" },
    orderBy: { creado: "desc" },
    select: { id: true },
  });

  const limpio = dominio.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const urls = [`https://${limpio}/`];

  if (rastreo) {
    const lentas = await db.pagina.findMany({
      where: { rastreoId: rastreo.id, estado: { lt: 400 } },
      orderBy: { ms: "desc" },
      take: 2,
      select: { url: true },
    });
    for (const p of lentas) if (!urls.includes(p.url)) urls.push(p.url);
  }

  return urls.slice(0, 3);
}

export async function POST(req: NextRequest) {
  const { clienteId } = (await req.json().catch(() => ({}))) as { clienteId?: string };
  if (!clienteId) return Response.json({ error: "Falta el cliente." }, { status: 400 });

  const p = await permiso(clienteId);
  if ("error" in p) return Response.json({ error: p.error }, { status: p.codigo });
  if (p.rol === "LECTOR") {
    return Response.json({ error: "Los lectores no pueden lanzar mediciones." }, { status: 403 });
  }

  const cliente = await db.cliente.findUnique({
    where: { id: clienteId },
    select: { dominio: true, nombre: true },
  });
  if (!cliente) return Response.json({ error: "Ese cliente no existe." }, { status: 404 });

  const urls = await representativas(clienteId, cliente.dominio);

  // En serie: PageSpeed limita las peticiones por minuto y en paralelo lo
  // único que se consigue es que las devuelva todas con un 429.
  const mediciones: Medicion[] = [];
  for (const u of urls) mediciones.push(await medir(u));

  const buenas = mediciones.filter((m) => m.nota != null);

  await anotar({
    usuarioId: p.usuarioId,
    clienteId,
    accion: "velocidad",
    resumen: buenas.length
      ? `${buenas.length} páginas medidas · nota media ${Math.round(
          buenas.reduce((t, m) => t + (m.nota ?? 0), 0) / buenas.length
        )}`
      : "No se pudo medir ninguna página",
    resultado: buenas.length ? "ok" : "error",
  });

  return Response.json({ mediciones });
}
