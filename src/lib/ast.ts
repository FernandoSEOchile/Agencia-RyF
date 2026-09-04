import "server-only";
import ExcelJS from "exceljs";
import { rejilla, huellaDe, detectarEsquema, recordada, recordar, type EsquemaAst } from "@/lib/astIA";

/**
 * Lectura de un Excel de arquitectura de sitio.
 *
 * No hay formato fijo. Cada agencia monta su plantilla a su manera y la misma
 * agencia la cambia entre proyectos: unos marcan las secciones con rutas que
 * empiezan por «/», otros con el nombre a secas distinguido por no llevar
 * volumen al lado, y las columnas de cada nivel caen donde caen. Intentar
 * cubrir eso con reglas fijas es una carrera perdida.
 *
 * Así que el reparto es: el modelo mira una muestra y deduce la plantilla, y
 * este archivo la aplica al documento entero de forma determinista. El modelo
 * decide la estructura; los datos los extrae código, que no se inventa un
 * volumen.
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
    // Solo la primera letra de cada palabra. `\b\w` parecía lo mismo, pero \b
    // corta también en la ñ y en las vocales con tilde: salía «CañEríAs».
    .replace(/(^|\s)(\S)/g, (_, sep: string, c: string) => sep + c.toLocaleUpperCase("es"));
}

export interface FilaLeida {
  n: number;
  celdas: { col: number; valor: string }[];
}

/** La hoja elegida, ya en texto. Es lo que se guarda para poder rehacerla. */
export interface Rejilla {
  hoja: string;
  filas: FilaLeida[];
}

/** Convierte una hoja en filas de texto, saltándose lo vacío. */
export function leerHoja(hoja: ExcelJS.Worksheet): FilaLeida[] {
  const filas: FilaLeida[] = [];

  hoja.eachRow({ includeEmpty: false }, (fila, n) => {
    const celdas: { col: number; valor: string }[] = [];
    fila.eachCell({ includeEmpty: false }, (celda, col) => {
      const v = texto(celda.value);
      if (v) celdas.push({ col, valor: v.slice(0, 200) });
    });
    if (celdas.length) filas.push({ n, celdas });
  });

  return filas;
}

/** Slug a partir de un nombre, cuando la plantilla no trae rutas. */
function slugDe(nombre: string): string {
  const s = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return "/" + s;
}

/**
 * Recorre la rejilla entera aplicando la plantilla que dedujo el modelo.
 *
 * Toda la ambigüedad se resolvió al detectar el esquema; aquí no se adivina
 * nada. Trabaja sobre la rejilla y no sobre el Excel para que se pueda volver
 * a ejecutar con un esquema corregido sin tener que subir el archivo otra vez.
 */
export function aplicar(rej: Rejilla, e: EsquemaAst): ParsedArquitectura {
  const ignorar = new Set(
    [...e.textosIgnorar, ...ETIQUETAS_IGNORAR].map((t) => t.toLowerCase().replace(/\s+/g, " ").trim())
  );

  const niveles = [...e.niveles].sort((a, b) => a.columnaNombre - b.columnaNombre);

  const categorias: AstNode[] = [];
  const home: KeywordRow[] = [];
  const stack: (AstNode | null)[] = new Array(10).fill(null);

  for (const fila of rej.filas) {
    if (fila.n < e.filaInicio) continue;
    const celda = new Map(fila.celdas.map((c) => [c.col, c.valor]));

    for (const nv of niveles) {
      const valor = celda.get(nv.columnaNombre);
      if (!valor) continue;

      const limpio = valor.replace(/\s+/g, " ").trim();
      if (ignorar.has(limpio.toLowerCase()) || limpio.startsWith("#")) continue;

      const volTexto = nv.columnaVolumen > 0 ? celda.get(nv.columnaVolumen) ?? "" : "";
      const vol = numero(volTexto);

      const esSeccion =
        e.marcaSeccion === "todas"
          ? true
          : e.marcaSeccion === "empieza_por_barra"
          ? limpio.startsWith("/")
          : // «sin_volumen»: el encabezado del bloque es el que no lleva número.
            volTexto === "" || vol === 0;

      if (esSeccion) {
        const esRuta = limpio.startsWith("/");
        const node: AstNode = {
          slug: esRuta ? limpio : slugDe(limpio),
          nombre: esRuta ? nombreDesdeSlug(limpio) : limpio,
          nivel: nv.nivel,
          keywords: [],
          totalVolumen: 0,
          hijos: [],
        };

        // Se cuelga del ancestro más cercano que exista: una subcategoría cuya
        // categoría padre no aparece en el archivo no debe perderse.
        let padre: AstNode | null = null;
        for (let n = nv.nivel - 1; n >= 1; n--) {
          if (stack[n]) {
            padre = stack[n];
            break;
          }
        }

        if (padre) padre.hijos.push(node);
        else categorias.push(node);

        stack[nv.nivel] = node;
        for (let d = nv.nivel + 1; d < stack.length; d++) stack[d] = null;
      } else {
        const destino = stack[nv.nivel];
        const kw: KeywordRow = { keyword: limpio, volumen: vol };
        if (destino) destino.keywords.push(kw);
        else home.push(kw);
      }
    }
  }

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

  return { categorias, home, numCategorias: categorias.length, numPaginas, totalKeywords };
}

export interface ResultadoLectura extends ParsedArquitectura {
  esquema: EsquemaAst;
  reconocido: boolean;
  rejilla: Rejilla;
}

export async function parseArquitectura(buffer: Buffer): Promise<ResultadoLectura> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const hojas = wb.worksheets.map((h) => ({ nombre: h.name, filas: leerHoja(h) }));
  if (hojas.every((h) => h.filas.length === 0)) {
    throw new Error("El archivo está vacío.");
  }

  // La muestra lleva las primeras filas de cada hoja: con eso se ve la cabecera
  // y un par de bloques completos, que es cuanto hace falta para entender la
  // plantilla.
  const muestra = rejilla(hojas);
  const huella = huellaDe(muestra.slice(0, 1200));

  let esquema = await recordada(huella);
  const reconocido = Boolean(esquema);

  if (!esquema) esquema = await detectarEsquema(muestra);

  const elegida =
    hojas.find((h) => h.nombre === esquema.hoja) ?? hojas.filter((h) => h.filas.length).slice(-1)[0];
  if (!elegida) throw new Error(`El modelo indicó la hoja «${esquema.hoja}» y no existe en el archivo.`);

  const rej: Rejilla = { hoja: elegida.nombre, filas: elegida.filas };
  const leido = aplicar(rej, esquema);

  if (leido.numPaginas === 0) {
    throw new Error(
      `Se reconoció la plantilla («${esquema.descripcion}») pero no se extrajo ninguna sección. ` +
        `Puede que el archivo tenga una estructura distinta a la de su cabecera.`
    );
  }

  // Solo se recuerda lo que funcionó: guardar un esquema que no extrajo nada
  // sería enseñarle al modelo un mal ejemplo.
  if (!reconocido) await recordar(huella, esquema, muestra.slice(0, 4000));

  return { ...leido, esquema, reconocido, rejilla: rej };
}

/** La rejilla en texto legible, para enseñársela al modelo cuando se corrige. */
export function rejillaLegible(rej: Rejilla, desde = 1, cuantas = 80): string {
  return rej.filas
    .filter((f) => f.n >= desde)
    .slice(0, cuantas)
    .map((f) => `f${f.n}: ` + f.celdas.map((c) => `[c${c.col}] ${c.valor}`).join("  "))
    .join("\n");
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
