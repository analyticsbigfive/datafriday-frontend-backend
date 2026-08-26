-- CreateIndex
CREATE INDEX "StockLevel_marketPriceId_idx" ON "StockLevel"("marketPriceId");

-- CreateIndex
CREATE INDEX "StockMovement_marketPriceId_idx" ON "StockMovement"("marketPriceId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_marketPriceId_fkey" FOREIGN KEY ("marketPriceId") REFERENCES "MarketPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_marketPriceId_fkey" FOREIGN KEY ("marketPriceId") REFERENCES "MarketPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
