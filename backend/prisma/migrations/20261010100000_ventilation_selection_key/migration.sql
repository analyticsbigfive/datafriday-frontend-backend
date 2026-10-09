-- Ventilation : un PIN par COMBINAISON de matchs (décision Ulrich du 2026-10-09).
-- Avec A, B et C : A seul, A + B, B + C, A + B + C ont chacun leur accès et leur PIN, qui
-- n'affiche que les matchs de sa combinaison. `selectionKey` = empreinte des ids triés de la
-- combinaison ; vide pour les fenêtres d'inventaire (une par match et par phase, inchangé).
ALTER TABLE "InventoryWindow" ADD COLUMN IF NOT EXISTS "selectionKey" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "InventoryWindow_tenantId_spaceId_eventId_phase_key";
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryWindow_tenantId_spaceId_eventId_phase_selectionKey_key"
  ON "InventoryWindow"("tenantId", "spaceId", "eventId", "phase", "selectionKey");
