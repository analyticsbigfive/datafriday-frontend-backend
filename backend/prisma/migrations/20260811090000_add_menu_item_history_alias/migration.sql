-- Écrite à la main (comme les migrations précédentes, cf. 20260810120000_add_digifood_csv_import_run) :
-- SQL identique à ce que Prisma aurait généré pour le modèle MenuItemHistoryAlias (schema.prisma),
-- appliqué via `prisma migrate deploy` (drift pré-existant sur la shadow database).
-- Alias « historique emprunté » Event Predict : source (nom d'item timeline) -> cible (MenuItem).
-- Résolution frontend uniquement — la page Analyse ne lit jamais cette table.

-- CreateTable
CREATE TABLE "MenuItemHistoryAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "sourceMenuItemId" TEXT,
    "sourceName" TEXT NOT NULL,
    "targetMenuItemId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemHistoryAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemHistoryAlias_tenantId_spaceId_sourceName_key" ON "MenuItemHistoryAlias"("tenantId", "spaceId", "sourceName");

-- CreateIndex
CREATE INDEX "MenuItemHistoryAlias_tenantId_spaceId_idx" ON "MenuItemHistoryAlias"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "MenuItemHistoryAlias_targetMenuItemId_idx" ON "MenuItemHistoryAlias"("targetMenuItemId");
