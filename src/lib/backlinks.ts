import "server-only";
import { credenciales, type Credenciales } from "@/lib/dataforseo";

/**
 * Perfil de enlaces entrantes de un sitio, vía DataForSEO.
 *
 * Se piden cuatro cosas en la misma pasada porque por separado no significan
 * nada: el total de enlaces sin saber de cuántos dominios distintos vienen es
 * un número inflado, y los textos de enlace sin el reparto de dominios no
 * dicen si el perfil es natural o comprado.
 *
 * Cada llamada cuesta, así que el resultado se guarda como instantánea y se
 * actualiza cuando alguien lo pide, no al abrir la pantalla.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

export interface DominioEnlazante {
  dominio: string;
  enlaces: number;
  rank: number;
  primeraVez: string | null;
  perdido: boolean;
}

export interface Enlace {
  desde: string;
  hacia: string;
  ancla: string | null;
  rank: number;
  dofollow: boolean;
  visto: string | null;
}

export interface Ancla {
  texto: string;
  enlaces: number;
  dominios: number;
}

export interface PerfilEnlaces {
  dominio: string;
  resumen: {
    enlaces: number;
    dominiosEnlazantes: number;
    dominiosPrincipales: number;
    rank: number;
    nofollow: number;
    rotos: number;
    paginasEnlazadas: number;
  };
  dominios: DominioEnlazante[];
  enlaces: Enlace[];
  anclas: Ancla[];
  coste: number;
  avisos: string[];
}

function cabecera(c: Credenciales) {
  return "Basic " + Buffer.from(`${c.login}:${c.clave}`).toString("base64");
}

/** Una llamada al proveedor. Devuelve el resultado y lo que costó. */
async function pedir(
  c: Credenciales,
  ruta: string,
  cuerpo: Record<string, unknown>
): Promise<{ datos: Record<string, unknown> | null; coste: number; aviso?: string }> {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;

  try {
    const r = await fetch(`${base}/v3/backlinks/${ruta}/live`, {
      method: "POST",
      headers: { Authorization: cabecera(c), "Content-Type": "application/json" },
      body: JSON.stringify([cuerpo]),
      signal: AbortSignal.timeout(90000),
      cache: "no-store",
    });

    if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
    if (!r.ok) throw new Error(`respondió ${r.status}`);

    const j = await r.json();
    const tarea = j?.tasks?.[0];

    if (tarea?.status_code && tarea.status_code !== 20000) {
      // Un fallo en una de las cuatro no debe tumbar las otras tres: se avisa
      // y se sigue con lo que sí llegó.
      return { datos: null, coste: 0, aviso: `${ruta}: ${tarea.status_message ?? tarea.status_code}` };
    }

    return {
      datos: tarea?.result?.[0] ?? null,
      coste: typeof j?.cost === "number" ? j.cost : 0,
    };
  } catch (e) {
    return { datos: null, coste: 0, aviso: `${ruta}: ${e instanceof Error ? e.message : "error"}` };
  }
}

const limpio = (d: string) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function analizarEnlaces(dominio: string): Promise<PerfilEnlaces> {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  const objetivo = limpio(dominio);

  const [resumen, dominios, enlaces, anclas] = await Promise.all([
    pedir(c, "summary", { target: objetivo, include_subdomains: true, internal_list_limit: 10 }),
    pedir(c, "referring_domains", {
      target: objetivo,
      limit: 100,
      order_by: ["backlinks,desc"],
      include_subdomains: true,
    }),
    // Uno por dominio: cien enlaces del mismo sitio son un dato, no cien.
    pedir(c, "backlinks", {
      target: objetivo,
      limit: 100,
      mode: "one_per_domain",
      order_by: ["rank,desc"],
      include_subdomains: true,
    }),
    pedir(c, "anchors", { target: objetivo, limit: 40, order_by: ["backlinks,desc"] }),
  ]);

  const avisos = [resumen, dominios, enlaces, anclas]
    .map((x) => x.aviso)
    .filter((x): x is string => Boolean(x));

  const coste = resumen.coste + dominios.coste + enlaces.coste + anclas.coste;

  if (!resumen.datos && avisos.length === 4) {
    throw new Error(`No se pudo consultar el perfil de enlaces. ${avisos[0]}`);
  }

  const r = (resumen.datos ?? {}) as Record<string, unknown>;

  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const txt = (v: unknown) => (typeof v === "string" && v ? v : null);

  return {
    dominio: objetivo,
    resumen: {
      enlaces: num(r.backlinks),
      dominiosEnlazantes: num(r.referring_domains),
      dominiosPrincipales: num(r.referring_main_domains),
      rank: num(r.rank),
      // El proveedor devuelve los atributos como un objeto con claves
      // variables; se lee con cuidado porque no siempre viene.
      nofollow: num((r.referring_links_attributes as Record<string, unknown> | undefined)?.nofollow),
      rotos: num(r.broken_backlinks),
      paginasEnlazadas: num(r.referring_pages),
    },
    dominios: (((dominios.datos?.items as unknown[]) ?? []) as Record<string, unknown>[]).map((d) => ({
      dominio: String(d.domain ?? ""),
      enlaces: num(d.backlinks),
      rank: num(d.rank),
      primeraVez: txt(d.first_seen)?.slice(0, 10) ?? null,
      perdido: Boolean(d.is_lost),
    })),
    enlaces: (((enlaces.datos?.items as unknown[]) ?? []) as Record<string, unknown>[]).map((e) => ({
      desde: String(e.url_from ?? ""),
      hacia: String(e.url_to ?? ""),
      ancla: txt(e.anchor),
      rank: num(e.rank),
      dofollow: Boolean(e.dofollow),
      visto: txt(e.first_seen)?.slice(0, 10) ?? null,
    })),
    anclas: (((anclas.datos?.items as unknown[]) ?? []) as Record<string, unknown>[]).map((a) => ({
      texto: String(a.anchor ?? "").slice(0, 120),
      enlaces: num(a.backlinks),
      dominios: num(a.referring_domains),
    })),
    coste,
    avisos,
  };
}
