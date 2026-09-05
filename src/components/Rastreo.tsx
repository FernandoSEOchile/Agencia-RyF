"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";
import SearchConsole from "@/components/SearchConsole";
import Velocidad from "@/components/Velocidad";
import Esqueleto from "@/components/Esqueleto";
import { fecha } from "@/lib/formato";

/**
 * Rastreo técnico del sitio.
 *
 * Los problemas se presentan como cuadros que se pinchan, no como una tabla de
 * cinco mil filas: nadie audita una web leyendo cinco mil filas, se audita
 * preguntando «¿qué está roto?» y mirando solo eso.
 */

type Problemas = Record<string, number>;

interface Pagina {
  url: string;
  estado: number | null;
  ms: number | null;
  destino: string | null;
  titulo: string | null;
  palabras: number;
  imagenesSinAlt: number;
  error: string | null;
  /** Si Google puede indexarla, y por qué no cuando no. Lo decide el servidor. */
  indexable: boolean;
  motivo: string | null;
}

interface Tanda {
  id: string;
  estado: string;
  total: number;
  hechas: number;
  creado: string;
  acabado?: string | null;
  nota?: string | null;
}

/**
 * Qué mide cada cuadro y por qué importa.
 *
 * El orden no es alfabético ni por cantidad: va de lo que impide posicionar a
 * lo que solo lo empeora. Quien abre esta pestaña con prisa arregla los tres
 * primeros y ya ha hecho lo que más valía.
 */
const INFORMES: { id: string; etiqueta: string; grave?: boolean; porque: string }[] = [
  { id: "rotas", etiqueta: "Rotas", grave: true, porque: "Devuelven 404 o ni contestan. El visitante se va y Google deja de rastrearlas." },
  { id: "noIndexables", etiqueta: "No indexables", grave: true, porque: "El sitio le pide a Google que no las incluya. Se ven perfectas y nunca salen en buscadores." },
  { id: "huerfanas", etiqueta: "Huérfanas", grave: true, porque: "Ninguna otra página del sitio las enlaza. Existen en el sitemap y en la práctica están escondidas." },
  { id: "tituloRepetido", etiqueta: "Título repetido", porque: "Dos o más páginas con el mismo título compiten entre ellas por la misma búsqueda." },
  { id: "descripcionRepetida", etiqueta: "Descripción repetida", porque: "La misma meta description en varias páginas: en el resultado de Google se ven idénticas." },
  { id: "sinTitulo", etiqueta: "Sin título", porque: "Google se inventa uno, y suele elegir peor que tú." },
  { id: "sinDescripcion", etiqueta: "Sin descripción", porque: "Sin meta description, el fragmento del resultado lo escribe Google recortando la página." },
  { id: "sinH1", etiqueta: "Sin H1", porque: "Falta el encabezado principal, que es la primera pista de sobre qué va la página." },
  { id: "variosH1", etiqueta: "Varios H1", porque: "Más de un encabezado principal: no queda claro cuál es el tema de la página." },
  { id: "contenidoPobre", etiqueta: "Contenido pobre", porque: "Menos de 300 palabras. Rara vez alcanza para competir por nada." },
  { id: "redirigidas", etiqueta: "Redirigidas", porque: "Están en el sitemap pero acaban en otra dirección. El sitemap debería llevar al destino final." },
  { id: "sinEnlacesSalientes", etiqueta: "Sin enlaces internos", porque: "No enlazan a ninguna otra página del sitio: son callejones sin salida." },
  { id: "sinDatos", etiqueta: "Sin datos estructurados", porque: "No declaran JSON-LD. Sin eso Google no puede mostrar precio, valoraciones ni migas en el resultado." },
  { id: "datosRotos", etiqueta: "Datos rotos", grave: true, porque: "Tienen JSON-LD pero no se puede leer. Peor que no tenerlo: el sitio cree que lo está diciendo y Google lo descarta entero." },
  { id: "canonicalAjeno", etiqueta: "Canonical a otra", porque: "Declaran que la versión buena es otra página. Nunca van a posicionar ellas mismas — a veces es lo correcto, a veces es un error del tema." },
  { id: "sinCanonical", etiqueta: "Sin canonical", porque: "Sin canonical, cualquier variante de la URL puede tomarse como una página distinta." },
  { id: "profundas", etiqueta: "A más de 3 clics", porque: "Están hondas: Google reparte menos autoridad cuanto más lejos de la portada." },
  { id: "sinLang", etiqueta: "Sin idioma", porque: "El HTML no declara en qué idioma está." },
  { id: "sinViewport", etiqueta: "Sin viewport", porque: "Sin la etiqueta viewport el móvil renderiza la versión de escritorio encogida." },
  { id: "lentas", etiqueta: "Lentas", porque: "Tardan más de tres segundos en entregarse enteras." },
  { id: "sinAlt", etiqueta: "Imágenes sin alt", porque: "Imágenes sin texto alternativo: ni Google ni un lector de pantalla saben qué son." },
];

