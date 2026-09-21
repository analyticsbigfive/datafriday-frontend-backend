-- Paniers pré-agrégés (Analyse) : grain event × minute × PdV × composition (productKeys).
-- Écrite par les deux pipelines d'agrégation (rebuild complet, live à la minute), lue par
-- getTransactionBasketsBatch à la place des transactions brutes.
CREATE TABLE "SpaceBasketMinuteAgg" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "weezeventEventId" TEXT NOT NULL,
    "weezeventLocationId" TEXT,
    "weezeventLocationName" TEXT,
    "spaceElementId" TEXT,
    "integrationId" TEXT,
    "productKeys" TEXT[],
    "transactionsCount" INTEGER NOT NULL,
    "itemsQuantity" DOUBLE PRECISION NOT NULL,
    "revenueHt" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceBasketMinuteAgg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpaceBasketMinuteAgg_key" ON "SpaceBasketMinuteAgg"("tenantId", "spaceId", "minute", "weezeventEventId", "weezeventLocationId", "spaceElementId", "productKeys");
CREATE INDEX "SpaceBasketMinuteAgg_tenant_space_event_minute_idx" ON "SpaceBasketMinuteAgg"("tenantId", "spaceId", "weezeventEventId", "minute");
CREATE INDEX "SpaceBasketMinuteAgg_tenant_space_integration_idx" ON "SpaceBasketMinuteAgg"("tenantId", "spaceId", "integrationId");
