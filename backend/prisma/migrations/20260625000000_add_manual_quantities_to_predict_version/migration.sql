-- Quantités absolues saisies (slider) pour les items à prédiction 0, où le % est inopérant.
-- Même nature que "quantityAdjustments" : map JSON `${elementId}-${menuItemId}` -> entier >= 0.
-- NOT NULL DEFAULT '{}' : sûr sur table peuplée (les lignes existantes héritent de {}).
ALTER TABLE public."EventPredictVersion"
  ADD COLUMN IF NOT EXISTS "manualQuantities" jsonb NOT NULL DEFAULT '{}'::jsonb;
