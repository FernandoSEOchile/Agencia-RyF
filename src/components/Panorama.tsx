"use client";

import { useCallback, useEffect, useState } from "react";
import { Linea, Tramos, Cifra, Historico, Reparto, type DiaPosiciones, type MesTramos } from "@/components/Grafico";

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
  avisoGsc: string | null;
  posiciones: DiaPosiciones[];
  trabajo: { fecha: string; cuantos: number }[];
  tecnico: { paginas: number; rotas: number; noIndexables: number; medido: string } | null;
  keywords: number;
  reparto: { top3: number; top10: number; top20: number; top50: number; resto: number };
  consultasTotales: number;
  historico: MesTramos[];
  exploradoEl: string | null;
  velocidad: number | null;
  enlaces: { medido: string; resumen: Record<string, number> | null } | null;
}

const PERIODOS = [
  [28, "1 mes"],
  [90, "3 meses"],
  [180, "6 meses"],
  [365, "1 año"],
] as const;

const miles = (n: number) => Math.round(n).toLocaleString("es-CL");

/**
 * Cuánto cambió la segunda mitad respecto a la primera.
 *
 * Se parte el periodo por la mitad en vez de comparar contra los mismos días
 * del año pasado porque casi ningún sitio tiene un año de historial aquí
 * todavía. Cuando lo tengan, esta es la función que hay que cambiar.
 */
function variacion(valores: number[]): number | null {
  if (valores.length < 14) return null;

  const mitad = Math.floor(valores.length / 2);
  const antes = valores.slice(0, mitad).reduce((t, v) => t + v, 0);
  const ahora = valores.slice(mitad).reduce((t, v) => t + v, 0);

  if (antes === 0) return null;
  return Math.round(((ahora - antes) / antes) * 100);
}

export default function Panorama({ clienteId }: { clienteId: string }) {
  const [dias, setDias] = useState(180);
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    return <p className="text-[13px] text-[color:var(--tinta-media)]">Reuniendo los datos…</p>;
  }

  if (error) return <p className="text-[13px] font-medium text-red-600">{error}</p>;
  if (!d) return null;

  const clics = d.trafico.map((x) => x.clics);
  const impresiones = d.trafico.map((x) => x.impresiones);
  const posicion = d.trafico.map((x) => x.posicion);

  const media = (v: number[]) => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Cómo va {d.cliente.nombre}</h2>
          <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">
            Lo que se puede medir del sitio, junto y en el tiempo.
          </p>
        </div>

        <div className="segmentos">
          {PERIODOS.map(([n, texto]) => (
            <button
              key={n}
              onClick={() => setDias(n)}
              className={`segmento ${dias === n ? "segmento-activo" : ""}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {d.avisoGsc && (
        <p className="mt-4 rounded-xl border border-[color:var(--linea)] bg-white px-4 py-3 text-[13px] text-[color:var(--tinta-media)]">
          {d.avisoGsc}
        </p>
      )}

      {/* Cifras: lo que se mira primero y decide si hay que preocuparse. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Cifra
          etiqueta="Clics"
          valor={miles(clics.reduce((t, v) => t + v, 0))}
          variacion={variacion(clics)}
          pie={`en ${d.dias} días`}
        />
        <Cifra
          etiqueta="Impresiones"
          valor={miles(impresiones.reduce((t, v) => t + v, 0))}
          variacion={variacion(impresiones)}
        />
        <Cifra
          etiqueta="Posición media"
          valor={posicion.length ? media(posicion).toFixed(1) : "—"}
          variacion={variacion(posicion)}
          mejorMenos
        />
        <Cifra
          etiqueta="Palabras en seguimiento"
          valor={miles(d.keywords)}
          pie={d.posiciones.length ? `${d.posiciones.length} mediciones` : "sin medir aún"}
        />
        <Cifra
          etiqueta="Velocidad"
          valor={d.velocidad != null ? String(d.velocidad) : "—"}
          pie={d.velocidad != null ? "nota de PageSpeed" : "sin medir"}
        />
      </div>

      {/* Tres gráficos con el mismo eje de tiempo, nunca dos escalas en uno. */}
      <div className="mt-4 grid gap-4">
        <Linea
          titulo="Clics desde Google"
          puntos={d.trafico.map((x) => ({ fecha: x.fecha, valor: x.clics }))}
          marcas={d.trabajo}
        />

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

        <div className="grid gap-4 lg:grid-cols-2">
          <Reparto reparto={d.reparto} total={d.consultasTotales} />
          {d.posiciones.length > 1 && <Tramos dias={d.posiciones} />}
        </div>

        {d.historico.length > 1 && <Historico meses={d.historico} />}
      </div>

      {d.historico.length > 1 && d.exploradoEl && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
          La curva de posiciones sale de la exploración del dominio del {d.exploradoEl} y es una{" "}
          <span className="font-medium text-[color:var(--tinta)]">estimación de DataForSEO</span>,
          no una medición. Sirve para ver la forma de la tendencia; las cifras exactas son las de
          Search Console.
        </p>
      )}

      {d.historico.length <= 1 && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
          Para ver la curva de palabras clave por posición mes a mes, explora este dominio desde{" "}
          <span className="font-medium text-[color:var(--tinta)]">Explorar dominio</span>. Se paga
          una vez y queda guardada.
        </p>
      )}

      {d.trabajo.length > 0 && (
        <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
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
