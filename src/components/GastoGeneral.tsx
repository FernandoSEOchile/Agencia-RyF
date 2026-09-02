"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cabecera, useOrden, type Columna } from "@/components/Tabla";

interface Datos {
  desde: string;
  hasta: string;
  total: number;
  claude: number;
  dataforseo: number;
  porCliente: {
    id: string | null;
    nombre: string;
    dominio: string | null;
    claude: number;
    dataforseo: number;
    total: number;
  }[];
  porUsuario: { id: string | null; nombre: string; total: number; operaciones: number }[];
  porConcepto: { servicio: string; concepto: string; monto: number; veces: number }[];
  porDia: { dia: string; claude: number; dataforseo: number }[];
}

const PERIODOS = [
  [7, "7 días"],
  [28, "28 días"],
  [90, "3 meses"],
  [365, "1 año"],
] as const;

const VISTAS = [
  ["clientes", "Por cliente"],
  ["conceptos", "Por concepto"],
  ["personas", "Por persona"],
] as const;

type ColCli = "nombre" | "claude" | "dataforseo" | "total";
type ColCon = "concepto" | "servicio" | "veces" | "monto";
type ColUsr = "nombre" | "operaciones" | "total";

const COL_CLI: readonly Columna<ColCli>[] = [
  { id: "nombre", texto: "Cliente" },
  { id: "claude", texto: "Claude", clase: "text-right", num: true },
  { id: "dataforseo", texto: "API de SEO", clase: "text-right", num: true },
  { id: "total", texto: "Total", clase: "text-right", num: true },
];

const COL_CON: readonly Columna<ColCon>[] = [
  { id: "concepto", texto: "Concepto" },
  { id: "servicio", texto: "Servicio" },
  { id: "veces", texto: "Veces", clase: "text-right", num: true },
  { id: "monto", texto: "Gasto", clase: "text-right", num: true },
];

const COL_USR: readonly Columna<ColUsr>[] = [
  { id: "nombre", texto: "Persona" },
  { id: "operaciones", texto: "Operaciones", clase: "text-right", num: true },
  { id: "total", texto: "Gasto", clase: "text-right", num: true },
];

function fecha(diasAtras: number) {
  return new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
}

const dolares = (n: number) => (n >= 1 ? `US$${n.toFixed(2)}` : n > 0 ? `US$${n.toFixed(4)}` : "—");

