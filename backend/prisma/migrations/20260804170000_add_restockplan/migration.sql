-- Écrit à la main (comme les migrations précédentes, cf. 20260804160000_add_space_revenue_minute_item_agg) :
-- SQL identique à ce que Prisma aurait généré pour le modèle RestockPlan (schema.prisma),
-- repris de prisma/sql/2026-08-04_restockplan.sql, appliqué via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "RestockPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectiveSource" TEXT NOT NULL DEFAULT 'forecast',
    "referenceEventId" TEXT,
    "selectedEventIds" TEXT[],
    "eventsSnapshot" JSONB NOT NULL DEFAULT '[]',
    "scenarioByEventId" JSONB NOT NULL DEFAULT '{}',
    "stockAdjustments" JSONB NOT NULL DEFAULT '{}',
    "stockPackedModes" JSONB NOT NULL DEFAULT '{}',
    "stockExcluded" JSONB NOT NULL DEFAULT '{}',
    "restockedRows" JSONB NOT NULL DEFAULT '{}',
    "stockLines" JSONB NOT NULL DEFAULT '[]',
    "restockLines" JSONB NOT NULL DEFAULT '[]',
    "shoppingMode" TEXT NOT NULL DEFAULT 'finished',
    "shoppingGroups" JSONB NOT NULL DEFAULT '[]',
    "recipeCoeffs" JSONB NOT NULL DEFAULT '{}',
    "lineOverrides" JSONB NOT NULL DEFAULT '{}',
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "shoppingItemCount" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestockPlan_tenantId_spaceId_updatedAt_idx" ON "RestockPlan"("tenantId", "spaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "RestockPlan_spaceId_idx" ON "RestockPlan"("spaceId");
