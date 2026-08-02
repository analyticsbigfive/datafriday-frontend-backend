-- CreateTable
CREATE TABLE "WeezeventIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "organizationId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeezeventIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeezeventIntegration_tenantId_idx" ON "WeezeventIntegration"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventIntegration_tenantId_enabled_idx" ON "WeezeventIntegration"("tenantId", "enabled");

-- AddForeignKey
ALTER TABLE "WeezeventIntegration" ADD CONSTRAINT "WeezeventIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate any existing single-instance Weezevent config from Tenant rows
INSERT INTO "WeezeventIntegration" ("id", "tenantId", "name", "clientId", "clientSecret", "organizationId", "enabled", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    'Weezevent',
    "weezeventClientId",
    "weezeventClientSecret",
    "weezeventOrganizationId",
    COALESCE("weezeventEnabled", false),
    "createdAt",
    CURRENT_TIMESTAMP
FROM "Tenant"
WHERE "weezeventClientId" IS NOT NULL
  AND "weezeventClientSecret" IS NOT NULL;
