import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Entrega el ZIP del conector.
 *
 * Lo descarga el propio WordPress del cliente cuando decide actualizarse. Va
 * sin autenticación por lo mismo que la ruta de versión: el paquete no contiene
 * secretos, y las credenciales de cada sitio se generan en el sitio, no viajan
 * dentro del plugin.
 *
 * La confianza aquí descansa en dos cosas: que el dominio es tuyo y que el
 * tráfico va por HTTPS. Si alguien pudiera servir contenido desde este dominio,
 * podría entregar código a la cartera entera — por eso el certificado y el
 * acceso al servidor son parte de la seguridad del sistema, no un detalle de
 * infraestructura.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [zip, meta] = await Promise.all([
      readFile(join(process.cwd(), "public", "plugin", "appseo-ryf.zip")),
      readFile(join(process.cwd(), "public", "plugin", "version.json"), "utf8").catch(() => "{}"),
    ]);

    const version = (JSON.parse(meta).version as string) || "";

    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        // El nombre lleva la versión para que quede rastro en los registros del
        // servidor de cada cliente de qué se descargó exactamente.
        "Content-Disposition": `attachment; filename="appseo-ryf${version ? "-" + version : ""}.zip"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return Response.json({ error: "No hay ningún paquete publicado." }, { status: 404 });
  }
}
