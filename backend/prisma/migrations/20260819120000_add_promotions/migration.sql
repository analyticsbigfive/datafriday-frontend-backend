-- Écrite à la main (comme les migrations précédentes, cf. 20260818120000_add_combo_pricing) :
-- SQL identique à ce que Prisma aurait généré, appliqué via `prisma migrate deploy`.
--
-- Promotions sur un menu item (demande Bertrand) :
--  1) PromotionType : référentiel de configuration (comme DisplayName) alimentant le select
--     « type de promotion ».
--  2) Promotion : attachée à UN menu item (menuItemId @unique). Quand l'item « est en promotion »,
--     il désigne un produit remisé (discountedProduct, un autre MenuItem) + un promotionType.

-- CreateTable
CREATE TABLE "PromotionType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "discountedProductId" TEXT,
    "promotionTypeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionType_tenantId_idx" ON "PromotionType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionType_tenantId_name_key" ON "PromotionType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_menuItemId_key" ON "Promotion"("menuItemId");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_idx" ON "Promotion"("tenantId");

-- CreateIndex
CREATE INDEX "Promotion_menuItemId_idx" ON "Promotion"("menuItemId");

-- CreateIndex
CREATE INDEX "Promotion_discountedProductId_idx" ON "Promotion"("discountedProductId");

-- CreateIndex
CREATE INDEX "Promotion_promotionTypeId_idx" ON "Promotion"("promotionTypeId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_discountedProductId_fkey" FOREIGN KEY ("discountedProductId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_promotionTypeId_fkey" FOREIGN KEY ("promotionTypeId") REFERENCES "PromotionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
