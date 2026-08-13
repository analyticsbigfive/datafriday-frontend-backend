-- Écrite à la main (comme les migrations précédentes, cf. 20260813130000_stockmovement_transfer_status) :
-- SQL identique à ce que Prisma aurait généré pour le modèle StockTransferLoss (schema.prisma),
-- appliqué via `prisma migrate deploy` (drift pré-existant sur la shadow database).
-- BUG-259-02 (suite, 2026-08-13) : section "Pertes" dédiée, distincte de StockReconciliation
-- (écart de comptage) — un transfert confirmé avec une quantité inférieure à la quantité
-- déclarée à l'émission pose une ligne ici. archivedAt = masquée de la liste active ("vidée"
-- par un utilisateur) sans jamais être supprimée.

-- CreateTable
CREATE TABLE "StockTransferLoss" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "sourceElementId" TEXT NOT NULL,
    "destinationElementId" TEXT NOT NULL,
    "unitsPerPack" DOUBLE PRECISION,
    "declaredPacked" INTEGER NOT NULL DEFAULT 0,
    "declaredLoose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedPacked" INTEGER NOT NULL DEFAULT 0,
    "receivedLoose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lostPacked" INTEGER NOT NULL DEFAULT 0,
    "lostLoose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferMovementId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferLoss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockTransferLoss_tenantId_spaceId_createdAt_idx" ON "StockTransferLoss"("tenantId", "spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransferLoss_tenantId_spaceId_archivedAt_idx" ON "StockTransferLoss"("tenantId", "spaceId", "archivedAt");
