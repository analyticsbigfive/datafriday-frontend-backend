-- AlterTable: taxonomie dynamique additive sur MarketPrice (goodType enum conservé)
ALTER TABLE "MarketPrice" ADD COLUMN "typeId" TEXT;
ALTER TABLE "MarketPrice" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "MarketPrice_typeId_idx" ON "MarketPrice"("typeId");
CREATE INDEX "MarketPrice_categoryId_idx" ON "MarketPrice"("categoryId");

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
