import Link from "next/link";

/**
 * Página que no existe.
 *
 * Sin esto Next enseñaba su 404 por defecto: en inglés, sin la barra y sin
 * forma de volver. Un enlace viejo a un cliente borrado acababa ahí.
 */
export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="rotulo">404</p>
      <h1 className="mt-2 text-[24px] font-semibold">Esta página no existe</h1>
      <p className="mt-2 text-[14px] text-[color:var(--tinta-media)]">
        Puede que el enlace sea viejo o que el cliente se haya dado de baja.
      </p>
      <Link href="/panel" className="boton-fuerte mt-6">
        Ir a la cartera
      </Link>
    </main>
  );
}
