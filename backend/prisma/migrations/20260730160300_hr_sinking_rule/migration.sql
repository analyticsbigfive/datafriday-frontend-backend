-- STF-2 "Sinking RH" : dotation conditionnelle par rôle × sous-type FNB.
-- Ex. Kitchen Food + friteuse → Chef de partie obligatoire ; bain-marie seul → EPR
-- uniquement (backlog STF-2, 2026-07-30). Doit s'exécuter APRÈS
-- 20260730160000_hr_staffing_module (FK vers HrRole).
-- Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "HrSinkingRule" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "roleId"             TEXT NOT NULL,
    "fnbCategory"        TEXT NOT NULL,
    "conditionAttribute" TEXT,
    "conditionMinValue"  DOUBLE PRECISION,
    "mandatoryQty"       INTEGER NOT NULL DEFAULT 1,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrSinkingRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrSinkingRule_roleId_fkey" FOREIGN KEY ("roleId")
        REFERENCES "HrRole"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrSinkingRule_tenantId_roleId_fnbCategory_conditionAttribute_key"
    ON "HrSinkingRule"("tenantId", "roleId", "fnbCategory", "conditionAttribute") NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS "HrSinkingRule_tenantId_idx" ON "HrSinkingRule"("tenantId");
CREATE INDEX IF NOT EXISTS "HrSinkingRule_roleId_idx" ON "HrSinkingRule"("roleId");
