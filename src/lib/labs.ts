import "server-only";
import { credenciales, type Credenciales } from "@/lib/dataforseo";

/**
 * DataForSEO Labs: el panorama de un dominio que no es tuyo.
 *
 * Para los sitios propios ya está Search Console, que da el dato real y gratis.
 * Esto sirve para lo que Search Console no puede ver: la competencia y los
 * clientes potenciales. Ahí es donde una base de terceros, aunque sea una
 * muestra, es lo único que hay.
 *
 * Conviene saberlo al leer los números: son estimaciones calculadas sobre su
 * propio rastreo, no medidas. En Chile su cobertura es más corta que en
 * mercados grandes, así que sirven para comparar y priorizar, no para
 * facturar sobre ellos.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

export interface TramoPosiciones {
  pos1: number;
  pos2a3: number;
  pos4a10: number;
  pos11a20: number;
  pos21a50: number;
  pos51a100: number;
}

export interface FotoMes {
  mes: string;
  keywords: number;
  trafico: number;
  valor: number;
}

export interface KeywordDominio {
  keyword: string;
  posicion: number;
  volumen: number;
  trafico: number;
  cpc: number;
  url: string | null;
}

export interface Competidor {
  dominio: string;
  coincidencias: number;
  posicionMedia: number;
  trafico: number;
}

export interface PanoramaDominio {
  dominio: string;
  pais: number;
  resumen: {
    keywords: number;
    trafico: number;
    valor: number;
    tramos: TramoPosiciones;
  };
  historico: FotoMes[];
  keywords: KeywordDominio[];
  competidores: Competidor[];
  coste: number;
  avisos: string[];
}

function cabecera(c: Credenciales) {
  return "Basic " + Buffer.from(`${c.login}:${c.clave}`).toString("base64");
}

async function pedir(
  c: Credenciales,
  ruta: string,
  cuerpo: Record<string, unknown>
): Promise<{ datos: Record<string, unknown> | null; coste: number; aviso?: string }> {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;

  try {
    const r = await fetch(`${base}/v3/dataforseo_labs/google/${ruta}/live`, {
      method: "POST",
      headers: { Authorization: cabecera(c), "Content-Type": "application/json" },
      body: JSON.stringify([cuerpo]),
      signal: AbortSignal.timeout(120000),
      cache: "no-store",
    });

    if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
    if (!r.ok) throw new Error(`respondió ${r.status}`);

    const j = await r.json();
    const tarea = j?.tasks?.[0];

    if (tarea?.status_code && tarea.status_code !== 20000) {
      return { datos: null, coste: 0, aviso: `${ruta}: ${tarea.status_message ?? tarea.status_code}` };
    }

    return { datos: tarea?.result?.[0] ?? null, coste: typeof j?.cost === "number" ? j.cost : 0 };
  } catch (e) {
    return { datos: null, coste: 0, aviso: `${ruta}: ${e instanceof Error ? e.message : "error"}` };
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Las métricas orgánicas vienen anidadas y con nombre distinto según endpoint. */
function organico(x: unknown): Record<string, unknown> {
  const m = obj(obj(x).metrics);
  return obj(m.organic);
}

function tramos(o: Record<string, unknown>): TramoPosiciones {
  return {
    pos1: num(o.pos_1),
    pos2a3: num(o.pos_2_3),
    pos4a10: num(o.pos_4_10),
    pos11a20: num(o.pos_11_20),
    pos21a50: num(o.pos_21_30) + num(o.pos_31_40) + num(o.pos_41_50),
    pos51a100: num(o.pos_51_100),
  };
}

const limpio = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function explorarDominio(dominio: string, pais = 2152): Promise<PanoramaDominio> {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  const objetivo = limpio(dominio);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(objetivo)) {
    throw new Error("Eso no parece un dominio. Escríbelo como «ejemplo.cl».");
  }

  const comun = { target: objetivo, location_code: pais, language_code: "es" };

  const [resumen, historico, keywords, competidores] = await Promise.all([
    pedir(c, "domain_rank_overview", comun),
    // Sin fecha de inicio devuelve solo los últimos meses. Se le piden tres
    // años: la curva de visibilidad no dice nada con seis puntos.
    pedir(c, "historical_rank_overview", {
      ...comun,
      date_from: new Date(Date.now() - 1095 * 86_400_000).toISOString().slice(0, 10),
    }),
    pedir(c, "ranked_keywords", {
      ...comun,
      limit: 200,
      order_by: ["ranked_serp_element.serp_item.etv,desc"],
    }),
    pedir(c, "competitors_domain", { ...comun, limit: 20 }),
  ]);

  const avisos = [resumen, historico, keywords, competidores]
    .map((x) => x.aviso)
    .filter((x): x is string => Boolean(x));

  const coste = resumen.coste + historico.coste + keywords.coste + competidores.coste;

  if (avisos.length === 4) {
    throw new Error(`No se pudo consultar el dominio. ${avisos[0]}`);
  }

  const items = (x: Record<string, unknown> | null) =>
    ((x?.items as unknown[]) ?? []) as Record<string, unknown>[];

  const o = organico(items(resumen.datos)[0]);

  // Si la respuesta llegó pero no se reconoció su forma, conviene saberlo:
  // el proveedor cambia nombres de campo de vez en cuando y un panel lleno de
  // ceros parece un dominio sin tráfico en lugar de un error nuestro.
  if (resumen.datos && Object.keys(o).length === 0) {
    console.error("[labs] forma inesperada en domain_rank_overview:", JSON.stringify(items(resumen.datos)[0] ?? resumen.datos).slice(0, 1200));
    avisos.push("El resumen llegó con una forma que no se reconoció; los totales pueden salir en cero.");
  }

  return {
    dominio: objetivo,
    pais,
    resumen: {
      keywords: num(o.count),
      trafico: Math.round(num(o.etv)),
      valor: Math.round(num(o.estimated_paid_traffic_cost)),
      tramos: tramos(o),
    },

    historico: items(historico.datos)
      .map((f) => {
        const m = organico(f);
        return {
          mes: `${num(f.year)}-${String(num(f.month)).padStart(2, "0")}`,
          keywords: num(m.count),
          trafico: Math.round(num(m.etv)),
          valor: Math.round(num(m.estimated_paid_traffic_cost)),
        };
      })
      .filter((f) => f.mes !== "0-00")
      .sort((a, b) => a.mes.localeCompare(b.mes)),

    keywords: items(keywords.datos).map((k) => {
      const kd = obj(k.keyword_data);
      const info = obj(kd.keyword_info);
      const serp = obj(obj(k.ranked_serp_element).serp_item);
      return {
        keyword: String(kd.keyword ?? ""),
        posicion: num(serp.rank_group),
        volumen: num(info.search_volume),
        trafico: Math.round(num(serp.etv)),
        cpc: Math.round(num(info.cpc) * 100) / 100,
        url: typeof serp.url === "string" ? serp.url : null,
      };
    }),

    competidores: items(competidores.datos).map((x) => {
      const m = organico(x);
      return {
        dominio: String(x.domain ?? ""),
        coincidencias: num(m.count) || num(x.intersections),
        posicionMedia: Math.round(num(x.avg_position) * 10) / 10,
        trafico: Math.round(num(m.etv)),
      };
    }),

    coste,
    avisos,
  };
}
