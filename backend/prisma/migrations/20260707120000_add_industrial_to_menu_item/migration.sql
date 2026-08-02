-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "industrialId" TEXT;

-- CreateTable
CREATE TABLE "Industrial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Industrial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Industrial_tenantId_idx" ON "Industrial"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Industrial_tenantId_name_key" ON "Industrial"("tenantId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_industrialId_idx" ON "MenuItem"("industrialId");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_industrialId_fkey" FOREIGN KEY ("industrialId") REFERENCES "Industrial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
