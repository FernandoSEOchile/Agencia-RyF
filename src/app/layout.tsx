import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel AppSEO",
  description: "Gestión conversacional de los sitios WordPress conectados.",
};

/**
 * El armazón no lleva navegación: cada pantalla trae la suya, porque la lista
 * de clientes y la ficha necesitan acciones distintas.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#fafaf9] text-neutral-700 antialiased">{children}</body>
    </html>
  );
}
