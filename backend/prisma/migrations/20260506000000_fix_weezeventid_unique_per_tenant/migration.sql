-- Fix: weezeventId unique constraint must be per-tenant (not global)
-- A Weezevent account can be linked to multiple tenants; same IDs must be allowed across tenants.

-- Drop global unique indexes (keep the non-unique _idx ones untouched)
DROP INDEX IF EXISTS "WeezeventEvent_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventMerchant_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventLocation_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventProduct_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventUser_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventWallet_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventTransaction_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventProductVariant_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventProductComponent_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventOrder_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventPrice_weezeventId_key";
DROP INDEX IF EXISTS "WeezeventAttendee_weezeventId_key";

-- Add composite unique (tenantId, weezeventId) for each model
CREATE UNIQUE INDEX "WeezeventEvent_tenantId_weezeventId_key" ON "WeezeventEvent"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventMerchant_tenantId_weezeventId_key" ON "WeezeventMerchant"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventLocation_tenantId_weezeventId_key" ON "WeezeventLocation"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventProduct_tenantId_weezeventId_key" ON "WeezeventProduct"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventUser_tenantId_weezeventId_key" ON "WeezeventUser"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventWallet_tenantId_weezeventId_key" ON "WeezeventWallet"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventTransaction_tenantId_weezeventId_key" ON "WeezeventTransaction"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventProductVariant_tenantId_weezeventId_key" ON "WeezeventProductVariant"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventProductComponent_tenantId_weezeventId_key" ON "WeezeventProductComponent"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventOrder_tenantId_weezeventId_key" ON "WeezeventOrder"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventPrice_tenantId_weezeventId_key" ON "WeezeventPrice"("tenantId", "weezeventId");
CREATE UNIQUE INDEX "WeezeventAttendee_tenantId_weezeventId_key" ON "WeezeventAttendee"("tenantId", "weezeventId");
