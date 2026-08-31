/**
 * Acceso a la base de datos.
 *
 * En desarrollo Next.js recarga los módulos en cada cambio, y sin esta caché
 * cada recarga abriría una conexión nueva hasta agotar el pool. Es el patrón
 * recomendado por Prisma para entornos con recarga en caliente.
 */
import "server-only";
import { PrismaClient } from "@prisma/client";

const global_ = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  global_.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global_.prisma = db;
}
