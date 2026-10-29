-- Decision metier du 2026-10-30 : ElementInventory.quantity (stock tampon d'un article sur un
-- stockage ou un PDV) est desormais stockee en UNITES DE BASE (litres, unites...), comme le stock
-- restant auquel le Rearmement la compare. La saisie et l'affichage se font en colis cote front.
--
-- Les tampons deja saisis l'ont ete en NOMBRE DE COLIS (ex. 12 = 12 futs de 20 L). Conversion
-- unique : quantity = quantity * contenance du colis.
--
-- Contenance du colis = MarketPrice."packedUnits" (le drawer Market Price y persiste la
-- « quantite par paquet » ; la colonne inventoryQuantityPackaged n'existe pas en base, le front
-- replie sur packedUnits, cf. frontend/src/utils/storageManualItem.js resolveQtyPackaged).
-- Market Price joint par marketPriceId, supprime logiquement ou non.
--
-- Seules les lignes ecrites depuis la page Stockage (isStored renseigne, colonne ajoutee le
-- 2026-10-26) sont en colis. Les lignes historiques du 3D builder (isStored NULL, ex. 1664 - 30L
-- 900, Coca-Cola 1000 en prod) etaient deja saisies en unites : inchangees.
--
-- Inchange : lignes sans marketPriceId, quantity <= 0, contenance <= 1 (ou NULL).
-- minStock / maxStock ne sont pas touches. Pas de changement de schema. Non idempotent : a
-- n'executer qu'une fois (Prisma ne rejoue pas une migration appliquee).
UPDATE "ElementInventory" ei
SET "quantity" = ei."quantity" * mp."packedUnits"
FROM "MarketPrice" mp
WHERE mp."id" = ei."marketPriceId"
  AND ei."marketPriceId" IS NOT NULL
  AND ei."quantity" > 0
  AND ei."isStored" IS NOT NULL
  AND mp."packedUnits" > 1;
