-- Reconstruction 2026-09-07 : "kind" existe déjà en base réelle sur InventorySnapshot,
-- ajoutée via le script manuel prisma/sql/2026-07-20_inventorysnapshot_kind.sql (cf.
-- commentaire schema.prisma) plutôt que via `prisma migrate` — jamais suivie en migration.

ALTER TABLE "InventorySnapshot" ADD COLUMN IF NOT EXISTS "kind" TEXT;
