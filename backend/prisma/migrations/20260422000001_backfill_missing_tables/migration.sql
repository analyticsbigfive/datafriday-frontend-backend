-- Reconstruction 2026-09-07 : 4 tables existent dans la vraie base (probablement créées
-- via `prisma db push` avant l'adoption de `migrate`) mais n'ont jamais eu de migration
-- correspondante dans ce dépôt — ExternalMerch, SpaceRevenueMinuteAgg, WeezeventSyncJob,
-- WeezeventSyncChunk (vérifié par recherche exhaustive : aucun CREATE TABLE ni RENAME les
-- concernant dans prisma/migrations/*). Sans ce fichier, `prisma migrate dev` échoue au
-- rejeu de l'historique sur la shadow database (P3006/P1014 dès qu'une migration ultérieure
-- référence l'une de ces tables). DDL exact récupéré par `pg_dump --schema-only` sur la base
-- réelle (Supabase) — pas de colonnes/contraintes reconstruites à la main.
--
-- Entièrement idempotent (IF NOT EXISTS partout, contraintes nommées dans des blocs DO qui
-- avalent `duplicate_object`) : sans effet sur une base qui a déjà ces tables (le cas de la
-- vraie base aujourd'hui), crée tout proprement sur une base neuve (shadow DB, CI, nouvel
-- environnement).

-- ── ExternalMerch (Builder v1 : zone "merch externe", dépend de Config) ──────────────────

CREATE TABLE IF NOT EXISTS "ExternalMerch" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExternalMerch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalMerch_configId_key" ON "ExternalMerch"("configId");

DO $$ BEGIN
    ALTER TABLE "ExternalMerch" ADD CONSTRAINT "ExternalMerch_configId_fkey"
        FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── SpaceRevenueMinuteAgg (agrégat minute revenue Weezevent) ─────────────────────────────

CREATE TABLE IF NOT EXISTS "SpaceRevenueMinuteAgg" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "weezeventEventId" TEXT,
    "weezeventLocationId" TEXT,
    "spaceElementId" TEXT,
    "revenueHt" DECIMAL(12,2) NOT NULL,
    "transactionsCount" INTEGER NOT NULL,
    "itemsCount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "weezeventMerchantId" TEXT,
    -- "integrationId" volontairement PAS incluse ici : ajoutée par la migration
    -- (déjà présente et correcte) 20260814170000_add_integrationid_space_revenue_agg,
    -- postérieure à celle-ci — l'ajouter ici en doublerait la création lors du rejeu.

    CONSTRAINT "SpaceRevenueMinuteAgg_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SpaceRevenueMinuteAgg_tenantId_spaceId_minute_idx" ON "SpaceRevenueMinuteAgg"("tenantId", "spaceId", "minute");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaceRevenueMinuteAgg_tenantId_spaceId_minute_weezeventEven_key" ON "SpaceRevenueMinuteAgg"("tenantId", "spaceId", "minute", "weezeventEventId", "weezeventLocationId", "weezeventMerchantId", "spaceElementId");
CREATE INDEX IF NOT EXISTS "SpaceRevenueMinuteAgg_tenantId_spaceId_spaceElementId_minut_idx" ON "SpaceRevenueMinuteAgg"("tenantId", "spaceId", "spaceElementId", "minute");
CREATE INDEX IF NOT EXISTS "SpaceRevenueMinuteAgg_tenantId_spaceId_weezeventEventId_min_idx" ON "SpaceRevenueMinuteAgg"("tenantId", "spaceId", "weezeventEventId", "minute");
CREATE INDEX IF NOT EXISTS "SpaceRevenueMinuteAgg_tenantId_spaceId_weezeventLocationId__idx" ON "SpaceRevenueMinuteAgg"("tenantId", "spaceId", "weezeventLocationId", "minute");

-- ── WeezeventSyncJob / WeezeventSyncChunk (import historique par lots) ───────────────────

CREATE TABLE IF NOT EXISTS "WeezeventSyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalCollected" INTEGER NOT NULL DEFAULT 0,
    "totalInserted" INTEGER NOT NULL DEFAULT 0,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "processedChunks" INTEGER NOT NULL DEFAULT 0,
    "collectDone" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WeezeventSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WeezeventSyncJob_integrationId_status_idx" ON "WeezeventSyncJob"("integrationId", "status");
CREATE INDEX IF NOT EXISTS "WeezeventSyncJob_tenantId_integrationId_idx" ON "WeezeventSyncJob"("tenantId", "integrationId");

DO $$ BEGIN
    ALTER TABLE "WeezeventSyncJob" ADD CONSTRAINT "WeezeventSyncJob_integrationId_fkey"
        FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WeezeventSyncChunk" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,

    CONSTRAINT "WeezeventSyncChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WeezeventSyncChunk_jobId_status_idx" ON "WeezeventSyncChunk"("jobId", "status");

DO $$ BEGIN
    ALTER TABLE "WeezeventSyncChunk" ADD CONSTRAINT "WeezeventSyncChunk_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "WeezeventSyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
