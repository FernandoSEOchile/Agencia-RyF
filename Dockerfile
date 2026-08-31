# Imagen del panel AppSEO.
#
# Tres etapas para que la imagen final no arrastre ni el código fuente ni las
# dependencias de compilación: lo que se sube al servidor es solo lo necesario
# para ejecutar.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# El cliente de Prisma se genera contra el esquema antes de compilar: si falta,
# el build de Next falla al importar los tipos.
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# No correr como root: si alguien logra ejecutar código dentro del contenedor,
# que no sea con todos los permisos.
RUN addgroup -g 1001 -S nodejs && adduser -S panel -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=panel:nodejs /app/.next/standalone ./
COPY --from=build --chown=panel:nodejs /app/.next/static ./.next/static

# Prisma necesita el esquema y las migraciones en tiempo de ejecución para
# poder aplicar `migrate deploy` al arrancar.
COPY --from=build --chown=panel:nodejs /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/scripts ./scripts

USER panel
EXPOSE 3000

# El esquema se aplica al arrancar, así que desplegar una versión con cambios
# de base es un solo paso y no se puede olvidar.
#
# Se usa `db push` y no `migrate deploy` porque el proyecto acaba de cambiar de
# SQLite a Postgres y no hay migraciones de Postgres todavía. `db push` crea lo
# que falte a partir del esquema y se niega si el cambio destruiría datos.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
