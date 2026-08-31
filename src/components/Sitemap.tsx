"use client";

import { useEffect, useState } from "react";

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
  ["contenido", "Páginas y entradas"],
  ["productos", "Productos"],
  ["categorias", "Categorías"],
] as const;

/** Estados que conviene resaltar: lo publicado manda, lo demás es aviso. */
function colorEstado(estado: string) {
  if (estado === "publish" || estado === "con descripción") return "bg-emerald-50 text-emerald-700";
  if (estado === "draft" || estado === "sin descripción") return "bg-amber-50 text-amber-800";
  return "bg-neutral-100 text-neutral-600";
}

export default function Sitemap({ clienteId }: { clienteId: string }) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("contenido");
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    fetch(`/api/sitemap?cliente=${clienteId}&tipo=${tipo}&pagina=${pagina}`)
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
  }, [clienteId, tipo, pagina]);

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? filas.filter((f) => f.titulo.toLowerCase().includes(q) || f.url.toLowerCase().includes(q))
    : filas;

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
                  <th className="px-4 py-2.5 font-semibold">URL</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Palabras</th>
                  <th className="px-3 py-2.5 font-semibold">Modificado</th>
                  <th className="px-4 py-2.5 font-semibold">Último cambio registrado</th>
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
                        {f.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-600">{f.subtipo}</td>
                    <td className="px-3 py-2.5">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorEstado(f.estado)}`}>
                        {f.estado}
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
              {q ? `${visibles.length} de ${filas.length} en esta página · ` : ""}
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
        </>
      )}
    </div>
  );
}
