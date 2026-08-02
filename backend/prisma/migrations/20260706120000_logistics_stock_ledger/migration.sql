-- Logistics : ledger de mouvements de stock + niveaux matérialisés + réconciliations

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('DELIVERY', 'TRANSFER_SHOP', 'TRANSFER_STORAGE', 'EXPIRY', 'SALE', 'INVENTORY_RESET', 'OTHER');

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "menuItemId" TEXT,
    "marketPriceId" TEXT,
    "packedDelta" INTEGER NOT NULL DEFAULT 0,
    "looseDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" "StockMovementReason" NOT NULL,
    "counterpartyElementId" TEXT,
    "transferGroupId" TEXT,
    "expiryDate" TIMESTAMP(3),
    "note" TEXT,
    "eventId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "packedUnits" INTEGER NOT NULL DEFAULT 0,
    "looseUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitsPerPack" DOUBLE PRECISION,
    "marketPriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT,
    "lines" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_elementId_createdAt_idx" ON "StockMovement"("tenantId", "elementId", "createdAt");
CREATE INDEX "StockMovement_tenantId_spaceId_createdAt_idx" ON "StockMovement"("tenantId", "spaceId", "createdAt");
CREATE INDEX "StockMovement_tenantId_spaceId_eventId_idx" ON "StockMovement"("tenantId", "spaceId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_tenantId_elementId_itemKey_key" ON "StockLevel"("tenantId", "elementId", "itemKey");
CREATE INDEX "StockLevel_tenantId_spaceId_idx" ON "StockLevel"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "StockReconciliation_tenantId_spaceId_createdAt_idx" ON "StockReconciliation"("tenantId", "spaceId", "createdAt");
