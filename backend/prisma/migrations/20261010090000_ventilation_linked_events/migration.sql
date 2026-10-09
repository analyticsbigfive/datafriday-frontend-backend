-- Ventilation v2 (maquettes Bertrand du 2026-10-09).
-- 1. Un accès PIN « Ventilation » est celui du PREMIER match d'une sélection de matchs :
--    les autres matchs de la sélection sont enregistrés sur sa fenêtre.
ALTER TABLE "InventoryWindow" ADD COLUMN IF NOT EXISTS "linkedEventIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. Plusieurs accès Ventilation peuvent être ouverts en même temps (un PIN par match,
--    choisir une autre sélection ne doit pas couper les logisticiens déjà connectés).
--    L'inventaire garde sa règle : une seule fenêtre ouverte par espace et par phase.
DROP INDEX IF EXISTS "InventoryWindow_one_open_per_space_phase";
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryWindow_one_open_per_space_phase"
  ON "InventoryWindow"("tenantId", "spaceId", "phase")
  WHERE "status" = 'open' AND "phase" <> 'ventilation';
