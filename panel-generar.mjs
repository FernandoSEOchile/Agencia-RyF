/**
 * Genera el panel HTML a partir de panel-datos.json.
 *
 * El panel es una foto del momento en que se recolectó, no una consulta en
 * vivo: los datos van dentro del archivo. Para actualizarlo se vuelve a correr
 * panel-datos.mjs y luego esto.
 *
 * Uso:  node panel-generar.mjs   →  escribe panel.html
 */
import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("panel-datos.json", "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("es-CL"));

const versiones = [...new Set(d.sitios.filter((s) => s.conector).map((s) => s.conector))]
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const ultima = versiones[0];

const vivos = d.sitios.filter((s) => s.estado === "ok");
const totalOps = vivos.reduce((a, s) => a + (s.operaciones || 0), 0);
const desactualizados = vivos.filter((s) => s.conector !== ultima).length;
const conEscritura = vivos.filter((s) => s.solo_lectura === false).length;

const fecha = new Date(d.generado).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" });

/** Etiqueta legible para cada acción del registro. */
const ACCIONES = {
  categoria_seo: "Categoría",
  contenido_escribir: "Contenido",
  producto_guardar: "Producto",
  css_guardar: "CSS",
  ajustes: "Ajustes",
  actualizacion: "Actualización",
  credenciales_nuevas: "Credenciales",
  plugin_instalar: "Plugin",
  plugin_activar: "Plugin",
  media_subir: "Medios",
};

function barra(hecho, total) {
  if (!total) return "";
  const pct = Math.round((100 * hecho) / total);
  return `<div class="barra" role="img" aria-label="${pct}% de cobertura">
      <div class="barra-relleno" style="width:${pct}%"></div>
    </div>
    <div class="barra-pie"><span>${num(hecho)} de ${num(total)}</span><span class="tabular">${pct}%</span></div>`;
}

function dato(etiqueta, valor, extra = "") {
  return `<div class="dato ${extra}"><dt>${etiqueta}</dt><dd class="tabular">${valor}</dd></div>`;
}

function tarjeta(s) {
  if (s.estado !== "ok") {
    return `<article class="sitio caido">
      <header class="sitio-cab">
        <div>
          <h2>${esc(s.dominio)}</h2>
          <p class="sitio-sub">Sin datos</p>
        </div>
        <span class="pill pill-crit">${esc(s.estado)}</span>
      </header>
      <p class="aviso">${esc(s.detalle || s.http || "El conector no respondió.")}</p>
    </article>`;
  }

  const atrasado = s.conector !== ultima;
  const cobertura = s.categorias
    ? `<section class="cobertura">
        <h3>Categorías con descripción SEO</h3>
        ${barra(s.categorias_con_texto, s.categorias)}
      </section>`
    : "";

  const registro = (s.registro || []).slice(0, 12).map((e) => {
    const etiqueta = ACCIONES[e.accion] || e.accion.replace(/_/g, " ");
    const mal = e.resultado && e.resultado !== "ok";
    return `<li class="${mal ? "mal" : ""}">
        <span class="hora tabular">${esc((e.fecha || "").slice(5, 16))}</span>
        <span class="chip">${esc(etiqueta)}</span>
        <span class="resumen">${esc(e.resumen || "—")}</span>
      </li>`;
  }).join("");

  return `<article class="sitio">
    <header class="sitio-cab">
      <div>
        <h2><a href="${esc(s.sitio)}" target="_blank" rel="noopener">${esc(s.dominio)}</a></h2>
        <p class="sitio-sub">WordPress ${esc(s.wordpress)} · PHP ${esc(s.php)}</p>
      </div>
      <div class="pills">
        <span class="pill ${atrasado ? "pill-warn" : "pill-ok"}" title="${atrasado ? "Hay una versión más nueva" : "Versión al día"}">v${esc(s.conector)}</span>
        <span class="pill ${s.solo_lectura ? "pill-neutro" : "pill-ok"}">${s.solo_lectura ? "Solo lectura" : "Escritura"}</span>
      </div>
    </header>

    <dl class="datos">
      ${dato("Productos", num(s.productos))}
      ${dato("Categorías", num(s.categorias))}
      ${dato("Operaciones", num(s.operaciones))}
      ${dato("Fallos recientes", s.fallos ? `<span class="crit">${s.fallos}</span>` : "0")}
      ${dato("Publicar", s.permite_publicar ? "Sí" : "No")}
      ${dato("CSS propio", s.css_bytes ? num(s.css_bytes) + " B" : "—")}
    </dl>

    ${cobertura}

    ${s.fragmento_activo ? '<p class="aviso aviso-warn">Hay un fragmento de código externo activo. El módulo de categorías del conector se aparta para no duplicar la salida.</p>' : ""}

    ${registro ? `<section class="actividad">
      <h3>Actividad reciente</h3>
      <ul class="linea">${registro}</ul>
    </section>` : '<p class="aviso">Sin actividad registrada.</p>'}
  </article>`;
}

const html = `<title>Clientes AppSEO</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap">
<style>
:root {
  --naranja: #ff6b00;
  --naranja-suave: rgba(255, 107, 0, 0.12);
  --fondo: #f7f7f5;
  --panel: #ffffff;
  --tinta: #111111;
  --texto: #575757;
  --tenue: #8a8a86;
  --borde: #e7e7e3;
  --ok: #1f8a4c;
  --ok-fondo: rgba(31, 138, 76, 0.1);
  --warn: #a86400;
  --warn-fondo: rgba(168, 100, 0, 0.1);
  --crit: #c0392b;
  --crit-fondo: rgba(192, 57, 43, 0.1);
  --sombra: 0 1px 2px rgba(17, 17, 17, 0.04), 0 8px 24px rgba(17, 17, 17, 0.04);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --naranja: #ff8534;
    --naranja-suave: rgba(255, 133, 52, 0.16);
    --fondo: #121211;
    --panel: #1a1a19;
    --tinta: #f4f4f2;
    --texto: #b0b0aa;
    --tenue: #7e7e78;
    --borde: #2b2b29;
    --ok: #4ec27d;
    --ok-fondo: rgba(78, 194, 125, 0.14);
    --warn: #e0a53f;
    --warn-fondo: rgba(224, 165, 63, 0.14);
    --crit: #f0705f;
    --crit-fondo: rgba(240, 112, 95, 0.14);
    --sombra: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
  }
}

:root[data-theme="dark"] {
  --naranja: #ff8534;
  --naranja-suave: rgba(255, 133, 52, 0.16);
  --fondo: #121211;
  --panel: #1a1a19;
  --tinta: #f4f4f2;
  --texto: #b0b0aa;
  --tenue: #7e7e78;
  --borde: #2b2b29;
  --ok: #4ec27d;
  --ok-fondo: rgba(78, 194, 125, 0.14);
  --warn: #e0a53f;
  --warn-fondo: rgba(224, 165, 63, 0.14);
  --crit: #f0705f;
  --crit-fondo: rgba(240, 112, 95, 0.14);
  --sombra: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--fondo);
  color: var(--texto);
  font-family: "Schibsted Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.tabular { font-variant-numeric: tabular-nums; }

.envoltorio {
  max-width: 1120px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

/* --- Cabecera --- */

.cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--borde);
}

.cabecera h1 {
  margin: 0;
  color: var(--tinta);
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.marca {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 10px;
  border-radius: 3px;
  background: var(--naranja);
  vertical-align: 2px;
}

.sello { color: var(--tenue); font-size: 0.85rem; margin: 4px 0 0; }

/* --- Resumen --- */

.resumen {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1px;
  margin: 28px 0 40px;
  background: var(--borde);
  border: 1px solid var(--borde);
  border-radius: 12px;
  overflow: hidden;
}

.metrica { background: var(--panel); padding: 18px 20px; }
.metrica dt { color: var(--tenue); font-size: 0.75rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 6px; }
.metrica dd { margin: 0; color: var(--tinta); font-size: 1.6rem; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.metrica dd small { font-size: 0.85rem; font-weight: 500; color: var(--tenue); }

/* --- Tarjeta de sitio --- */

.sitios { display: grid; gap: 20px; }

.sitio {
  background: var(--panel);
  border: 1px solid var(--borde);
  border-radius: 14px;
  padding: 22px 24px 24px;
  box-shadow: var(--sombra);
}

.sitio.caido { border-left: 3px solid var(--crit); }

.sitio-cab {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.sitio-cab h2 { margin: 0; color: var(--tinta); font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; }
.sitio-cab h2 a { color: inherit; text-decoration: none; }
.sitio-cab h2 a:hover { color: var(--naranja); text-decoration: underline; text-underline-offset: 3px; }
.sitio-sub { margin: 2px 0 0; color: var(--tenue); font-size: 0.82rem; }

.pills { display: flex; flex-wrap: wrap; gap: 6px; }

.pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.76rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pill-ok { background: var(--ok-fondo); color: var(--ok); }
.pill-warn { background: var(--warn-fondo); color: var(--warn); }
.pill-crit { background: var(--crit-fondo); color: var(--crit); }
.pill-neutro { background: var(--borde); color: var(--texto); }

/* --- Datos --- */

.datos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 14px 20px;
  margin: 0 0 20px;
  padding: 16px 0;
  border-top: 1px solid var(--borde);
  border-bottom: 1px solid var(--borde);
}

.dato dt { color: var(--tenue); font-size: 0.72rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 3px; }
.dato dd { margin: 0; color: var(--tinta); font-size: 1.05rem; font-weight: 600; }
.crit { color: var(--crit); }

/* --- Cobertura --- */

.cobertura { margin-bottom: 20px; }
.cobertura h3, .actividad h3 {
  margin: 0 0 10px;
  color: var(--tinta);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.barra { height: 7px; border-radius: 4px; background: var(--borde); overflow: hidden; }
.barra-relleno { height: 100%; border-radius: 4px; background: var(--naranja); }
.barra-pie { display: flex; justify-content: space-between; margin-top: 6px; color: var(--tenue); font-size: 0.8rem; }

/* --- Actividad --- */

.linea { list-style: none; margin: 0; padding: 0; }

.linea li {
  display: grid;
  grid-template-columns: 76px 96px 1fr;
  gap: 12px;
  align-items: baseline;
  padding: 7px 0;
  border-bottom: 1px solid var(--borde);
  font-size: 0.85rem;
}

.linea li:last-child { border-bottom: 0; }
.linea li.mal .resumen { color: var(--crit); }
.hora { color: var(--tenue); font-size: 0.78rem; }

.chip {
  justify-self: start;
  padding: 1px 8px;
  border-radius: 5px;
  background: var(--naranja-suave);
  color: var(--naranja);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.resumen { color: var(--texto); overflow-wrap: anywhere; }

/* --- Avisos --- */

.aviso {
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--borde);
  color: var(--texto);
  font-size: 0.85rem;
}

.aviso-warn { background: var(--warn-fondo); color: var(--warn); }

.pie { margin-top: 40px; color: var(--tenue); font-size: 0.8rem; text-align: center; }
.pie a { color: var(--naranja); }

@media (max-width: 640px) {
  .envoltorio { padding: 32px 16px 60px; }
  .linea li { grid-template-columns: 1fr; gap: 2px; padding: 10px 0; }
  .chip { margin-bottom: 2px; }
}
</style>

<div class="envoltorio">
  <header class="cabecera">
    <div>
      <h1><span class="marca"></span>Clientes AppSEO</h1>
      <p class="sello">Recolectado el ${esc(fecha)}</p>
    </div>
    <p class="sello">Conector más reciente: v${esc(ultima)}</p>
  </header>

  <dl class="resumen">
    <div class="metrica"><dt>Sitios conectados</dt><dd>${vivos.length}<small> / ${d.sitios.length}</small></dd></div>
    <div class="metrica"><dt>Operaciones</dt><dd>${num(totalOps)}</dd></div>
    <div class="metrica"><dt>Con escritura</dt><dd>${conEscritura}</dd></div>
    <div class="metrica"><dt>Versiones en uso</dt><dd>${versiones.length}</dd></div>
    <div class="metrica"><dt>Por actualizar</dt><dd class="${desactualizados ? "crit" : ""}">${desactualizados}</dd></div>
  </dl>

  <div class="sitios">
    ${d.sitios.map(tarjeta).join("\n")}
  </div>

  <p class="pie">AppSEO RyF · <a href="https://agenciaryf.com/">Agencia RYF</a></p>
</div>
`;

writeFileSync("panel.html", html);
console.log("\n  panel.html  ·  " + html.length + " bytes  ·  " + d.sitios.length + " sitios\n");
