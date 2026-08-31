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

# El esquema se copia solo para tenerlo a mano; quien lo aplica es el servicio
# `migrador` del docker-compose, que corre sobre la etapa de compilación y sí
# tiene todas las dependencias del CLI de Prisma.
COPY --from=build --chown=panel:nodejs /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/scripts ./scripts

USER panel
EXPOSE 3000

# Solo levanta el servidor. La base la prepara el servicio `migrador` antes de
# que este contenedor arranque: meter el CLI de Prisma aquí obligaría a copiar
# medio node_modules a una imagen que se supone mínima.
CMD ["node", "server.js"]
