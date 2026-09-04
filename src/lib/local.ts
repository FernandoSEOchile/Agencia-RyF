import "server-only";
import { db } from "@/lib/db";
import { credenciales } from "@/lib/dataforseo";
import { apuntar } from "@/lib/gasto";

/**
 * SEO local por cuadrícula.
 *
 * En SEO local no existe «la posición». El mismo negocio puede salir primero
 * para quien busca desde su misma calle y no aparecer para quien busca a tres
 * kilómetros: Google contesta según dónde está el que pregunta. Un único número
 * de posición para un negocio local es, literalmente, una respuesta inventada.
 *
 * Así que se pregunta muchas veces desde muchos sitios. DataForSEO permite
 * mandar unas coordenadas concretas —`location_coordinate`— y devuelve lo que
 * vería alguien parado ahí. Una llamada por punto de la cuadrícula.
 *
 * A 0,002 dólares por punto, un barrido de 9×9 cuesta 16 centavos. Eso es lo
 * que hace viable medirlo cada semana en vez de una vez al año.
 */

const PRODUCCION = "https://api.dataforseo.com";
const PRUEBAS = "https://sandbox.dataforseo.com";

/** Chile, para la búsqueda inicial del negocio. */
const PAIS = 2152;

/** Pausa entre puntos. No es por dinero, es por no encadenar 121 golpes. */
const PAUSA = 250;

/** Sin noticias durante este rato, un barrido se da por interrumpido. */
const ABANDONO = 10 * 60 * 1000;

/** Cuántos resultados se miran por punto. Más allá del 20 nadie mira. */
const PROFUNDIDAD = 20;

/**
 * El zoom con el que se pregunta desde cada punto.
 *
 * No es un detalle cosmético: con 17z —nivel de calle— Google contesta «No
 * Search Results» y devuelve cero resultados, y el mapa se llenaba de puntos
 * rojos que parecían «aquí no apareces» cuando en realidad no se había
 * preguntado bien. Con 14z devuelve los veinte de siempre.
 *
 * Si algún día hay que tocarlo, hacia abajo: cuanto menor el número, más
 * abierta la zona que Google considera.
 */
const ZOOM = "14z";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const txt = (v: unknown) => (typeof v === "string" ? v : null);

function cabecera(login: string, clave: string) {
  return "Basic " + Buffer.from(`${login}:${clave}`).toString("base64");
}

export interface Ficha {
  titulo: string;
  cid: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  puntuacion: number | null;
  resenas: number | null;
}

/** Una consulta al mapa de Google desde unas coordenadas concretas. */
async function mapa(
  c: { login: string; clave: string; pruebas?: boolean },
  keyword: string,
  cuerpoExtra: Record<string, unknown>
) {
  const base = c.pruebas ? PRUEBAS : PRODUCCION;

  const r = await fetch(`${base}/v3/serp/google/maps/live/advanced`, {
    method: "POST",
    headers: { Authorization: cabecera(c.login, c.clave), "Content-Type": "application/json" },
    body: JSON.stringify([
      { keyword, language_code: "es", depth: PROFUNDIDAD, ...cuerpoExtra },
    ]),
    signal: AbortSignal.timeout(60000),
    cache: "no-store",
  });

  if (r.status === 402) throw new Error("La cuenta de DataForSEO se quedó sin saldo.");
  if (!r.ok) throw new Error(`DataForSEO respondió ${r.status}.`);

  const j = await r.json();
  const tarea = j?.tasks?.[0];

  if (tarea?.status_code && tarea.status_code !== 20000) {
    throw new Error(tarea.status_message ?? `código ${tarea.status_code}`);
  }

  return {
    items: (tarea?.result?.[0]?.items ?? []) as Record<string, unknown>[],
    coste: typeof j?.cost === "number" ? j.cost : 0,
  };
}

