-- CreateTable
CREATE TABLE "HrRoleMenuItemRatio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "ratioBasis" TEXT NOT NULL,
    "ratioValue" DOUBLE PRECISION NOT NULL,
    "unitQty" INTEGER NOT NULL DEFAULT 1,
    "allMenuItems" BOOLEAN NOT NULL DEFAULT false,
    "menuItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrRoleMenuItemRatio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementMenuItemSalesInput" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "configId" TEXT,
    "menuItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "revenueHt" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementMenuItemSalesInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrRoleMenuItemRatio_tenantId_idx" ON "HrRoleMenuItemRatio"("tenantId");

-- CreateIndex
CREATE INDEX "HrRoleMenuItemRatio_spaceId_idx" ON "HrRoleMenuItemRatio"("spaceId");

-- CreateIndex
CREATE INDEX "HrRoleMenuItemRatio_roleId_idx" ON "HrRoleMenuItemRatio"("roleId");

-- CreateIndex
CREATE INDEX "ElementMenuItemSalesInput_tenantId_idx" ON "ElementMenuItemSalesInput"("tenantId");

-- CreateIndex
CREATE INDEX "ElementMenuItemSalesInput_elementId_configId_idx" ON "ElementMenuItemSalesInput"("elementId", "configId");

-- CreateIndex
CREATE INDEX "ElementMenuItemSalesInput_menuItemId_idx" ON "ElementMenuItemSalesInput"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ElementMenuItemSalesInput_elementId_configId_menuItemId_key" ON "ElementMenuItemSalesInput"("elementId", "configId", "menuItemId");

-- AddForeignKey
ALTER TABLE "HrRoleMenuItemRatio" ADD CONSTRAINT "HrRoleMenuItemRatio_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRoleMenuItemRatio" ADD CONSTRAINT "HrRoleMenuItemRatio_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "HrRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementMenuItemSalesInput" ADD CONSTRAINT "ElementMenuItemSalesInput_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementMenuItemSalesInput" ADD CONSTRAINT "ElementMenuItemSalesInput_configId_fkey" FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementMenuItemSalesInput" ADD CONSTRAINT "ElementMenuItemSalesInput_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
