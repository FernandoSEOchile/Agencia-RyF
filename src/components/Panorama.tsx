"use client";

import { useCallback, useEffect, useState } from "react";
import Periodo, { usePeriodo } from "@/components/Periodo";
import Esqueleto from "@/components/Esqueleto";
import {
  Linea,
  Tramos,
  Cifra,
  Historico,
  Reparto,
  LineasTramos,
  type DiaPosiciones,
  type MesTramos,
  type MesGsc,
} from "@/components/Grafico";

/**
 * El panorama de un cliente: cómo va, en una pantalla.
 *
 * La pregunta que contesta es una sola —«¿esto está creciendo?»— y todo lo que
 * no ayude a contestarla sobra. Por eso arriba van cifras con su variación, en
 * medio el tráfico en el tiempo, y el detalle vive en las otras pestañas.
 *
 * La marca amarilla bajo el gráfico de clics es lo que hace distinta esta
 * pantalla: son los días en que el equipo tocó el sitio. Sin eso, un repunte es
 * una curiosidad; con eso, se puede mirar si vino de algo que hicimos.
 */

interface Dia {
  fecha: string;
  clics: number;
  impresiones: number;
  posicion: number;
}

interface Datos {
  cliente: { nombre: string; dominio: string };
  dias: number;
  trafico: Dia[];
  traficoAnterior: Dia[];
  anotaciones: { id: string; fecha: string; texto: string }[];
  avisoGsc: string | null;
  posiciones: DiaPosiciones[];
  trabajo: { fecha: string; cuantos: number }[];
  tecnico: { paginas: number; rotas: number; noIndexables: number; medido: string } | null;
  keywords: number;
  reparto: { top3: number; top10: number; top20: number; top50: number; resto: number };
  consultasTotales: number;
  tramosMes: MesGsc[];
  historico: MesTramos[];
  exploradoEl: string | null;
  velocidad: number | null;
  enlaces: { medido: string; resumen: Record<string, number> | null } | null;
}

const miles = (n: number) => Math.round(n).toLocaleString("es-CL");

/**
 * Cuánto cambió este periodo respecto al anterior del mismo largo.
 *
 * Se compara contra los mismos días de antes —los 28 anteriores a estos 28—
 * y no partiendo el periodo por la mitad, que era lo que se hacía y decía
 * «vs. periodo anterior» sin serlo. En `promedio` (la posición media) se
 * comparan medias y no sumas: sumar posiciones no significa nada.
 */
function variacionEntre(actual: number[], anterior: number[], promedio = false): number | null {
  if (actual.length < 3 || anterior.length < 3) return null;
  const agregar = (v: number[]) => (promedio ? v.reduce((t, x) => t + x, 0) / v.length : v.reduce((t, x) => t + x, 0));
  const a = agregar(anterior);
  const b = agregar(actual);
  if (a === 0) return null;
  return Math.round(((b - a) / a) * 100);
}

