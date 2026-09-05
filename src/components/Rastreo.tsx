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

      {tanda && tanda.estado !== "corriendo" && (
        <p className="mt-4 text-[14px] text-[color:var(--tinta-media)]">
          {tanda.estado === "terminado"
            ? `${miles(tanda.hechas)} páginas revisadas ${fecha(tanda.creado)}`
            : tanda.estado === "interrumpido"
              ? "El último rastreo se cortó a mitad."
              : "El último rastreo falló."}
          {tanda.nota && ` · ${tanda.nota}`}
        </p>
      )}

      {sitio && (
        <div
          className={`mt-4 rounded-2xl border px-5 py-3 text-[14px] ${
            sitio.cierraTodo || !sitio.robots
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-[color:var(--linea)] bg-white text-[color:var(--tinta-media)]"
          }`}
        >
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

      {problemas && (() => {
        // Lo grave con cifra primero, luego lo demás con cifra, y los ceros al
        // final y atenuados. Antes «90 canibalizaciones» pesaba lo mismo que
        // «0 sin viewport» y había que leer la rejilla entera para saber qué
        // mirar.
        const visibles = INFORMES.filter((i) => problemas[i.id] !== undefined);
        const peso = (i: (typeof INFORMES)[number]) =>
          problemas[i.id] === 0 ? 2 : i.grave ? 0 : 1;
        const ordenados = [...visibles].sort(
          (x, y) => peso(x) - peso(y) || problemas[y.id] - problemas[x.id]
        );
        const conCifra = ordenados.filter((i) => problemas[i.id] > 0);
        return (
          <>
            <p className="mt-5 text-[14px]">
              {conCifra.length === 0 ? (
                <span className="font-medium text-emerald-700">Nada que arreglar en lo rastreado.</span>
              ) : (
                <>
                  <span className="font-medium">
                    {conCifra.length} {conCifra.length === 1 ? "cosa" : "cosas"} que mirar:
                  </span>{" "}
                  <span className="text-[color:var(--tinta-media)]">
                    {conCifra
                      .slice(0, 4)
                      .map((i) => `${miles(problemas[i.id])} ${i.etiqueta.toLowerCase()}`)
                      .join(", ")}
                    {conCifra.length > 4 ? "…" : "."}
                  </span>
                </>
              )}
            </p>
        <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {ordenados.map((i) => {
            const n = problemas[i.id];
            const activo = abierto === i.id;
            return (
              <button
                key={i.id}
                onClick={() => abrir(i.id)}
                title={i.porque}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  activo
                    ? "border-[color:var(--tinta)] bg-white shadow-sm"
                    : n === 0
                      ? "border-transparent bg-black/[0.025] opacity-70 hover:opacity-100"
                      : "border-[color:var(--linea)] bg-white hover:border-[color:var(--linea-fuerte)]"
                }`}
              >
                <p
                  className={`text-[22px] cifra font-semibold tabular-nums ${
                    n === 0
                      ? "text-[color:var(--tinta-suave)]"
                      : i.grave
                        ? "text-red-600"
                        : "text-amber-700"
                  }`}
                >
                  {miles(n)}
                </p>
                <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">{i.etiqueta}</p>
                {anterior && anterior.problemas[i.id] !== undefined && anterior.problemas[i.id] !== n && (
                  <p
                    className={`mt-0.5 text-[12px] tabular-nums ${n < anterior.problemas[i.id] ? "text-emerald-700" : "text-red-600"}`}
                    title={`Rastreo anterior: ${anterior.problemas[i.id]}`}
                  >
                    {n < anterior.problemas[i.id] ? "▼" : "▲"} {Math.abs(n - anterior.problemas[i.id])} desde {fecha(anterior.creado)}
                  </p>
                )}
              </button>
            );
          })}

          {/* Canibalizaciones: el número tarda porque hay que preguntarle a
              Google, así que hasta que llegue se enseña un guion en gris. */}
          <button
            onClick={() => abrir("canibal")}
            title={APARTE.canibal.porque}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              abierto === "canibal"
                ? "border-[color:var(--tinta)] bg-white shadow-sm"
                : "border-[color:var(--linea)] bg-white hover:border-[color:var(--linea-fuerte)]"
            }`}
          >
            <p
              className={`text-[22px] cifra font-semibold tabular-nums ${
                canibales == null
                  ? "text-[color:var(--tinta-suave)]"
                  : canibales === 0
                    ? "text-[color:var(--tinta-suave)]"
                    : "text-amber-700"
              }`}
            >
              {canibales == null ? "—" : miles(canibales)}
            </p>
            <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">
              {APARTE.canibal.etiqueta}
            </p>
          </button>

          <button
            onClick={() => abrir("velocidad")}
            title={APARTE.velocidad.porque}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              abierto === "velocidad"
                ? "border-[color:var(--tinta)] bg-white shadow-sm"
                : "border-[color:var(--linea)] bg-white hover:border-[color:var(--linea-fuerte)]"
            }`}
          >
            <p
              className={`text-[22px] cifra font-semibold tabular-nums ${
                velocidad?.nota == null
                  ? "text-[color:var(--tinta-suave)]"
                  : velocidad.nota >= 90
                    ? "text-emerald-700"
                    : velocidad.nota >= 50
                      ? "text-amber-700"
                      : "text-red-600"
              }`}
            >
              {velocidad?.nota ?? "—"}
            </p>
            <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">
              {APARTE.velocidad.etiqueta}
            </p>
          </button>
        </div>
          </>
        );
      })()}

      {abierto && (
        <div className="mt-5">
          <p className="text-[14px] text-[color:var(--tinta-media)]">
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
      )}
    </>
  );
}
