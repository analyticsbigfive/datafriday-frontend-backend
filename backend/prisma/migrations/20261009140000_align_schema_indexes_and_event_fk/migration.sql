-- Alignement base <-> schema.prisma (dérive constatée le 2026-10-02 par `prisma migrate diff`) :
-- schema.prisma déclarait ces 3 index et cette clé étrangère sans migration correspondante,
-- donc ils n'existent ni en production ni sur une base créée depuis les migrations.
-- Partie additive uniquement. Les colonnes héritées encore présentes en base
-- (MenuItem.spaceIds/spacePrices, WeezeventIntegration.clientId/clientSecret/organizationId)
-- contiennent des données et ne sont PAS supprimées ici (décision à prendre, cf. plan D0).
--
-- Production : créer les index CONCURRENTLY à la main, puis marquer la migration appliquée :
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ... (les 3 ci-dessous)
--   puis exécuter la contrainte et le renommage tels quels (Event : ~800 lignes, 0 orphelin vérifié)
--   npx prisma migrate resolve --applied 20261009140000_align_schema_indexes_and_event_fk

CREATE INDEX IF NOT EXISTS "Ingredient_tenantId_deletedAt_idx" ON "Ingredient"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "MenuItem_tenantId_deletedAt_idx" ON "MenuItem"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Packaging_tenantId_deletedAt_idx" ON "Packaging"("tenantId", "deletedAt");

ALTER TABLE "Event" ADD CONSTRAINT "Event_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nom tronqué à 63 caractères différemment par Postgres et par Prisma.
ALTER INDEX IF EXISTS "HrSinkingRule_tenantId_roleId_fnbCategory_conditionAttribute_ke"
  RENAME TO "HrSinkingRule_tenantId_roleId_fnbCategory_conditionAttribut_key";
ALTER INDEX IF EXISTS "uniq_kv_store" RENAME TO "KvStore_tenantId_key_key";
ALTER INDEX IF EXISTS "SalesPriceAgg_tenantId_locationId_productId_itemWeezeven_key"
  RENAME TO "SalesPriceAgg_tenantId_locationId_productId_itemWeezeventId_key";
ALTER INDEX IF EXISTS "SpaceRevenueMinuteItemAgg_tenantId_spaceId_minute_weezeven_key"
  RENAME TO "SpaceRevenueMinuteItemAgg_tenantId_spaceId_minute_weezevent_key";
ALTER INDEX IF EXISTS "SpaceRevenueMinuteItemAgg_tenantId_spaceId_spaceElementId__idx"
  RENAME TO "SpaceRevenueMinuteItemAgg_tenantId_spaceId_spaceElementId_m_idx";
ALTER INDEX IF EXISTS "SpaceRevenueMinuteItemAgg_tenantId_spaceId_weezeventEventI_idx"
  RENAME TO "SpaceRevenueMinuteItemAgg_tenantId_spaceId_weezeventEventId_idx";
