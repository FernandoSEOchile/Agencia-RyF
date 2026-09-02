import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";

/**
 * Página pública del producto.
 *
 * Existe por dos razones. La primera es comercial: a quien le hablan de esto
 * tiene que poder entender qué hace sin una cuenta. La segunda es un
 * requisito: Google exige una página accesible sin identificarse que describa
 * la aplicación y enlace a su política de privacidad, y sin eso no se puede
 * verificar el acceso a Search Console.
 *
 * Sigue el lenguaje visual de agenciaryf.com —titulares en versalitas de peso
 * máximo, naranja de acción, héroe oscuro— para que quien venga desde la web
 * de la agencia no sienta que cambió de empresa.
 */
export const metadata = {
  title: "AppSEO · Gestiona el SEO de todos tus WordPress desde un panel",
  description:
    "Conecta los WordPress y WooCommerce de tus clientes y trabaja sobre ellos conversando: contenido, arquitectura SEO, posiciones y diseño, sin entrar a cada escritorio.",
};

const CAPACIDADES = [
  {
    titulo: "Escribe en el sitio",
    cuerpo:
      "Descripciones de categoría, fichas de producto, páginas y CSS se publican directamente en el WordPress del cliente. No devuelve texto para que lo copies: lo aplica.",
  },
  {
    titulo: "Mira Google antes de escribir",
    cuerpo:
      "Analiza los primeros resultados de la búsqueda que quieres atacar —su extensión, sus encabezados, el vocabulario que comparten— y escribe con ese criterio, no a ciegas.",
  },
  {
    titulo: "Arquitectura cruzada con el sitio",
    cuerpo:
      "Subes el Excel de arquitectura y te dice qué secciones ya existen, con qué URL, y cuáles faltan por crear con cuántas búsquedas mensuales se están perdiendo.",
  },
  {
    titulo: "Posiciones y datos reales",
    cuerpo:
      "Seguimiento en Google por país y dispositivo, más las consultas de Search Console para ver dónde ya hay visibilidad aprovechable.",
  },
  {
    titulo: "Inventario de lo publicado",
    cuerpo:
      "Cada URL del cliente con su fecha de modificación y qué se hizo en ella desde el panel, ordenable y filtrable por tipo de contenido.",
  },
  {
    titulo: "Equipo con permisos",
    cuerpo:
      "Cada persona ve solo los clientes que le corresponden, con lectura o escritura, y queda registrado quién hizo qué y cuándo.",
  },
];

const PASOS: [string, string][] = [
  ["Instalas el conector", "Un plugin propio en el WordPress del cliente. No ejecuta código remoto: expone lo justo, y cada petición va firmada."],
  ["Pegas la cadena", "El sitio queda enlazado al panel, y decides si permite solo lectura o también escritura."],
  ["Trabajas conversando", "Pides lo que necesitas en lenguaje normal y se aplica sobre el sitio, dejando registro de cada cambio."],
];

