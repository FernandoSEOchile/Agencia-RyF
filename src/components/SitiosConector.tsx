"use client";

import { useState } from "react";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

/**
 * Los sitios de WordPress a los que llega quien mira, con su versión del
 * conector y un botón para ponerlos al día.
 *
 * El botón no empuja el paquete: pide al sitio que compruebe ahora en vez de
 * esperar a que caduque su caché de seis horas, y es el sitio quien decide si
 * lo instala. Por eso una respuesta puede ser «hay versión nueva pero no me
 * dejan instalarla», y se muestra tal cual en vez de tratarla como un error.
 */

export interface SitioConector {
  id: string;
  nombre: string;
  dominio: string;
  version: string | null;
}

type Col = "nombre" | "dominio" | "version";

const COLUMNAS: readonly Columna<Col>[] = [
  { id: "nombre", texto: "Sitio" },
  { id: "dominio", texto: "Dominio" },
  { id: "version", texto: "Conector" },
];

type Estado = { cargando: boolean; texto?: string; bien?: boolean };

export default function SitiosConector({
  sitios,
  ultima,
  puedeActualizar,
}: {
  sitios: SitioConector[];
  /** Versión publicada en el panel, contra la que se compara cada sitio. */
  ultima: string;
  puedeActualizar: boolean;
}) {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const { orden, ordenar, ordenarPor } = useOrden<Col>("version");

  const filas = ordenarPor(sitios, (s, c) =>
    c === "nombre" ? s.nombre : c === "dominio" ? s.dominio : (s.version ?? "")
  );

  async function actualizar(sitio: SitioConector) {
    setEstados((e) => ({ ...e, [sitio.id]: { cargando: true } }));

    try {
      const r = await fetch("/api/plugin/actualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: sitio.id }),
      });
      const d = await r.json();

      if (!r.ok) {
        setEstados((e) => ({
          ...e,
          [sitio.id]: { cargando: false, texto: d.error ?? `Error ${r.status}`, bien: false },
        }));
        return;
      }

      if (d.actualizado) {
        setEstados((e) => ({
          ...e,
          [sitio.id]: { cargando: false, texto: `Actualizado a v${d.disponible}`, bien: true },
        }));
        return;
      }

      setEstados((e) => ({
        ...e,
        [sitio.id]: {
          cargando: false,
          bien: d.motivo === "al_dia",
          texto:
            d.motivo === "al_dia"
              ? `Ya estaba al día (v${d.instalada})`
              : (d.aviso ?? `Hay v${d.disponible} disponible, pero el sitio no la instaló.`),
        },
      }));
    } catch {
      setEstados((e) => ({
        ...e,
        [sitio.id]: { cargando: false, texto: "No se pudo hablar con el sitio.", bien: false },
      }));
    }
  }

  if (sitios.length === 0) return null;

  return (
    <div className="tarjeta mt-4 overflow-x-auto">
      <table className="w-full text-[13px]">
        <Cabecera columnas={COLUMNAS} orden={orden} ordenar={ordenar} acciones />
        <tbody className="divide-y divide-[color:var(--linea)]">
          {filas.map((s) => {
            const atrasado = !!s.version && s.version !== ultima;
            const est = estados[s.id];

            return (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium">{s.nombre}</td>
                <td className="px-3 py-3 text-[color:var(--tinta-media)]">{s.dominio}</td>
                <td className="px-3 py-3">
                  <span
                    className={`pastilla tabular-nums ${
                      atrasado
                        ? "bg-amber-50 text-amber-700"
                        : "bg-black/[0.05] text-[color:var(--tinta-media)]"
                    }`}
                  >
                    v{s.version ?? "?"}
                  </span>
                  {est?.texto && (
                    <span
                      className={`ml-2 text-[12px] ${
                        est.bien ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {est.texto}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {puedeActualizar && (
                    <button
                      onClick={() => actualizar(s)}
                      disabled={est?.cargando}
                      className="boton-sutil disabled:opacity-50"
                      title="Le pide al sitio que compruebe y, si lo tiene permitido, instale la versión nueva"
                    >
                      {est?.cargando ? "Actualizando…" : atrasado ? "Actualizar" : "Comprobar"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
