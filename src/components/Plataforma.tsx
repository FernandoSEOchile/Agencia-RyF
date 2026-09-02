/**
 * Distintivos de plataforma.
 *
 * Son marcas dibujadas a mano, no los logotipos oficiales: se usan para que de
 * un vistazo se sepa con qué se está trabajando —cambia lo que el panel puede
 * hacer en cada sitio— y no para representar a WordPress ni a Shopify.
 *
 * Van en SVG en línea porque son dos formas simples: una imagen externa
 * costaría una petición y una dependencia de CSP a cambio de nada.
 */

const AZUL_WP = "#21759B";
const VERDE_SHOPIFY = "#5E8E3E";

export function IconoWordPress({ tam = 16 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={AZUL_WP} strokeWidth="1.6" />
      <path
        d="M6.2 8.6h1.7l1.6 6.1 1.6-6.1h1.4l1.6 6.1 1.6-6.1h1.7l-2.4 8.2h-1.6l-1.6-5.9-1.6 5.9H8.6z"
        fill={AZUL_WP}
      />
    </svg>
  );
}

export function IconoShopify({ tam = 16 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.6 6.4h10.8l1.1 12.4a1.2 1.2 0 0 1-1.2 1.3H6.7a1.2 1.2 0 0 1-1.2-1.3z"
        fill={VERDE_SHOPIFY}
      />
      <path
        d="M9 8V6.1a3 3 0 0 1 6 0V8"
        fill="none"
        stroke={VERDE_SHOPIFY}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** La etiqueta que se ve junto al nombre de un cliente. */
export default function Plataforma({
  cual,
  conNombre = false,
  tam = 16,
}: {
  cual: string;
  conNombre?: boolean;
  tam?: number;
}) {
  const esShopify = cual === "shopify";
  const nombre = esShopify ? "Shopify" : "WordPress";

  return (
    <span
      className="inline-flex items-center gap-1.5 align-middle"
      title={nombre}
      aria-label={nombre}
    >
      {esShopify ? <IconoShopify tam={tam} /> : <IconoWordPress tam={tam} />}
      {conNombre && (
        <span className="text-[12px] font-medium text-[color:var(--tinta-media)]">{nombre}</span>
      )}
    </span>
  );
}
