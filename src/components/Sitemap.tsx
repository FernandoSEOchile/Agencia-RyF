"use client";

import { useEffect, useMemo, useState } from "react";

interface Fila {
  id: number;
  titulo: string;
  url: string;
  subtipo: string;
  estado: string;
  palabras: number | null;
  modificado: string | null;
  cambio: { fecha: string; accion: string; resumen: string } | null;
}

const TIPOS = [
  ["productos", "Productos"],
  ["categorias", "Categorías"],
  ["posts", "Entradas"],
  ["paginas", "Páginas"],
] as const;

const ESTADOS = [
  ["publish", "Publicados"],
  ["draft", "Borradores"],
  ["todo", "Todos"],
] as const;

type Columna = "titulo" | "estado" | "palabras" | "modificado" | "cambio";

const COLUMNAS: { id: Columna; texto: string; alineado?: string }[] = [
  { id: "titulo", texto: "URL" },
  { id: "estado", texto: "Estado" },
  { id: "palabras", texto: "Palabras", alineado: "text-right" },
  { id: "modificado", texto: "Modificado" },
  { id: "cambio", texto: "Último cambio registrado" },
];

/** Estados que conviene resaltar: lo publicado manda, lo demás es aviso. */
function colorEstado(estado: string) {
  if (estado === "publish" || estado === "con descripción") return "bg-emerald-50 text-emerald-700";
  if (estado === "draft" || estado === "sin descripción") return "bg-amber-50 text-amber-800";
  return "bg-neutral-100 text-neutral-600";
}

function nombreEstado(estado: string) {
  if (estado === "publish") return "publicado";
  if (estado === "draft") return "borrador";
  if (estado === "pending") return "pendiente";
  if (estado === "private") return "privado";
  return estado;
}

export default function Sitemap({ clienteId }: { clienteId: string }) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("productos");
  const [estado, setEstado] = useState<(typeof ESTADOS)[number][0]>("publish");
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Por defecto lo más reciente arriba: es la pregunta que trae a esta tabla.
  const [orden, setOrden] = useState<Columna>("modificado");
  const [desc, setDesc] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    fetch(`/api/sitemap?cliente=${clienteId}&tipo=${tipo}&estado=${estado}&pagina=${pagina}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo cargar.");
        if (!vivo) return;
        setFilas(j.filas);
        setTotal(j.total);
        setPaginas(j.paginas);
      })
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));

    return () => {
      vivo = false;
    };
  }, [clienteId, tipo, estado, pagina]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = q
      ? filas.filter((f) => f.titulo.toLowerCase().includes(q) || f.url.toLowerCase().includes(q))
      : filas;

    const valor = (f: Fila): string | number | null => {
      if (orden === "titulo") return f.titulo.toLowerCase();
      if (orden === "estado") return f.estado;
      if (orden === "palabras") return f.palabras;
      if (orden === "modificado") return f.modificado;
      return f.cambio ? f.cambio.fecha : null;
    };

    // Las filas sin valor van siempre al final, se ordene como se ordene:
    // ausencia de dato no es un dato pequeño.
    return [...filtradas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
  }, [filas, busqueda, orden, desc]);

  function ordenarPor(c: Columna) {
    if (c === orden) {
      setDesc((d) => !d);
      return;
    }
    setOrden(c);
    // Texto arranca de la A a la Z; fechas y números, de mayor a menor.
    setDesc(c !== "titulo" && c !== "estado");
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map(([id, texto]) => (
          <button
            key={id}
            onClick={() => {
              setTipo(id);
              setPagina(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              tipo === id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {texto}
          </button>
        ))}

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Filtrar por título o URL…"
          className="ml-auto w-56 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs outline-none focus:border-[#ff6b00]"
        />
      </div>

      {/* Las categorías no tienen estado de publicación en WordPress: el filtro
          no aplica, y mostrarlo sería ofrecer algo que no hace nada. */}
      {tipo !== "categorias" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-400">Estado</span>
          {ESTADOS.map(([id, texto]) => (
            <button
              key={id}
              onClick={() => {
                setEstado(id);
                setPagina(1);
              }}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                estado === id ? "bg-[#ff6b00]/10 text-[#ff6b00]" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {cargando ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-neutral-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff6b00]" />
          Leyendo el sitio…
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400">
                  {COLUMNAS.map((c) => (
                    <th
                      key={c.id}
                      onClick={() => ordenarPor(c.id)}
                      title="Ordenar por esta columna"
                      className={`cursor-pointer select-none px-3 py-2.5 font-semibold first:pl-4 last:pr-4 hover:text-neutral-700 ${
                        c.alineado ?? ""
                      } ${orden === c.id ? "text-[#ff6b00]" : ""}`}
                    >
                      {c.texto}
                      {orden === c.id && <span className="ml-1">{desc ? "↓" : "↑"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibles.map((f) => (
                  <tr key={`${f.subtipo}-${f.id}`} className="align-top hover:bg-neutral-50">
                    <td className="max-w-[260px] px-4 py-2.5">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener"
                        className="block truncate font-medium text-neutral-900 underline-offset-2 hover:text-[#ff6b00] hover:underline"
                        title={f.url}
                      >
                        {f.titulo}
                      </a>
                      <span className="block truncate text-[11px] text-neutral-400">
                        {f.url.replace(/^https?:\/\/[^/]+/, "") || "/"} · {f.subtipo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorEstado(
                          f.estado
                        )}`}
                      >
                        {nombreEstado(f.estado)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-neutral-600">
                      {f.palabras ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-neutral-600">
                      {f.modificado ?? "—"}
                    </td>
                    <td className="max-w-[280px] px-4 py-2.5 text-xs text-neutral-600">
                      {f.cambio ? (
                        <>
                          <span className="mr-1.5 rounded bg-[#ff6b00]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#ff6b00]">
                            {f.cambio.accion}
                          </span>
                          <span className="text-neutral-500">{f.cambio.resumen}</span>
                          <span className="ml-1 whitespace-nowrap tabular-nums text-neutral-400">
                            · {f.cambio.fecha.slice(5)}
                          </span>
                        </>
                      ) : (
                        <span className="text-neutral-300">sin operaciones del panel</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
            <span className="tabular-nums">
              {busqueda.trim() ? `${visibles.length} de ${filas.length} en esta página · ` : ""}
              {total.toLocaleString("es-CL")} en total
            </span>
            {paginas > 1 && (
              <span className="ml-auto flex items-center gap-2">
                <button
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 font-medium disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <span className="tabular-nums">
                  {pagina} / {paginas}
                </span>
                <button
                  disabled={pagina >= paginas}
                  onClick={() => setPagina((p) => p + 1)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 font-medium disabled:opacity-40"
                >
                  Siguiente →
                </button>
              </span>
            )}
          </div>

          {paginas > 1 && (
            <p className="mt-1.5 text-[11px] text-neutral-400">
              El orden se aplica sobre la página que estás viendo, no sobre el catálogo entero.
            </p>
          )}
        </>
      )}
    </div>
  );
}
