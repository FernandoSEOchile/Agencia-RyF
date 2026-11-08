import { fechaLarga } from "@/lib/formato";

/**
 * El análisis de un dominio, maquetado como informe para salir en PDF.
 *
 * Se imprime con el diálogo del navegador («Guardar como PDF») en vez de
 * generarse en el servidor: así no hace falta meter un Chromium en el
 * contenedor, el texto del PDF se puede seleccionar y copiar, y lo que sale es
 * exactamente lo que el panel tiene cargado, sin una segunda consulta que
 * pudiera devolver otra cosa.
 *
 * Va aparte de la vista interactiva porque esa enseña una pestaña cada vez,
 * corta las palabras clave a 300 y obedece al filtro; el informe se le entrega
 * a un cliente o a un prospecto, así que primero va el resumen visual y después
 * el detalle completo, en el orden por defecto y con las URL enteras.
 *
 * Los gráficos son SVG y divs a mano, como en la pantalla: una librería de
 * gráficos dibuja en canvas, y el canvas sale borroso en un PDF.
 */

interface Datos {
  dominio: string;
  resumen: {
    keywords: number;
    trafico: number;
    valor: number;
    tramos: { pos1: number; pos2a3: number; pos4a10: number; pos11a20: number; pos21a50: number; pos51a100: number };
  };
  historico: { mes: string; trafico: number }[];
  keywords: { keyword: string; posicion: number; volumen: number; trafico: number; cpc: number; url: string | null }[];
  competidores: { dominio: string; coincidencias: number; posicionMedia: number; trafico: number }[];
}

const numero = (n: number) => n.toLocaleString("es-CL");
const pct = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => {
  const [a, mm] = m.split("-");
  return `${MESES[Number(mm) - 1] ?? mm} ${a.slice(2)}`;
};

const TRAMOS = [
  { id: "pos1", etq: "1", color: "#0f9d58" },
  { id: "pos2a3", etq: "2–3", color: "#37b24d" },
  { id: "pos4a10", etq: "4–10", color: "#94c93d" },
  { id: "pos11a20", etq: "11–20", color: "#f0a500" },
  { id: "pos21a50", etq: "21–50", color: "#e07b39" },
  { id: "pos51a100", etq: "51–100", color: "#c4c9d0" },
] as const;

function clasePosicion(p: number) {
  if (!p) return "ip-pos ip-pos-nula";
  if (p <= 3) return "ip-pos ip-pos-top";
  if (p <= 10) return "ip-pos ip-pos-pag1";
  if (p <= 20) return "ip-pos ip-pos-pag2";
  return "ip-pos";
}

function GraficoTrafico({ datos }: { datos: { mes: string; trafico: number }[] }) {
  if (datos.length < 2) {
    return <p className="ip-vacio">El proveedor no tiene histórico de este dominio.</p>;
  }
  const ancho = 600;
  const alto = 170;
  const cima = Math.max(...datos.map((d) => d.trafico), 1);
  const x = (i: number) => (i / (datos.length - 1)) * ancho;
  const y = (v: number) => alto - (v / cima) * (alto - 10) - 2;
  const linea = datos.map((d, i) => `${x(i)},${y(d.trafico)}`).join(" ");
  const paso = Math.ceil(datos.length / 6);
  const etiquetas = datos.filter((_, i) => i % paso === 0 || i === datos.length - 1);
  const ultimo = datos[datos.length - 1];

  return (
    <>
      <div className="ip-grafico-cifras">
        <span>
          Último mes <strong>{numero(ultimo.trafico)}</strong>
        </span>
        <span>
          Máximo <strong>{numero(cima)}</strong>
        </span>
        <span>
          Meses <strong>{datos.length}</strong>
        </span>
      </div>
      <div className="ip-grafico">
        <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" width="100%" height="120">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={ancho} y1={alto * f} y2={alto * f} stroke="#e6e6ea" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`0,${alto} ${linea} ${ancho},${alto}`} fill="#ff6b00" opacity="0.12" />
          <polyline points={linea} fill="none" stroke="#ff6b00" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="ip-ejes">
          {etiquetas.map((d) => (
            <span key={d.mes}>{mesCorto(d.mes)}</span>
          ))}
        </div>
      </div>
    </>
  );
}