/**
 * Busca el negocio para quedarse con su identificador y sus coordenadas.
 *
 * Se hace una vez, antes del barrido, y por una razón concreta: comparar por
 * nombre en 81 respuestas es frágil —«Panadería San José» y «PANADERIA SAN
 * JOSE» son la misma y no coinciden— mientras que el `cid` es el mismo siempre.
 */
export async function buscarNegocio(nombre: string): Promise<{ fichas: Ficha[]; coste: number }> {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  const { items, coste } = await mapa(c, nombre, { location_code: PAIS });

  const fichas: Ficha[] = items
    .filter((i) => i.type === "maps_search")
    .slice(0, 8)
    .map((i) => {
      const info = obj(i.rating);
      return {
        titulo: txt(i.title) ?? "",
        cid: txt(i.cid),
        direccion: txt(i.address),
        lat: typeof i.latitude === "number" ? i.latitude : null,
        lng: typeof i.longitude === "number" ? i.longitude : null,
        puntuacion: typeof info.value === "number" ? info.value : null,
        resenas: typeof info.votes_count === "number" ? info.votes_count : null,
      };
    })
    .filter((f) => f.titulo);

  return { fichas, coste };
}

/**
 * Las coordenadas de cada punto de la cuadrícula.
 *
 * Un grado de latitud son ~111,32 km en cualquier parte. Uno de longitud son
 * los mismos 111,32 multiplicados por el coseno de la latitud, porque los
 * meridianos se juntan hacia los polos: sin ese coseno, una cuadrícula en
 * Santiago saldría estirada de este a oeste y las distancias serían mentira.
 */
export function coordenadas(lat: number, lng: number, lado: number, separacion: number) {
  const KM_POR_GRADO = 111.32;
  const mitad = Math.floor(lado / 2);

  const dLat = separacion / KM_POR_GRADO;
  const dLng = separacion / (KM_POR_GRADO * Math.cos((lat * Math.PI) / 180));

  const puntos: { fila: number; columna: number; lat: number; lng: number }[] = [];

  for (let f = 0; f < lado; f++) {
    for (let c = 0; c < lado; c++) {
      puntos.push({
        fila: f,
        columna: c,
        // La fila 0 es la de arriba, o sea la más al norte.
        lat: lat + (mitad - f) * dLat,
        lng: lng + (c - mitad) * dLng,
      });
    }
  }

  return puntos;
}

/** Arranca un barrido y devuelve su id enseguida. El trabajo sigue solo. */
export async function arrancar(datos: {
  clienteId: string;
  usuarioId: string;
  keyword: string;
  negocio: string;
  cid: string | null;
  lat: number;
  lng: number;
  lado: number;
  separacion: number;
}) {
  const enCurso = await db.rejilla.findFirst({
    where: {
      clienteId: datos.clienteId,
      estado: "corriendo",
      tocado: { gt: new Date(Date.now() - ABANDONO) },
    },
  });
  if (enCurso) throw new Error("Ya hay un barrido en marcha para este cliente.");

  const puntos = coordenadas(datos.lat, datos.lng, datos.lado, datos.separacion);

  const rejilla = await db.rejilla.create({
    data: {
      clienteId: datos.clienteId,
      keyword: datos.keyword,
      negocio: datos.negocio,
      cid: datos.cid,
      centroLat: datos.lat,
      centroLng: datos.lng,
      lado: datos.lado,
      separacion: datos.separacion,
      total: puntos.length,
    },
  });

  // Sin `await`: la respuesta sale ya y el barrido sigue por su cuenta.
  correr(rejilla.id, datos, puntos, datos.clienteId, datos.usuarioId).catch(async (e) => {
    await db.rejilla.update({
      where: { id: rejilla.id },
      data: {
        estado: "error",
        nota: e instanceof Error ? e.message.slice(0, 300) : "error desconocido",
        acabado: new Date(),
      },
    });
  });

  return rejilla.id;
}

