-- Écrite à la main (comme les migrations précédentes, cf. 20260814120000_add_menuitem_seasonid) :
-- SQL identique à ce que Prisma aurait généré, appliqué via `prisma migrate deploy`.
--
-- Tarification d'un combo (demande Bertrand) :
--  1) MenuItem.isCombo : « cet item EST un combo » (posé quand il a des éléments combo),
--     distinct du flag comboItem (« réutilisable dans un combo »).
--  2) SpaceMenuItem.discountType / discountValue : promo PAR ESPACE. priceTtc stocke le prix
--     après promo ; ces deux colonnes gardent le type + la valeur de la remise pour l'affichage.

ALTER TABLE "MenuItem" ADD COLUMN "isCombo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SpaceMenuItem" ADD COLUMN "discountType" TEXT;
ALTER TABLE "SpaceMenuItem" ADD COLUMN "discountValue" DECIMAL(10,2);
