-- LogisticTask.batchId : lot d'origine (un POST batch = un batchId partagé), sert à
-- détecter la clôture complète d'un lot pour notifier son créateur. Colonne nullable,
-- purement additive.

-- AlterTable
ALTER TABLE "LogisticTask" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "LogisticTask_batchId_idx" ON "LogisticTask"("batchId");
