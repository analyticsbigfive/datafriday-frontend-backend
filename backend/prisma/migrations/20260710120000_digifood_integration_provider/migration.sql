-- Intégration Digifood — migration additive (PLAN_INTEGRATION_DIGIFOOD §2)
-- 100 % additif : aucune donnée existante modifiée (hors backfill config §2.2),
-- zéro impact sur le code actuellement déployé.

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('WEEZEVENT', 'DIGIFOOD');

-- Colonne provider sur la table de config commune (backfill automatique via DEFAULT)
ALTER TABLE "WeezeventIntegration" ADD COLUMN "provider" "IntegrationProvider" NOT NULL DEFAULT 'WEEZEVENT';

-- CreateTable : détail de config 1-1 par provider
CREATE TABLE "WeezeventIntegrationConfig" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "WeezeventIntegrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigifoodIntegrationConfig" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "keyVersion" TEXT,
    "posVersion" TEXT,

    CONSTRAINT "DigifoodIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventIntegrationConfig_integrationId_key" ON "WeezeventIntegrationConfig"("integrationId");
CREATE UNIQUE INDEX "DigifoodIntegrationConfig_integrationId_key" ON "DigifoodIntegrationConfig"("integrationId");

-- AddForeignKey
ALTER TABLE "WeezeventIntegrationConfig" ADD CONSTRAINT "WeezeventIntegrationConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigifoodIntegrationConfig" ADD CONSTRAINT "DigifoodIntegrationConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill : une ligne WeezeventIntegrationConfig par intégration existante (§2.2 étape 3).
-- Les colonnes clientId/clientSecret/organizationId de WeezeventIntegration restent
-- physiquement en place (gelées, hors modèle Prisma après l'étape 2) — drop différé.
INSERT INTO "WeezeventIntegrationConfig" ("id", "integrationId", "clientId", "clientSecret", "organizationId")
SELECT gen_random_uuid()::text, "id", "clientId", "clientSecret", "organizationId"
FROM "WeezeventIntegration"
ON CONFLICT ("integrationId") DO NOTHING;

-- Colonnes provider sur les données (§2.3) — DEFAULT 'WEEZEVENT' = backfill automatique
ALTER TABLE "WeezeventTransaction" ADD COLUMN "provider" "IntegrationProvider" NOT NULL DEFAULT 'WEEZEVENT';
ALTER TABLE "WeezeventProduct" ADD COLUMN "provider" "IntegrationProvider" NOT NULL DEFAULT 'WEEZEVENT';
ALTER TABLE "WeezeventLocation" ADD COLUMN "provider" "IntegrationProvider" NOT NULL DEFAULT 'WEEZEVENT';
ALTER TABLE "WeezeventWebhookEvent" ADD COLUMN "provider" "IntegrationProvider" NOT NULL DEFAULT 'WEEZEVENT';

-- Journal webhook : id de livraison externe Digifood + dédup (§2.4)
ALTER TABLE "WeezeventWebhookEvent" ADD COLUMN "externalDeliveryId" TEXT;
CREATE UNIQUE INDEX "WeezeventWebhookEvent_integrationId_externalDeliveryId_key" ON "WeezeventWebhookEvent"("integrationId", "externalDeliveryId");

-- Index composites (§2.2, §2.3)
CREATE INDEX "WeezeventIntegration_tenantId_provider_enabled_idx" ON "WeezeventIntegration"("tenantId", "provider", "enabled");
CREATE INDEX "WeezeventTransaction_tenantId_provider_idx" ON "WeezeventTransaction"("tenantId", "provider");
CREATE INDEX "WeezeventProduct_tenantId_provider_idx" ON "WeezeventProduct"("tenantId", "provider");
