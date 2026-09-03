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

/** «2026-09» -> «sep 26». */
function mesCorto(iso: string) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [a, m] = iso.split("-");
  return `${meses[Number(m) - 1]} ${a.slice(2)}`;
}

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

/* Los tramos del histórico del dominio.
 *
 * Una rampa de un solo tono, de oscuro a claro, y no cinco colores distintos.
 * Los tramos son una escala ORDENADA —del top 3 al puesto 100— y darles cinco
 * identidades sugiere que son cosas distintas cuando son la misma cosa a
 * distinta altura. Con la rampa, «cuánto oscuro hay arriba» se lee de un
 * vistazo y sin depender de distinguir colores. */
const RAMPA = [
  { id: "pos1", etiqueta: "Puesto 1", color: "#0b3566" },
  { id: "pos2a3", etiqueta: "2 y 3", color: "#14508f" },
  { id: "pos4a10", etiqueta: "4 a 10", color: "#2a78d6" },
  { id: "pos11a20", etiqueta: "11 a 20", color: "#7fb0e8" },
  { id: "pos21a50", etiqueta: "21 a 50", color: "#b9d5f3" },
  { id: "pos51a100", etiqueta: "51 a 100", color: "#dfeaf7" },
] as const;

export interface MesTramos {
  mes: string;
  keywords: number;
  trafico: number;
  tramos: Record<string, number>;
}

/**
 * La curva de palabras clave por posición, mes a mes.
 *
 * Es el gráfico que enseña Semrush en la portada de un dominio, y el que
 * contesta «¿esto va hacia arriba?» mejor que ningún otro: el total de palabras
 * sube igual con diez nuevas en el top 3 que con diez en la página nueve, y
 * solo la primera cosa es crecer.
 *
 * Área apilada y no líneas sueltas porque la pregunta es de parte y todo.
 */
