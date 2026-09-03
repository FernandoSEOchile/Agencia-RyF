"use client";

import { useState } from "react";

/**
 * Gráficos del panorama, en SVG y sin librería.
 *
 * Sin librería a propósito: son dos formas —una línea con área y una barra
 * apilada— y traerse cien kilobytes de JavaScript para eso encarece cada carga
 * del panel a cambio de nada.
 *
 * Reglas que no conviene romper, porque son las que hacen que un gráfico se lea
 * en vez de decorar:
 *
 * · **Un solo eje por gráfico.** Clics e impresiones se miden en escalas muy
 *   distintas, y ponerlos juntos con dos ejes deja dibujar la historia que uno
 *   quiera moviendo una escala. Van en gráficos separados que comparten el eje
 *   del tiempo, que es la comparación honesta.
 * · **Una serie no lleva leyenda**: el título ya la nombra.
 * · **Nunca un número sobre cada punto.** Se etiqueta el último valor y el
 *   máximo, y el resto lo dice el cursor al pasar por encima.
 */

/* Paleta validada para fondo claro. Los nombres dicen para qué sirve cada uno,
   no de qué color son: si algún día cambia la marca, cambia aquí y nada más. */
const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const VERDE = "#1baf7a";
const AMARILLO = "#eda100";
const TINTA = "#111111";
const SUAVE = "#8b8b86";
const LINEA = "#e6e6e1";

const miles = (n: number) => Math.round(n).toLocaleString("es-CL");

