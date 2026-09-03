"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Lanza una ronda del vigía ahora mismo.
 *
 * El cron ya la lanza cada diez minutos, pero cuando alguien acaba de arreglar
 * un sitio no quiere esperar diez minutos para saber si quedó bien.
 */
export default function Revisar() {
  const [estado, setEstado] = useState<{ cargando: boolean; texto?: string; bien?: boolean }>({
    cargando: false,
  });
  const router = useRouter();

  async function revisar() {
    setEstado({ cargando: true });

    try {
      const r = await fetch("/api/vigia", { method: "POST" });
      const d = await r.json();

      if (!r.ok) {
        setEstado({ cargando: false, texto: d.error ?? `Error ${r.status}`, bien: false });
        return;
      }

      setEstado({
        cargando: false,
        bien: d.caidos === 0,
        texto:
          d.caidos === 0
            ? `${d.revisados} sitios revisados, todos en pie`
            : `${d.caidos} de ${d.revisados} con problemas`,
      });

      router.refresh();
    } catch {
      setEstado({ cargando: false, texto: "No se pudo lanzar la revisión.", bien: false });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {estado.texto && (
        <span className={`text-[13px] ${estado.bien ? "text-emerald-700" : "text-red-600"}`}>
          {estado.texto}
        </span>
      )}
      <button onClick={revisar} disabled={estado.cargando} className="boton disabled:opacity-50">
        {estado.cargando ? "Revisando…" : "Revisar ahora"}
      </button>
    </div>
  );
}