async function correr(
  rejillaId: string,
  datos: { keyword: string; negocio: string; cid: string | null },
  puntos: { fila: number; columna: number; lat: number; lng: number }[],
  clienteId: string,
  usuarioId: string
) {
  const c = await credenciales();
  if (!c) throw new Error("Falta configurar DataForSEO en Ajustes.");

  // Se compara en minúsculas y sin acentos por si no hubiera cid: dos fichas
  // de la misma cadena se escriben igual pero se teclean distinto.
  const normal = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const buscado = normal(datos.negocio);
  let coste = 0;
  let hechos = 0;

  for (const p of puntos) {
    let puesto: number | null = null;
    let primero: string | null = null;
    let resultados = 0;

    try {
      const r = await mapa(c, datos.keyword, {
        location_coordinate: `${p.lat.toFixed(6)},${p.lng.toFixed(6)},${ZOOM}`,
      });
      coste += r.coste;

      const fichas = r.items.filter((i) => i.type === "maps_search");
      resultados = fichas.length;

      fichas.forEach((f, i) => {
        const suyo = datos.cid
          ? txt(f.cid) === datos.cid
          : normal(txt(f.title) ?? "") === buscado;

        // `rank_absolute` cuenta también los anuncios; para «en qué puesto
        // estoy» lo que sirve es el orden entre las fichas orgánicas.
        if (suyo && puesto === null) puesto = i + 1;
        if (i === 0) primero = txt(f.title);
      });
    } catch {
      // Un punto que falla se guarda sin puesto. Dejarlo fuera del todo
      // pintaría un hueco en el mapa que se leería como «aquí no aparece».
    }

    await db.puntoRejilla.create({
      data: {
        rejillaId,
        fila: p.fila,
        columna: p.columna,
        lat: p.lat,
        lng: p.lng,
        puesto,
        primero,
        resultados,
      },
    });

    hechos++;

    if (hechos % 5 === 0 || hechos === puntos.length) {
      await db.rejilla.update({ where: { id: rejillaId }, data: { hechos, coste } });
    }

    await dormir(PAUSA);
  }

  // Si ningún punto trajo resultados, no hubo medición: hubo un fallo
  // (saldo, ficha que no existe, zoom malo). Guardarlo como «terminado»
  // pintaba una rejilla de interrogaciones con «costó $0.000» y se quedaba
  // en el histórico como si fuera un dato.
  const conDatos = await db.puntoRejilla.count({ where: { rejillaId, resultados: { gt: 0 } } });
  if (conDatos === 0) {
    await db.rejilla.update({
      where: { id: rejillaId },
      data: {
        estado: "error",
        nota: "Ningún punto devolvió resultados. Suele ser saldo agotado en DataForSEO o una ficha que Google no encuentra con ese nombre. Revisa Ajustes y vuelve a medir.",
        hechos,
        coste,
        acabado: new Date(),
      },
    });
  } else {
    await db.rejilla.update({
      where: { id: rejillaId },
      data: { estado: "terminado", hechos, coste, acabado: new Date() },
    });
  }

  // El gasto se apunta al final y con el importe real acumulado, no con una
  // estimación al empezar: si el barrido se corta a la mitad, lo que hay que
  // registrar es lo que de verdad se gastó.
  if (coste > 0) {
    await apuntar({
      usuarioId,
      clienteId,
      servicio: "dataforseo",
      concepto: "barrido local",
      monto: coste,
      detalle: `${datos.keyword} · ${hechos} puntos`,
    });
  }
}

/** Marca como interrumpidos los barridos que se quedaron colgados. */
export async function limpiarColgados() {
  await db.rejilla.updateMany({
    where: { estado: "corriendo", tocado: { lt: new Date(Date.now() - ABANDONO) } },
    data: { estado: "interrumpido", nota: "Se cortó a mitad, seguramente por un reinicio del panel." },
  });
}