/** Fecha corta para el eje: «14 sep». */
function dia(iso: string) {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]}`;
}

export interface Punto {
  fecha: string;
  valor: number;
}

/**
 * Una serie en el tiempo, con área y cursor.
 *
 * `invertido` es para la posición media: ahí un número más bajo es mejor, y
 * dibujarla como todo lo demás haría que una mejora pareciera una caída.
 */
export function Linea({
  titulo,
  puntos,
  color = AZUL,
  invertido = false,
  sufijo = "",
  marcas = [],
  alto = 150,
}: {
  titulo: string;
  puntos: Punto[];
  color?: string;
  invertido?: boolean;
  sufijo?: string;
  /** Días en los que se trabajó, para marcarlos bajo la línea. */
  marcas?: { fecha: string; cuantos: number }[];
  alto?: number;
}) {
  const [encima, setEncima] = useState<number | null>(null);

  if (puntos.length < 2) {
    return (
      <div className="tarjeta p-5">
        <h3 className="text-[13px] font-medium">{titulo}</h3>
        <p className="mt-6 text-center text-[13px] text-[color:var(--tinta-suave)]">
          Todavía no hay suficientes datos para dibujar una línea.
        </p>
      </div>
    );
  }

  const ANCHO = 640;
  const PAD = { arriba: 16, derecha: 12, abajo: 26, izquierda: 10 };
  const w = ANCHO - PAD.izquierda - PAD.derecha;
  const h = alto - PAD.arriba - PAD.abajo;

  const valores = puntos.map((p) => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);

  // Se deja aire arriba y abajo para que la línea no toque los bordes, y para
  // que una serie plana no salga pegada al suelo pareciendo un cero.
  const lo = invertido ? Math.max(0, min - (max - min) * 0.2 - 0.5) : 0;
  const hi = invertido ? max + (max - min) * 0.2 + 0.5 : max * 1.15 || 1;

  const x = (i: number) => PAD.izquierda + (i / (puntos.length - 1)) * w;
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1);
    return PAD.arriba + (invertido ? t : 1 - t) * h;
  };

  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${PAD.arriba + h} L${x(0).toFixed(1)},${PAD.arriba + h} Z`;

  const ultimo = puntos[puntos.length - 1];
  const iMax = valores.indexOf(max);
  const marcado = encima != null ? puntos[encima] : null;

  const porFecha = new Map(marcas.map((m) => [m.fecha, m.cuantos]));
  const id = titulo.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="tarjeta p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium">{titulo}</h3>
        <p className="text-[13px] tabular-nums text-[color:var(--tinta-media)]">
          {marcado ? (
            <>
              <span className="font-semibold text-[color:var(--tinta)]">
                {miles(marcado.valor)}
                {sufijo}
              </span>{" "}
              <span className="text-[color:var(--tinta-suave)]">{dia(marcado.fecha)}</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-[color:var(--tinta)]">
                {miles(ultimo.valor)}
                {sufijo}
              </span>{" "}
              <span className="text-[color:var(--tinta-suave)]">el último día</span>
            </>
          )}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="mt-2 w-full"
        style={{ height: alto }}
        role="img"
        aria-label={`${titulo}, de ${dia(puntos[0].fecha)} a ${dia(ultimo.fecha)}`}
        onMouseLeave={() => setEncima(null)}
        onMouseMove={(e) => {
          const caja = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - caja.left) / caja.width) * ANCHO;
          const i = Math.round(((rel - PAD.izquierda) / w) * (puntos.length - 1));
          setEncima(Math.min(puntos.length - 1, Math.max(0, i)));
        }}
      >
        <defs>
          <linearGradient id={`relleno-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1={PAD.izquierda} y1={PAD.arriba + h} x2={ANCHO - PAD.derecha} y2={PAD.arriba + h} stroke={LINEA} strokeWidth="1" />

        {/* Días con trabajo: una marca discreta bajo el eje. Es lo que permite
            mirar un repunte y preguntarse si vino de algo que hicimos. */}
        {puntos.map((p, i) =>
          porFecha.has(p.fecha) ? (
            <rect
              key={`t-${p.fecha}`}
              x={x(i) - 1}
              y={PAD.arriba + h + 2}
              width="2"
              height="5"
              rx="1"
              fill={AMARILLO}
            >
              <title>{`${porFecha.get(p.fecha)} cambios el ${dia(p.fecha)}`}</title>
            </rect>
          ) : null
        )}

        <path d={area} fill={`url(#relleno-${id})`} />
        <path d={linea} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* El máximo, etiquetado. Solo ese y el último: un número por punto
            convierte el gráfico en una tabla ilegible. */}
        {iMax !== puntos.length - 1 && (
          <>
            <circle cx={x(iMax)} cy={y(max)} r="3.5" fill={color} stroke="#fff" strokeWidth="2" />
            <text
              x={Math.min(x(iMax), ANCHO - 60)}
              y={y(max) - 8}
              fontSize="11"
              fill={SUAVE}
              textAnchor="middle"
            >
              {miles(max)}
              {sufijo}
            </text>
          </>
        )}

        <circle cx={x(puntos.length - 1)} cy={y(ultimo.valor)} r="4" fill={color} stroke="#fff" strokeWidth="2" />

        {marcado && encima != null && (
          <>
            <line x1={x(encima)} y1={PAD.arriba} x2={x(encima)} y2={PAD.arriba + h} stroke={SUAVE} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(encima)} cy={y(marcado.valor)} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
          </>
        )}

        <text x={PAD.izquierda} y={alto - 8} fontSize="11" fill={SUAVE}>
          {dia(puntos[0].fecha)}
        </text>
        <text x={ANCHO - PAD.derecha} y={alto - 8} fontSize="11" fill={SUAVE} textAnchor="end">
          {dia(ultimo.fecha)}
        </text>
      </svg>
    </div>
  );
}

/* Los tramos de posición. El orden importa: de mejor a peor, y ese mismo orden
   se respeta en la pila, en la leyenda y en la tabla. */
const TRAMOS = [
  { id: "top3", etiqueta: "Top 3", color: VERDE },
  { id: "top10", etiqueta: "4 a 10", color: AZUL },
  { id: "top20", etiqueta: "11 a 20", color: AMARILLO },
  { id: "top100", etiqueta: "21 a 100", color: NARANJA },
] as const;

export interface DiaPosiciones {
  fecha: string;
  top3: number;
  top10: number;
  top20: number;
  top100: number;
}

/**
 * Cuántas palabras hay en cada tramo, medición a medición.
 *
 * Barras apiladas y no líneas: lo que se lee de un vistazo es «cuánto verde hay
 * y si está creciendo», que es una relación de parte y todo, no cuatro series
 * independientes.
 */
