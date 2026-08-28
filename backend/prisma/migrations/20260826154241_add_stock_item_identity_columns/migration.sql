-- ADR-0006 : identité produit polymorphe (itemKind, itemRefId) en remplacement progressif
-- d'itemKey (nom). Colonnes nullables, purement additives — aucun comportement existant
-- modifié. Voir backend/docs/adr/0006_stock_identite_produit_polymorphe.md.

-- AlterTable
ALTER TABLE "StockLevel" ADD COLUMN     "itemKind" TEXT,
ADD COLUMN     "itemRefId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "itemKind" TEXT,
ADD COLUMN     "itemRefId" TEXT;

-- AlterTable
ALTER TABLE "StockTransferLoss" ADD COLUMN     "itemKind" TEXT,
ADD COLUMN     "itemRefId" TEXT;

-- CreateIndex
CREATE INDEX "StockLevel_itemRefId_idx" ON "StockLevel"("itemRefId");

-- CreateIndex
CREATE INDEX "StockMovement_itemRefId_idx" ON "StockMovement"("itemRefId");

-- CreateIndex
CREATE INDEX "StockTransferLoss_itemRefId_idx" ON "StockTransferLoss"("itemRefId");
