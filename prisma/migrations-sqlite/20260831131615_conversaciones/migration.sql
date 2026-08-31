-- CreateTable
CREATE TABLE "Conversacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "creado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tocado" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversacionId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "usadas" TEXT,
    "entrada" INTEGER NOT NULL DEFAULT 0,
    "salida" INTEGER NOT NULL DEFAULT 0,
    "creado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Conversacion_clienteId_tocado_idx" ON "Conversacion"("clienteId", "tocado");

-- CreateIndex
CREATE INDEX "Mensaje_conversacionId_creado_idx" ON "Mensaje"("conversacionId", "creado");
