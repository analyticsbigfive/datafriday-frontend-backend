-- Rename table (preserves all 516 existing rows)
ALTER TABLE "WeezeventMerchantElementMapping" RENAME TO "WeezeventLocationShopMapping";

-- Rename column weezeventMerchantId → weezeventLocationId
ALTER TABLE "WeezeventLocationShopMapping" RENAME COLUMN "weezeventMerchantId" TO "weezeventLocationId";

-- Rename primary key constraint
ALTER INDEX "WeezeventMerchantElementMapping_pkey" RENAME TO "WeezeventLocationShopMapping_pkey";

-- Rename unique constraint (source name is 63 chars, PostgreSQL truncated weezeventMerchantId → weezeventMerchantI)
ALTER INDEX "WeezeventMerchantElementMapping_tenantId_weezeventMerchantI_key" RENAME TO "WeezeventLocationShopMapping_tenantId_weezeventLocationId_key";

-- Rename indexes
ALTER INDEX "WeezeventMerchantElementMapping_tenantId_spaceElementId_idx" RENAME TO "WeezeventLocationShopMapping_tenantId_spaceElementId_idx";
ALTER INDEX "WeezeventMerchantElementMapping_weezeventMerchantId_idx" RENAME TO "WeezeventLocationShopMapping_weezeventLocationId_idx";
