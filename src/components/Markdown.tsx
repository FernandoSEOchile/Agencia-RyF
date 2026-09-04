"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderiza el markdown que devuelve el asistente.
 *
 * Los estilos van componente a componente y no con un plugin de tipografía
 * porque este texto convive con burbujas de chat: hace falta controlar los
 * márgenes verticales para que no se despeguen del contenedor.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[color:var(--tinta)]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--acento)] underline underline-offset-2 hover:text-[color:var(--tinta)]"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="mb-2.5 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2.5 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-bold text-[color:var(--tinta)] first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-4 text-[15px] font-bold text-[color:var(--tinta)] first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-[color:var(--tinta)] first:mt-0">{children}</h3>,
        code: ({ className, children }) => {
          // Sin `className` es código en línea; con él, un bloque con lenguaje.
          const bloque = Boolean(className);
          return bloque ? (
            <code className="block overflow-x-auto whitespace-pre rounded-lg bg-[color:var(--tinta)] p-3 font-mono text-xs text-[color:var(--tinta-media)]">
              {children}
            </code>
          ) : (
            <code className="rounded bg-black/[0.04] px-1 py-0.5 font-mono text-[0.85em] text-[color:var(--tinta)]">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="mb-2.5 last:mb-0">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2.5 border-l-2 border-[color:var(--acento)] pl-3 text-[color:var(--tinta-media)] last:mb-0">
            {children}
          </blockquote>
        ),
        // Las tablas se salen del ancho del chat con facilidad: se les da su
        // propio scroll para que no arrastren la página entera.
        table: ({ children }) => (
          <div className="mb-2.5 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-[color:var(--linea-fuerte)] px-2 py-1.5 text-left font-semibold text-[color:var(--tinta)]">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="border-b border-[color:var(--linea-fuerte)] px-2 py-1.5 align-top">{children}</td>,
        hr: () => <hr className="my-3 border-[color:var(--linea-fuerte)]" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
