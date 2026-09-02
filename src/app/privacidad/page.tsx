import Image from "next/image";
import Link from "next/link";

/**
 * Política de privacidad.
 *
 * Tiene que ser pública y estar en el mismo dominio que la aplicación: es
 * requisito de Google para autorizar el acceso a Search Console. Está escrita
 * para que se entienda, no para cubrirse: quien la lee necesita saber qué se
 * toca de lo suyo y cómo lo quita.
 */
export const metadata = {
  title: "Política de privacidad · AppSEO",
  description: "Qué datos trata AppSEO, para qué, dónde se guardan y cómo se eliminan.",
};

const ACTUALIZADO = "2 de septiembre de 2026";

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[19px] font-semibold">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[color:var(--tinta-media)]">
        {children}
      </div>
    </section>
  );
}

export default function Privacidad() {
  return (
    <>
      <header className="sticky top-0 z-40 bg-[#111111]">
        <div className="contenedor flex h-12 items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} className="h-[18px] w-auto" />
            <span className="text-[13px] font-medium tracking-tight text-white/90">AppSEO</span>
          </Link>
        </div>
      </header>

      <main className="contenedor max-w-[760px] py-16">
        <p className="rotulo">Actualizada el {ACTUALIZADO}</p>
        <h1 className="mt-3 text-[36px] font-semibold leading-tight">Política de privacidad</h1>

        <p className="mt-5 text-[15px] leading-relaxed text-[color:var(--tinta-media)]">
          AppSEO es una herramienta de Agencia RYF (Santiago de Chile) para gestionar el SEO de sitios
          WordPress. Esta página explica qué datos trata, con qué finalidad, dónde se guardan y cómo se
          eliminan.
        </p>

        <Bloque titulo="Quién trata los datos">
          <p>
            El responsable es Agencia RYF. Para cualquier consulta sobre esta política o para ejercer
            los derechos que se describen más abajo, escribe a{" "}
            <a href="mailto:contacto@agenciaryf.com" className="underline underline-offset-4">
              contacto@agenciaryf.com
            </a>
            .
          </p>
        </Bloque>

        <Bloque titulo="Datos de tu cuenta">
          <p>
            Para entrar al panel se guardan tu nombre, tu correo y una versión cifrada de tu contraseña
            —nunca la contraseña en sí—, junto con la fecha de tu último acceso. Se usan solo para
            identificarte y para saber quién realizó cada acción.
          </p>
        </Bloque>

        <Bloque titulo="Datos de los sitios que conectas">
          <p>
            Al conectar un WordPress se guarda su dirección y la credencial que permite comunicarse con
            él. Esa credencial se almacena cifrada con AES-256-GCM, con una clave que vive fuera de la
            base de datos.
          </p>
          <p>
            El panel lee y, si lo autorizas al conectarlo, publica contenido en ese sitio. Cada acción
            queda registrada con la fecha, el usuario que la hizo y qué cambió. Puedes desconectar un
            sitio en cualquier momento desde el panel o desactivando el conector en tu WordPress.
          </p>
        </Bloque>

        <Bloque titulo="Datos de Google Search Console">
          <p>
            Si decides conectarlo, AppSEO solicita acceso a Google Search Console con el permiso{" "}
            <code className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[13px]">
              webmasters.readonly
            </code>
            , que es <strong className="font-medium text-[color:var(--tinta)]">de solo lectura</strong>.
            El panel no puede modificar, enviar ni eliminar nada en tu cuenta de Google.
          </p>
          <p>
            Ese acceso se usa con una única finalidad: mostrarte, dentro del panel, las consultas de
            búsqueda, impresiones, clics y posiciones de las propiedades que tú mismo elijas asociar a
            cada cliente.
          </p>
          <p>
            De esa conexión se guarda tu dirección de correo de Google y el token que permite renovar el
            acceso, cifrado igual que el resto de credenciales.{" "}
            <strong className="font-medium text-[color:var(--tinta)]">
              Los datos de búsqueda no se almacenan
            </strong>
            : se consultan a Google en el momento de mostrarlos y no se guarda copia.
          </p>
          <p>
            Esta información no se comparte con terceros, no se vende, no se usa para publicidad ni para
            entrenar modelos de inteligencia artificial.
          </p>
          <p>
            Puedes retirar el permiso cuando quieras, por dos vías: desde el propio panel, o desde{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4"
            >
              los permisos de tu cuenta de Google
            </a>
            . Al hacerlo, el panel deja de poder acceder de inmediato.
          </p>
        </Bloque>

        <Bloque titulo="Conversaciones e inteligencia artificial">
          <p>
            Las instrucciones que escribes en el panel se envían a la API de Anthropic para generar la
            respuesta, junto con la información del sitio necesaria para atender la petición. Anthropic
            actúa como proveedor de procesamiento y no utiliza ese contenido para entrenar sus modelos.
          </p>
          <p>
            Las conversaciones se guardan en el panel para que puedas retomarlas y para dejar constancia
            de qué se pidió. Puedes eliminarlas desde la ficha del cliente.
          </p>
        </Bloque>

        <Bloque titulo="Terceros que intervienen">
          <p>
            Para funcionar, AppSEO se apoya en Anthropic (generación de respuestas), Google Search
            Console (datos de búsqueda, solo si lo conectas) y DataForSEO (posiciones en buscadores, solo
            si se activa). A cada uno se le envía únicamente lo imprescindible para prestar ese servicio.
          </p>
          <p>
            Los datos se alojan en un servidor propio contratado a Hostinger, con acceso restringido y
            cifrado en tránsito mediante HTTPS.
          </p>
        </Bloque>

        <Bloque titulo="Cuánto se conserva y cómo se elimina">
          <p>
            Los datos se conservan mientras la cuenta esté activa. Si quieres que se eliminen tus datos,
            los de un sitio conectado o los de una conexión de Google, escríbenos a{" "}
            <a href="mailto:contacto@agenciaryf.com" className="underline underline-offset-4">
              contacto@agenciaryf.com
            </a>{" "}
            y se eliminarán en un plazo máximo de 30 días, salvo lo que debamos conservar por obligación
            legal.
          </p>
          <p>
            Tienes derecho a acceder a tus datos, a corregirlos, a solicitar su eliminación y a oponerte
            a su tratamiento. Se atienden por el mismo correo.
          </p>
        </Bloque>

        <Bloque titulo="Cambios en esta política">
          <p>
            Si cambia algo relevante, se actualizará esta página junto con su fecha. Si el cambio afecta
            a cómo se tratan datos que ya nos confiaste, se avisará dentro del panel.
          </p>
        </Bloque>

        <p className="mt-12 border-t border-[color:var(--linea)] pt-6 text-[14px]">
          <Link href="/" className="underline underline-offset-4 hover:text-[color:var(--acento)]">
            Volver al inicio
          </Link>
          <span className="mx-2 text-black/20">·</span>
          <Link href="/terminos" className="underline underline-offset-4 hover:text-[color:var(--acento)]">
            Términos de uso
          </Link>
        </p>
      </main>

      <footer className="contenedor py-10 text-[12px] text-[color:var(--tinta-suave)]">
        AppSEO · Agencia RYF · Santiago de Chile
      </footer>
    </>
  );
}
