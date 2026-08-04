-- RestockPlan — historique des plans de réapprovisionnement nommés (scope ESPACE)
-- 2026-08-04, demande owner JLH : « les plans de réapprovisionnement ne sont pas
-- sauvegardés, ce qui empêche les modifications et le suivi ».
--
-- Pourquoi une table de plus : « RestockState » est UNE ligne par (tenantId, spaceId),
-- écrasée à chaque frappe — elle porte la SESSION courante, jamais un historique.
-- « RestockPlan » porte des DOCUMENTS FIGÉS nommés : stockLines / restockLines /
-- shoppingGroups sont la photo des lignes calculées au moment de la sauvegarde,
-- pour qu'un plan validé la semaine dernière réaffiche les mêmes chiffres même si
-- prédictions, prix ou recettes ont changé depuis.
-- Décision : docs/adr/0005_restockplan_document_fige_vs_restockstate_session.md
--
-- Application MANUELLE uniquement (ADR-0002 : aucune migration via la plateforme,
-- « prisma migrate deploy » est un no-op silencieux ici).
--   psql "$DIRECT_URL" -f backend/prisma/sql/2026-08-04_restockplan.sql
-- ⚠ À lancer AVANT de déployer le backend qui référence le modèle : sinon le
--   premier appel renvoie un 500 (P2021 « table does not exist ») — exactement le
--   scénario de la fiche 248-01. Puis : npx prisma generate.
--
-- Idempotent (IF NOT EXISTS) : rejouable sans effet.
-- Vérification : SELECT to_regclass('"RestockPlan"');  → non NULL

CREATE TABLE IF NOT EXISTS "RestockPlan" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "spaceId"           TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    -- Entrées (rejouées au détachement du plan)
    "objectiveSource"   TEXT NOT NULL DEFAULT 'forecast',
    "referenceEventId"  TEXT,
    "selectedEventIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "eventsSnapshot"    JSONB NOT NULL DEFAULT '[]',
    "scenarioByEventId" JSONB NOT NULL DEFAULT '{}',
    "stockAdjustments"  JSONB NOT NULL DEFAULT '{}',
    "stockPackedModes"  JSONB NOT NULL DEFAULT '{}',
    "stockExcluded"     JSONB NOT NULL DEFAULT '{}',
    "restockedRows"     JSONB NOT NULL DEFAULT '{}',
    -- Photo figée des 3 étapes
    "stockLines"        JSONB NOT NULL DEFAULT '[]',
    "restockLines"      JSONB NOT NULL DEFAULT '[]',
    "shoppingMode"      TEXT NOT NULL DEFAULT 'finished',
    "shoppingGroups"    JSONB NOT NULL DEFAULT '[]',
    "recipeCoeffs"      JSONB NOT NULL DEFAULT '{}',
    "lineOverrides"     JSONB NOT NULL DEFAULT '{}',
    -- Compteurs dénormalisés (au moment de la photo)
    "lineCount"         INTEGER NOT NULL DEFAULT 0,
    "shoppingItemCount" INTEGER NOT NULL DEFAULT 0,
    "meta"              JSONB,
    "createdBy"         TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestockPlan_pkey" PRIMARY KEY ("id")
);

-- Couvre la liste : where { tenantId, spaceId } orderBy updatedAt desc.
CREATE INDEX IF NOT EXISTS "RestockPlan_tenantId_spaceId_updatedAt_idx"
    ON "RestockPlan"("tenantId", "spaceId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "RestockPlan_spaceId_idx"
    ON "RestockPlan"("spaceId");

-- Pas d'unicité sur (tenantId, spaceId, name) : « Dupliquer » créerait un conflit,
-- et EventPredictVersion — le pattern de référence — n'en a pas non plus.
