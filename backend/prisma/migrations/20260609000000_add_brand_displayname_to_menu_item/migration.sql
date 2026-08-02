-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "brandId" TEXT,
ADD COLUMN "displayNameId" TEXT;

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayName" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_tenantId_idx" ON "Brand"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_tenantId_name_key" ON "Brand"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DisplayName_tenantId_idx" ON "DisplayName"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayName_tenantId_name_key" ON "DisplayName"("tenantId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_brandId_idx" ON "MenuItem"("brandId");

-- CreateIndex
CREATE INDEX "MenuItem_displayNameId_idx" ON "MenuItem"("displayNameId");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_displayNameId_fkey" FOREIGN KEY ("displayNameId") REFERENCES "DisplayName"("id") ON DELETE SET NULL ON UPDATE CASCADE;
