-- BUG : commit c02c8ea8 (2026-09-09) a ajouté numberOfTpe/numberOfCollaborators au
-- schéma Prisma sans générer de migration, cassant en 500 tout GET /events en
-- production (colonne absente en base). Migration rattrapée a posteriori.

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "numberOfTpe" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "numberOfCollaborators" INTEGER;
