-- Lignes d inventaire d un Storage : article bien stocke sur cette reserve (null = historique).
ALTER TABLE "ElementInventory" ADD COLUMN "isStored" BOOLEAN;