export default async function Inicio() {
  const sesion = await auth();
  const destino = sesion?.user ? "/panel" : "/entrar";

  return (
    <div className="web">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0f1c]">
        <div className="contenedor flex h-16 items-center gap-5">
          <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} priority className="h-6 w-auto" />
          <span
            className="hidden text-[13px] font-bold uppercase tracking-[0.12em] text-white/50 sm:block"
            style={{ fontFamily: "var(--titular)" }}
          >
            AppSEO
          </span>
          <Link href={destino} className="boton-naranja ml-auto !px-5 !py-2">
            {sesion?.user ? "Ir al panel" : "Entrar"}
          </Link>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------- héroe */}
        <section className="heroe overflow-hidden">
          <div className="contenedor relative z-10 py-24 text-center sm:py-32">
            <p className="cinta">Herramienta interna de Agencia RYF</p>

            <h1 className="titular-web mx-auto mt-7 max-w-4xl !text-white text-[34px] sm:text-[56px]">
              El SEO de todos tus WordPress
              <br />
              <span style={{ color: "var(--naranja)" }}>desde un solo panel</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-white/70">
              AppSEO conecta los sitios WordPress y WooCommerce de tus clientes y te deja trabajar sobre
              ellos conversando. Escribes una instrucción y se aplica en el sitio: contenido, categorías,
              fichas de producto, diseño. Sin entrar a cada escritorio y con registro de todo lo que se
              toca.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href={destino} className="boton-naranja">
                {sesion?.user ? "Ir al panel" : "Entrar al panel"}
              </Link>
              <a href="mailto:contacto@agenciaryf.com" className="boton-linea">
                Escríbenos
              </a>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ capacidades */}
        <section className="bg-white py-20">
          <div className="contenedor">
            <p className="cinta">Qué hace</p>
            <h2 className="seccion-web mt-4 max-w-3xl text-[26px] sm:text-[34px]">
              Todo lo que hoy haces entrando a{" "}
              <span style={{ color: "var(--naranja)" }}>cada WordPress</span>
            </h2>

            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {CAPACIDADES.map((c) => (
                <div key={c.titulo} className="border-t-2 border-[color:var(--naranja)] pt-4">
                  <h3 className="sub-web text-[17px]">{c.titulo}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed">{c.cuerpo}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ pasos */}
        <section className="bg-[#f9f9f9] py-20">
          <div className="contenedor">
            <p className="cinta">Cómo se conecta un sitio</p>
            <h2 className="seccion-web mt-4 text-[26px] sm:text-[34px]">
              Tres pasos, <span style={{ color: "var(--naranja)" }}>una sola vez</span>
            </h2>

            <ol className="mt-12 grid gap-6 sm:grid-cols-3">
              {PASOS.map(([titulo, cuerpo], i) => (
                <li key={titulo} className="bg-white p-7" style={{ borderRadius: 3 }}>
                  <span
                    className="text-[32px] font-black leading-none"
                    style={{ fontFamily: "var(--display)", color: "var(--naranja)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="sub-web mt-3 text-[17px]">{titulo}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed">{cuerpo}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------ datos */}
        <section className="bg-white py-20">
          <div className="contenedor">
            <p className="cinta">Qué datos usa</p>
            <h2 className="seccion-web mt-4 text-[26px] sm:text-[34px]">
              Lo mínimo, <span style={{ color: "var(--naranja)" }}>y siempre con tu permiso</span>
            </h2>

            <div className="mt-12 grid max-w-4xl gap-10 sm:grid-cols-2">
              <div className="border-t-2 border-[color:var(--naranja)] pt-4">
                <h3 className="sub-web text-[17px]">Los sitios que conectas</h3>
                <p className="mt-2 text-[15px] leading-relaxed">
                  El conector se instala con tu permiso en cada WordPress y expone únicamente lo
                  necesario para leer y publicar contenido. Cada petición va firmada, y las credenciales
                  se guardan cifradas.
                </p>
              </div>
              <div className="border-t-2 border-[color:var(--naranja)] pt-4">
                <h3 className="sub-web text-[17px]">Google Search Console</h3>
                <p className="mt-2 text-[15px] leading-relaxed">
                  Si lo autorizas, el panel lee <strong className="font-semibold text-slate-900">solo en
                  modo lectura</strong> las consultas y posiciones de tus propiedades para mostrarlas
                  junto al resto. No modifica nada en tu cuenta de Google, y puedes revocar el acceso
                  cuando quieras.
                </p>
              </div>
            </div>

            <p className="mt-10 text-[14px]">
              <Link href="/privacidad" className="font-semibold underline underline-offset-4 hover:text-[color:var(--naranja)]">
                Política de privacidad
              </Link>
              <span className="mx-3 text-slate-300">·</span>
              <Link href="/terminos" className="font-semibold underline underline-offset-4 hover:text-[color:var(--naranja)]">
                Términos de uso
              </Link>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ cierre */}
        <section className="heroe overflow-hidden">
          <div className="contenedor relative z-10 py-20 text-center">
            <h2 className="titular-web mx-auto max-w-3xl !text-white text-[26px] sm:text-[36px]">
              ¿Gestionas varios WordPress?
              <br />
              <span style={{ color: "var(--naranja)" }}>Hablemos</span>
            </h2>
            <div className="mt-8">
              <a href="mailto:contacto@agenciaryf.com" className="boton-naranja">
                Escríbenos
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0a0f1c] py-8">
        <div className="contenedor flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-white/45">
          <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} className="h-4 w-auto opacity-70" />
          <span>AppSEO · Agencia RYF · Santiago de Chile</span>
          <Link href="/privacidad" className="ml-auto transition hover:text-white">
            Privacidad
          </Link>
          <Link href="/terminos" className="transition hover:text-white">
            Términos
          </Link>
        </div>
      </footer>
    </div>
  );
}
