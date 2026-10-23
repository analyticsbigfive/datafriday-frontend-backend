-- Cost tracking : version immuable du coût d'une brique (ingrédient, emballage, composant),
-- jamais mise à jour, uniquement insérée. `refId` est polymorphe (pas de clé étrangère) pour que
-- l'historique survive à la brique. `unitCost` : coût par unité de recette (ingrédient, emballage)
-- ou MenuComponent.unitCost. `reason` : texte libre, pas d'enum.
CREATE TABLE IF NOT EXISTS public."BrickCostSnapshot" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "refId"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "unitCost"      DECIMAL(10,4) NOT NULL,
  "recipeUnit"    TEXT,
  "supplierId"    TEXT,
  "supplierName"  TEXT,
  "marketPriceId" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "reason"        TEXT NOT NULL,
  "sourceRef"     JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrickCostSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BrickCostSnapshot_tenantId_kind_refId_effectiveFrom_idx"
  ON public."BrickCostSnapshot" ("tenantId", "kind", "refId", "effectiveFrom" DESC);

CREATE INDEX IF NOT EXISTS "BrickCostSnapshot_tenantId_supplierId_effectiveFrom_idx"
  ON public."BrickCostSnapshot" ("tenantId", "supplierId", "effectiveFrom");

-- Clé étrangère (cascade : l'historique disparaît avec le tenant).
ALTER TABLE public."BrickCostSnapshot"
  ADD CONSTRAINT "BrickCostSnapshot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
