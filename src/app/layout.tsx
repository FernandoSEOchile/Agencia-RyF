import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel AppSEO",
  description: "Gestión conversacional de los sitios WordPress conectados.",
};

/**
 * El armazón raíz no lleva navegación: la web pública, entrar y el informe por
 * enlace no la tienen. La del panel —riel y barra— vive en src/app/panel/layout.tsx.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[color:var(--fondo)] text-[color:var(--tinta)] antialiased">{children}</body>
    </html>
  );
}
