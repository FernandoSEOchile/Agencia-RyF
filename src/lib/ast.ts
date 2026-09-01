import "server-only";
import ExcelJS from "exceljs";

/**
 * Lee un Excel de la agencia con hojas "KR" (Keyword Research) y "AST"
 * (Arquitectura del Sitio) y reconstruye el árbol de categorías.
 *
 * Estructura esperada en la hoja AST:
 *  - Cada página se marca con una fila cuyo valor empieza por "/" (el slug).
 *  - El nivel depende de la columna: C = categoría, E = subcategoría,
 *    G = sub-subcategoría (la columna A son keywords de Home).
 *  - Debajo de cada slug van sus keywords objetivo, con el volumen en la
 *    columna inmediatamente a la derecha, hasta una fila "TOTAL" o el
 *    siguiente slug.
 */

export interface KeywordRow {
  keyword: string;
  volumen: number;
}

export interface AstNode {
  slug: string;
  nombre: string;
  nivel: number; // 1 = categoría, 2 = subcategoría, 3 = sub-subcategoría
  keywords: KeywordRow[];
  totalVolumen: number;
  hijos: AstNode[];
}

export interface ParsedArquitectura {
  categorias: AstNode[];
  home: KeywordRow[];
  numCategorias: number;
  numPaginas: number;
  totalKeywords: number;
}

const NIVELES = [
  { nivel: 1, colKw: 3, colVol: 4 }, // C / D
  { nivel: 2, colKw: 5, colVol: 6 }, // E / F
  { nivel: 3, colKw: 7, colVol: 8 }, // G / H
];

const ETIQUETAS_IGNORAR = new Set([
  "categoría",
  "categoria",
  "subcategoría",
  "subcategoria",
  "sub-subcategoría",
  "sub-subcategoria",
  "producto",
  "volumen",
  "home",
  "total",
  "sugerencia",
  "mixtas",
]);

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    // Celdas con fórmula o texto enriquecido
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
  }
  return String(v).trim();
}

function numero(v: ExcelJS.CellValue): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "object") {
    const o = v as { result?: unknown };
    if (o.result !== undefined) v = o.result as ExcelJS.CellValue;
  }
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function nombreDesdeSlug(slug: string): string {
  return slug
    .replace(/^\//, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function parseArquitectura(buffer: Buffer): Promise<ParsedArquitectura> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const ws = wb.getWorksheet("AST") ?? wb.worksheets[wb.worksheets.length - 1];
  if (!ws) throw new Error("No se encontró la hoja AST en el Excel.");

  const categorias: AstNode[] = [];
  const home: KeywordRow[] = [];
  const stack: (AstNode | null)[] = [null, null, null, null]; // índice = nivel

  const maxRow = ws.rowCount;
  for (let r = 2; r <= maxRow; r++) {
    const row = ws.getRow(r);

    // 1) ¿Es una keyword/slug de Home (columna A)?
    const homeVal = texto(row.getCell(1).value);
    let consumido = false;

    // 2) Buscar el primer nivel (C, E, G) con contenido en esta fila.
    for (const { nivel, colKw, colVol } of NIVELES) {
      const val = texto(row.getCell(colKw).value);
      if (!val) continue;
      consumido = true;

      if (val.startsWith("/")) {
        const node: AstNode = {
          slug: val,
          nombre: nombreDesdeSlug(val),
          nivel,
          keywords: [],
          totalVolumen: 0,
          hijos: [],
        };
        const padre = stack[nivel - 1];
        if (nivel === 1 || !padre) categorias.push(node);
        else padre.hijos.push(node);
        stack[nivel] = node;
        for (let d = nivel + 1; d < stack.length; d++) stack[d] = null;
      } else if (!ETIQUETAS_IGNORAR.has(val.toLowerCase())) {
        const kw: KeywordRow = { keyword: val, volumen: numero(row.getCell(colVol).value) };
        const destino = stack[nivel];
        if (destino) destino.keywords.push(kw);
        else home.push(kw); // keyword de nivel sin página asignada todavía
      }
      break; // un contenido por fila
    }

    // 3) Keyword de Home (solo si no consumimos C/E/G).
    if (!consumido && homeVal && !ETIQUETAS_IGNORAR.has(homeVal.toLowerCase())) {
      home.push({ keyword: homeVal, volumen: numero(row.getCell(2).value) });
    }
  }

  // Calcular totales de volumen (propios + descendientes) y contadores.
  let numPaginas = 0;
  let totalKeywords = home.length;
  function totalizar(node: AstNode): number {
    numPaginas++;
    const propio = node.keywords.reduce((s, k) => s + k.volumen, 0);
    totalKeywords += node.keywords.length;
    const hijos = node.hijos.reduce((s, h) => s + totalizar(h), 0);
    node.totalVolumen = propio + hijos;
    return node.totalVolumen;
  }
  categorias.forEach(totalizar);

  return {
    categorias,
    home,
    numCategorias: categorias.length,
    numPaginas,
    totalKeywords,
  };
}

/** Una sección lista para guardar y cotejar, ya fuera del árbol. */
export interface NodoPlano {
  slug: string;
  nombre: string;
  nivel: number;
  orden: number;
  padreSlug: string | null;
  keywords: KeywordRow[];
  volumen: number;
}

/**
 * Aplana el árbol conservando el orden de lectura.
 *
 * El árbol sirve para entender la jerarquía; para cotejar contra el sitio y
 * mostrar una tabla hace falta una lista. Se guarda el slug del padre en vez
 * de un identificador porque en este punto todavía no existen los registros.
 */
export function aplanar(a: ParsedArquitectura): NodoPlano[] {
  const filas: NodoPlano[] = [];
  let orden = 0;

  function recorrer(nodo: AstNode, padreSlug: string | null) {
    filas.push({
      slug: nodo.slug,
      nombre: nodo.nombre,
      nivel: nodo.nivel,
      orden: orden++,
      padreSlug,
      keywords: nodo.keywords,
      // El volumen propio, no el acumulado: para priorizar qué falta crear
      // interesa lo que esa página concreta puede capturar.
      volumen: nodo.keywords.reduce((s, k) => s + k.volumen, 0),
    });
    nodo.hijos.forEach((h) => recorrer(h, nodo.slug));
  }

  a.categorias.forEach((c) => recorrer(c, null));
  return filas;
}

/**
 * Normaliza un texto para poder compararlo.
 *
 * Quita acentos, signos y palabras vacías: «Mochilas para Notebook» y
 * «mochila notebook» tienen que parecerse, porque en un catálogo real la misma
 * sección se nombra de las dos formas.
 */
export function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/(de|del|la|el|los|las|para|con|y|en|a)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras significativas de un texto, para comparar por parecido. */
export function fichas(t: string): Set<string> {
  return new Set(
    normalizar(t)
      .split(/[\s-]+/)
      .filter((p) => p.length > 2)
      .map((p) => (p.endsWith("s") ? p.slice(0, -1) : p))
  );
}

/** Parecido entre dos textos, de 0 a 1, por palabras compartidas. */
export function parecido(a: string, b: string): number {
  const A = fichas(a);
  const B = fichas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes++;
  return comunes / Math.max(A.size, B.size);
}
