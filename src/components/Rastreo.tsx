"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

/**
 * Rastreo técnico del sitio.
 *
 * Los problemas se presentan como cuadros que se pinchan, no como una tabla de
 * cinco mil filas: nadie audita una web leyendo cinco mil filas, se audita
 * preguntando «¿qué está roto?» y mirando solo eso.
 */

interface Problemas {
  rotas: number;
  redirigidas: number;
  lentas: number;
  sinTitulo: number;
  sinDescripcion: number;
  sinH1: number;
  noIndexables: number;
  sinAlt: number;
  huerfanas: number;
  tituloRepetido: number;
}

interface Pagina {
  url: string;
  estado: number | null;
  ms: number | null;
  destino: string | null;
  titulo: string | null;
  palabras: number;
  imagenesSinAlt: number;
  error: string | null;
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

/** Qué mide cada cuadro y por qué importa. Se enseña al pasar el ratón. */
const INFORMES: { id: keyof Problemas; etiqueta: string; grave?: boolean; porque: string }[] = [
  { id: "rotas", etiqueta: "Rotas", grave: true, porque: "Devuelven 404 o ni contestan. El visitante se va y Google deja de rastrearlas." },
  { id: "noIndexables", etiqueta: "No indexables", grave: true, porque: "El sitio le pide a Google que no las incluya. Se ven bien y nunca salen en buscadores." },
  { id: "huerfanas", etiqueta: "Huérfanas", porque: "Ningún enlace interno lleva a ellas. Existen en el sitemap y en la práctica están escondidas." },
  { id: "redirigidas", etiqueta: "Redirigidas", porque: "Están en el sitemap pero acaban en otra dirección. El sitemap debería llevar al destino final." },
  { id: "tituloRepetido", etiqueta: "Título repetido", porque: "Dos páginas con el mismo título compiten entre ellas por la misma búsqueda." },
  { id: "sinTitulo", etiqueta: "Sin título", porque: "Google se inventa uno, y suele elegir peor que tú." },
  { id: "sinDescripcion", etiqueta: "Sin descripción", porque: "Sin meta description, el fragmento del resultado lo escribe Google recortando la página." },
  { id: "sinH1", etiqueta: "Sin H1", porque: "Falta el encabezado principal, que es la primera pista de sobre qué va la página." },
  { id: "lentas", etiqueta: "Lentas", porque: "Tardan más de tres segundos en entregarse enteras." },
  { id: "sinAlt", etiqueta: "Imágenes sin alt", porque: "Imágenes sin texto alternativo: ni Google ni un lector de pantalla saben qué son." },
];

type Col = "url" | "estado" | "ms" | "titulo";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "url", texto: "URL" },
  { id: "estado", texto: "Código", clase: "text-right", num: true },
  { id: "ms", texto: "Tiempo", clase: "text-right", num: true },
  { id: "titulo", texto: "Título" },
];

const miles = (n: number) => n.toLocaleString("es-CL");

export default function Rastreo({
  clienteId,
  puedeLanzar,
}: {
  clienteId: string;
  puedeLanzar: boolean;
}) {
  const [tanda, setTanda] = useState<Tanda | null>(null);
  const [problemas, setProblemas] = useState<Problemas | null>(null);
  const [abierto, setAbierto] = useState<keyof Problemas | null>(null);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { orden, ordenar, ordenarPor } = useOrden<Col>("url");

  const mirar = useCallback(async () => {
    try {
      const d = await fetch(`/api/rastreo?cliente=${clienteId}`).then((r) => r.json());
      if (d.error) {
        setError(d.error);
        return;
      }
      setTanda(d.rastreo);
      setProblemas(d.problemas ?? null);
    } catch {
      setError("No se pudo leer el rastreo.");
    } finally {
      setCargando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    mirar();
  }, [mirar]);

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

  async function abrir(id: keyof Problemas) {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    setPaginas([]);

    // El de títulos repetidos no tiene lista propia: se ve mirando los títulos
    // en cualquiera de los otros informes, y montarle una consulta aparte por
    // un caso que se resuelve ordenando no compensa.
    if (id === "tituloRepetido") return;

    const d = await fetch(`/api/rastreo?cliente=${clienteId}&problema=${id}`).then((r) => r.json());
    setPaginas(d.paginas ?? []);
  }

  const filas = ordenarPor(paginas, (p, c) =>
    c === "url" ? p.url : c === "titulo" ? (p.titulo ?? "") : (p[c] ?? -1)
  );

  if (cargando) return <p className="text-[13px] text-[color:var(--tinta-media)]">Mirando…</p>;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Rastreo técnico</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-[color:var(--tinta-media)]">
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

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}

      {!tanda && (
        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">Este sitio no se ha rastreado nunca.</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[color:var(--tinta-media)]">
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
          <p className="mt-3 text-[12px] text-[color:var(--tinta-suave)]">
            Puedes irte a otra pestaña: sigue por su cuenta.
          </p>
        </div>
      )}

      {tanda && tanda.estado !== "corriendo" && (
        <p className="mt-4 text-[13px] text-[color:var(--tinta-media)]">
          {tanda.estado === "terminado"
            ? `${miles(tanda.hechas)} páginas revisadas el ${tanda.creado.slice(0, 10)}`
            : tanda.estado === "interrumpido"
              ? "El último rastreo se cortó a mitad."
              : "El último rastreo falló."}
          {tanda.nota && ` · ${tanda.nota}`}
        </p>
      )}

      {problemas && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {INFORMES.map((i) => {
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
                    : "border-[color:var(--linea)] bg-white hover:border-[color:var(--linea-fuerte)]"
                }`}
              >
                <p
                  className={`text-[22px] font-semibold tabular-nums ${
                    n === 0
                      ? "text-[color:var(--tinta-suave)]"
                      : i.grave
                        ? "text-red-600"
                        : "text-amber-700"
                  }`}
                >
                  {miles(n)}
                </p>
                <p className="mt-0.5 text-[12px] text-[color:var(--tinta-media)]">{i.etiqueta}</p>
              </button>
            );
          })}
        </div>
      )}

      {abierto && (
        <div className="mt-5">
          <p className="text-[13px] text-[color:var(--tinta-media)]">
            {INFORMES.find((i) => i.id === abierto)?.porque}
          </p>

          {abierto === "tituloRepetido" ? (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">
              Ordena cualquier otro informe por «Título» para ver cuáles se repiten.
            </p>
          ) : paginas.length === 0 ? (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-suave)]">Nada por aquí.</p>
          ) : (
            <div className="tarjeta mt-3 overflow-x-auto">
              <table className="w-full text-[13px]">
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
                          <span className="block truncate text-[12px] text-[color:var(--tinta-suave)]">
                            → {p.destino}
                          </span>
                        )}
                        {p.error && (
                          <span className="block text-[12px] text-red-600">{p.error}</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          p.estado == null || p.estado >= 400 ? "text-red-600" : ""
                        }`}
                      >
                        {p.estado ?? "—"}
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
