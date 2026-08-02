-- Décomposition de prix par menu item, requise par le front (TTC, HT, taxe, remise).
-- `vatRate` : taux TVA % par article ; NULL → fallback TenantVatConfig.defaultVatRate → 20.
-- `discountType`/`discountValue` : remise catalogue ("percent" → %, "amount" → montant TTC).
-- Le HT, le montant de TVA et le prix remisé NE sont PAS stockés : ils sont calculés à la
-- réponse (computePricing → bloc `pricing`) pour éviter toute dérive.
-- Colonnes nullable + IF NOT EXISTS : sûr et idempotent sur table peuplée.
ALTER TABLE public."MenuItem"
  ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "discountType" TEXT,
  ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(10,2);
