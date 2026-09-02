import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Términos de uso · AppSEO",
  description: "Condiciones de uso del panel AppSEO de Agencia RYF.",
};

const ACTUALIZADO = "2 de septiembre de 2026";

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="sub-web border-t-2 border-[color:var(--naranja)] pt-4 text-[19px]">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed ">
        {children}
      </div>
    </section>
  );
}

export default function Terminos() {
  return (
    <div className="web">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0f1c]">
        <div className="contenedor flex h-16 items-center gap-5">
          <Link href="/" className="flex items-center gap-5">
            <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} className="h-6 w-auto" />
            <span
              className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/50"
              style={{ fontFamily: "var(--titular)" }}
            >
              AppSEO
            </span>
          </Link>
        </div>
      </header>

      <main className="contenedor max-w-[780px] py-16">
        <p className="cinta">Actualizados el {ACTUALIZADO}</p>
        <h1 className="titular-web mt-5 text-[32px] sm:text-[42px]">Términos de uso</h1>

        <p className="mt-5 text-[15px] leading-relaxed ">
          AppSEO es un panel de Agencia RYF (Santiago de Chile) para gestionar el SEO de sitios
          WordPress. Al usarlo aceptas estas condiciones.
        </p>

        <Bloque titulo="Quién puede usarlo">
          <p>
            El acceso es por invitación: se entra con una cuenta creada por un administrador. Eres
            responsable de mantener tus credenciales en privado y de lo que se haga desde tu cuenta.
          </p>
        </Bloque>

        <Bloque titulo="Sitios que conectas">
          <p>
            Solo debes conectar sitios sobre los que tengas autorización para actuar. Al conectar un
            sitio con permiso de escritura, el panel podrá publicar y modificar contenido en él, y esos
            cambios son tu responsabilidad, no de la herramienta.
          </p>
          <p>
            Antes de un cambio masivo, revisa lo que se va a hacer. Y ten una copia de seguridad de los
            sitios de tus clientes: es una práctica sensata que ningún panel sustituye.
          </p>
        </Bloque>

        <Bloque titulo="Contenido generado con inteligencia artificial">
          <p>
            Parte del contenido lo redacta un modelo de lenguaje. Puede equivocarse, y puede afirmar
            cosas que suenan razonables sin serlo. Revisa lo que se publica antes de darlo por bueno,
            especialmente precios, plazos, medidas y cualquier dato verificable.
          </p>
          <p>
            La responsabilidad sobre lo publicado en el sitio de un cliente es de quien lo publica.
          </p>
        </Bloque>

        <Bloque titulo="Datos de terceros">
          <p>
            Las posiciones, volúmenes de búsqueda y datos de Search Console proceden de servicios
            externos. Se muestran tal como los entregan esos servicios y pueden contener imprecisiones o
            retrasos que no dependen de nosotros.
          </p>
        </Bloque>

        <Bloque titulo="Disponibilidad">
          <p>
            El servicio se ofrece tal cual. Se hace lo razonable por mantenerlo disponible, pero puede
            haber interrupciones por mantenimiento, por fallos de los servicios de los que depende o por
            causas ajenas.
          </p>
        </Bloque>

        <Bloque titulo="Uso indebido">
          <p>
            No está permitido usar el panel para generar contenido engañoso, suplantar a personas u
            organizaciones, ni para actuar sobre sitios de terceros sin su permiso. El acceso puede
            retirarse si esto ocurre.
          </p>
        </Bloque>

        <Bloque titulo="Cambios y contacto">
          <p>
            Estos términos pueden actualizarse; la fecha de arriba indica la última versión. Para
            cualquier duda, escribe a{" "}
            <a href="mailto:contacto@agenciaryf.com" className="underline underline-offset-4">
              contacto@agenciaryf.com
            </a>
            .
          </p>
        </Bloque>

        <p className="mt-12 border-t border-[color:var(--linea)] pt-6 text-[14px]">
          <Link href="/" className="underline underline-offset-4 hover:text-[color:var(--acento)]">
            Volver al inicio
          </Link>
          <span className="mx-2 text-black/20">·</span>
          <Link href="/privacidad" className="underline underline-offset-4 hover:text-[color:var(--acento)]">
            Política de privacidad
          </Link>
        </p>
      </main>

      <footer className="mt-16 bg-[#0a0f1c] py-8">
        <div className="contenedor flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-white/45">
          <span>AppSEO · Agencia RYF · Santiago de Chile</span>
          <Link href="/" className="ml-auto transition hover:text-white">
            Inicio
          </Link>
        </div>
      </footer>
    </div>
  );
}
