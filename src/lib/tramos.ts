import "server-only";
import { db } from "@/lib/db";
import { consultasEntre } from "@/lib/gsc";

/**
 * Cuántas consultas hay en cada tramo de posición, mes a mes.
 *
 * Es el gráfico que enseña Semrush en la portada de un dominio, pero con datos
 * reales en vez de estimados: cada consulta es una búsqueda por la que el sitio
 * salió de verdad, y su posición es la que Google le dio.
 *
 * Hay que pedirlo mes a mes y no de una vez porque Search Console no devuelve
 * la posición por consulta Y por fecha sin multiplicar una cosa por la otra:
 * pedir las dos dimensiones juntas da el producto de consultas por días, que en
 * un sitio mediano son cientos de miles de filas para dibujar seis líneas.
 *
 * Y por eso se guarda. Un mes cerrado ya no cambia, así que se calcula una vez;
 * el mes en curso se vuelve a pedir cada vez, porque le siguen entrando datos.
 */

export interface Mes {
  mes: string;
  top3: number;
  top10: number;
  top20: number;
  top50: number;
  resto: number;
  consultas: number;
}

/** El primer y el último día de un mes, como los quiere la API. */
function limites(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0));
  return {
    desde: `${mes}-01`,
    hasta: fin.toISOString().slice(0, 10),
  };
}

/** Los meses del periodo, del más viejo al más nuevo. */
function mesesDe(dias: number): string[] {
  const salida: string[] = [];
  const hoy = new Date();

  // Search Console guarda 16 meses. Pedir más allá devuelve vacío y confunde.
  const cuantos = Math.min(Math.ceil(dias / 30), 16);

  for (let i = cuantos - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    salida.push(d.toISOString().slice(0, 7));
  }

  return salida;
}

export async function porMes(
  clienteId: string,
  conexionId: string,
  propiedad: string,
  dias: number
): Promise<Mes[]> {
  const meses = mesesDe(dias);
  const enCurso = new Date().toISOString().slice(0, 7);

  const guardados = await db.tramoMes.findMany({
    where: { clienteId, mes: { in: meses } },
  });

  const porClave = new Map(guardados.map((g) => [g.mes, g]));
  const salida: Mes[] = [];

  for (const mes of meses) {
    const guardado = porClave.get(mes);

    // El mes en curso se recalcula, pero no más de una vez por hora: mirar la
    // pantalla tres veces seguidas no debería costar tres llamadas a Google.
    const fresco =
      guardado &&
      (mes !== enCurso || Date.now() - guardado.calculado.getTime() < 3_600_000);

    if (fresco) {
      salida.push({
        mes,
        top3: guardado.top3,
        top10: guardado.top10,
        top20: guardado.top20,
        top50: guardado.top50,
        resto: guardado.resto,
        consultas: guardado.consultas,
      });
      continue;
    }

    const { desde, hasta } = limites(mes);

    let filas;
    try {
      filas = await consultasEntre(conexionId, propiedad, desde, hasta);
    } catch {
      // Un mes que falla no tumba el gráfico: se deja fuera y los demás salen.
      if (guardado) {
        salida.push({
          mes,
          top3: guardado.top3,
          top10: guardado.top10,
          top20: guardado.top20,
          top50: guardado.top50,
          resto: guardado.resto,
          consultas: guardado.consultas,
        });
      }
      continue;
    }

    const t = { top3: 0, top10: 0, top20: 0, top50: 0, resto: 0 };

    for (const f of filas) {
      if (f.posicion <= 3) t.top3++;
      else if (f.posicion <= 10) t.top10++;
      else if (f.posicion <= 20) t.top20++;
      else if (f.posicion <= 50) t.top50++;
      else t.resto++;
    }

    const fila = { ...t, consultas: filas.length };

    await db.tramoMes.upsert({
      where: { clienteId_mes: { clienteId, mes } },
      update: { ...fila, calculado: new Date() },
      create: { clienteId, mes, ...fila },
    });

    salida.push({ mes, ...fila });
  }

  // Los meses sin ninguna consulta se recortan solo si están al principio: un
  // sitio nuevo no tenía tráfico en enero y esa parte plana no aporta nada,
  // pero un cero en medio sí significa algo y se queda.
  while (salida.length && salida[0].consultas === 0) salida.shift();

  return salida;
}
