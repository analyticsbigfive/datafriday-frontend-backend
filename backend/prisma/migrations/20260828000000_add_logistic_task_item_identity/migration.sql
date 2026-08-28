-- ADR-0006 (chantier 377) : LogisticTask rejoint StockLevel/StockMovement/StockTransferLoss
-- sur l'identité produit stable (itemKind, itemRefId) en remplacement progressif d'itemKey
-- (nom). Colonnes nullables, purement additives — aucun comportement existant modifié.
-- Voir backend/docs/adr/0006_stock_identite_produit_polymorphe.md.

-- AlterTable
ALTER TABLE "LogisticTask" ADD COLUMN     "itemKind" TEXT,
ADD COLUMN     "itemRefId" TEXT;

-- CreateIndex
CREATE INDEX "LogisticTask_itemRefId_idx" ON "LogisticTask"("itemRefId");
