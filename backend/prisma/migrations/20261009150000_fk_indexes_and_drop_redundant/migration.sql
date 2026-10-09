-- D1/D2 (plan de remédiation backend, 2026-10-02), mesuré en lecture seule sur la production.
-- D2 : index sur les 10 clés étrangères qui n'en avaient pas (suppression ou mise à jour d'un parent
--      = parcours complet de la table enfant).
-- D1 : suppression de 79 index non uniques couverts par un index plus large ou une contrainte
--      unique commençant par les mêmes colonnes (130 Mo en production, coût à chaque écriture).
--      Conservés volontairement : WeezeventTransactionItem_transactionId_idx (1,5 milliard de
--      lectures, l'index couvrant est 3,4 fois plus gros) et
--      WeezeventTransaction_tenantId_integrationId_status_transactionD (à mesurer d'abord).
--      Les trois index [tenantId] d'Ingredient, MenuItem et Packaging ne sont redondants qu'après
--      la migration 20261009140000 (qui crée les index [tenantId, deletedAt]) : ordre à respecter.
--
-- Production : jouer ces ordres à la main en CONCURRENTLY (hors transaction, hors match), puis
--   npx prisma migrate resolve --applied 20261009150000_fk_indexes_and_drop_redundant
-- Sinon, le DROP INDEX simple prend un verrou exclusif bref sur chaque table.

CREATE INDEX IF NOT EXISTS "UserPinnedSpace_spaceId_idx" ON "UserPinnedSpace"("spaceId");
CREATE INDEX IF NOT EXISTS "HrPerson_roleId_idx" ON "HrPerson"("roleId");
CREATE INDEX IF NOT EXISTS "EventStaffLine_supplierId_idx" ON "EventStaffLine"("supplierId");
CREATE INDEX IF NOT EXISTS "EventStaffLine_personId_idx" ON "EventStaffLine"("personId");
CREATE INDEX IF NOT EXISTS "ElementMenuItemSalesInput_configId_idx" ON "ElementMenuItemSalesInput"("configId");
CREATE INDEX IF NOT EXISTS "WeezeventUser_walletId_idx" ON "WeezeventUser"("walletId");
CREATE INDEX IF NOT EXISTS "DigifoodCsvImportRun_integrationId_idx" ON "DigifoodCsvImportRun"("integrationId");
CREATE INDEX IF NOT EXISTS "Ingredient_marketPriceId_idx" ON "Ingredient"("marketPriceId");
CREATE INDEX IF NOT EXISTS "Packaging_marketPriceId_idx" ON "Packaging"("marketPriceId");
CREATE INDEX IF NOT EXISTS "WeezeventLocationShopMapping_spaceElementId_idx" ON "WeezeventLocationShopMapping"("spaceElementId");

DROP INDEX IF EXISTS "Brand_tenantId_idx";
DROP INDEX IF EXISTS "ComponentCategory_tenantId_idx";
DROP INDEX IF EXISTS "ComponentComponent_parentId_idx";
DROP INDEX IF EXISTS "ComponentIngredient_componentId_idx";
DROP INDEX IF EXISTS "ComponentType_tenantId_idx";
DROP INDEX IF EXISTS "DisplayName_tenantId_idx";
DROP INDEX IF EXISTS "ElementMenuItemSalesInput_elementId_configId_idx";
DROP INDEX IF EXISTS "ElementPerformance_elementId_idx";
DROP INDEX IF EXISTS "EventCategory_tenantId_idx";
DROP INDEX IF EXISTS "EventPredictVersion_tenantId_idx";
DROP INDEX IF EXISTS "EventSubcategory_tenantId_idx";
DROP INDEX IF EXISTS "EventType_tenantId_idx";
DROP INDEX IF EXISTS "Event_spaceId_idx";
DROP INDEX IF EXISTS "HrGoalSpace_goalId_idx";
DROP INDEX IF EXISTS "HrRoleSupplier_roleId_idx";
DROP INDEX IF EXISTS "HrRole_tenantId_idx";
DROP INDEX IF EXISTS "HrSinkingRule_tenantId_idx";
DROP INDEX IF EXISTS "HrStaffRatioSpace_ratioId_idx";
DROP INDEX IF EXISTS "HrSupplier_tenantId_idx";
DROP INDEX IF EXISTS "Industrial_tenantId_idx";
DROP INDEX IF EXISTS "Ingredient_tenantId_idx";
DROP INDEX IF EXISTS "InventoryCount_tenantId_idx";
DROP INDEX IF EXISTS "KvStore_tenantId_idx";
DROP INDEX IF EXISTS "MarketPriceCategory_tenantId_idx";
DROP INDEX IF EXISTS "MarketPriceType_tenantId_idx";
DROP INDEX IF EXISTS "MenuAssignment_elementId_idx";
DROP INDEX IF EXISTS "MenuAssignment_stationId_idx";
DROP INDEX IF EXISTS "MenuItemCombo_parentId_idx";
DROP INDEX IF EXISTS "MenuItemComponent_menuItemId_idx";
DROP INDEX IF EXISTS "MenuItemHistoryAlias_tenantId_spaceId_idx";
DROP INDEX IF EXISTS "MenuItemIngredient_menuItemId_idx";
DROP INDEX IF EXISTS "MenuItemPackaging_menuItemId_idx";
DROP INDEX IF EXISTS "MenuItem_tenantId_idx";
DROP INDEX IF EXISTS "Menu_spaceId_idx";
DROP INDEX IF EXISTS "Packaging_tenantId_idx";
DROP INDEX IF EXISTS "PackingType_tenantId_idx";
DROP INDEX IF EXISTS "Permission_tenantId_idx";
DROP INDEX IF EXISTS "ProductCategory_tenantId_idx";
DROP INDEX IF EXISTS "ProductType_tenantId_idx";
DROP INDEX IF EXISTS "PromotionType_tenantId_idx";
DROP INDEX IF EXISTS "Promotion_menuItemId_idx";
DROP INDEX IF EXISTS "RestockState_tenantId_idx";
DROP INDEX IF EXISTS "Role_tenantId_idx";
DROP INDEX IF EXISTS "SalesPriceAgg_tenantId_locationId_productId_idx";
DROP INDEX IF EXISTS "SeasonSpace_seasonId_idx";
DROP INDEX IF EXISTS "SpaceElement_floorId_idx";
DROP INDEX IF EXISTS "SpaceElement_forecourtId_idx";
DROP INDEX IF EXISTS "SpaceElement_zoneId_idx";
DROP INDEX IF EXISTS "SpaceProductRevenueDailyAgg_tenantId_spaceId_day_idx";
DROP INDEX IF EXISTS "SpaceRevenueMinuteAgg_tenantId_spaceId_minute_idx";
DROP INDEX IF EXISTS "StorageType_tenantId_idx";
DROP INDEX IF EXISTS "Subtype_departmentId_idx";
DROP INDEX IF EXISTS "Team_tenantId_idx";
DROP INDEX IF EXISTS "TenantVatConfig_tenantId_idx";
DROP INDEX IF EXISTS "Tenant_slug_idx";
DROP INDEX IF EXISTS "UnmappedDataMetrics_tenantId_entityType_idx";
DROP INDEX IF EXISTS "UserPinnedSpace_userId_idx";
DROP INDEX IF EXISTS "UserSpaceAccess_userId_idx";
DROP INDEX IF EXISTS "UserTenant_userId_idx";
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "WeezeventAttendee_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventEvent_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventIntegration_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventLocation_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventMerchant_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventOrder_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventPrice_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventProductComponent_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventProductVariant_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventProduct_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventSyncState_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventTransactionItem_productId_idx";
DROP INDEX IF EXISTS "WeezeventTransaction_eventId_idx";
DROP INDEX IF EXISTS "WeezeventTransaction_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventTransaction_tenantId_locationId_status_idx";
DROP INDEX IF EXISTS "WeezeventUser_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventWallet_tenantId_idx";
DROP INDEX IF EXISTS "WeezeventWebhookEvent_integrationId_idx";
DROP INDEX IF EXISTS "Zone_spaceId_idx";
