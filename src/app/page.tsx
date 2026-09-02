import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";

/**
 * Página pública del producto.
 *
 * Existe por dos razones. La primera es comercial: alguien a quien le hablan
 * de esto tiene que poder entender qué hace sin una cuenta. La segunda es un
 * requisito: Google exige una página accesible sin identificarse que explique
 * la aplicación y enlace a su política de privacidad, y sin eso no se puede
 * verificar el acceso a Search Console.
 *
 * A quien ya tiene sesión abierta se le lleva al panel: para él esto sobra.
 */
export const metadata = {
  title: "AppSEO · Gestiona el SEO de todos tus WordPress desde un panel",
  description:
    "Conecta los WordPress y WooCommerce de tus clientes y trabaja sobre ellos conversando: contenido, arquitectura SEO, posiciones y diseño, sin entrar a cada escritorio.",
};

const CAPACIDADES = [
  {
    titulo: "Escribe en el sitio, no te devuelve texto",
    cuerpo:
      "Descripciones de categoría, fichas de producto, páginas y CSS se publican directamente en el WordPress del cliente. No hay copiar y pegar entre pestañas.",
  },
  {
    titulo: "Mira Google antes de escribir",
    cuerpo:
      "Analiza los primeros resultados de la búsqueda que quieres atacar —su extensión, sus encabezados, el vocabulario que comparten— y escribe con ese criterio en vez de a ciegas.",
  },
  {
    titulo: "Arquitectura SEO cruzada con el sitio real",
    cuerpo:
      "Subes el Excel de arquitectura y te dice qué secciones existen ya, con qué URL, y cuáles faltan por crear con cuántas búsquedas mensuales se están perdiendo.",
  },
  {
    titulo: "Posiciones y datos de búsqueda",
    cuerpo:
      "Seguimiento de posiciones en Google por país y dispositivo, y las consultas reales de Search Console para ver dónde ya hay visibilidad que se puede aprovechar.",
  },
  {
    titulo: "Inventario de todo lo publicado",
    cuerpo:
      "Cada URL del cliente con su fecha de modificación y qué se hizo en ella desde el panel, ordenable y filtrable por tipo de contenido.",
  },
  {
    titulo: "Varias personas, permisos separados",
    cuerpo:
      "Cada trabajador ve solo los clientes que le corresponden, con permiso de lectura o de escritura, y queda registrado quién hizo qué y cuándo.",
  },
];

const PASOS = [
  ["Instalas el conector", "Un plugin propio en el WordPress del cliente. No ejecuta código remoto: expone lo justo, firmado."],
  ["Pegas la cadena de conexión", "El sitio queda enlazado al panel, y decides si permite solo lectura o también escritura."],
  ["Trabajas conversando", "Le pides lo que necesitas en lenguaje normal y lo aplica sobre el sitio, dejando registro de cada cambio."],
];

export default async function Inicio() {
  const sesion = await auth();

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#111111]">
        <div className="contenedor flex h-12 items-center gap-4">
          <Image src="/ryf.webp" alt="Agencia RYF" width={512} height={199} priority className="h-[18px] w-auto" />
          <span className="text-[13px] font-medium tracking-tight text-white/90">AppSEO</span>
          <Link
            href={sesion?.user ? "/panel" : "/entrar"}
            className="ml-auto text-[12px] font-medium text-white/60 transition hover:text-white"
          >
            {sesion?.user ? "Ir al panel" : "Entrar"}
          </Link>
        </div>
      </header>

      <main>
        <section className="contenedor py-20 sm:py-28">
          <p className="rotulo">Herramienta interna de Agencia RYF</p>
          <h1 className="mt-3 max-w-3xl text-[40px] font-semibold leading-[1.1] sm:text-[54px]">
            El SEO de todos tus WordPress, desde un solo panel.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[color:var(--tinta-media)]">
            AppSEO conecta los sitios WordPress y WooCommerce de tus clientes y te deja trabajar sobre
            ellos conversando. Escribes una instrucción y se aplica en el sitio: contenido, categorías,
            fichas de producto, diseño. Sin entrar a cada escritorio, sin copiar y pegar, y con registro
            de todo lo que se toca.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={sesion?.user ? "/panel" : "/entrar"} className="boton-fuerte !px-5 !py-2.5 !text-[14px]">
              {sesion?.user ? "Ir al panel" : "Entrar al panel"}
            </Link>
            <a href="mailto:contacto@agenciaryf.com" className="boton !px-5 !py-2.5 !text-[14px]">
              Escríbenos
            </a>
          </div>
        </section>

        <section className="border-y border-[color:var(--linea)] bg-white py-16">
          <div className="contenedor">
            <h2 className="rotulo">Qué hace</h2>
            <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {CAPACIDADES.map((c) => (
                <div key={c.titulo}>
                  <h3 className="text-[15px] font-semibold">{c.titulo}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
                    {c.cuerpo}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="contenedor py-16">
          <h2 className="rotulo">Cómo se conecta un sitio</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {PASOS.map(([titulo, cuerpo], i) => (
              <li key={titulo} className="tarjeta p-5">
                <span className="text-[13px] font-semibold tabular-nums text-[color:var(--acento)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-[15px] font-semibold">{titulo}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">{cuerpo}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-[color:var(--linea)] bg-white py-16">
          <div className="contenedor">
            <h2 className="rotulo">Qué datos usa</h2>
            <div className="mt-6 grid max-w-4xl gap-8 sm:grid-cols-2">
              <div>
                <h3 className="text-[15px] font-semibold">Los sitios que conectas</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
                  El conector se instala con tu permiso en cada WordPress y expone únicamente lo
                  necesario para leer y publicar contenido. Cada petición va firmada, y las credenciales
                  se guardan cifradas.
                </p>
              </div>
              <div>
                <h3 className="text-[15px] font-semibold">Google Search Console</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--tinta-media)]">
                  Si lo autorizas, el panel lee <strong className="font-medium text-[color:var(--tinta)]">solo
                  en modo lectura</strong> las consultas y posiciones de tus propiedades, para mostrarlas
                  junto al resto. No modifica nada en tu cuenta de Google y puedes revocar el acceso
                  cuando quieras.
                </p>
              </div>
            </div>
            <p className="mt-6 text-[14px]">
              <Link href="/privacidad" className="underline underline-offset-4 hover:text-[color:var(--acento)]">
                Política de privacidad
              </Link>
              <span className="mx-2 text-black/20">·</span>
              <Link href="/terminos" className="underline underline-offset-4 hover:text-[color:var(--acento)]">
                Términos de uso
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="contenedor py-10 text-[12px] text-[color:var(--tinta-suave)]">
        AppSEO · Agencia RYF · Santiago de Chile
      </footer>
    </>
  );
}
