/**
 * Inventario de URLs de un cliente, con su último cambio conocido.
 *
 * Junta dos fuentes: lo que existe (páginas, productos, categorías, leídos del
 * conector) y lo que se le hizo (el registro del propio WordPress). El cruce
 * va por tipo y id de objeto: así cada fila puede decir no solo cuándo se
 * modificó, sino qué operación fue.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, veTodo } from "@/lib/clientes";

export const runtime = "nodejs";

interface EntradaLog {
  creado: string;
  accion: string;
  objeto_tipo: string;
  objeto_id: string;
  resumen: string;
}

export interface Fila {
  id: number;
  titulo: string;
  url: string;
  subtipo: string;
  estado: string;
  palabras: number | null;
  modificado: string | null;
  cambio: { fecha: string; accion: string; resumen: string } | null;
}

export async function GET(req: NextRequest) {
  const sesion = await auth();
  if (!sesion?.user?.id) return Response.json({ error: "Sesión no iniciada." }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const clienteId = q.get("cliente") || "";
  const tipo = q.get("tipo") || "contenido";
  const pagina = Math.max(1, parseInt(q.get("pagina") || "1", 10) || 1);

  const rol = (sesion.user as { rol?: string }).rol ?? "LECTOR";
  if (!veTodo(rol)) {
    const acceso = await db.acceso.findUnique({
      where: { usuarioId_clienteId: { usuarioId: sesion.user.id, clienteId } },
    });
    if (!acceso) return Response.json({ error: "Sin acceso." }, { status: 403 });
  }

  // El registro del sitio, indexado por objeto. Solo la operación más
  // reciente de cada uno: es lo que la tabla muestra como «último cambio».
  const log = await api<{ entradas: EntradaLog[] }>(clienteId, "GET", "/log?por_pagina=100").catch(() => null);
  const ultimo = new Map<string, { fecha: string; accion: string; resumen: string }>();
  for (const e of log?.datos?.entradas ?? []) {
    const clave = `${e.objeto_tipo}:${e.objeto_id}`;
    if (!ultimo.has(clave)) {
      ultimo.set(clave, { fecha: e.creado.slice(0, 16), accion: e.accion, resumen: e.resumen });
    }
  }
  const cambioDe = (tipos: string[], id: number) => {
    for (const t of tipos) {
      const c = ultimo.get(`${t}:${id}`);
      if (c) return c;
    }
    return null;
  };

  if (tipo === "productos") {
    interface P { id: number; nombre: string; url: string; estado: string; palabras_desc: number; modificado: string; seo?: { metadesc?: string } }
    // Solo lo publicado: los borradores no existen para Google ni para el cliente.
    const r = await api<{ productos: P[]; total: number; paginas: number }>(
      clienteId, "GET", `/products?pagina=${pagina}&estado=publish`
    );
    if (!r.ok) return Response.json({ error: r.mensaje || r.codigo }, { status: 502 });

    const filas: Fila[] = (r.datos?.productos ?? []).map((p) => ({
      id: p.id,
      titulo: p.nombre,
      url: p.url,
      subtipo: "producto",
      estado: p.estado,
      palabras: p.palabras_desc ?? null,
      modificado: p.modificado ?? null,
      cambio: cambioDe(["product", "producto"], p.id),
    }));
    return Response.json({ filas, total: r.datos?.total ?? filas.length, paginas: r.datos?.paginas ?? 1, pagina });
  }

  if (tipo === "categorias") {
    interface T { id: number; nombre: string; url: string; productos: number; seo_bytes: number }
    const r = await api<{ terminos: T[] }>(clienteId, "GET", "/terms?taxonomia=product_cat");
    if (!r.ok) return Response.json({ error: r.mensaje || r.codigo }, { status: 502 });

    const filas: Fila[] = (r.datos?.terminos ?? []).map((t) => {
      const cambio = cambioDe(["product_cat", "term"], t.id);
      return {
        id: t.id,
        titulo: t.nombre,
        url: t.url,
        subtipo: `categoría · ${t.productos} prod.`,
        estado: t.seo_bytes ? "con descripción" : "sin descripción",
        palabras: null,
        // Los términos de WordPress no guardan fecha de modificación propia:
        // la única fecha fiable es la del registro del conector.
        modificado: cambio?.fecha ?? null,
        cambio,
      };
    });
    return Response.json({ filas, total: filas.length, paginas: 1, pagina: 1 });
  }

  // Páginas o entradas, según la pestaña, y solo publicadas.
  interface C { id: number; titulo: string; url: string; tipo: string; estado: string; palabras: number; modificado: string }
  const r = await api<{ content: C[] }>(clienteId, "GET", "/audit?por_pagina=300");
  if (!r.ok) return Response.json({ error: r.mensaje || r.codigo }, { status: 502 });

  const claseWp = tipo === "paginas" ? "page" : "post";
  const filas: Fila[] = (r.datos?.content ?? [])
    .filter((c) => c.estado === "publish" && c.tipo === claseWp)
    .map((c) => ({
    id: c.id,
    titulo: c.titulo || "(sin título)",
    url: c.url,
    subtipo: c.tipo === "page" ? "página" : c.tipo === "post" ? "entrada" : c.tipo,
    estado: c.estado,
    palabras: c.palabras ?? null,
    modificado: c.modificado ?? null,
    cambio: cambioDe(["post", "page", "contenido"], c.id),
  }));
  return Response.json({ filas, total: filas.length, paginas: 1, pagina: 1 });
}
