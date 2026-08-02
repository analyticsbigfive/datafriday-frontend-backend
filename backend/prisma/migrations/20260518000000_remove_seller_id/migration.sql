-- sellerId (seller_id from Weezevent API = individual cashier) is not used in
-- any analytics query and has no FK relation — removed as dead weight.
ALTER TABLE "WeezeventTransaction" DROP COLUMN IF EXISTS "sellerId";
