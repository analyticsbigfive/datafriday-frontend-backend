-- Move the Industrial (façonnier/industriel) FK from MenuItem to MarketPrice.
-- The MenuItem.industrialId column was never deployed to prod (introduced in
-- 20260707120000_add_industrial_to_menu_item, applied to dev only), so this is
-- a clean move rather than an add-then-drop pair.

-- DropForeignKey
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_industrialId_fkey";

-- DropIndex
DROP INDEX "MenuItem_industrialId_idx";

-- AlterTable
ALTER TABLE "MenuItem" DROP COLUMN "industrialId";

-- AlterTable
ALTER TABLE "MarketPrice" ADD COLUMN "industrialId" TEXT;

-- CreateIndex
CREATE INDEX "MarketPrice_industrialId_idx" ON "MarketPrice"("industrialId");

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_industrialId_fkey" FOREIGN KEY ("industrialId") REFERENCES "Industrial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
