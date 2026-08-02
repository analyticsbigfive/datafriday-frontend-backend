-- Décision : frontend.docs/QUESTIONS_A_BERTRAND.md #1 (résolu 2026-07-16) — aligner le backend
-- sur le front, qui rend déjà email/phone/address/city/postcode/contactName obligatoires.
--
-- Backfill des lignes existantes avant la contrainte NOT NULL (voir CONTRIBUTING.md §"Corriger un
-- bug", point 3 : un fix qui ne corrige que les nouvelles écritures laisse les anciennes en
-- violation). Au 2026-07-16 : 3 lignes avec tel NULL, 6 avec address NULL, 4 avec city NULL,
-- 6 avec postcode NULL, 3 avec contactName NULL (email : aucune).
UPDATE "Supplier" SET "email" = '' WHERE "email" IS NULL;
UPDATE "Supplier" SET "tel" = '' WHERE "tel" IS NULL;
UPDATE "Supplier" SET "address" = '' WHERE "address" IS NULL;
UPDATE "Supplier" SET "city" = '' WHERE "city" IS NULL;
UPDATE "Supplier" SET "postcode" = '' WHERE "postcode" IS NULL;
UPDATE "Supplier" SET "contactName" = '' WHERE "contactName" IS NULL;

-- AlterTable
ALTER TABLE "Supplier"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "tel" SET NOT NULL,
  ALTER COLUMN "address" SET NOT NULL,
  ALTER COLUMN "city" SET NOT NULL,
  ALTER COLUMN "postcode" SET NOT NULL,
  ALTER COLUMN "contactName" SET NOT NULL;