export default function GastoGeneral() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<number | null>(28);
  const [desde, setDesde] = useState(fecha(28));
  const [hasta, setHasta] = useState(fecha(0));
  const [vista, setVista] = useState<(typeof VISTAS)[number][0]>("clientes");

  const oCli = useOrden<ColCli>("total", false);
  const oCon = useOrden<ColCon>("monto", false);
  const oUsr = useOrden<ColUsr>("total", false);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/gasto/general?desde=${desde}&hasta=${hasta}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo leer el gasto.");
        setDatos(j);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error inesperado."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const cima = Math.max(1, ...(datos?.porDia ?? []).map((d) => d.claude + d.dataforseo));

  const clientes = oCli.ordenarPor(datos?.porCliente ?? [], (c, col) => (col === "nombre" ? c.nombre : c[col]));
  const conceptos = oCon.ordenarPor(datos?.porConcepto ?? [], (c, col) =>
    col === "concepto" ? c.concepto : col === "servicio" ? c.servicio : col === "veces" ? c.veces : c.monto
  );
  const personas = oUsr.ordenarPor(datos?.porUsuario ?? [], (u, col) => (col === "nombre" ? u.nombre : u[col]));

  // El día con más gasto de todo el periodo: si algo se descontroló, está ahí.
  const pico = (datos?.porDia ?? []).reduce(
    (m, d) => (d.claude + d.dataforseo > m.monto ? { dia: d.dia, monto: d.claude + d.dataforseo } : m),
    { dia: "", monto: 0 }
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmentos">
          {PERIODOS.map(([n, texto]) => (
            <button
              key={n}
              onClick={() => {
                setDias(n);
                setDesde(fecha(n));
                setHasta(fecha(0));
              }}
              className={`segmento ${dias === n ? "segmento-activo" : ""}`}
            >
              {texto}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[12px] text-[color:var(--tinta-media)]">
          desde
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => {
              setDias(null);
              setDesde(e.target.value);
            }}
            className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[12px] outline-none focus:border-[color:var(--acento)]"
          />
          hasta
          <input
            type="date"
            value={hasta}
            min={desde}
            max={fecha(0)}
            onChange={(e) => {
              setDias(null);
              setHasta(e.target.value);
            }}
            className="rounded-full border border-[color:var(--linea-fuerte)] bg-white px-3 py-1 text-[12px] outline-none focus:border-[color:var(--acento)]"
          />
        </label>

        {cargando && <span className="text-[12px] text-[color:var(--tinta-suave)]">cargando…</span>}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}

      {datos && (
        <>
          <dl className="tarjeta mt-4 grid grid-cols-3 divide-x divide-[color:var(--linea)] overflow-hidden">
            {[
              ["Total", datos.total],
              ["Claude", datos.claude],
              ["API de SEO", datos.dataforseo],
            ].map(([k, v]) => (
              <div key={String(k)} className="px-5 py-4">
                <dt className="rotulo">{String(k)}</dt>
                <dd className="mt-1 text-[26px] font-semibold tabular-nums">{dolares(Number(v))}</dd>
              </div>
            ))}
          </dl>

          {datos.porDia.length > 1 && (
            <div className="tarjeta mt-3 p-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="rotulo">Por día</p>
                {pico.monto > 0 && (
                  <p className="text-[12px] text-[color:var(--tinta-suave)]">
                    día más caro: {pico.dia} con {dolares(pico.monto)}
                  </p>
                )}
              </div>
              <div className="mt-4 flex h-28 items-end gap-[3px]">
                {datos.porDia.map((d) => (
                  <div
                    key={d.dia}
                    className="flex-1 cursor-default"
                    title={`${d.dia} · ${dolares(d.claude + d.dataforseo)}`}
                  >
                    <div
                      style={{ height: `${(d.dataforseo / cima) * 100}%` }}
                      className="w-full bg-[color:var(--acento)]/70"
                    />
                    <div
                      style={{ height: `${(d.claude / cima) * 100}%` }}
                      className="w-full bg-[color:var(--tinta)]/80"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 flex flex-wrap gap-4 text-[11px] text-[color:var(--tinta-suave)]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 bg-[color:var(--tinta)]/80" /> Claude
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 bg-[color:var(--acento)]/70" /> API de SEO
                </span>
                <span className="ml-auto">
                  {datos.desde} a {datos.hasta}
                </span>
              </p>
            </div>
          )}

          <div className="mt-6 segmentos">
            {VISTAS.map(([id, n]) => (
              <button
                key={id}
                onClick={() => setVista(id)}
                className={`segmento ${vista === id ? "segmento-activo" : ""}`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="tarjeta mt-3 overflow-x-auto">
            {vista === "clientes" && (
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <Cabecera columnas={COL_CLI} orden={oCli.orden} ordenar={oCli.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {clientes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-[color:var(--tinta-suave)]">
                        Sin gasto en este periodo.
                      </td>
                    </tr>
                  ) : (
                    clientes.map((c) => (
                      <tr key={c.id ?? "sin"} className="transition hover:bg-black/[0.015]">
                        <td className="px-5 py-2.5">
                          {c.id ? (
                            <Link
                              href={`/panel/clientes/${c.id}`}
                              className="font-medium underline-offset-2 transition hover:text-[color:var(--acento)] hover:underline"
                            >
                              {c.nombre}
                            </Link>
                          ) : (
                            <span className="font-medium">{c.nombre}</span>
                          )}
                          <span className="ml-2 text-[11px] text-[color:var(--tinta-suave)]">
                            {c.dominio ?? "dominios explorados, aún no son clientes"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                          {dolares(c.claude)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                          {dolares(c.dataforseo)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                          {dolares(c.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {vista === "conceptos" && (
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <Cabecera columnas={COL_CON} orden={oCon.orden} ordenar={oCon.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {conceptos.map((c) => (
                    <tr key={`${c.servicio}-${c.concepto}`} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5 font-medium capitalize">{c.concepto}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`pastilla ${
                            c.servicio === "claude"
                              ? "bg-black/[0.06] text-[color:var(--tinta-media)]"
                              : "bg-[color:var(--acento)]/10 text-[color:var(--acento)]"
                          }`}
                        >
                          {c.servicio === "claude" ? "Claude" : "SEO"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {c.veces}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{dolares(c.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {vista === "personas" && (
              <table className="w-full min-w-[440px] border-collapse text-[13px]">
                <Cabecera columnas={COL_USR} orden={oUsr.orden} ordenar={oUsr.ordenar} />
                <tbody className="divide-y divide-[color:var(--linea)]">
                  {personas.map((u) => (
                    <tr key={u.id ?? "auto"} className="transition hover:bg-black/[0.015]">
                      <td className="px-5 py-2.5 font-medium">{u.nombre}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--tinta-media)]">
                        {u.operaciones}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{dolares(u.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[color:var(--tinta-suave)]">
            «Prospección» agrupa lo gastado explorando dominios que todavía no son clientes: es coste
            comercial, no de operación, y mezclarlo con una cuenta la haría parecer menos rentable de lo
            que es. El reparto por persona no es para vigilar a nadie — sirve para detectar que alguien
            está midiendo a diario porque nadie le explicó que cada medición se paga.
          </p>
        </>
      )}
    </div>
  );
}