/**
 * Los dos cuadros que no salen del rastreo.
 *
 * Canibalizaciones viene de Search Console y velocidad de PageSpeed, pero se
 * presentan igual que el resto: quien audita quiere ver todo lo que está mal en
 * la misma rejilla, no una lista de problemas y luego dos secciones sueltas
 * debajo con otro aspecto.
 */
const APARTE: Record<string, { etiqueta: string; porque: string }> = {
  canibal: {
    etiqueta: "Canibalizaciones",
    porque:
      "Búsquedas en las que Google enseña varias páginas tuyas: compiten entre ellas y se reparten los clics. Sale de Search Console, así que son datos reales.",
  },
  velocidad: {
    etiqueta: "Velocidad",
    porque:
      "Nota de 0 a 100 de PageSpeed, media de las últimas páginas medidas. En móvil, que es lo que Google usa para decidir posiciones.",
  },
};

/**
 * Las comprobaciones, en cuatro bloques y en orden de importancia.
 *
 * Veinticuatro cuadros iguales obligaban a leerlos todos para saber qué
 * mirar. Agrupados por lo que significan —si Google llega, qué lee, cómo se
 * ve el resultado, cuánto tarda— la pantalla se recorre de arriba abajo y en
 * cada bloque solo se despliega lo que está mal.
 */
const GRUPOS: { id: string; etiqueta: string; porque: string; ids: string[] }[] = [
  {
    id: "indexacion",
    etiqueta: "Indexación",
    porque: "Si Google no llega o no puede indexar, nada de lo demás cuenta.",
    ids: ["rotas", "noIndexables", "huerfanas", "redirigidas", "canonicalAjeno", "sinCanonical", "profundas", "sinEnlacesSalientes"],
  },
  {
    id: "contenido",
    etiqueta: "Contenido",
    porque: "Lo que Google lee para decidir por qué búsquedas sales.",
    ids: ["tituloRepetido", "sinTitulo", "descripcionRepetida", "sinDescripcion", "sinH1", "variosH1", "contenidoPobre", "canibal"],
  },
  {
    id: "marcado",
    etiqueta: "Datos y marcado",
    porque: "Lo que hace que el resultado se vea completo y la página se entienda.",
    ids: ["datosRotos", "sinDatos", "sinAlt", "sinLang", "sinViewport"],
  },
  {
    id: "rendimiento",
    etiqueta: "Rendimiento",
    porque: "Cuánto tarda en llegar, en móvil, que es lo que Google mide.",
    ids: ["lentas", "velocidad"],
  },
];

/**
 * Una nota de 0 a 100 que se pueda explicar.
 *
 * Cada comprobación resta según la parte del sitio que afecta: lo grave hasta
 * 30 puntos si afecta a todas las páginas, lo demás hasta 10. La velocidad
 * resta aparte. No pretende ser exacta; pretende que dos rastreos seguidos
 * se puedan comparar con un número y que ese número no cambie porque sí.
 */
function notaTecnica(problemas: Problemas, total: number, velocidad: number | null): number {
  if (total <= 0) return 0;
  let nota = 100;
  for (const i of INFORMES) {
    const n = problemas[i.id];
    if (!n) continue;
    nota -= Math.min(1, n / total) * (i.grave ? 30 : 10);
  }
  if (velocidad != null) nota -= velocidad < 50 ? 10 : velocidad < 90 ? 5 : 0;
  return Math.max(0, Math.round(nota));
}

/** Verde a partir de 80, ámbar desde 50, rojo por debajo. Igual que la ficha. */
function colorNota(n: number) {
  return n >= 80 ? "text-emerald-700" : n >= 50 ? "text-amber-700" : "text-red-600";
}

interface Sitio {
  robots: boolean;
  estado?: number;
  cierraTodo?: boolean;
  bloqueos?: string[];
  declaraSitemap?: boolean;
  error?: string;
}

