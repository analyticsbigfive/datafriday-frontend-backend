-- Reconstruction 2026-09-07 : "variantOfId" (ajoutée juste avant, dans
-- 20260519100000_add_variant_of_id) n'existe plus sur WeezeventProduct en base réelle et
-- n'est référencée par aucune autre migration. Son retrait a dû être fait hors migration ;
-- on le rejoue ici pour que l'historique local corresponde à la réalité.

DROP INDEX IF EXISTS "WeezeventProduct_variantOfId_idx";
ALTER TABLE "WeezeventProduct" DROP COLUMN IF EXISTS "variantOfId";
