-- Prix de vente PAR ESPACE : un menu item peut être vendu à des prix différents selon l'espace.
-- À l'étape 3 de la Data Integration, on applique désormais le prix Weezevent à un espace donné
-- (et non plus au seul prix global). On trace donc DANS QUEL espace chaque prix a été appliqué.
--
-- `spaceId` NULL = prix global / historique legacy (avant le per-espace). Colonne purement
-- additive et nullable → sûre à appliquer sur une base peuplée (aucune réécriture des lignes
-- existantes). Pas de FK vers Space ici : `spaceId` est conservé comme trace même si l'espace
-- est supprimé ensuite (l'historique reste lisible).
ALTER TABLE public."MenuItemPriceHistory"
  ADD COLUMN IF NOT EXISTS "spaceId" TEXT;

-- Index pour relire l'historique des prix d'un article DANS un espace donné (courbe par espace).
CREATE INDEX IF NOT EXISTS "MenuItemPriceHistory_menuItemId_spaceId_createdAt_idx"
  ON public."MenuItemPriceHistory" ("menuItemId", "spaceId", "createdAt");
