-- Auto-remplissage du Staff dans le 3D Builder à partir des règles Sinking RH
-- (2026-07-30) : ElementStaff gagne roleId (traçabilité HrRole) + source
-- ('AUTO'|'MANUAL', défaut 'MANUAL' pour les lignes déjà en base — elles sont
-- toutes manuelles à ce jour, aucune ligne AUTO n'a jamais existé). Additif,
-- aucune perte de données.

ALTER TABLE "ElementStaff" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
ALTER TABLE "ElementStaff" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';

DO $$ BEGIN
  ALTER TABLE "ElementStaff" ADD CONSTRAINT "ElementStaff_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "HrRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ElementStaff_roleId_idx" ON "ElementStaff"("roleId");
