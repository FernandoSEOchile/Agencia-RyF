-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'EDITOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoAcceso" DATETIME
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "urlRest" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "secreto" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT,
    "soloLectura" BOOLEAN,
    "ultimaSonda" DATETIME,
    "estadoSonda" TEXT
);

-- CreateTable
CREATE TABLE "Acceso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    CONSTRAINT "Acceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Acceso_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Registro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accion" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "resultado" TEXT NOT NULL DEFAULT 'ok',
    "usuarioId" TEXT,
    "clienteId" TEXT,
    CONSTRAINT "Registro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Registro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trabajo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "total" INTEGER NOT NULL DEFAULT 0,
    "hechos" INTEGER NOT NULL DEFAULT 0,
    "fallidos" INTEGER NOT NULL DEFAULT 0,
    "creado" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciado" DATETIME,
    "terminado" DATETIME,
    "error" TEXT,
    CONSTRAINT "Trabajo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemTrabajo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trabajoId" TEXT NOT NULL,
    "objetoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "huella" TEXT,
    "propuesto" TEXT,
    "anterior" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "error" TEXT,
    CONSTRAINT "ItemTrabajo_trabajoId_fkey" FOREIGN KEY ("trabajoId") REFERENCES "Trabajo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_dominio_key" ON "Cliente"("dominio");

-- CreateIndex
CREATE UNIQUE INDEX "Acceso_usuarioId_clienteId_key" ON "Acceso"("usuarioId", "clienteId");

-- CreateIndex
CREATE INDEX "Registro_clienteId_creado_idx" ON "Registro"("clienteId", "creado");

-- CreateIndex
CREATE INDEX "Trabajo_clienteId_estado_idx" ON "Trabajo"("clienteId", "estado");

-- CreateIndex
CREATE INDEX "ItemTrabajo_trabajoId_estado_idx" ON "ItemTrabajo"("trabajoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTrabajo_trabajoId_objetoId_key" ON "ItemTrabajo"("trabajoId", "objetoId");
