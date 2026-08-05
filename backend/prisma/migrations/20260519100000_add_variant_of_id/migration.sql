-- AlterTable: add variantOfId to WeezeventProduct
ALTER TABLE "WeezeventProduct" ADD COLUMN "variantOfId" TEXT;

-- CreateIndex
CREATE INDEX "WeezeventProduct_variantOfId_idx" ON "WeezeventProduct"("variantOfId");
