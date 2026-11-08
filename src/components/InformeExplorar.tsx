import { fechaLarga } from "@/lib/formato";

/**
 * El análisis de un dominio, maquetado para salir en PDF.
 *
 * Se imprime con el diálogo del navegador («Guardar como PDF») en vez de
 * generarse en el servidor: así no hace falta meter un Chromium en el
 * contenedor, el texto del PDF se puede seleccionar y copiar, y lo que sale es
 * exactamente lo que el panel tiene cargado, sin una segunda consulta que
 * pudiera devolver otra cosa.
 *
 * Va aparte de la vista interactiva porque esa enseña una pestaña cada vez,
 * corta las palabras clave a 300 y obedece al filtro; el informe tiene que
 * llevar todo, en el orden por defecto, y con las URL completas.
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
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => {
  const [a, mm] = m.split("-");
  return `${MESES[Number(mm) - 1] ?? mm} ${a}`;
};

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
  const tramos: [string, number][] = [
    ["Posición 1", t.pos1],
    ["Posiciones 2 a 3", t.pos2a3],
    ["Posiciones 4 a 10", t.pos4a10],
    ["Posiciones 11 a 20", t.pos11a20],
    ["Posiciones 21 a 50", t.pos21a50],
    ["Posiciones 51 a 100", t.pos51a100],
  ];
  const totalTramos = tramos.reduce((s, [, n]) => s + n, 0);

  const keywords = [...p.keywords].sort((a, b) => b.trafico - a.trafico);
  const competidores = [...p.competidores].sort((a, b) => b.coincidencias - a.coincidencias);

  return (
    <section className="solo-imprimir informe-pdf">
      {/* div y no header: el CSS de impresión esconde todos los header (la barra). */}
      <div className="informe-cabecera">
        <p className="informe-marca">AppSEO · Agencia RYF</p>
        <h1>Análisis de dominio: {p.dominio}</h1>
        <p>
          Mercado: {pais}
          {medido && <> · Datos consultados el {fechaLarga(medido)}</>}
        </p>
        <p>Informe generado el {fechaLarga(generado)}</p>
      </div>

      <h2>Resumen</h2>
      <table className="informe-metricas">
        <tbody>
          <tr>
            <th>Palabras clave</th>
            <th>Tráfico estimado</th>
            <th>Valor del tráfico</th>
          </tr>
          <tr>
            <td>{numero(p.resumen.keywords)}</td>
            <td>{numero(p.resumen.trafico)}/mes</td>
            <td>US${numero(p.resumen.valor)}</td>
          </tr>
        </tbody>
      </table>

      {totalTramos > 0 && (
        <>
          <h2>Reparto por posición</h2>
          <table>
            <thead>
              <tr>
                <th>Tramo</th>
                <th className="der">Palabras clave</th>
                <th className="der">% del total</th>
              </tr>
            </thead>
            <tbody>
              {tramos.map(([etq, n]) => (
                <tr key={etq}>
                  <td>{etq}</td>
                  <td className="der">{numero(n)}</td>
                  <td className="der">{((n / totalTramos) * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Tráfico orgánico estimado por mes</h2>
      {p.historico.length < 2 ? (
        <p>El proveedor no tiene histórico de este dominio.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th className="der">Visitas estimadas</th>
            </tr>
          </thead>
          <tbody>
            {p.historico.map((h) => (
              <tr key={h.mes}>
                <td>{nombreMes(h.mes)}</td>
                <td className="der">{numero(h.trafico)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Palabras clave ({keywords.length})</h2>
      {keywords.length === 0 ? (
        <p>Sin palabras clave registradas.</p>
      ) : (
        <table className="informe-kw">
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
                <td>{k.keyword}</td>
                <td className="der">{k.posicion || "—"}</td>
                <td className="der">{numero(k.volumen)}</td>
                <td className="der">{numero(k.trafico)}</td>
                <td className="der">{k.cpc ? `US$${k.cpc}` : "—"}</td>
                <td className="informe-url">{k.url ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Competencia ({competidores.length})</h2>
      {competidores.length === 0 ? (
        <p>Sin competidores registrados.</p>
      ) : (
        <table>
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
                <td>{x.dominio}</td>
                <td className="der">{numero(x.coincidencias)}</td>
                <td className="der">{x.posicionMedia || "—"}</td>
                <td className="der">{numero(x.trafico)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="informe-nota">
        Estos números son estimaciones calculadas por el proveedor sobre su propio rastreo, no
        medidas. En Chile su cobertura es más corta que en mercados grandes, así que sirven para
        comparar dominios y priorizar, no para prometer cifras. Para un sitio propio, Search Console
        da el dato real.
      </p>
    </section>
  );
}