export default function Panorama({
  clienteId,
  irA,
  puedeEditar = false,
}: {
  clienteId: string;
  /** Cambia de pestaña dentro de la ficha: «Medir velocidad» lleva a Técnico sin salir. */
  irA?: (pestaña: string) => void;
  puedeEditar?: boolean;
}) {
  const { dias, setDias, permitidos } = usePeriodo(180, [28, 90, 180, 365, 730]);
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anotFecha, setAnotFecha] = useState(new Date().toISOString().slice(0, 10));
  const [anotTexto, setAnotTexto] = useState("");

  async function anotarCambio() {
    if (!anotTexto.trim()) return;
    const r = await fetch("/api/anotaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, fecha: anotFecha, texto: anotTexto.trim() }),
    });
    if (r.ok) {
      setAnotTexto("");
      cargar();
    } else {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "No se pudo anotar.");
    }
  }

  async function quitarAnotacion(id: string) {
    await fetch("/api/anotaciones", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, id }),
    });
    cargar();
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const r = await fetch(`/api/panorama?cliente=${clienteId}&dias=${dias}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? `Error ${r.status}`);
        return;
      }
      setD(j);
    } catch {
      setError("No se pudo cargar el panorama.");
    } finally {
      setCargando(false);
    }
  }, [clienteId, dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando && !d) {
    return (
      <>
        <Esqueleto tipo="cifras" />
        <Esqueleto tipo="grafico" />
      </>
    );
  }

  if (error) return <p className="text-[14px] font-medium text-red-600">{error}</p>;
  if (!d) return null;

  const clics = d.trafico.map((x) => x.clics);
  const impresiones = d.trafico.map((x) => x.impresiones);
  const posicion = d.trafico.map((x) => x.posicion);
  const antes = {
    clics: (d.traficoAnterior ?? []).map((x) => x.clics),
    impresiones: (d.traficoAnterior ?? []).map((x) => x.impresiones),
    posicion: (d.traficoAnterior ?? []).map((x) => x.posicion),
  };

  const media = (v: number[]) => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Cómo va {d.cliente.nombre}</h2>
          <p className="mt-0.5 text-[14px] text-[color:var(--tinta-media)]">
            Lo que se puede medir del sitio, junto y en el tiempo.
          </p>
        </div>

        <Periodo dias={dias} setDias={setDias} permitidos={permitidos} />
      </div>

      {d.avisoGsc && (
        <p className="mt-4 rounded-xl border border-[color:var(--linea)] bg-white px-4 py-3 text-[14px] text-[color:var(--tinta-media)]">
          {d.avisoGsc}
        </p>
      )}

      {/* Cifras: lo que se mira primero y decide si hay que preocuparse. */}
      {/* Las cinco cifras en un solo bloque, con una junta de un pelo entre
          ellas, y la unica sombra de la pantalla: es lo que se mira primero. */}
      <div className="tarjeta tarjeta-destacada mt-5 grid gap-px overflow-hidden bg-[color:var(--linea)] sm:grid-cols-2 lg:grid-cols-5">
        <Cifra
          etiqueta="Clics"
          valor={miles(clics.reduce((t, v) => t + v, 0))}
          variacion={variacionEntre(clics, antes.clics)}
          pie={`en ${d.dias} días`}
        />
        <Cifra
          etiqueta="Impresiones"
          valor={miles(impresiones.reduce((t, v) => t + v, 0))}
          variacion={variacionEntre(impresiones, antes.impresiones)}
        />
        <Cifra
          etiqueta="Posición media"
          valor={posicion.length ? media(posicion).toFixed(1) : "—"}
          variacion={variacionEntre(posicion, antes.posicion, true)}
          mejorMenos
        />
        <Cifra
          etiqueta="Palabras en seguimiento"
          valor={miles(d.keywords)}
          pie={d.posiciones.length ? `${d.posiciones.length} mediciones` : "sin medir aún"}
          accion={!d.keywords && irA ? { texto: "Seguir palabras", alPulsar: () => irA("posiciones") } : undefined}
        />
        <Cifra
          etiqueta="Velocidad"
          valor={d.velocidad != null ? String(d.velocidad) : "—"}
          pie={d.velocidad != null ? "nota de PageSpeed" : "sin medir"}
          accion={d.velocidad == null && irA ? { texto: "Medir velocidad", alPulsar: () => irA("tecnico") } : undefined}
        />
      </div>

      {/* Tres gráficos con el mismo eje de tiempo, nunca dos escalas en uno. */}
      <div className="mt-4 grid gap-4">
        <Linea
          titulo="Clics desde Google"
          puntos={d.trafico.map((x) => ({ fecha: x.fecha, valor: x.clics }))}
          marcas={d.trabajo}
        />

        {/* Lo que pasó fuera del panel y explica la curva: una migración, un
            core update, un cambio de tema. Se apunta con fecha y queda como
            marca en el gráfico. */}
        <div className="tarjeta -mt-1 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(d.anotaciones ?? []).map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 text-[13px]">
                <span className="tabular-nums text-[color:var(--tinta-suave)]">{a.fecha.slice(5)}</span>
                <span>{a.texto}</span>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => quitarAnotacion(a.id)}
                    aria-label={`Quitar la anotación «${a.texto}»`}
                    className="text-[color:var(--tinta-suave)] hover:text-red-600"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {(d.anotaciones ?? []).length === 0 && !puedeEditar && (
              <span className="text-[13px] text-[color:var(--tinta-suave)]">Sin anotaciones en este periodo.</span>
            )}
            {puedeEditar && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  anotarCambio();
                }}
                className="ml-auto flex flex-wrap items-center gap-1.5"
              >
                <input
                  type="date"
                  value={anotFecha}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setAnotFecha(e.target.value)}
                  aria-label="Fecha de la anotación"
                  className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-2.5 py-1 text-[13px] outline-none focus:border-[color:var(--acento)]"
                />
                <input
                  value={anotTexto}
                  onChange={(e) => setAnotTexto(e.target.value)}
                  maxLength={200}
                  placeholder="Anotar un cambio: migración, core update, tema nuevo…"
                  aria-label="Texto de la anotación"
                  className="w-64 rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[13px] outline-none focus:border-[color:var(--acento)]"
                />
                <button type="submit" disabled={!anotTexto.trim()} className="boton disabled:opacity-40">
                  Anotar
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Linea
            titulo="Impresiones"
            puntos={d.trafico.map((x) => ({ fecha: x.fecha, valor: x.impresiones }))}
            color="#1baf7a"
          />
          <Linea
            titulo="Posición media"
            puntos={d.trafico.map((x) => ({ fecha: x.fecha, valor: x.posicion }))}
            color="#eb6834"
            invertido
          />
        </div>

        {d.tramosMes.length > 1 && <LineasTramos meses={d.tramosMes} />}

        <div className="grid gap-4 lg:grid-cols-2">
          <Reparto reparto={d.reparto} total={d.consultasTotales} />
          {d.posiciones.length > 1 && <Tramos dias={d.posiciones} />}
        </div>

        {d.historico.length > 1 && <Historico meses={d.historico} />}
      </div>

      {d.historico.length > 1 && d.exploradoEl && (
        <p className="mt-3 text-[14px] text-[color:var(--tinta-media)]">
          La curva de posiciones sale de la exploración del dominio del {d.exploradoEl} y es una{" "}
          <span className="font-medium text-[color:var(--tinta)]">estimación de DataForSEO</span>,
          no una medición. Sirve para ver la forma de la tendencia; las cifras exactas son las de
          Search Console.
        </p>
      )}

      {d.historico.length <= 1 && (
        <p className="mt-3 text-[14px] text-[color:var(--tinta-media)]">
          La curva de palabras clave por posición mes a mes sale de explorar el dominio: se paga una
          vez y queda guardada.{" "}
          <a href="/panel/explorar" className="font-medium text-[color:var(--acento)] underline-offset-4 hover:underline">
            Explorar este dominio →
          </a>
        </p>
      )}

      {d.trabajo.length > 0 && (
        <p className="mt-3 text-[14px] text-[color:var(--tinta-media)]">
          Las marcas amarillas bajo la línea de clics son los días en que se tocó el sitio:{" "}
          <span className="font-medium text-[color:var(--tinta)]">
            {miles(d.trabajo.reduce((t, x) => t + x.cuantos, 0))} cambios
          </span>{" "}
          en {d.trabajo.length} días. Google tarda semanas en reaccionar, así que el efecto se busca
          después de la marca, no encima.
        </p>
      )}

      {/* Estado del sitio: no crece, pero explica por qué a veces no crece. */}
      {(d.tecnico || d.enlaces) && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.tecnico && (
            <>
              <Cifra etiqueta="Páginas rastreadas" valor={miles(d.tecnico.paginas)} pie={`el ${d.tecnico.medido}`} />
              <Cifra etiqueta="Rotas" valor={miles(d.tecnico.rotas)} />
              <Cifra etiqueta="No indexables" valor={miles(d.tecnico.noIndexables)} />
            </>
          )}
          {d.enlaces?.resumen && (
            <Cifra
              etiqueta="Dominios que enlazan"
              valor={miles(d.enlaces.resumen.dominiosEnlazantes ?? 0)}
              pie={`medido el ${d.enlaces.medido}`}
            />
          )}
        </div>
      )}
    </>
  );
}