type Col = "url" | "estado" | "indexable" | "ms" | "titulo";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "url", texto: "URL" },
  { id: "estado", texto: "Código", clase: "text-right", num: true },
  { id: "indexable", texto: "Indexable" },
  { id: "ms", texto: "Tiempo", clase: "text-right", num: true },
  { id: "titulo", texto: "Título" },
];

const miles = (n: number) => n.toLocaleString("es-CL");

export default function Rastreo({
  clienteId,
  puedeLanzar,
  onPedir,
}: {
  clienteId: string;
  puedeLanzar: boolean;
  /** Rellena el chat con la orden de arreglar lo abierto. */
  onPedir?: (texto: string) => void;
}) {
  const [tanda, setTanda] = useState<Tanda | null>(null);
  const [problemas, setProblemas] = useState<Problemas | null>(null);
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const [canibales, setCanibales] = useState<number | null>(null);
  const [velocidad, setVelocidad] = useState<{ nota: number | null; medido: string | null } | null>(
    null
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<{ creado: string; problemas: Record<string, number> } | null>(null);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { orden, ordenar, ordenarPor } = useOrden<Col>("url");

  // En los informes de repetidos se ordena por el campo que los agrupa, para
  // que las que comparten título queden una debajo de otra y se vea el par.
  const porTitulo = abierto === "tituloRepetido" || abierto === "descripcionRepetida";

  const mirar = useCallback(async () => {
    try {
      const d = await fetch(`/api/rastreo?cliente=${clienteId}`).then((r) => r.json());
      if (d.error) {
        setError(d.error);
        return;
      }
      setTanda(d.rastreo);
      setProblemas(d.problemas ?? null);
        setAnterior(d.anterior ?? null);
      setSitio(d.sitio ?? null);
    } catch {
      setError("No se pudo leer el rastreo.");
    } finally {
      setCargando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    mirar();
  }, [mirar]);

  // Los dos de fuera se piden por separado y sin bloquear: uno habla con Google
  // y puede tardar un par de segundos, y no tiene por qué retrasar la rejilla.
  useEffect(() => {
    fetch(`/api/velocidad?cliente=${clienteId}`)
      .then((r) => r.json())
      .then((d) => setVelocidad({ nota: d.nota ?? null, medido: d.medido ?? null }))
      .catch(() => setVelocidad({ nota: null, medido: null }));

    fetch(`/api/gsc?cliente=${clienteId}&dias=28`)
      .then((r) => r.json())
      .then((d) =>
        setCanibales(
          Array.isArray(d.filas)
            ? d.filas.filter((f: { paginas?: number }) => (f.paginas ?? 0) > 1).length
            : 0
        )
      )
      .catch(() => setCanibales(null));
  }, [clienteId]);

  // Mientras corre se pregunta cada pocos segundos. Con el rastreo parado no se
  // pregunta nada: no hay nada que pueda cambiar solo.
  useEffect(() => {
    if (tanda?.estado !== "corriendo") return;
    const t = setInterval(mirar, 5000);
    return () => clearInterval(t);
  }, [tanda?.estado, mirar]);

  async function lanzar() {
    setError(null);
    try {
      const r = await fetch("/api/rastreo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }
      setAbierto(null);
      setPaginas([]);
      await mirar();
    } catch {
      setError("No se pudo arrancar el rastreo.");
    }
  }

  async function abrir(id: string) {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    setPaginas([]);

    // Los de fuera del rastreo despliegan su propio componente, no una tabla
    // de URLs: no hay nada que pedir aquí.
    if (APARTE[id]) return;

    const d = await fetch(`/api/rastreo?cliente=${clienteId}&problema=${id}`).then((r) => r.json());
    setPaginas(d.paginas ?? []);
  }

  const filas = porTitulo && orden.col === "url"
    ? [...paginas].sort((a, b) => (a.titulo ?? "").localeCompare(b.titulo ?? "", "es"))
    : ordenarPor(paginas, (p, c) =>
        c === "url"
          ? p.url
          : c === "titulo"
            ? (p.titulo ?? "")
            : // Al ordenar por indexable primero salen las que NO lo son, que es
              // lo que uno busca cuando pincha esa columna.
              c === "indexable"
              ? (p.indexable ? "2 sí" : `1 ${p.motivo ?? "no"}`)
              : (p[c] ?? -1)
      );

  const panel = abierto ? (
        <div className="border-t border-[color:var(--linea)] bg-black/[0.015] px-5 pb-5 pt-4">
          <p className="max-w-3xl text-[14px] text-[color:var(--tinta-media)]">
            {APARTE[abierto]?.porque ?? INFORMES.find((i) => i.id === abierto)?.porque}
          </p>
          {onPedir && !APARTE[abierto] && (problemas?.[abierto] ?? 0) > 0 && (
            <button
              type="button"
              onClick={() =>
                onPedir(
                  `Mira el último rastreo técnico con ver_rastreo y arregla «${INFORMES.find((i) => i.id === abierto)?.etiqueta ?? abierto}» (${problemas?.[abierto]} páginas). Empieza por una, enséñamela y espera mi visto bueno antes de seguir con el resto.`
                )
              }
              className="boton mt-3"
            >
              Pedir al asistente que lo arregle
            </button>
          )}

          {abierto === "canibal" && (
            <div className="mt-4">
              <SearchConsole clienteId={clienteId} puedeEditar={puedeLanzar} soloCanibal />
            </div>
          )}

          {abierto === "velocidad" && (
            <Velocidad
              clienteId={clienteId}
              puedeMedir={puedeLanzar}
              alMedir={(nota) => setVelocidad({ nota, medido: new Date().toISOString() })}
            />
          )}

          {APARTE[abierto] ? null : paginas.length === 0 ? (
            <p className="mt-3 text-[14px] text-[color:var(--tinta-suave)]">Nada por aquí.</p>
          ) : (
            <div className="tarjeta mt-3 overflow-x-auto">
              <table className="w-full text-[14px]">
                <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {filas.map((p) => (
                    <tr key={p.url}>
                      <td className="max-w-[420px] truncate px-5 py-2.5">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          {p.url}
                        </a>
                        {p.destino && (
                          <span className="block truncate text-[13px] text-[color:var(--tinta-suave)]">
                            → {p.destino}
                          </span>
                        )}
                        {p.error && (
                          <span className="block text-[13px] text-red-600">{p.error}</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          p.estado == null || p.estado >= 400 ? "text-red-600" : ""
                        }`}
                      >
                        {p.estado ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {p.indexable ? (
                          <span className="pastilla bg-emerald-50 text-emerald-700">sí</span>
                        ) : (
                          <span
                            className="pastilla bg-red-50 text-red-700"
                            title={`Google no la indexa: ${p.motivo ?? "sin motivo claro"}`}
                          >
                            no · {p.motivo}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {p.ms == null ? "—" : `${(p.ms / 1000).toFixed(1)} s`}
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2.5 text-[color:var(--tinta-media)]">
                        {p.titulo ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null;

  if (cargando) return <Esqueleto tipo="cifras" />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Rastreo técnico</h2>
          <p className="mt-0.5 max-w-2xl text-[14px] text-[color:var(--tinta-media)]">
            Pide cada URL del sitemap y anota cómo respondió. No cuesta dinero, solo tiempo: va
            despacio a propósito para no ahogar el hosting del cliente.
          </p>
        </div>

        {puedeLanzar && tanda?.estado !== "corriendo" && (
          <button onClick={lanzar} className="boton-fuerte">
            {tanda ? "Rastrear de nuevo" : "Rastrear el sitio"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-[14px] font-medium text-red-600">{error}</p>}

      {!tanda && (
        <div className="mt-6 rounded-2xl border border-[color:var(--linea)] bg-[color:var(--panel)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">Este sitio no se ha rastreado nunca.</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-[color:var(--tinta-media)]">
            La primera pasada tarda unos minutos, según cuántas páginas tenga.
          </p>
        </div>
      )}

      {tanda?.estado === "corriendo" && (
        <div className="tarjeta mt-6 p-5">
          <p className="text-[14px] font-medium">
            Rastreando… {miles(tanda.hechas)}
            {tanda.total > 0 && ` de ${miles(tanda.total)}`}
          </p>
          {tanda.total > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07]">
              <div
                className="h-full rounded-full bg-[color:var(--acento)] transition-all"
                style={{ width: `${Math.round((tanda.hechas / tanda.total) * 100)}%` }}
              />
            </div>
          )}
          <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
            Puedes irte a otra pestaña: sigue por su cuenta.
          </p>
        </div>
      )}

      {tanda && tanda.estado !== "corriendo" && tanda.estado !== "terminado" && (
        <p className="mt-4 text-[14px] font-medium text-red-600">
          {tanda.estado === "interrumpido" ? "El último rastreo se cortó a mitad." : "El último rastreo falló."}
          {tanda.nota && ` · ${tanda.nota}`}
        </p>
      )}

      {sitio && (sitio.cierraTodo || !sitio.robots) && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-[14px] text-red-700">
          <span className="font-medium">robots.txt:</span>{" "}
          {!sitio.robots ? (
            <>no existe o no responde{sitio.error ? ` · ${sitio.error}` : ""}. Google rastrea igual,
            pero nadie le está diciendo qué evitar ni dónde está el sitemap.</>
          ) : sitio.cierraTodo ? (
            <>lleva un <code className="font-mono">Disallow: /</code>. Eso cierra el sitio entero a
            los buscadores.</>
          ) : (
            <>
              en su sitio
              {sitio.bloqueos?.length ? ` · ${sitio.bloqueos.length} reglas de bloqueo` : " · sin bloqueos"}
              {sitio.declaraSitemap ? " · declara el sitemap" : " · no declara el sitemap"}
            </>
          )}
        </div>
      )}

      {problemas && tanda && (() => {
        const hay = (id: string) =>
          id === "canibal" ? (canibales ?? 0) : id === "velocidad" ? 0 : (problemas[id] ?? 0);
        const existe = (id: string) => id === "canibal" || id === "velocidad" || problemas[id] !== undefined;
        const etiqueta = (id: string) => APARTE[id]?.etiqueta ?? INFORMES.find((i) => i.id === id)?.etiqueta ?? id;
        const grave = (id: string) => Boolean(INFORMES.find((i) => i.id === id)?.grave);

        const nota = notaTecnica(problemas, tanda.hechas, velocidad?.nota ?? null);
        const notaAntes = anterior ? notaTecnica(anterior.problemas, tanda.hechas, null) : null;
        const conCifra = INFORMES.filter((i) => (problemas[i.id] ?? 0) > 0).sort(
          (x, y) => Number(Boolean(y.grave)) - Number(Boolean(x.grave)) || problemas[y.id] - problemas[x.id]
        );

        return (
          <>
            {/* La cabecera: un número que resume, qué mirar primero, y de qué
                rastreo sale. Es lo que se lee cuando se abre la pestaña con prisa. */}
            <div className="tarjeta tarjeta-destacada mt-5 grid gap-px overflow-hidden sm:grid-cols-[auto_1fr_auto] [&>*]:ring-1 [&>*]:ring-[color:var(--linea)]">
              <div className="bg-[color:var(--panel)] px-5 py-4">
                <p className="rotulo">Salud técnica</p>
                <p className={`mt-1.5 cifra text-[34px] leading-none ${colorNota(nota)}`}>
                  {nota}
                  <span className="text-[16px] text-[color:var(--tinta-suave)]">/100</span>
                </p>
                {notaAntes !== null && notaAntes !== nota && (
                  <p className={`mt-1.5 text-[13px] tabular-nums ${nota > notaAntes ? "text-emerald-700" : "text-red-600"}`}>
                    {nota > notaAntes ? "▲" : "▼"} {Math.abs(nota - notaAntes)} desde {fecha(anterior!.creado)}
                  </p>
                )}
              </div>

              <div className="bg-[color:var(--panel)] px-5 py-4">
                <p className="rotulo">Qué mirar primero</p>
                {conCifra.length === 0 ? (
                  <p className="mt-1.5 text-[15px] font-medium text-emerald-700">Nada que arreglar en lo rastreado.</p>
                ) : (
                  <ol className="mt-1.5 flex flex-col gap-0.5">
                    {conCifra.slice(0, 3).map((i, k) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => abrir(i.id)}
                          className="text-left text-[15px] underline-offset-4 hover:text-[color:var(--acento)] hover:underline"
                        >
                          <span className="mr-2 tabular-nums text-[color:var(--tinta-suave)]">{k + 1}.</span>
                          <span className={`cifra mr-1.5 ${i.grave ? "text-red-600" : "text-amber-700"}`}>{miles(problemas[i.id])}</span>
                          {i.etiqueta.toLowerCase()}
                        </button>
                      </li>
                    ))}
                    {conCifra.length > 3 && (
                      <li className="text-[13px] text-[color:var(--tinta-suave)]">y {conCifra.length - 3} más abajo</li>
                    )}
                  </ol>
                )}
              </div>

              <div className="bg-[color:var(--panel)] px-5 py-4 text-[13px] text-[color:var(--tinta-media)]">
                <p className="rotulo">Rastreo</p>
                <p className="mt-1.5">
                  <span className="cifra text-[15px] text-[color:var(--tinta)]">{miles(tanda.hechas)}</span> páginas · {fecha(tanda.creado)}
                </p>
                {sitio && sitio.robots && !sitio.cierraTodo && (
                  <p className="mt-1">
                    robots.txt {sitio.bloqueos?.length ? `· ${sitio.bloqueos.length} bloqueos` : "· sin bloqueos"}
                    {sitio.declaraSitemap ? " · con sitemap" : " · sin sitemap"}
                  </p>
                )}
                {anterior && <p className="mt-1">anterior: {fecha(anterior.creado)}</p>}
              </div>
            </div>

            {/* Los cuatro bloques. En cada uno, solo lo que está mal como filas
                —lo grave primero—, y lo que está a cero, plegado en una línea. */}
            {GRUPOS.map((g) => {
              const ids = g.ids.filter(existe);
              const malas = ids
                .filter((id) => id === "velocidad" ? (velocidad?.nota != null && velocidad.nota < 90) : hay(id) > 0)
                .sort((x, y) => Number(grave(y)) - Number(grave(x)) || hay(y) - hay(x));
              const bien = ids.filter((id) => !malas.includes(id));
              // Velocidad se enseña siempre: sin medir también es información.
              const filasGrupo = malas.includes("velocidad") || !ids.includes("velocidad") ? malas : [...malas, "velocidad"];
              const bienSinVel = bien.filter((id) => id !== "velocidad");

              return (
                <section key={g.id} className="tarjeta mt-4 overflow-hidden">
                  <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 pb-2 pt-4">
                    <h3 className="text-[15px] font-semibold">{g.etiqueta}</h3>
                    <p className="text-[13px] text-[color:var(--tinta-media)]">{g.porque}</p>
                    <p className="ml-auto text-[13px] tabular-nums text-[color:var(--tinta-suave)]">
                      {malas.length === 0 ? "todo en orden" : `${malas.length} de ${ids.length} con algo`}
                    </p>
                  </header>

                  {filasGrupo.map((id) => {
                    const n = hay(id);
                    const activo = abierto === id;
                    const esVel = id === "velocidad";
                    const valor = esVel ? (velocidad?.nota ?? null) : id === "canibal" && canibales == null ? null : n;
                    const color = esVel
                      ? valor == null ? "text-[color:var(--tinta-suave)]" : colorNota(valor)
                      : valor == null ? "text-[color:var(--tinta-suave)]" : grave(id) ? "text-red-600" : "text-amber-700";
                    const antes = anterior?.problemas[id];
                    return (
                      <div key={id} className="border-t border-[color:var(--linea)]">
                        <button
                          type="button"
                          onClick={() => abrir(id)}
                          aria-expanded={activo}
                          className={`grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 px-5 py-3 text-left transition hover:bg-black/[0.02] ${activo ? "bg-black/[0.02]" : ""}`}
                        >
                          <span className={`cifra text-[22px] leading-none ${color}`}>
                            {valor == null ? "—" : miles(valor)}
                            {esVel && valor != null && <span className="text-[12px] text-[color:var(--tinta-suave)]">/100</span>}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium">{etiqueta(id)}</span>
                            <span className="block truncate text-[13px] text-[color:var(--tinta-media)]">
                              {APARTE[id]?.porque ?? INFORMES.find((i) => i.id === id)?.porque}
                            </span>
                          </span>
                          <span className="flex items-center gap-3 text-[12px] tabular-nums">
                            {!esVel && antes !== undefined && antes !== n && (
                              <span className={n < antes ? "text-emerald-700" : "text-red-600"} title={`Rastreo anterior: ${antes}`}>
                                {n < antes ? "▼" : "▲"} {Math.abs(n - antes)}
                              </span>
                            )}
                            <span className={`text-[color:var(--tinta-suave)] transition ${activo ? "rotate-90" : ""}`}>▸</span>
                          </span>
                        </button>
                        {activo && panel}
                      </div>
                    );
                  })}

                  {bienSinVel.length > 0 && (
                    <p className="border-t border-[color:var(--linea)] px-5 py-2.5 text-[13px] text-[color:var(--tinta-suave)]">
                      <span className="mr-1.5 text-emerald-700">✓</span>
                      Sin problemas: {bienSinVel.map(etiqueta).join(" · ")}
                    </p>
                  )}
                </section>
              );
            })}
          </>
        );
      })()}
    </>
  );
}
