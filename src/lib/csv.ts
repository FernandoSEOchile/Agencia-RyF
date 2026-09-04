/**
 * Descargar una tabla como CSV, desde el navegador.
 *
 * Nada del panel salía de la pantalla: ni el listado de páginas rotas, ni las
 * posiciones, ni el gasto. Un SEO vive en hojas de cálculo, y pedir «pásame
 * eso en Excel» no debería ser una petición al programador.
 *
 * Con punto y coma y BOM a propósito: es lo que hace que Excel en español lo
 * abra en columnas y con los acentos bien, sin asistente de importación.
 */
export function descargarCsv(nombre: string, filas: Record<string, unknown>[]) {
  if (typeof window === "undefined" || filas.length === 0) return;

  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))];

  const celda = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const t = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };

  const texto =
    "﻿" +
    [columnas.join(";"), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(";"))].join("\r\n");

  const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre.replace(/[^\w.-]+/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
