"use client";

import { useConfirmar } from "@/components/Confirmar";
import { useEffect, useState } from "react";
  const { confirmar, dialogo } = useConfirmar();

interface Entrada {
  id: string;
  mes: string;
  categoria: string;
  titulo: string;
  detalle: string | null;
  automatico: boolean;
}

interface Datos {
  cliente: string;
  dominio: string;
  entradas: Entrada[];
  mesesConActividad: string[];
}

const CATEGORIAS: [string, string][] = [
  ["contenido", "Contenido"],
  ["arquitectura", "Arquitectura"],
  ["tecnico", "Técnico"],
  ["diseno", "Diseño"],
  ["analisis", "Análisis"],
  ["otro", "Otro"],
];

const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS);

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function mesLegible(mes: string) {
  const [a, m] = mes.split("-");
  const n = MESES[Number(m) - 1] ?? mes;
  return `${n[0].toUpperCase()}${n.slice(1)} de ${a}`;
}

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

export default function Bitacora({
  clienteId,
  puedeEditar,
}: {
  clienteId: string;
  puedeEditar: boolean;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [mesNuevo, setMesNuevo] = useState(mesActual());
  const [categoria, setCategoria] = useState("contenido");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch(`/api/bitacora?cliente=${encodeURIComponent(clienteId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo leer la bitácora.");
      setDatos(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function llamar(metodo: string, cuerpo: unknown) {
    const r = await fetch("/api/bitacora", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo completar la operación.");
    return j;
  }

  async function redactar(mes: string, modo: "nuevo" | "actualizar" | "rehacer" = "nuevo") {
    if (modo === "rehacer") {
      const ok = await confirmar({
        titulo: `¿Rehacer ${mesLegible(mes)} desde cero?`,
        detalle: "Se borran las entradas que escribió la IA y se redacta el mes entero de nuevo. Lo que añadiste a mano se conserva.",
        boton: "Rehacer",
      });
      if (!ok) return;
    }

    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const j = await llamar("PATCH", { clienteId, mes, modo });

      const partes = [
        j.nuevas ? `${j.nuevas} ${j.nuevas === 1 ? "entrada nueva" : "entradas nuevas"}` : "",
        j.actualizadas ? `${j.actualizadas} ampliadas` : "",
        j.borradas ? `${j.borradas} rehechas` : "",
      ].filter(Boolean);

      setAviso(
        `${mesLegible(mes)}: ${partes.join(", ") || "sin cambios"}. Revísalo antes de enviarlo.`
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  async function añadir() {
    setOcupado(true);
    setError(null);
    try {
      await llamar("POST", { clienteId, mes: mesNuevo, categoria, titulo, detalle });
      setTitulo("");
      setDetalle("");
      setAbierto(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(id: string) {
    setOcupado(true);
    try {
      await llamar("DELETE", { id });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(false);
    }
  }

  const entradas = datos?.entradas ?? [];
  const meses = [...new Set(entradas.map((e) => e.mes))].sort().reverse();

  // Los meses con actividad pero sin redactar: son los que falta cerrar.
  const sinRedactar = (datos?.mesesConActividad ?? []).filter((m) => !meses.includes(m)).sort().reverse();

  function copiar() {
    const texto = meses
      .map((m) => {
        const del = entradas.filter((e) => e.mes === m);
        return `${mesLegible(m)}\n\n${del.map((e) => `• ${e.titulo}${e.detalle ? `\n  ${e.detalle}` : ""}`).join("\n")}`;
      })
      .join("\n\n\n");

    navigator.clipboard
      .writeText(`${datos?.cliente} · Trabajo realizado\n\n\n${texto}`)
      .then(() => setAviso("Copiado. Ya puedes pegarlo en un correo o un documento."))
      .catch(() => setError("El navegador no dejó copiar."));
  }

  if (cargando && !datos) {
    return <p className="mt-5 text-[13px] text-[color:var(--tinta-suave)]">Cargando la bitácora…</p>;
  }

  return (
    <div className="mt-5">
      {dialogo}
      <div className="flex flex-wrap items-center gap-2 imprimir-oculto">
        {puedeEditar && (
          <button onClick={() => setAbierto(!abierto)} className="boton">
            {abierto ? "Cerrar" : "Añadir entrada"}
          </button>
        )}
        {entradas.length > 0 && (
          <>
            <button onClick={copiar} className="boton">
              Copiar como texto
            </button>
            <button onClick={() => window.print()} className="boton">
              Imprimir
            </button>
          </>
        )}
        {ocupado && (
          <span className="text-[13px] text-[color:var(--tinta-suave)]">Trabajando…</span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700 imprimir-oculto">{error}</p>
      )}
      {aviso && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700 imprimir-oculto">
          {aviso}
        </p>
      )}

      {abierto && (
        <div className="tarjeta mt-4 p-5 imprimir-oculto">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="rotulo">Mes</span>
              <input
                type="month"
                value={mesNuevo}
                onChange={(e) => setMesNuevo(e.target.value)}
                className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--acento)]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="rotulo">Tipo</span>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] outline-none"
              >
                {CATEGORIAS.map(([id, n]) => (
                  <option key={id} value={id}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[280px] flex-1 flex-col gap-1.5">
              <span className="rotulo">Qué se hizo</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Optimización de contenido en 12 fichas de producto"
                className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[13px] outline-none focus:border-[color:var(--acento)]"
              />
            </label>
          </div>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className="rotulo">Detalle (opcional)</span>
            <input
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[13px] outline-none focus:border-[color:var(--acento)]"
            />
          </label>

          <button
            onClick={añadir}
            disabled={ocupado || !titulo.trim()}
            className="boton-fuerte mt-3"
          >
            Añadir
          </button>
        </div>
      )}

      {sinRedactar.length > 0 && puedeEditar && (
        <div className="tarjeta mt-4 p-5 imprimir-oculto">
          <p className="rotulo">Meses con trabajo sin redactar</p>
          <p className="mt-1.5 text-[13px] text-[color:var(--tinta-media)]">
            Se redactan a partir del registro técnico, agrupando lo repetido. Revísalo siempre antes de
            enviárselo a nadie.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {sinRedactar.map((m) => (
              <li key={m}>
                <button onClick={() => redactar(m)} disabled={ocupado} className="boton">
                  Redactar {mesLegible(m)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entradas.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">La bitácora está vacía.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Aquí se acumula, mes a mes, lo que se hizo por este cliente, escrito para que lo lea él. Se
            puede redactar desde el registro de trabajo o añadir a mano.
          </p>
        </div>
      ) : (
        <div className="tarjeta mt-5 p-7 imprimir-limpio">
          <header className="border-b border-[color:var(--linea)] pb-4">
            <p className="rotulo">Trabajo realizado</p>
            <h2 className="mt-1 text-[22px] font-semibold">{datos?.cliente}</h2>
            <p className="text-[13px] text-[color:var(--tinta-suave)]">{datos?.dominio}</p>
          </header>

          {meses.map((m) => {
            const del = entradas.filter((e) => e.mes === m);
            return (
              <section key={m} className="mt-7 first:mt-6">
                <h3 className="text-[16px] font-semibold">{mesLegible(m)}</h3>

                <ul className="mt-3 space-y-2.5">
                  {del.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--acento)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug">{e.titulo}</p>
                        {e.detalle && (
                          <p className="mt-0.5 text-[13px] text-[color:var(--tinta-media)]">{e.detalle}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-[color:var(--tinta-suave)] imprimir-oculto">
                          {NOMBRE_CATEGORIA[e.categoria] ?? e.categoria}
                          {!e.automatico && " · a mano"}
                        </p>
                      </div>

                      {puedeEditar && (
                        <button
                          onClick={() => quitar(e.id)}
                          disabled={ocupado}
                          className="imprimir-oculto shrink-0 text-[11px] text-[color:var(--tinta-suave)] transition hover:text-red-600"
                        >
                          Quitar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {puedeEditar && (
                  <div className="imprimir-oculto mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => redactar(m, "actualizar")}
                      disabled={ocupado}
                      className="boton !py-1.5 !text-[11px]"
                      title="Solo lee lo ocurrido desde la última vez que se redactó"
                    >
                      Añadir lo nuevo
                    </button>
                    <button
                      onClick={() => redactar(m, "rehacer")}
                      disabled={ocupado}
                      className="boton !py-1.5 !text-[11px]"
                      title="Borra lo escrito por la IA y redacta el mes entero otra vez"
                    >
                      Rehacer el mes desde cero
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)] imprimir-oculto">
        «Añadir lo nuevo» solo mira lo ocurrido desde la última vez, así que se puede pulsar cuantas
        veces haga falta sin que se repita nada; si algo amplía una entrada que ya estaba —más fichas
        del mismo trabajo—, la actualiza en vez de duplicarla. «Rehacer desde cero» borra lo escrito
        por la IA y vuelve a redactar el mes entero, respetando lo que añadiste a mano.
        <br />
        Y revísalo siempre antes de enviarlo: es lo que va a leer tu cliente, y solo tú sabes qué
        merece destacarse.
      </p>
    </div>
  );
}
