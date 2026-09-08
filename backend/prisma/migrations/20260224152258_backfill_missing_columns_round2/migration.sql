-- Reconstruction 2026-09-07 (round 2) : colonnes/nullabilité existant déjà en base réelle
-- (vérifié via information_schema, comparé à un rejeu local complet de l'historique) mais
-- jamais capturées par une migration — même cause que les reconstructions précédentes de
-- cette passe (ajouts/altérations probables via `prisma db push`). Toutes vérifiées contre
-- la vraie base avant écriture, aucune valeur devinée.

-- Config : deux colonnes jamais migrées.
ALTER TABLE "Config" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Config" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- Event : trois colonnes jamais migrées (isSimulated déjà documentée dans schema.prisma
-- comme flag de l'outil QA "simuler une vente").
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "isSimulated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "ticketsScanned" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "ticketsSold" INTEGER;

-- InventorySnapshot.kind : voir 20260618100001_add_inventory_snapshot_kind (la table
-- InventorySnapshot n'existe pas encore à ce point de l'historique).

-- MarketPrice : numberOfUnits/packedUnits/unitsPerPurchase créées INTEGER dans 0_init,
-- élargies en DOUBLE PRECISION en réalité (permet des conditionnements fractionnaires) sans
-- migration ; purchasePackaging jamais ajoutée du tout.
ALTER TABLE "MarketPrice" ALTER COLUMN "numberOfUnits" TYPE DOUBLE PRECISION USING "numberOfUnits"::double precision;
ALTER TABLE "MarketPrice" ALTER COLUMN "packedUnits" TYPE DOUBLE PRECISION USING "packedUnits"::double precision;
ALTER TABLE "MarketPrice" ALTER COLUMN "unitsPerPurchase" TYPE DOUBLE PRECISION USING "unitsPerPurchase"::double precision;
ALTER TABLE "MarketPrice" ADD COLUMN IF NOT EXISTS "purchasePackaging" TEXT;

-- WeezeventTransaction.deletedAt : soft-delete, lu par 20260824120000_fix_transactions_count
-- et d'autres requêtes manuelles, jamais migrée (même cause).
ALTER TABLE "WeezeventTransaction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WeezeventTransaction_deletedAt_idx" ON "WeezeventTransaction"("deletedAt");

-- MenuItem : typeId/categoryId rendues NOT NULL par 20260224152257_update (juste avant celle-ci
-- dans l'historique), repassées nullable en réalité (cohérent avec schema.prisma actuel : FK
-- "optional") sans migration.
ALTER TABLE "MenuItem" ALTER COLUMN "typeId" DROP NOT NULL;
ALTER TABLE "MenuItem" ALTER COLUMN "categoryId" DROP NOT NULL;
