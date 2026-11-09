"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { fechaLarga, fecha } from "@/lib/formato";
import type { KeywordVista } from "@/components/Posiciones";

/**
 * Las posiciones del cliente, maquetadas como informe para entregarle.
 *
 * Mismo lenguaje que el PDF de Explorar (clases ip-) y misma forma de
 * generarlo: el diálogo de impresión del navegador, sin un Chromium en el
 * servidor. A diferencia de aquel, este vive dentro de la ficha, rodeado de
 * pestañas, menú y paneles; por eso se monta directamente en <body> y, al
 * imprimir, se esconde todo lo demás (`body.imprimiendo-informe`).
 *
 * Es para el cliente final: sin costes, sin nada de otros clientes y sin
 * cifras que no salgan de una medición. Lo que no se midió dice «sin dato»;
 * lo que no aparece dice dentro de cuántos resultados se buscó.
 */

interface Grupo {
  clave: string;
  ubicacion: string;
  dispositivo: string;
  filas: KeywordVista[];
}

const numero = (n: number) => n.toLocaleString("es-CL");

function variacion(k: KeywordVista): { texto: string; clase: string } {
  // Sin puesto anterior no se sabe si «entró» o si la medición de antes era de
  // las que no distinguían el mapa: no se afirma ningún movimiento.
  if (k.mediciones < 2 || k.anterior === null) return { texto: "—", clase: "ip-suave" };
  if (k.puesto === null) {
    return k.revisados === null ? { texto: "—", clase: "ip-suave" } : { texto: "salió", clase: "ip-baja" };
  }
  const d = k.anterior - k.puesto;
  if (d === 0) return { texto: "=", clase: "ip-suave" };
  return d > 0 ? { texto: `▲ ${d}`, clase: "ip-sube" } : { texto: `▼ ${-d}`, clase: "ip-baja" };
}

function claseDePuesto(p: number | null) {
  if (p === null) return "ip-pos ip-pos-nula";
  if (p <= 3) return "ip-pos ip-pos-top";
  if (p <= 10) return "ip-pos ip-pos-pag1";
  if (p <= 20) return "ip-pos ip-pos-pag2";
  return "ip-pos";
}

function Puesto({ k }: { k: KeywordVista }) {
  if (k.mediciones === 0 || (k.puesto === null && k.revisados === null)) {
    return <span className="ip-suave">sin dato</span>;
  }
  if (k.puesto === null) {
    return <span className="ip-suave">no está en los {k.revisados} revisados</span>;
  }
  return (
    <>
      <span className={claseDePuesto(k.puesto)}>{k.puesto}</span>
      {k.tipo === "destacado" && <span className="ip-marca-destacado">destacado</span>}
    </>
  );
}

