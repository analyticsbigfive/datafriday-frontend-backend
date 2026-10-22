-- Cost tracking : version immuable du coût d'un article (jamais mise à jour, uniquement insérée).
-- `recipe` : lignes figées {kind, refId, name, quantity, unitCost}. `recipeHash` : empreinte de
-- la recette + coût + prix, comparée au dernier snapshot pour ne rien écrire si rien n'a changé.
-- `reason` : texte libre (baseline, created, market_price, recipe_edit, ...), pas d'enum.
CREATE TABLE IF NOT EXISTS public."MenuItemCostSnapshot" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "menuItemId"     TEXT NOT NULL,
  "effectiveFrom"  TIMESTAMP(3) NOT NULL,
  "totalCost"      DECIMAL(12,4) NOT NULL,
  "numberOfPieces" INTEGER NOT NULL DEFAULT 1,
  "costPerPiece"   DECIMAL(12,4) NOT NULL,
  "basePrice"      DECIMAL(10,2),
  "vatRate"        DECIMAL(5,2),
  "recipe"         JSONB NOT NULL,
  "recipeHash"     TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "sourceRef"      JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuItemCostSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MenuItemCostSnapshot_tenantId_menuItemId_effectiveFrom_idx"
  ON public."MenuItemCostSnapshot" ("tenantId", "menuItemId", "effectiveFrom" DESC);

CREATE INDEX IF NOT EXISTS "MenuItemCostSnapshot_tenantId_effectiveFrom_idx"
  ON public."MenuItemCostSnapshot" ("tenantId", "effectiveFrom");

-- Clés étrangères (cascade : l'historique disparaît avec l'article ou le tenant).
ALTER TABLE public."MenuItemCostSnapshot"
  ADD CONSTRAINT "MenuItemCostSnapshot_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES public."MenuItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."MenuItemCostSnapshot"
  ADD CONSTRAINT "MenuItemCostSnapshot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
