-- Historique des prix d'un menu item (courbe d'évolution dans le temps).
--
-- CONTEXTE : à l'étape 3 de la Data Integration, on associe un produit Weezevent à un menu
-- item. Le prix de vente vient des transactions Weezevent et évolue dans le temps. On applique
-- le prix modal (le plus fréquent, déjà calculé / affiché) au `MenuItem.basePrice` COURANT, et
-- on archive chaque application ici pour garder l'historique des prix de l'article.
--
-- `MenuItem.basePrice` reste la source du prix courant ; cette table est purement additive
-- (aucune colonne existante touchée), donc sûre à appliquer sur une base peuplée.
-- `source` : 'weezevent_catalog' (prix catalogue Weezevent) | 'weezevent_sales' (dérivé des
--   ventes / prix modal) | 'manual' (édition traçée).
-- `observedAt` : date métier du prix (transaction source) ; `createdAt` : moment de la pose.
CREATE TABLE IF NOT EXISTS public."MenuItemPriceHistory" (
  "id"                 TEXT NOT NULL,
  "menuItemId"         TEXT NOT NULL,
  "tenantId"           TEXT NOT NULL,
  "basePrice"          DECIMAL(10,2) NOT NULL,
  "vatRate"            DECIMAL(5,2),
  "currency"           TEXT,
  "source"             TEXT NOT NULL,
  "weezeventProductId" TEXT,
  "observedAt"         TIMESTAMP(3) NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuItemPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MenuItemPriceHistory_menuItemId_createdAt_idx"
  ON public."MenuItemPriceHistory" ("menuItemId", "createdAt");

CREATE INDEX IF NOT EXISTS "MenuItemPriceHistory_tenantId_idx"
  ON public."MenuItemPriceHistory" ("tenantId");

-- Clés étrangères (cascade : l'historique disparaît avec l'article ou le tenant).
ALTER TABLE public."MenuItemPriceHistory"
  ADD CONSTRAINT "MenuItemPriceHistory_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES public."MenuItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."MenuItemPriceHistory"
  ADD CONSTRAINT "MenuItemPriceHistory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