export default function InformePosiciones({
  cliente,
  keywords,
  generado,
}: {
  cliente: { nombre: string; dominio: string };
  keywords: KeywordVista[];
  generado: Date;
}) {
  // El portal necesita el document; en el servidor no se pinta nada.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  const medidas = keywords.filter((k) => k.mediciones > 0);
  const conPuesto = medidas.filter((k) => k.puesto !== null) as (KeywordVista & { puesto: number })[];
  const top3 = conPuesto.filter((k) => k.puesto <= 3).length;
  const top10 = conPuesto.filter((k) => k.puesto <= 10).length;
  const de11a20 = conPuesto.filter((k) => k.puesto > 10 && k.puesto <= 20).length;
  const mas20 = conPuesto.filter((k) => k.puesto > 20).length;
  const noEsta = medidas.filter((k) => k.puesto === null && k.revisados !== null).length;
  const sinDato = keywords.length - conPuesto.length - noEsta;
  const enMapa = medidas.filter((k) => k.puestoMapa !== null).length;
  const promedio = conPuesto.length ? conPuesto.reduce((s, k) => s + k.puesto, 0) / conPuesto.length : null;

  const conCambio = medidas
    .filter((k) => k.puesto !== null && k.anterior !== null && k.anterior !== k.puesto)
    .map((k) => ({ k, d: (k.anterior as number) - (k.puesto as number) }));
  const suben = conCambio.filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
  const bajan = conCambio.filter((x) => x.d < 0).sort((a, b) => a.d - b.d);

  const fechas = medidas.map((k) => k.medido).filter((f): f is string => Boolean(f)).sort();
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const mismoDia = desde && hasta && desde.slice(0, 10) === hasta.slice(0, 10);

  const grupos: Grupo[] = [];
  for (const k of keywords) {
    const disp = k.dispositivo === "mobile" ? "Móvil" : "Escritorio";
    const clave = `${k.ubicacion}|${disp}`;
    let g = grupos.find((x) => x.clave === clave);
    if (!g) {
      g = { clave, ubicacion: k.ubicacion, dispositivo: disp, filas: [] };
      grupos.push(g);
    }
    g.filas.push(k);
  }
  for (const g of grupos) {
    // Lo mejor arriba; lo que no aparece y lo que no tiene dato, al final.
    g.filas.sort((a, b) => (a.puesto ?? 1000 + (a.revisados === null ? 1 : 0)) - (b.puesto ?? 1000 + (b.revisados === null ? 1 : 0)) || a.termino.localeCompare(b.termino, "es"));
  }
  const ubicaciones = [...new Set(grupos.map((g) => g.ubicacion))].join(" · ");
  const dispositivos = [...new Set(grupos.map((g) => g.dispositivo))].join(" · ");

  const tramos = [
    { etq: "Top 3", n: top3, color: "#0f9d58" },
    { etq: "4 a 10", n: top10 - top3, color: "#94c93d" },
    { etq: "11 a 20", n: de11a20, color: "#f0a500" },
    { etq: "Más allá del 20", n: mas20, color: "#e07b39" },
    { etq: "No aparece", n: noEsta, color: "#c4c9d0" },
    { etq: "Sin dato", n: sinDato, color: "#e5e5ea" },
  ];
  const total = keywords.length || 1;

  return createPortal(
    <section className="solo-imprimir informe-pdf">
      {/* div y no header: el CSS de impresión esconde todos los header. */}
      <div className="ip-portada">
        <div className="ip-portada-fila">
          <span className="ip-marca">
            Agencia RYF <span>· Informe SEO</span>
          </span>
          <span className="ip-etiqueta">Posiciones en Google</span>
        </div>
        <h1>{cliente.nombre}</h1>
        <p className="ip-subtitulo">{cliente.dominio}</p>
        <div className="ip-meta">
          <span>
            <em>Ubicación</em>
            {ubicaciones || "—"}
          </span>
          <span>
            <em>Dispositivo</em>
            {dispositivos || "—"}
          </span>
          <span>
            <em>Medición</em>
            {!desde ? "sin mediciones" : mismoDia ? fechaLarga(hasta).replace(/,\s*\d{1,2}:\d{2}.*$/, "") : `${fecha(desde)} al ${fecha(hasta)}`}
          </span>
          <span>
            <em>Generado</em>
            {fechaLarga(generado)}
          </span>
        </div>
      </div>

      <div className="ip-kpis">
        <div className="ip-kpi">
          <p className="ip-kpi-rotulo">Palabras clave</p>
          <p className="ip-kpi-valor">{numero(keywords.length)}</p>
          <p className="ip-kpi-nota">{numero(medidas.length)} con medición</p>
        </div>
        <div className="ip-kpi ip-kpi-acento">
          <p className="ip-kpi-rotulo">En el top 3</p>
          <p className="ip-kpi-valor">{numero(top3)}</p>
          <p className="ip-kpi-nota">primeros resultados de Google</p>
        </div>
        <div className="ip-kpi">
          <p className="ip-kpi-rotulo">En la primera página</p>
          <p className="ip-kpi-valor">{numero(top10)}</p>
          <p className="ip-kpi-nota">posiciones 1 a 10</p>
        </div>
        <div className="ip-kpi">
          <p className="ip-kpi-rotulo">Posición promedio</p>
          <p className="ip-kpi-valor">{promedio === null ? "—" : promedio.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</p>
          <p className="ip-kpi-nota">de las que aparecen ({numero(conPuesto.length)})</p>
        </div>
      </div>

      <div className="ip-fila">
        <div className="ip-tarjeta">
          <h2>Dónde están las palabras clave</h2>
          <div className="ip-barra-apilada">
            {tramos.map((t) => (t.n > 0 ? <div key={t.etq} style={{ width: `${(t.n / total) * 100}%`, background: t.color }} /> : null))}
          </div>
          <table className="ip-leyenda">
            <tbody>
              {tramos.map((t) => (
                <tr key={t.etq}>
                  <td>
                    <i style={{ background: t.color }} />
                    {t.etq}
                  </td>
                  <td className="der">{numero(t.n)}</td>
                  <td className="der ip-suave">{((t.n / total) * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {enMapa > 0 && (
            <p className="ip-pie-tarjeta">
              Además, {numero(enMapa)} {enMapa === 1 ? "aparece" : "aparecen"} en el mapa de Google.
            </p>
          )}
        </div>

        <div className="ip-tarjeta">
          <h2>Movimientos desde la medición anterior</h2>
          {suben.length === 0 && bajan.length === 0 ? (
            <p className="ip-vacio">Sin cambios de posición respecto de la medición anterior.</p>
          ) : (
            <table className="ip-ranking">
              <tbody>
                {[...suben.slice(0, 5), ...bajan.slice(0, 5)].map(({ k, d }) => (
                  <tr key={k.id}>
                    <td className="ip-ranking-texto">
                      <span>{k.termino}</span>
                    </td>
                    <td className="der ip-suave">
                      {k.anterior} → {k.puesto}
                    </td>
                    <td className={`der ip-fuerte ${d > 0 ? "ip-sube" : "ip-baja"}`}>{d > 0 ? `▲ ${d}` : `▼ ${-d}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="ip-pie-tarjeta">
            {numero(suben.length)} {suben.length === 1 ? "subió" : "subieron"} · {numero(bajan.length)}{" "}
            {bajan.length === 1 ? "bajó" : "bajaron"}
          </p>
        </div>
      </div>

      {grupos.map((g, i) => (
        <div key={g.clave} className={`ip-seccion${i === 0 ? " ip-salto" : ""}`}>
          <h2 className="ip-titulo-seccion">
            {grupos.length > 1 ? `${g.ubicacion} · ${g.dispositivo}` : "Detalle por palabra clave"} <span>{g.filas.length}</span>
          </h2>
          <table className="ip-tabla">
            <thead>
              <tr>
                <th>Palabra clave</th>
                <th className="der">Posición</th>
                <th className="der">Variación</th>
                <th className="der">Mapa</th>
                <th>URL que posiciona</th>
              </tr>
            </thead>
            <tbody>
              {g.filas.map((k) => {
                const v = variacion(k);
                return (
                  <tr key={k.id}>
                    <td className="ip-fuerte">{k.termino}</td>
                    <td className="der">
                      <Puesto k={k} />
                    </td>
                    <td className={`der ${v.clase}`}>{v.texto}</td>
                    <td className="der">{k.puestoMapa !== null ? <span className="ip-pos ip-pos-mapa">{k.puestoMapa}</span> : <span className="ip-suave">—</span>}</td>
                    <td className="ip-url">{k.urlPosicionada ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <p className="ip-nota">
        <strong>Cómo leer este informe.</strong> Las posiciones se midieron directamente en Google desde la
        ubicación y el dispositivo indicados. La posición cuenta solo los resultados orgánicos (el fragmento
        destacado, marcado como «destacado», cuenta como un puesto); los anuncios no cuentan. El mapa de
        Google se informa aparte, en su propia columna. «No está» significa que el sitio no aparece entre los
        resultados que entregó Google en esa medición; «sin dato», que esa palabra aún no tiene una medición
        comparable. Las posiciones cambian según el día, la ubicación y el historial de quien busca.
      </p>
    </section>,
    document.body
  );
}
