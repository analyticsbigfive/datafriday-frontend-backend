-- Écrite à la main (comme les migrations précédentes, cf. 20260811090000_add_menu_item_history_alias) :
-- SQL identique à ce que Prisma aurait généré pour le modèle StockMovement mis à jour (schema.prisma),
-- appliqué via `prisma migrate deploy` (drift pré-existant sur la shadow database).
-- BUG-259-02 : un transfert (TRANSFER_SHOP/TRANSFER_STORAGE) émis côté source reste PENDING tant que
-- la contrepartie n'a pas confirmé la réception (POST /logistics/movements/:id/confirm) — status/
-- confirmedAt/confirmedBy sont null pour toute autre raison de mouvement.

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- AlterTable
ALTER TABLE "StockMovement"
  ADD COLUMN "status" "StockTransferStatus",
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_counterpartyElementId_status_idx" ON "StockMovement"("tenantId", "counterpartyElementId", "status");
