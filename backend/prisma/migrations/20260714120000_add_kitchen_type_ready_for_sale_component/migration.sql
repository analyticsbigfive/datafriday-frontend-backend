-- Cuisine Centrale/Locale sur Menu Item + Composant, affiché quand Ready for Sale = "Yes".
-- MenuComponent n'avait pas de readyForSale (contrairement à MenuItem) : ajouté ici avec le
-- même contrat (String "Yes"/"No"/null) pour que la condition d'affichage soit cohérente
-- des deux côtés. Migration 100% additive, aucune colonne existante modifiée.

-- CreateEnum
CREATE TYPE "KitchenType" AS ENUM ('Central', 'Local');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "kitchenType" "KitchenType";

-- AlterTable
ALTER TABLE "MenuComponent" ADD COLUMN "readyForSale" TEXT,
ADD COLUMN "kitchenType" "KitchenType";

-- CreateIndex
CREATE INDEX "MenuComponent_readyForSale_idx" ON "MenuComponent"("readyForSale");
