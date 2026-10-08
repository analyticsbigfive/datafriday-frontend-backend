-- Accès PIN « Ventilation » des logisticiens (chantier logistic_ventilation, partie 3).
-- 1. Slug du QR code de ventilation, un par espace (généré à la première ouverture).
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "ventilationSlug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Space_ventilationSlug_key" ON "Space"("ventilationSlug");

-- 2. Annulation d'un dépôt VENTILATION par mouvement inverse.
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reversesMovementId" TEXT;
CREATE INDEX IF NOT EXISTS "StockMovement_reversesMovementId_idx" ON "StockMovement"("reversesMovementId");
