-- D2 (plan de remédiation) : clés étrangères kitchenId ajoutées par la migration
-- 20261008120000_kitchens_component_spaces sans index. Supprimer une cuisine (SET NULL sur
-- les fiches) parcourait MenuItem et MenuComponent en entier.
-- Tables de catalogue (production 2026-10-09 : 9 810 MenuItem, 123 MenuComponent) : création
-- simple, verrou bref.

CREATE INDEX IF NOT EXISTS "MenuComponent_kitchenId_idx" ON "MenuComponent"("kitchenId");
CREATE INDEX IF NOT EXISTS "MenuItem_kitchenId_idx" ON "MenuItem"("kitchenId");
