-- Rapport Saison — tables Season / SeasonSpace
-- (2026-08-04, demande Bertrand reunion du 04/08 : custom ranges nommes,
--  ex. « Saison 2025-2026 » du 1er juillet au 30 juin, parametres dans
--  Settings > Configuration et proposes comme presets de dates dans Analyse
--  et Predict.)
--
-- Semantique :
--   Season      = periode personnalisee nommee (dates ABSOLUES startDate /
--                 endDate), rattachee a un ENSEMBLE de Spaces via SeasonSpace,
--                 ou a tous (allSpaces = true, jointure vide — jamais de
--                 sentinelle, jamais de spaceIds JSON : ADR-0003).
--   SeasonSpace = jointure explicite saison <-> espaces.
--
-- Contrairement aux Settings HR (HrGoal), les saisons PEUVENT se chevaucher
-- sur un meme espace : « Saison 2024-2025 » et « Saison 2025-2026 » coexistent.
-- Aucune contrainte d'unicite au-dela de la cle primaire.
--
-- Application MANUELLE uniquement (ADR-0002 : jamais via la plateforme), via
-- la connexion directe : psql "$DIRECT_URL" -f backend/prisma/sql/2026-08-04_seasons.sql
-- A appliquer AVANT de deployer le module backend `seasons` (sinon P2022 -> 500).
-- Idempotent (IF NOT EXISTS) — executable plusieurs fois sans effet.

CREATE TABLE IF NOT EXISTS "Season" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate"   TIMESTAMP(3) NOT NULL,
    "allSpaces" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Season_tenantId_idx" ON "Season"("tenantId");

CREATE TABLE IF NOT EXISTS "SeasonSpace" (
    "seasonId" TEXT NOT NULL,
    "spaceId"  TEXT NOT NULL,
    CONSTRAINT "SeasonSpace_pkey" PRIMARY KEY ("seasonId", "spaceId"),
    CONSTRAINT "SeasonSpace_seasonId_fkey" FOREIGN KEY ("seasonId")
        REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeasonSpace_spaceId_fkey" FOREIGN KEY ("spaceId")
        REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SeasonSpace_seasonId_idx" ON "SeasonSpace"("seasonId");
CREATE INDEX IF NOT EXISTS "SeasonSpace_spaceId_idx" ON "SeasonSpace"("spaceId");
