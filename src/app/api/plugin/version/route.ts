import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Versión publicada del conector.
 *
 * La consultan los WordPress de los clientes a través del mecanismo nativo de
 * actualización de plugins. Es pública a propósito: no revela nada que no esté
 * ya dentro del ZIP, y exigir credenciales aquí obligaría a cada sitio a
 * autenticarse antes de saber si tiene que actualizarse.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Publicacion {
  version: string;
  probado?: string;
  php?: string;
  notas?: string;
}

export async function GET() {
  let datos: Publicacion;

  try {
    const bruto = await readFile(join(process.cwd(), "public", "plugin", "version.json"), "utf8");
    datos = JSON.parse(bruto);
  } catch {
    return Response.json({ error: "No hay ninguna versión publicada." }, { status: 404 });
  }

  if (!datos.version) {
    return Response.json({ error: "La publicación no declara versión." }, { status: 500 });
  }

  return Response.json(
    {
      version: datos.version,
      paquete: "https://panel.agenciaryf.com/api/plugin/descargar",
      probado: datos.probado ?? "",
      php: datos.php ?? "7.4",
      notas: datos.notas ?? "",
    },
    {
      // Los sitios ya guardan la respuesta seis horas por su cuenta; esto evita
      // que un proxy intermedio sirva una versión vieja más tiempo del debido.
      headers: { "Cache-Control": "public, max-age=300" },
    }
  );
}
