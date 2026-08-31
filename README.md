# AppSEO

Herramienta interna para aumentar la productividad de consultores SEO creando
contenido optimizado, listo para pegar en tiendas **Shopify** y **WooCommerce**.

## Qué hace

1. **Descripciones de categoría** (con IA · Claude)
   Genera texto SEO en HTML/CSS para páginas de categoría, con bloque de
   preguntas frecuentes y datos estructurados **FAQPage (JSON-LD)**.
   Incorpora la metodología de la agencia: keyword principal + secundarias,
   análisis del top de Google e integración natural del conocimiento real del
   negocio (E-E-A-T).

2. **Módulos de enlazado interno** (instantáneo, sin IA)
   Crea widgets HTML/CSS de enlaces relacionados en formato cuadrícula, lista o
   chips, para distribuir autoridad y mejorar la navegación interna.

Ambas herramientas ofrecen **vista previa en vivo** y **copiar al portapapeles**.

## Puesta en marcha

```bash
npm install
cp .env.local.example .env.local   # y pon tu ANTHROPIC_API_KEY real
npm run dev
```

Abre http://localhost:3000

> La clave de Anthropic se consigue en
> https://console.anthropic.com/settings/keys
> El generador de enlazado funciona sin clave; el de categorías la necesita.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- Anthropic SDK (`@anthropic-ai/sdk`), modelo por defecto `claude-sonnet-4-6`
  (configurable con `ANTHROPIC_MODEL`)

## Estructura

```
src/
  app/
    page.tsx                      Inicio (selección de herramienta)
    categoria/page.tsx            Generador de descripciones de categoría
    enlazado/page.tsx             Generador de módulos de enlazado
    api/generar-categoria/route.ts  Endpoint que llama a Claude
  lib/
    anthropic.ts                  Cliente + parseo de JSON
    prompts.ts                    Prompts del generador de categorías
    enlazado.ts                   Generador de módulos (plantillas)
  components/
    CodeBlock.tsx                 Código + botón copiar
    Preview.tsx                   Vista previa en iframe aislado
```

## Próximos pasos sugeridos

- Conexión directa por API (Shopify Admin / WooCommerce REST) para publicar.
- Importación de productos/categorías por CSV.
- Guardado de generaciones e histórico.
- Generación asistida de textos ancla en el módulo de enlazado.