export function Tramos({ dias }: { dias: DiaPosiciones[] }) {
  if (dias.length === 0) {
    return (
      <div className="tarjeta p-5">
        <h3 className="text-[13px] font-medium">Palabras por tramo</h3>
        <p className="mt-6 text-center text-[13px] text-[color:var(--tinta-suave)]">
          Aún no se han medido posiciones en este periodo.
        </p>
      </div>
    );
  }

  const ANCHO = 640;
  const ALTO = 170;
  const PAD = { arriba: 14, abajo: 26, lados: 10 };
  const h = ALTO - PAD.arriba - PAD.abajo;
  const w = ANCHO - PAD.lados * 2;

  const total = (d: DiaPosiciones) => d.top3 + d.top10 + d.top20 + d.top100;
  const max = Math.max(...dias.map(total), 1);

  const ancho = Math.min(28, (w / dias.length) * 0.7);
  const paso = w / dias.length;
  const ultimo = dias[dias.length - 1];

  return (
    <div className="tarjeta p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-medium">Palabras por tramo</h3>
        <div className="flex flex-wrap items-center gap-3">
          {TRAMOS.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5 text-[12px] text-[color:var(--tinta-media)]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
              {t.etiqueta}
              <span className="tabular-nums font-medium text-[color:var(--tinta)]">{ultimo[t.id]}</span>
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="mt-2 w-full" style={{ height: ALTO }} role="img"
        aria-label="Palabras clave por tramo de posición en cada medición">
        <line x1={PAD.lados} y1={PAD.arriba + h} x2={ANCHO - PAD.lados} y2={PAD.arriba + h} stroke={LINEA} strokeWidth="1" />

        {dias.map((d, i) => {
          const cx = PAD.lados + paso * i + paso / 2 - ancho / 2;
          let acumulado = 0;

          return (
            <g key={d.fecha}>
              {TRAMOS.map((t) => {
                const v = d[t.id];
                if (!v) return null;

                const alto = (v / max) * h;
                acumulado += alto;
                const y = PAD.arriba + h - acumulado;

                return (
                  // 2px de hueco entre segmentos: sin ese respiro dos colores
                  // contiguos se leen como una sola banda.
                  <rect key={t.id} x={cx} y={y} width={ancho} height={Math.max(0, alto - 2)} rx="2" fill={t.color}>
                    <title>{`${t.etiqueta}: ${v} · ${dia(d.fecha)}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}

        <text x={PAD.lados} y={ALTO - 8} fontSize="11" fill={SUAVE}>{dia(dias[0].fecha)}</text>
        <text x={ANCHO - PAD.lados} y={ALTO - 8} fontSize="11" fill={SUAVE} textAnchor="end">{dia(ultimo.fecha)}</text>
      </svg>
    </div>
  );
}

/** Un número grande con su variación. Para lo que no necesita gráfico. */
export function Cifra({
  etiqueta,
  valor,
  variacion,
  pie,
  mejorMenos = false,
}: {
  etiqueta: string;
  valor: string;
  /** Porcentaje de cambio contra el periodo anterior. */
  variacion?: number | null;
  pie?: string;
  /** Para la posición media, donde bajar es mejorar. */
  mejorMenos?: boolean;
}) {
  const sube = (variacion ?? 0) > 0;
  const bueno = mejorMenos ? !sube : sube;

  return (
    <div className="tarjeta px-5 py-4">
      <p className="rotulo">{etiqueta}</p>
      <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums" style={{ color: TINTA }}>
        {valor}
      </p>

      {variacion != null && variacion !== 0 && (
        <p className={`mt-1.5 text-[12px] font-medium tabular-nums ${bueno ? "text-emerald-700" : "text-red-600"}`}>
          {sube ? "▲" : "▼"} {Math.abs(variacion)}%{" "}
          <span className="font-normal text-[color:var(--tinta-suave)]">vs. periodo anterior</span>
        </p>
      )}

      {pie && <p className="mt-1.5 text-[12px] text-[color:var(--tinta-suave)]">{pie}</p>}
    </div>
  );
}