export default function InformeExplorar({
  panorama: p,
  medido,
  pais,
  generado,
}: {
  panorama: Datos;
  medido: string | null;
  pais: string;
  generado: Date;
}) {
  const t = p.resumen.tramos;
  const totalTramos = TRAMOS.reduce((s, x) => s + t[x.id], 0);
  const top10 = t.pos1 + t.pos2a3 + t.pos4a10;
  const top3 = t.pos1 + t.pos2a3;

  const keywords = [...p.keywords].sort((a, b) => b.trafico - a.trafico);
  const destacadas = keywords.slice(0, 10);
  const cimaKw = Math.max(...destacadas.map((k) => k.trafico), 1);

  const competidores = [...p.competidores].sort((a, b) => b.coincidencias - a.coincidencias);
  const rivales = competidores.slice(0, 10);
  const cimaComp = Math.max(...rivales.map((c) => c.coincidencias), 1);

  return (
    <section className="solo-imprimir informe-pdf">
      {/* div y no header: el CSS de impresión esconde todos los header (la barra). */}
      <div className="ip-portada">
        <div className="ip-portada-fila">
          <span className="ip-marca">
            Agencia RYF <span>· Informe SEO</span>
          </span>
          <span className="ip-etiqueta">Análisis de dominio</span>
        </div>
        <h1>{p.dominio}</h1>
        <div className="ip-meta">
          <span>
            <em>Mercado</em>
            {pais}
          </span>
          {medido && (
            <span>
              <em>Datos al</em>
              {fechaLarga(medido)}
            </span>
          )}
          <span>
            <em>Generado</em>
            {fechaLarga(generado)}
          </span>
        </div>
      </div>

      <div className="ip-kpis">
        <div className="ip-kpi">
          <p className="ip-kpi-rotulo">Palabras clave</p>
          <p className="ip-kpi-valor">{numero(p.resumen.keywords)}</p>
          <p className="ip-kpi-nota">posicionadas en Google</p>
        </div>
        <div className="ip-kpi ip-kpi-acento">
          <p className="ip-kpi-rotulo">Tráfico orgánico</p>
          <p className="ip-kpi-valor">{numero(p.resumen.trafico)}</p>
          <p className="ip-kpi-nota">visitas estimadas al mes</p>
        </div>
        <div className="ip-kpi">
          <p className="ip-kpi-rotulo">Valor del tráfico</p>
          <p className="ip-kpi-valor">US${numero(p.resumen.valor)}</p>
          <p className="ip-kpi-nota">estimado por el proveedor</p>
        </div>
        <div className="ip-kpi">
          <p className="ip-kpi-rotulo">En el top 10</p>
          <p className="ip-kpi-valor">{numero(top10)}</p>
          <p className="ip-kpi-nota">
            {totalTramos > 0 ? `${pct((top10 / totalTramos) * 100)} · ${numero(top3)} en el top 3` : "sin reparto"}
          </p>
        </div>
      </div>

      <div className="ip-fila">
        <div className="ip-tarjeta">
          <h2>Reparto por posición</h2>
          {totalTramos > 0 ? (
            <>
              <div className="ip-barra-apilada">
                {TRAMOS.map((x) =>
                  t[x.id] > 0 ? (
                    <div key={x.id} style={{ width: `${(t[x.id] / totalTramos) * 100}%`, background: x.color }} />
                  ) : null
                )}
              </div>
              <table className="ip-leyenda">
                <tbody>
                  {TRAMOS.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <i style={{ background: x.color }} />
                        Posición {x.etq}
                      </td>
                      <td className="der">{numero(t[x.id])}</td>
                      <td className="der ip-suave">{pct((t[x.id] / totalTramos) * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="ip-vacio">Sin datos de reparto.</p>
          )}
        </div>

        <div className="ip-tarjeta">
          <h2>Tráfico orgánico estimado</h2>
          <GraficoTrafico datos={p.historico} />
        </div>
      </div>

      <div className="ip-fila">
        <div className="ip-tarjeta">
          <h2>Palabras clave que más tráfico traen</h2>
          {destacadas.length === 0 ? (
            <p className="ip-vacio">Sin palabras clave registradas.</p>
          ) : (
            <table className="ip-ranking">
              <tbody>
                {destacadas.map((k, i) => (
                  <tr key={`${k.keyword}-${i}`}>
                    <td className="ip-ranking-texto">
                      <span>{k.keyword}</span>
                      <b style={{ width: `${(k.trafico / cimaKw) * 100}%` }} />
                    </td>
                    <td className="der">
                      <span className={clasePosicion(k.posicion)}>{k.posicion || "—"}</span>
                    </td>
                    <td className="der ip-fuerte">{numero(k.trafico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="ip-pie-tarjeta">Posición en Google · visitas estimadas al mes</p>
        </div>

        <div className="ip-tarjeta">
          <h2>Principales competidores</h2>
          {rivales.length === 0 ? (
            <p className="ip-vacio">Sin competidores registrados.</p>
          ) : (
            <table className="ip-ranking">
              <tbody>
                {rivales.map((c) => (
                  <tr key={c.dominio}>
                    <td className="ip-ranking-texto">
                      <span>{c.dominio}</span>
                      <b className="ip-barra-gris" style={{ width: `${(c.coincidencias / cimaComp) * 100}%` }} />
                    </td>
                    <td className="der ip-fuerte">{numero(c.coincidencias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="ip-pie-tarjeta">Palabras clave en común con {p.dominio}</p>
        </div>
      </div>

      <div className="ip-seccion ip-salto">
        <h2 className="ip-titulo-seccion">
          Detalle de palabras clave <span>{keywords.length}</span>
        </h2>
        {keywords.length === 0 ? (
          <p className="ip-vacio">Sin palabras clave registradas.</p>
        ) : (
          <table className="ip-tabla">
            <thead>
              <tr>
                <th>Palabra clave</th>
                <th className="der">Posición</th>
                <th className="der">Volumen</th>
                <th className="der">Tráfico est.</th>
                <th className="der">CPC</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((k, i) => (
                <tr key={`${k.keyword}-${i}`}>
                  <td className="ip-fuerte">{k.keyword}</td>
                  <td className="der">
                    <span className={clasePosicion(k.posicion)}>{k.posicion || "—"}</span>
                  </td>
                  <td className="der">{numero(k.volumen)}</td>
                  <td className="der">{numero(k.trafico)}</td>
                  <td className="der ip-suave">{k.cpc ? `US$${k.cpc}` : "—"}</td>
                  <td className="ip-url">{k.url ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ip-seccion">
        <h2 className="ip-titulo-seccion">
          Competencia orgánica <span>{competidores.length}</span>
        </h2>
        {competidores.length === 0 ? (
          <p className="ip-vacio">Sin competidores registrados.</p>
        ) : (
          <table className="ip-tabla">
            <thead>
              <tr>
                <th>Dominio</th>
                <th className="der">Keywords en común</th>
                <th className="der">Posición media</th>
                <th className="der">Tráfico est.</th>
              </tr>
            </thead>
            <tbody>
              {competidores.map((x) => (
                <tr key={x.dominio}>
                  <td className="ip-fuerte">{x.dominio}</td>
                  <td className="der">{numero(x.coincidencias)}</td>
                  <td className="der">{x.posicionMedia || "—"}</td>
                  <td className="der">{numero(x.trafico)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="ip-nota">
        <strong>Sobre estas cifras.</strong> Son estimaciones calculadas por el proveedor de datos sobre
        su propio rastreo, no mediciones. En Chile su cobertura es menor que en mercados grandes, así que
        sirven para comparar dominios y priorizar, no para prometer resultados. Para un sitio propio,
        Google Search Console entrega el dato real.
      </p>
    </section>
  );
}
