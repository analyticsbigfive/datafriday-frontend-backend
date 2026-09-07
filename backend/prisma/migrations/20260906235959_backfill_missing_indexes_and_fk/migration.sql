-- Reconstruction 2026-09-07 (round 3, détectée par `prisma migrate dev` lui-même via son
-- diagnostic de drift structurel) : index et comportement de FK existant déjà en base réelle
-- mais jamais capturés en migration — même cause que les reconstructions précédentes (ajouts
-- probables via `prisma db push`). Vérifié colonne par colonne / index par index contre la
-- vraie base avant écriture (pg_indexes, pg_constraint), aucune valeur devinée. Idempotent.

CREATE INDEX IF NOT EXISTS "EventPredictVersion_tenantId_eventId_idx" ON "EventPredictVersion"("tenantId", "eventId");

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCount_tenantId_spaceId_eventId_shopId_itemId_key" ON "InventoryCount"("tenantId", "spaceId", "eventId", "shopId", "itemId") NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS "InventoryCount_tenantId_spaceId_updatedAt_idx" ON "InventoryCount"("tenantId", "spaceId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "MenuAssignment_elementId_enabled_idx" ON "MenuAssignment"("elementId", "enabled");

CREATE INDEX IF NOT EXISTS "SpaceElement_floorId_type_idx" ON "SpaceElement"("floorId", "type");
CREATE INDEX IF NOT EXISTS "SpaceElement_forecourtId_type_idx" ON "SpaceElement"("forecourtId", "type");

-- WeezeventTransaction : l'unicité (tenantId, weezeventId) a été élargie à
-- (tenantId, integrationId, weezeventId) en réalité (cohérent avec l'ajout d'integrationId,
-- cf. WeezeventTransaction_integrationId_fkey), sans migration suivie.
DROP INDEX IF EXISTS "WeezeventTransaction_tenantId_weezeventId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "WeezeventTransaction_tenantId_integrationId_weezeventId_key" ON "WeezeventTransaction"("tenantId", "integrationId", "weezeventId");
CREATE INDEX IF NOT EXISTS "WeezeventTransaction_tenantId_integrationId_transactionDate_idx" ON "WeezeventTransaction"("tenantId", "integrationId", "transactionDate");
CREATE INDEX IF NOT EXISTS "WeezeventTransaction_tenantId_locationId_transactionDate_idx" ON "WeezeventTransaction"("tenantId", "locationId", "transactionDate");

-- MenuItem.typeId/categoryId : 20260224152257_update les était passées en ON DELETE RESTRICT ;
-- repassées ON DELETE SET NULL en réalité (cohérent avec le retour à la nullabilité optionnelle
-- déjà corrigé dans 20260224152258_backfill_missing_columns_round2), sans migration suivie.
-- DROP puis ADD est naturellement idempotent (pas besoin de bloc DO/exception) : un rejeu
-- ne fait que recréer la même contrainte à l'identique.
ALTER TABLE "MenuItem" DROP CONSTRAINT IF EXISTS "MenuItem_typeId_fkey";
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MenuItem" DROP CONSTRAINT IF EXISTS "MenuItem_categoryId_fkey";
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
