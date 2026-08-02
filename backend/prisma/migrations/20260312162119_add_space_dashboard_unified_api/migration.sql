-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "timezone" TEXT DEFAULT 'Europe/Paris';

-- CreateTable
CREATE TABLE "WeezeventLocationSpaceMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weezeventLocationId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeezeventLocationSpaceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventMerchantElementMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weezeventMerchantId" TEXT NOT NULL,
    "spaceElementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeezeventMerchantElementMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantVatConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "defaultVatRate" DECIMAL(5,2) NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'FR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantVatConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceRevenueDailyAgg" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "weezeventEventId" TEXT,
    "weezeventLocationId" TEXT,
    "weezeventMerchantId" TEXT,
    "spaceElementId" TEXT,
    "revenueHt" DECIMAL(12,2) NOT NULL,
    "transactionsCount" INTEGER NOT NULL,
    "itemsCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceRevenueDailyAgg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceProductRevenueDailyAgg" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "weezeventProductId" TEXT NOT NULL,
    "revenueHt" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceProductRevenueDailyAgg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceDashboardVersion" (
    "spaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceDashboardVersion_pkey" PRIMARY KEY ("spaceId")
);

-- CreateTable
CREATE TABLE "AggregationJobLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "transactionsProcessed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregationJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmappedDataMetrics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "revenueHt" DECIMAL(12,2) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmappedDataMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeezeventLocationSpaceMapping_tenantId_spaceId_idx" ON "WeezeventLocationSpaceMapping"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "WeezeventLocationSpaceMapping_weezeventLocationId_idx" ON "WeezeventLocationSpaceMapping"("weezeventLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventLocationSpaceMapping_tenantId_weezeventLocationId_key" ON "WeezeventLocationSpaceMapping"("tenantId", "weezeventLocationId");

-- CreateIndex
CREATE INDEX "WeezeventMerchantElementMapping_tenantId_spaceElementId_idx" ON "WeezeventMerchantElementMapping"("tenantId", "spaceElementId");

-- CreateIndex
CREATE INDEX "WeezeventMerchantElementMapping_weezeventMerchantId_idx" ON "WeezeventMerchantElementMapping"("weezeventMerchantId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventMerchantElementMapping_tenantId_weezeventMerchantI_key" ON "WeezeventMerchantElementMapping"("tenantId", "weezeventMerchantId");

-- CreateIndex
CREATE INDEX "TenantVatConfig_tenantId_idx" ON "TenantVatConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantVatConfig_tenantId_effectiveFrom_key" ON "TenantVatConfig"("tenantId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SpaceRevenueDailyAgg_tenantId_spaceId_day_idx" ON "SpaceRevenueDailyAgg"("tenantId", "spaceId", "day");

-- CreateIndex
CREATE INDEX "SpaceRevenueDailyAgg_tenantId_spaceId_spaceElementId_day_idx" ON "SpaceRevenueDailyAgg"("tenantId", "spaceId", "spaceElementId", "day");

-- CreateIndex
CREATE INDEX "SpaceRevenueDailyAgg_tenantId_spaceId_weezeventLocationId_d_idx" ON "SpaceRevenueDailyAgg"("tenantId", "spaceId", "weezeventLocationId", "day");

-- CreateIndex
CREATE INDEX "SpaceRevenueDailyAgg_tenantId_spaceId_weezeventMerchantId_d_idx" ON "SpaceRevenueDailyAgg"("tenantId", "spaceId", "weezeventMerchantId", "day");

-- CreateIndex
CREATE INDEX "SpaceRevenueDailyAgg_tenantId_spaceId_weezeventEventId_day_idx" ON "SpaceRevenueDailyAgg"("tenantId", "spaceId", "weezeventEventId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceRevenueDailyAgg_tenantId_spaceId_day_weezeventEventId__key" ON "SpaceRevenueDailyAgg"("tenantId", "spaceId", "day", "weezeventEventId", "weezeventLocationId", "weezeventMerchantId", "spaceElementId");

-- CreateIndex
CREATE INDEX "SpaceProductRevenueDailyAgg_tenantId_spaceId_day_idx" ON "SpaceProductRevenueDailyAgg"("tenantId", "spaceId", "day");

-- CreateIndex
CREATE INDEX "SpaceProductRevenueDailyAgg_tenantId_spaceId_weezeventProdu_idx" ON "SpaceProductRevenueDailyAgg"("tenantId", "spaceId", "weezeventProductId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceProductRevenueDailyAgg_tenantId_spaceId_day_weezeventP_key" ON "SpaceProductRevenueDailyAgg"("tenantId", "spaceId", "day", "weezeventProductId");

-- CreateIndex
CREATE INDEX "SpaceDashboardVersion_tenantId_idx" ON "SpaceDashboardVersion"("tenantId");

-- CreateIndex
CREATE INDEX "AggregationJobLog_tenantId_status_startedAt_idx" ON "AggregationJobLog"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "AggregationJobLog_spaceId_status_idx" ON "AggregationJobLog"("spaceId", "status");

-- CreateIndex
CREATE INDEX "AggregationJobLog_status_startedAt_idx" ON "AggregationJobLog"("status", "startedAt");

-- CreateIndex
CREATE INDEX "UnmappedDataMetrics_tenantId_entityType_idx" ON "UnmappedDataMetrics"("tenantId", "entityType");

-- CreateIndex
CREATE INDEX "UnmappedDataMetrics_lastSeenAt_idx" ON "UnmappedDataMetrics"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnmappedDataMetrics_tenantId_entityType_entityId_key" ON "UnmappedDataMetrics"("tenantId", "entityType", "entityId");
