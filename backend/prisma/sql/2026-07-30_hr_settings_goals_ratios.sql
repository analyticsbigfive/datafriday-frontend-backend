-- Settings RH — tables HrGoal / HrGoalSpace / HrStaffRatio / HrStaffRatioSpace
-- (2026-07-30, branche feat/Hr)
--
-- Pourquoi : le commit 56297d8 (« feat(hr-settings): backend Settings HR ») a
-- ajouté les 4 modèles dans prisma/schema.prisma:542-591 SANS script SQL joint.
-- Comme prisma/migrations/ est gitignoré (.gitignore:47-48), le
-- `npx prisma migrate deploy` du startCommand Render est un no-op silencieux
-- (ADR-0002) : les tables n'ont donc
-- jamais été créées sur aucun environnement. Conséquence observée :
-- POST /events/:id/staffing/generate et les endpoints /hr-settings/* échouent
-- (relation inexistante) alors que le code, lui, est déployé.
--
-- Sémantique :
--   HrGoal            = objectif de CA par TPE (devise), rattaché à un ENSEMBLE
--                       de Spaces via HrGoalSpace, ou à tous (allSpaces = true).
--                       Lu par staffing.service.ts resolveSettings() → goalTpe,
--                       base de n = FLOOR(caPredictif / goalTpe) (spec §10.1).
--   HrGoalSpace       = jointure explicite goal ↔ espaces (jamais de spaceIds
--                       JSON — colonne gelée, ADR-0003).
--   HrStaffRatio      = nombre de staff par Responsable de zone (entier),
--                       même schéma de rattachement. Base de
--                       rz = CEIL(Σ front / staffPerZoneManager).
--   HrStaffRatioSpace = jointure ratio ↔ espaces.
--
-- Règle de résolution (§9.4, hypothèse non tranchée — questions #35 / #41) :
-- une ligne dont l'espace est listé prime sur une ligne allSpaces ; à égalité,
-- la plus récente (createdAt DESC) gagne.
--
-- Aucun ALTER TABLE : ElementPerformance.staffCost existe déjà en base
-- (double precision), il n'a pas besoin d'être ajouté ici.
--
-- Application MANUELLE uniquement (ADR-0002 : jamais via la plateforme).
-- Idempotent (IF NOT EXISTS) — exécutable plusieurs fois sans effet. À lancer
-- APRÈS 2026-07-29_hr_staffing_module.sql, puis `npx prisma generate`.

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