export function Historico({ meses }: { meses: MesTramos[] }) {
  const [encima, setEncima] = useState<number | null>(null);

  if (meses.length < 2) return null;

  const ANCHO = 640;
  const ALTO = 210;
  const PAD = { arriba: 16, abajo: 28, lados: 10 };
  const w = ANCHO - PAD.lados * 2;
  const h = ALTO - PAD.arriba - PAD.abajo;

  const total = (m: MesTramos) => RAMPA.reduce((t, r) => t + (m.tramos[r.id] ?? 0), 0);
  const max = Math.max(...meses.map(total), 1);

  const x = (i: number) => PAD.lados + (i / (meses.length - 1)) * w;
  const y = (v: number) => PAD.arriba + h - (v / max) * h;

  /* Se dibuja de abajo arriba acumulando: cada banda es la suma de las de
     debajo, y su borde inferior es el borde superior de la anterior. */
  const bandas: { color: string; d: string }[] = [];
  const suelo = meses.map(() => 0);

  for (let r = RAMPA.length - 1; r >= 0; r--) {
    const clave = RAMPA[r].id;
    const techo = meses.map((m, i) => suelo[i] + (m.tramos[clave] ?? 0));

    const arriba = techo.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const abajo = [...suelo]
      .map((v, i) => ({ v, i }))
      .reverse()
      .map(({ v, i }) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

    bandas.unshift({ color: RAMPA[r].color, d: `${arriba} ${abajo} Z` });
    for (let i = 0; i < meses.length; i++) suelo[i] = techo[i];
  }

  const ultimo = meses[meses.length - 1];
  const marcado = encima != null ? meses[encima] : null;
  const visto = marcado ?? ultimo;

  return (
    <div className="tarjeta p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-medium">Palabras clave por posición</h3>
        <p className="text-[13px] tabular-nums text-[color:var(--tinta-media)]">
          <span className="font-semibold text-[color:var(--tinta)]">{miles(total(visto))}</span>{" "}
          <span className="text-[color:var(--tinta-suave)]">en {mesCorto(visto.mes)}</span>
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {RAMPA.map((r) => (
          <span key={r.id} className="flex items-center gap-1.5 text-[12px] text-[color:var(--tinta-media)]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
            {r.etiqueta}
            <span className="tabular-nums font-medium text-[color:var(--tinta)]">
              {miles(visto.tramos[r.id] ?? 0)}
            </span>
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="mt-2 w-full"
        style={{ height: ALTO }}
        role="img"
        aria-label={`Palabras clave por tramo de posición, de ${mesCorto(meses[0].mes)} a ${mesCorto(ultimo.mes)}`}
        onMouseLeave={() => setEncima(null)}
        onMouseMove={(e) => {
          const caja = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - caja.left) / caja.width) * ANCHO;
          const i = Math.round(((rel - PAD.lados) / w) * (meses.length - 1));
          setEncima(Math.min(meses.length - 1, Math.max(0, i)));
        }}
      >
        {bandas.map((b, i) => (
          <path key={i} d={b.d} fill={b.color} stroke="#fff" strokeWidth="0.75" />
        ))}

        <line x1={PAD.lados} y1={PAD.arriba + h} x2={ANCHO - PAD.lados} y2={PAD.arriba + h} stroke={LINEA} strokeWidth="1" />

        {encima != null && (
          <line x1={x(encima)} y1={PAD.arriba} x2={x(encima)} y2={PAD.arriba + h} stroke={TINTA} strokeWidth="1" strokeDasharray="3 3" />
        )}

        <text x={PAD.lados} y={ALTO - 8} fontSize="11" fill={SUAVE}>{mesCorto(meses[0].mes)}</text>
        <text x={ANCHO - PAD.lados} y={ALTO - 8} fontSize="11" fill={SUAVE} textAnchor="end">{mesCorto(ultimo.mes)}</text>
      </svg>
    </div>
  );
}

/* Los tramos de Search Console. Mismos tonos que el histórico estimado, para
   que el mismo color signifique lo mismo en los dos gráficos de la pantalla. */
const TRAMOS_GSC = [
  { id: "top3", etiqueta: "Top 3", color: "#0b3566" },
  { id: "top10", etiqueta: "4 a 10", color: "#2a78d6" },
  { id: "top20", etiqueta: "11 a 20", color: "#7fb0e8" },
  { id: "top50", etiqueta: "21 a 50", color: "#b9d5f3" },
  { id: "resto", etiqueta: "51+", color: "#d8e5f2" },
] as const;

export interface MesGsc {
  mes: string;
  top3: number;
  top10: number;
  top20: number;
  top50: number;
  resto: number;
  consultas: number;
}

/**
 * Palabras clave por posición, mes a mes, con datos de Search Console.
 *
 * Líneas y no área apilada, al revés que el histórico estimado: aquí lo que se
 * quiere ver es si el top 3 crece **por sí mismo**, y en una pila esa banda se
 * mueve arriba y abajo por lo que hagan las de debajo aunque ella no cambie.
 *
 * Cada línea es un tramo y ninguna se suma a otra, así que se pueden leer las
 * cinco a la vez sin hacer restas mentales.
 */
export function LineasTramos({ meses }: { meses: MesGsc[] }) {
  const [encima, setEncima] = useState<number | null>(null);

  /* Qué tramos están apagados. Se puede apagar cualquiera menos el último que
     quede encendido: un gráfico sin series es una caja vacía, no una vista. */
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());

  if (meses.length < 2) return null;

  const visibles = TRAMOS_GSC.filter((t) => !ocultos.has(t.id));

  const ANCHO = 700;
  const ALTO = 240;
  const PAD = { arriba: 14, abajo: 30, izquierda: 8, derecha: 46 };
  const w = ANCHO - PAD.izquierda - PAD.derecha;
  const h = ALTO - PAD.arriba - PAD.abajo;

  const pico = Math.max(...meses.flatMap((m) => visibles.map((t) => m[t.id])), 1);

  /* El techo se redondea a una cifra limpia para que las líneas de referencia
     caigan en números que alguien pueda leer, no en 313,7. */
  const paso = Math.pow(10, Math.floor(Math.log10(pico / 4 || 1)));
  const escalon = Math.ceil(pico / 4 / paso) * paso;
  const techo = escalon * 4 || 1;

  const x = (i: number) => PAD.izquierda + (i / (meses.length - 1)) * w;
  const y = (v: number) => PAD.arriba + h - (v / techo) * h;

  const visto = encima != null ? meses[encima] : meses[meses.length - 1];

  /* Etiquetas del eje del tiempo: la primera, la última y las de en medio si
     caben. Con dieciséis meses, una cada tres. */
  const cadaCuantos = Math.max(1, Math.ceil(meses.length / 6));

  return (
    <div className="tarjeta p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-medium">Palabras clave por posición</h3>
          <p className="mt-0.5 text-[12px] text-[color:var(--tinta-suave)]">
            De Search Console: búsquedas por las que el sitio salió de verdad.
            {meses.length >= 16 && " Google guarda 16 meses, esto es todo lo que hay."}
          </p>
        </div>
        <p className="text-[13px] tabular-nums text-[color:var(--tinta-media)]">
          <span className="font-semibold text-[color:var(--tinta)]">{miles(visto.consultas)}</span>{" "}
          <span className="text-[color:var(--tinta-suave)]">en {mesCorto(visto.mes)}</span>
        </p>
      </div>

      {/* Leyenda encendible. La casilla no es decorativa: con cinco series
          superpuestas, poder apagar cuatro es la única forma de mirar una. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {TRAMOS_GSC.map((t) => {
          const apagado = ocultos.has(t.id);
          const ultimo = visibles.length === 1 && !apagado;

          return (
            <button
              key={t.id}
              disabled={ultimo}
              onClick={() =>
                setOcultos((o) => {
                  const n = new Set(o);
                  if (n.has(t.id)) n.delete(t.id);
                  else n.add(t.id);
                  return n;
                })
              }
              className={`flex items-center gap-1.5 text-[12px] transition ${
                apagado ? "opacity-40" : ""
              } ${ultimo ? "cursor-default" : "hover:opacity-80"}`}
              title={ultimo ? "Tiene que quedar al menos una" : apagado ? "Mostrar" : "Ocultar"}
            >
              <span
                className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border"
                style={{
                  background: apagado ? "transparent" : t.color,
                  borderColor: apagado ? "var(--linea-fuerte)" : t.color,
                }}
              >
                {!apagado && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                    <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-[color:var(--tinta-media)]">{t.etiqueta}</span>
              <span className="tabular-nums font-medium text-[color:var(--tinta)]">
                {miles(visto[t.id])}
              </span>
            </button>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="mt-3 w-full"
        style={{ height: ALTO }}
        role="img"
        aria-label={`Palabras clave por tramo de posición, de ${mesCorto(meses[0].mes)} a ${mesCorto(meses[meses.length - 1].mes)}`}
        onMouseLeave={() => setEncima(null)}
        onMouseMove={(e) => {
          const caja = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - caja.left) / caja.width) * ANCHO;
          const i = Math.round(((rel - PAD.izquierda) / w) * (meses.length - 1));
          setEncima(Math.min(meses.length - 1, Math.max(0, i)));
        }}
      >
        <defs>
          {TRAMOS_GSC.map((t) => (
            <linearGradient key={t.id} id={`g-${t.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={t.color} stopOpacity="0.04" />
            </linearGradient>
          ))}
        </defs>

        {/* Líneas de referencia con su valor a la derecha. Recesivas a
            propósito: son una regla para medir, no parte del dibujo. */}
        {[0, 1, 2, 3, 4].map((n) => {
          const v = escalon * n;
          return (
            <g key={n}>
              <line x1={PAD.izquierda} y1={y(v)} x2={ANCHO - PAD.derecha} y2={y(v)} stroke={LINEA} strokeWidth="1" />
              <text x={ANCHO - PAD.derecha + 8} y={y(v) + 4} fontSize="11" fill={SUAVE}>
                {miles(v)}
              </text>
            </g>
          );
        })}

        {encima != null && (
          <line x1={x(encima)} y1={PAD.arriba} x2={x(encima)} y2={PAD.arriba + h} stroke={SUAVE} strokeWidth="1" strokeDasharray="3 3" />
        )}

        {/* Primero todas las áreas y luego todas las líneas: dibujándolas por
            pares, el relleno de una taparía la línea de la anterior. */}
        {visibles.map((t) => {
          const arriba = meses.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m[t.id]).toFixed(1)}`).join(" ");
          return (
            <path
              key={`a-${t.id}`}
              d={`${arriba} L${x(meses.length - 1).toFixed(1)},${PAD.arriba + h} L${x(0).toFixed(1)},${PAD.arriba + h} Z`}
              fill={`url(#g-${t.id})`}
            />
          );
        })}

        {visibles.map((t) => (
          <path
            key={`l-${t.id}`}
            d={meses.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m[t.id]).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={t.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {encima != null &&
          visibles.map((t) => (
            <circle key={t.id} cx={x(encima)} cy={y(visto[t.id])} r="4" fill={t.color} stroke="#fff" strokeWidth="2" />
          ))}

        {meses.map((m, i) =>
          i % cadaCuantos === 0 || i === meses.length - 1 ? (
            <text
              key={m.mes}
              x={x(i)}
              y={ALTO - 8}
              fontSize="11"
              fill={SUAVE}
              textAnchor={i === 0 ? "start" : i === meses.length - 1 ? "end" : "middle"}
            >
              {mesCorto(m.mes)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

/**
 * Cuántas consultas caen en cada tramo, ahora mismo.
 *
 * Barras y no una tarta: la pregunta es comparar magnitudes entre tramos, y en
 * una tarta comparar dos porciones que no son contiguas es un ejercicio de fe.
 *
 * La rampa es la misma que el histórico, así que el mismo tono significa el
 * mismo tramo en los dos gráficos y no hay que releer la leyenda.
 */
export function Reparto({
  reparto,
  total,
}: {
  reparto: { top3: number; top10: number; top20: number; top50: number; resto: number };
  total: number;
}) {
  const BARRAS = [
    { id: "top3", etiqueta: "1 a 3", valor: reparto.top3, color: "#0b3566" },
    { id: "top10", etiqueta: "4 a 10", valor: reparto.top10, color: "#2a78d6" },
    { id: "top20", etiqueta: "11 a 20", valor: reparto.top20, color: "#7fb0e8" },
    { id: "top50", etiqueta: "21 a 50", valor: reparto.top50, color: "#b9d5f3" },
    { id: "resto", etiqueta: "51+", valor: reparto.resto, color: "#dfeaf7" },
  ];

  if (total === 0) return null;

  const max = Math.max(...BARRAS.map((b) => b.valor), 1);

  return (
    <div className="tarjeta p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium">Posiciones reales en Google</h3>
        <p className="text-[13px] tabular-nums text-[color:var(--tinta-media)]">
          <span className="font-semibold text-[color:var(--tinta)]">{miles(total)}</span>{" "}
          <span className="text-[color:var(--tinta-suave)]">consultas</span>
        </p>
      </div>

      <p className="mt-0.5 text-[12px] text-[color:var(--tinta-suave)]">
        De Search Console: búsquedas por las que el sitio apareció de verdad, con su posición media.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        {BARRAS.map((b) => (
          <div key={b.id} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-[color:var(--tinta-media)]">
              {b.etiqueta}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-r-[4px] bg-black/[0.03]">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${Math.max((b.valor / max) * 100, b.valor ? 1.5 : 0)}%`, background: b.color }}
                title={`${miles(b.valor)} consultas entre las posiciones ${b.etiqueta}`}
              />
            </div>
            <span className="w-14 shrink-0 text-[12px] font-medium tabular-nums">
              {miles(b.valor)}
            </span>
          </div>
        ))}
      </div>
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
