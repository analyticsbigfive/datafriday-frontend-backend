-- Déploiement du script manuel prisma/sql/2026-07-30_hr_settings_goals_ratios.sql
-- (jamais appliqué jusqu'ici, cf. ADR-0002). Contenu identique au script source,
-- copié tel quel pour entrer dans l'historique _prisma_migrations. À exécuter
-- APRÈS 20260730160000_hr_staffing_module. Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "HrGoal" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "goalPerTpe" DOUBLE PRECISION NOT NULL,
    "allSpaces"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HrGoal_tenantId_idx" ON "HrGoal"("tenantId");

CREATE TABLE IF NOT EXISTS "HrGoalSpace" (
    "goalId"  TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    CONSTRAINT "HrGoalSpace_pkey" PRIMARY KEY ("goalId", "spaceId"),
    CONSTRAINT "HrGoalSpace_goalId_fkey" FOREIGN KEY ("goalId")
        REFERENCES "HrGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrGoalSpace_spaceId_fkey" FOREIGN KEY ("spaceId")
        REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "HrGoalSpace_goalId_idx" ON "HrGoalSpace"("goalId");
CREATE INDEX IF NOT EXISTS "HrGoalSpace_spaceId_idx" ON "HrGoalSpace"("spaceId");

CREATE TABLE IF NOT EXISTS "HrStaffRatio" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "staffPerZoneManager" INTEGER NOT NULL,
    "allSpaces"           BOOLEAN NOT NULL DEFAULT false,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrStaffRatio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HrStaffRatio_tenantId_idx" ON "HrStaffRatio"("tenantId");

CREATE TABLE IF NOT EXISTS "HrStaffRatioSpace" (
    "ratioId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    CONSTRAINT "HrStaffRatioSpace_pkey" PRIMARY KEY ("ratioId", "spaceId"),
    CONSTRAINT "HrStaffRatioSpace_ratioId_fkey" FOREIGN KEY ("ratioId")
        REFERENCES "HrStaffRatio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrStaffRatioSpace_spaceId_fkey" FOREIGN KEY ("spaceId")
        REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "HrStaffRatioSpace_ratioId_idx" ON "HrStaffRatioSpace"("ratioId");
CREATE INDEX IF NOT EXISTS "HrStaffRatioSpace_spaceId_idx" ON "HrStaffRatioSpace"("spaceId");
