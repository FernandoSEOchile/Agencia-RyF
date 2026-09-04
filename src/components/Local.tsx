"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Posiciones locales sobre un mapa.
 *
 * La idea que hay detrás, y que conviene no perder de vista al tocar esto: en
 * SEO local **no existe «la posición»**. Google contesta según dónde está quien
 * pregunta, así que el mismo negocio puede salir primero desde su propia calle
 * y no aparecer a tres kilómetros. Un único número sería una respuesta
 * inventada; el mapa es la respuesta honesta.
 *
 * Leaflet se carga solo en el navegador y a mano, sin envoltorio de React:
 * necesita el `window` y el elemento ya montado, y para dibujar círculos de
 * colores no hace falta nada más.
 */

interface Punto {
  fila: number;
  columna: number;
  lat: number;
  lng: number;
  puesto: number | null;
  primero: string | null;
  resultados: number;
}

interface Barrido {
  id: string;
  keyword: string;
  negocio: string;
  centroLat: number;
  centroLng: number;
  lado: number;
  separacion: number;
  estado: string;
  total: number;
  hechos: number;
  coste: number;
  nota: string | null;
  creado: string;
  puntos: Punto[];
  media: number | null;
  visible: number;
  top3: number;
  medidos: number;
  sinDatos: number;
}

interface Ficha {
  titulo: string;
  cid: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  puntuacion: number | null;
  resenas: number | null;
}

/**
 * El color de un puesto.
 *
 * Verde, amarillo, naranja, rojo. Es un semáforo y no una rampa de un tono
 * porque aquí el dato no es «más o menos»: del 1 al 3 estás en el paquete que
 * la gente ve, del 4 al 10 estás si despliegan, y no aparecer es otra cosa
 * distinta de ir vigésimo.
 */
function color(puesto: number | null, resultados = 1) {
  // Gris cuando no hubo resultados: no es que el negocio no aparezca, es que
  // no hay respuesta. Pintarlo de rojo sería afirmar algo que no sabemos.
  if (resultados === 0) return "#9e9e9e";
  if (puesto == null) return "#c0392b";
  if (puesto <= 3) return "#1e8e3e";
  if (puesto <= 6) return "#7cb342";
  if (puesto <= 10) return "#f9ab00";
  if (puesto <= 15) return "#f57c00";
  return "#e8710a";
}

const LADOS = [5, 7, 9, 11] as const;

