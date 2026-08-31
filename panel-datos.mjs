/**
 * Recolecta el estado de todos los clientes conectados.
 *
 * Cada sitio guarda su propio registro; esto solo lo junta. Se consulta en
 * paralelo y ningún fallo detiene al resto: un cliente caído tiene que
 * aparecer como caído en el panel, no impedir que se vea el resto.
 *
 * Uso:  node panel-datos.mjs   →  escribe panel-datos.json
 */
import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), ".appseo");
const dominios = existsSync(RAIZ)
  ? readdirSync(RAIZ).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4)).sort()
  : [];

function cliente(cadena) {
  const cfg = JSON.parse(
    Buffer.from(cadena.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
  );
  return async (ruta) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString("base64url");
    const firma = createHmac("sha256", cfg.secret)
      .update(["GET", "/appseo/v1" + ruta.split("?")[0], ts, nonce,
        createHash("sha256").update("").digest("hex")].join("\n"))
      .digest("hex");
    const r = await fetch(cfg.rest + ruta, {
      headers: {
        "X-AppSEO-Key": cfg.key_id,
        "X-AppSEO-Timestamp": ts,
        "X-AppSEO-Nonce": nonce,
        "X-AppSEO-Signature": firma,
      },
    });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch { /* no era JSON */ }
    return { s: r.status, ok: r.ok, j };
  };
}

const sitios = await Promise.all(dominios.map(async (dominio) => {
  const base = { dominio };

  let get;
  try {
    get = cliente(readFileSync(join(RAIZ, dominio + ".txt"), "utf8").trim());
  } catch {
    return { ...base, estado: "credencial ilegible" };
  }

  let salud;
  try {
    salud = await get("/health");
  } catch (e) {
    return { ...base, estado: "sin respuesta", detalle: e.cause?.code || e.message };
  }

  if (!salud.ok) {
    return { ...base, estado: "error", http: salud.s, detalle: salud.j?.code || "" };
  }

  const s = { ...base, estado: "ok", ...salud.j };

  // El resto es informativo: si algo falla, el sitio sigue apareciendo.
  const [log, ajustes, terminos, productos] = await Promise.all([
    get("/log?por_pagina=25").catch(() => ({ ok: false })),
    get("/ajustes").catch(() => ({ ok: false })),
    get("/terms?taxonomia=product_cat").catch(() => ({ ok: false })),
    get("/products?pagina=1").catch(() => ({ ok: false })),
  ]);

  if (log.ok) {
    s.registro = (log.j.entradas || []).map((e) => ({
      fecha: e.creado,
      accion: e.accion,
      resumen: e.resumen,
      resultado: e.resultado,
    }));
    s.operaciones = log.j.total;
    const porAccion = {};
    for (const e of s.registro) porAccion[e.accion] = (porAccion[e.accion] || 0) + 1;
    s.por_accion = porAccion;
    s.fallos = s.registro.filter((e) => e.resultado !== "ok").length;
  }

  if (ajustes.ok) {
    s.seo_categorias = !!ajustes.j.seo_categorias;
    s.css_bytes = (ajustes.j.seo_categorias_css || "").length;
    s.fragmento_activo = !!ajustes.j.fragmento_activo;
  }

  if (terminos.ok) {
    const t = terminos.j.terminos || [];
    s.categorias = t.length;
    s.categorias_con_texto = t.filter((c) => c.seo_bytes).length;
  }

  if (productos.ok) {
    s.productos = productos.j.total;
    s.moneda = productos.j.moneda;
  }

  return s;
}));

const datos = {
  generado: new Date().toISOString(),
  sitios,
};

writeFileSync("panel-datos.json", JSON.stringify(datos, null, 1));

console.log("\n  " + sitios.length + " sitios consultados\n");
for (const s of sitios) {
  console.log("  " + s.dominio.padEnd(24) +
    (s.estado === "ok"
      ? "v" + s.conector + "  " + String(s.operaciones ?? "?").padStart(4) + " ops  " +
        (s.productos != null ? s.productos + " prod  " : "") +
        (s.categorias != null ? s.categorias_con_texto + "/" + s.categorias + " cat  " : "")
      : "✕ " + s.estado + " " + (s.detalle || "")));
}
console.log("\n  → panel-datos.json\n");
