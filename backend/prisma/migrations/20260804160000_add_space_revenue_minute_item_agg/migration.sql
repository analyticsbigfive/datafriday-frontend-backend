-- Écrit à la main (comme les migrations précédentes, cf. 20260803150000_add_simulation_run) :
-- prisma/migrations/ n'est pas rejouable de façon fiable via `prisma migrate dev` dans cet
-- historique local. SQL identique à ce que Prisma aurait généré pour le modèle
-- SpaceRevenueMinuteItemAgg (schema.prisma), appliqué via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "SpaceRevenueMinuteItemAgg" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "weezeventEventId" TEXT,
    "weezeventLocationId" TEXT,
    "weezeventLocationName" TEXT,
    "weezeventMerchantId" TEXT,
    "spaceElementId" TEXT,
    "weezeventProductId" TEXT,
    "revenueHt" DECIMAL(12,2) NOT NULL,
    "transactionsCount" INTEGER NOT NULL,
    "itemsCount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceRevenueMinuteItemAgg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpaceRevenueMinuteItemAgg_tenantId_spaceId_weezeventEventI_idx" ON "SpaceRevenueMinuteItemAgg"("tenantId", "spaceId", "weezeventEventId", "minute");

-- CreateIndex
CREATE INDEX "SpaceRevenueMinuteItemAgg_tenantId_spaceId_spaceElementId__idx" ON "SpaceRevenueMinuteItemAgg"("tenantId", "spaceId", "spaceElementId", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceRevenueMinuteItemAgg_tenantId_spaceId_minute_weezeven_key" ON "SpaceRevenueMinuteItemAgg"("tenantId", "spaceId", "minute", "weezeventEventId", "weezeventLocationId", "weezeventMerchantId", "spaceElementId", "weezeventProductId");