export default function Local({
  clienteId,
  nombreCliente,
  puedeBuscar,
}: {
  clienteId: string;
  nombreCliente: string;
  puedeBuscar: boolean;
}) {
  const [barrido, setBarrido] = useState<Barrido | null>(null);
  const [anteriores, setAnteriores] = useState<{ id: string; keyword: string; creado: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [negocio, setNegocio] = useState(nombreCliente);
  const [keyword, setKeyword] = useState("");
  const [lado, setLado] = useState<number>(9);
  const [separacion, setSeparacion] = useState(1);

  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [elegida, setElegida] = useState<Ficha | null>(null);
  const [buscando, setBuscando] = useState(false);

  const caja = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapa = useRef<any>(null);

  const mirar = useCallback(
    async (cual?: string) => {
      try {
        const d = await fetch(
          `/api/local?cliente=${clienteId}${cual ? `&barrido=${cual}` : ""}`
        ).then((r) => r.json());

        if (d.error) {
          setError(d.error);
          return;
        }
        setBarrido(d.rejilla);
        setAnteriores(d.anteriores ?? []);
      } catch {
        setError("No se pudo leer el barrido.");
      } finally {
        setCargando(false);
      }
    },
    [clienteId]
  );

  useEffect(() => {
    mirar();
  }, [mirar]);

  // Mientras barre se pregunta cada pocos segundos; parado, nada.
  useEffect(() => {
    if (barrido?.estado !== "corriendo") return;
    const t = setInterval(() => mirar(barrido.id), 4000);
    return () => clearInterval(t);
  }, [barrido?.estado, barrido?.id, mirar]);

  /* ---------------- El mapa ---------------- */
  useEffect(() => {
    if (!barrido || !caja.current || barrido.puntos.length === 0) return;

    let vivo = true;

    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !caja.current) return;

      if (!mapa.current) {
        mapa.current = L.map(caja.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(mapa.current);
      }

      // Se limpia lo de la pasada anterior: sin esto, cambiar de barrido apila
      // los círculos viejos debajo de los nuevos.
      mapa.current.eachLayer((capa: { _url?: string }) => {
        if (!capa._url) mapa.current.removeLayer(capa);
      });

      for (const p of barrido.puntos) {
        const texto = p.resultados === 0 ? "?" : p.puesto == null ? "—" : String(p.puesto);

        L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:${color(
              p.puesto,
              p.resultados
            )};color:#fff;font:700 13px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff">${texto}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        })
          .addTo(mapa.current)
          .bindTooltip(
            p.resultados === 0
              ? "Google no devolvió resultados en este punto"
              : p.puesto == null
                ? `No aparece aquí${p.primero ? `. Sale primero: ${p.primero}` : ""}`
                : `Puesto ${p.puesto}`,
            { direction: "top" }
          );
      }

      const bordes = L.latLngBounds(barrido.puntos.map((p) => [p.lat, p.lng] as [number, number]));
      mapa.current.fitBounds(bordes, { padding: [24, 24] });
    })();

    return () => {
      vivo = false;
    };
  }, [barrido]);

  async function buscar() {
    if (!negocio.trim()) return;
    setBuscando(true);
    setError(null);
    setFichas(null);

    try {
      const r = await fetch("/api/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, accion: "buscar", negocio: negocio.trim() }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }

      setFichas(d.fichas ?? []);
      if ((d.fichas ?? []).length === 1) setElegida(d.fichas[0]);
    } catch {
      setError("No se pudo buscar la ficha.");
    } finally {
      setBuscando(false);
    }
  }

  async function lanzar() {
    if (!elegida || !keyword.trim()) return;

    setError(null);
    setAviso(null);

    try {
      const r = await fetch("/api/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          keyword: keyword.trim(),
          negocio: elegida.titulo,
          cid: elegida.cid,
          lat: elegida.lat,
          lng: elegida.lng,
          lado,
          separacion,
        }),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error ?? `Error ${r.status}`);
        return;
      }

      setAviso(`Barriendo ${d.puntos} puntos. Tarda un par de minutos y sigue solo.`);
      await mirar(d.id);
    } catch {
      setError("No se pudo lanzar el barrido.");
    }
  }

  const coste = ((lado * lado) * 0.002).toFixed(2);

  if (cargando) return <p className="text-[13px] text-[color:var(--tinta-media)]">Mirando…</p>;

  return (
    <>
      <div>
        <h2 className="text-[17px] font-semibold">Posiciones locales</h2>
        <p className="mt-0.5 max-w-2xl text-[13px] text-[color:var(--tinta-media)]">
          En búsquedas locales no hay una posición: Google contesta según dónde está quien busca.
          Esto pregunta desde muchos puntos del mapa y enseña el puesto real en cada uno.
        </p>
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}
      {aviso && <p className="mt-3 text-[13px] text-emerald-700">{aviso}</p>}

      {/* ---------------- Lanzar un barrido ---------------- */}
      {puedeBuscar && (
        <div className="tarjeta mt-5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="rotulo">Negocio en Google Maps</span>
              <input
                value={negocio}
                onChange={(e) => {
                  setNegocio(e.target.value);
                  setElegida(null);
                  setFichas(null);
                }}
                placeholder="Nombre tal como sale en Maps"
                className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none focus:border-[color:var(--acento)]"
              />
            </label>

            <button onClick={buscar} disabled={buscando || !negocio.trim()} className="boton disabled:opacity-40">
              {buscando ? "Buscando…" : "Buscar ficha"}
            </button>
          </div>

          {fichas && fichas.length === 0 && (
            <p className="mt-3 text-[13px] text-[color:var(--tinta-media)]">
              No encontré ninguna ficha con ese nombre. Prueba con el nombre exacto de Google Maps.
            </p>
          )}

          {fichas && fichas.length > 0 && (
            <div className="mt-3">
              <p className="rotulo">Cuál de estas es</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {fichas.map((f) => (
                  <button
                    key={f.cid ?? f.titulo}
                    onClick={() => setElegida(f)}
                    className={`rounded-xl border px-3.5 py-2.5 text-left transition ${
                      elegida?.cid === f.cid && elegida?.titulo === f.titulo
                        ? "border-[color:var(--tinta)] bg-white"
                        : "border-[color:var(--linea)] bg-white hover:border-[color:var(--linea-fuerte)]"
                    }`}
                  >
                    <p className="text-[13px] font-medium">{f.titulo}</p>
                    <p className="mt-0.5 text-[12px] text-[color:var(--tinta-suave)]">
                      {f.direccion ?? "sin dirección"}
                      {f.puntuacion != null && ` · ${f.puntuacion} ★ (${f.resenas ?? 0})`}
                      {f.lat == null && " · sin coordenadas, no sirve"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {elegida?.lat != null && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[color:var(--linea)] pt-4">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="rotulo">Qué buscan</span>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="floristería, arquitectos, taller mecánico…"
                  className="rounded-xl border border-[color:var(--linea-fuerte)] bg-white px-3.5 py-2 text-[14px] outline-none focus:border-[color:var(--acento)]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="rotulo">Cuadrícula</span>
                <select
                  value={lado}
                  onChange={(e) => setLado(Number(e.target.value))}
                  className="rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--acento)]"
                >
                  {LADOS.map((n) => (
                    <option key={n} value={n}>
                      {n} × {n} · {n * n} puntos
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="rotulo">Cada</span>
                <select
                  value={separacion}
                  onChange={(e) => setSeparacion(Number(e.target.value))}
                  className="rounded-lg border border-[color:var(--linea-fuerte)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--acento)]"
                >
                  {[0.3, 0.5, 1, 2, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} km
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={lanzar}
                disabled={!keyword.trim() || barrido?.estado === "corriendo"}
                className="boton-fuerte disabled:opacity-40"
              >
                Barrer · US${coste}
              </button>
            </div>
          )}

          {elegida?.lat != null && (
            <p className="mt-2 text-[12px] text-[color:var(--tinta-suave)]">
              Cubre {((lado - 1) * separacion).toFixed(1)} km de lado a lado. Cuesta{" "}
              <span className="font-medium">US${coste}</span> y tarda{" "}
              {Math.ceil((lado * lado * 1.5) / 60)} minutos.
            </p>
          )}
        </div>
      )}

      {/* ---------------- El barrido ---------------- */}
      {barrido?.estado === "corriendo" && (
        <div className="tarjeta mt-4 p-5">
          <p className="text-[14px] font-medium">
            Barriendo… {barrido.hechos} de {barrido.total}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07]">
            <div
              className="h-full rounded-full bg-[color:var(--acento)] transition-all"
              style={{ width: `${Math.round((barrido.hechos / barrido.total) * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-[12px] text-[color:var(--tinta-suave)]">
            Puedes irte a otra pestaña: sigue por su cuenta.
          </p>
        </div>
      )}

      {barrido && barrido.puntos.length > 0 && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="tarjeta px-5 py-4">
              <p className="rotulo">Puesto medio</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                {barrido.media ?? "—"}
              </p>
              <p className="mt-1.5 text-[12px] text-[color:var(--tinta-suave)]">
                donde aparece
              </p>
            </div>
            <div className="tarjeta px-5 py-4">
              <p className="rotulo">Aparece en</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                {barrido.visible}%
              </p>
              <p className="mt-1.5 text-[12px] text-[color:var(--tinta-suave)]">
                de los {barrido.medidos} puntos con datos
              </p>
            </div>
            <div className="tarjeta px-5 py-4">
              <p className="rotulo">En el top 3</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-emerald-700">
                {barrido.top3}
              </p>
              <p className="mt-1.5 text-[12px] text-[color:var(--tinta-suave)]">
                de {barrido.puntos.length} puntos
              </p>
            </div>
            <div className="tarjeta px-5 py-4">
              <p className="rotulo">Costó</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                ${barrido.coste.toFixed(3)}
              </p>
              <p className="mt-1.5 text-[12px] text-[color:var(--tinta-suave)]">
                {barrido.creado.slice(0, 10)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px]">
              <span className="font-medium">{barrido.negocio}</span>{" "}
              <span className="text-[color:var(--tinta-media)]">para «{barrido.keyword}»</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[color:var(--tinta-media)]">
              {[
                ["1 a 3", "#1e8e3e"],
                ["4 a 6", "#7cb342"],
                ["7 a 10", "#f9ab00"],
                ["11 a 20", "#f57c00"],
                ["no aparece", "#c0392b"],
                ["sin datos", "#9e9e9e"],
              ].map(([t, c]) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div
            ref={caja}
            className="tarjeta mt-3 overflow-hidden"
            style={{ height: 460 }}
          />
        </>
      )}

      {!barrido && (
        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--linea-fuerte)] px-6 py-16 text-center">
          <p className="text-[15px] font-medium">Este cliente no tiene barridos todavía.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[color:var(--tinta-media)]">
            Sirve para negocios con local físico. Busca su ficha de Google Maps arriba y lanza el
            primero.
          </p>
        </div>
      )}

      {anteriores.length > 1 && (
        <div className="mt-5">
          <p className="rotulo">Barridos anteriores · compararlos es gratis</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {anteriores.map((a) => (
              <button
                key={a.id}
                onClick={() => mirar(a.id)}
                className={`boton ${barrido?.id === a.id ? "!border-[color:var(--tinta)]" : ""}`}
              >
                {a.keyword}
                <span className="text-[color:var(--tinta-suave)]">{a.creado.slice(0, 10)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
