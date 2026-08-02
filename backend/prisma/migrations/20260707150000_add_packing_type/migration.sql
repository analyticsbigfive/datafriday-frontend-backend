-- CreateTable
CREATE TABLE "PackingType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingType_tenantId_idx" ON "PackingType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingType_tenantId_name_key" ON "PackingType"("tenantId", "name");
