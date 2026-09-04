/**
 * Cómo se escriben fechas y dinero en pantalla.
 *
 * Había diecisiete sitios cortando un ISO a mano y cuatro reglas distintas
 * para los decimales de un dólar. Cada pantalla se leía distinto de la de al
 * lado, y eso hace que un panel parezca inacabado aunque funcione. Aquí hay
 * una regla por cosa, y las pantallas la usan sin opinar.
 */

const ZONA = "America/Santiago";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partes(f: Date) {
  // Se formatea en la zona de Chile pase lo que pase con el servidor: el
  // contenedor vive en UTC y sin esto «hoy» empezaría a las nueve de la noche.
  const p = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(f);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    anio: Number(v("year")),
    mes: Number(v("month")),
    dia: Number(v("day")),
    hora: `${v("hour").padStart(2, "0")}:${v("minute")}`,
  };
}

/**
 * «hoy 21:50», «ayer», «2 sep», «2 sep 2025».
 *
 * Con `hora` se añade la hora en todos los casos; sin ella, solo el día. El
 * año aparece únicamente cuando no es el actual: en un panel que se mira a
 * diario, repetirlo en cada fila es ruido.
 */
export function fecha(valor: Date | string | null | undefined, opciones?: { hora?: boolean }): string {
  if (!valor) return "—";
  const f = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(f.getTime())) return "—";

  const d = partes(f);
  const hoy = partes(new Date());
  const ayer = partes(new Date(Date.now() - 86_400_000));
  const conHora = opciones?.hora ? ` ${d.hora}` : "";

  if (d.anio === hoy.anio && d.mes === hoy.mes && d.dia === hoy.dia) return `hoy${conHora}`;
  if (d.anio === ayer.anio && d.mes === ayer.mes && d.dia === ayer.dia) return `ayer${conHora}`;

  const dia = `${d.dia} ${MESES[d.mes - 1]}`;
  return d.anio === hoy.anio ? `${dia}${conHora}` : `${dia} ${d.anio}${conHora}`;
}

/** La fecha entera, para el `title` de lo que se muestra abreviado. */
export function fechaLarga(valor: Date | string | null | undefined): string {
  if (!valor) return "";
  const f = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(f.getTime())) return "";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA,
    dateStyle: "full",
    timeStyle: "short",
  }).format(f);
}

/**
 * Dólares, siempre con «US$» delante.
 *
 * De un dólar para arriba, dos decimales, como en cualquier factura. Por
 * debajo, tres cifras significativas: US$0.034, no US$0.0340. El cero no se
 * escribe como cifra porque «US$0.000» parece un dato y no lo es.
 */
export function dinero(n: number | null | undefined, cero = "sin coste"): string {
  if (!n) return cero;
  if (n >= 1) return `US$${n.toFixed(2)}`;
  const cifras = Math.max(2, 2 - Math.floor(Math.log10(n)));
  // Sin ceros de relleno al final (US$0.034, no US$0.0340), pero nunca menos
  // de dos decimales, que es lo que se espera de un importe.
  const texto = n.toFixed(Math.min(cifras, 5)).replace(/(\.\d\d\d*?)0+$/, "$1");
  return `US$${texto}`;
}

/** Miles con punto, como se escribe en Chile. */
export function miles(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("es-CL");
}
