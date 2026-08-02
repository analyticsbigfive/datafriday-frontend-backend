-- CreateTable
CREATE TABLE "WeezeventProductMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weezeventProductId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "autoMapped" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "mappedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeezeventProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventProductVariant" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "sku" TEXT,
    "stock" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventProductComponent" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventProductComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventOrder" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "status" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventPrice" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "priceType" TEXT,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeezeventAttendee" (
    "id" TEXT NOT NULL,
    "weezeventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "ticketType" TEXT,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeezeventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeezeventProductMapping_menuItemId_idx" ON "WeezeventProductMapping"("menuItemId");

-- CreateIndex
CREATE INDEX "WeezeventProductMapping_tenantId_idx" ON "WeezeventProductMapping"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventProductMapping_autoMapped_idx" ON "WeezeventProductMapping"("autoMapped");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProductMapping_weezeventProductId_key" ON "WeezeventProductMapping"("weezeventProductId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProductVariant_weezeventId_key" ON "WeezeventProductVariant"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProductVariant_tenantId_idx" ON "WeezeventProductVariant"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventProductVariant_productId_idx" ON "WeezeventProductVariant"("productId");

-- CreateIndex
CREATE INDEX "WeezeventProductVariant_weezeventId_idx" ON "WeezeventProductVariant"("weezeventId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProductComponent_weezeventId_key" ON "WeezeventProductComponent"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProductComponent_tenantId_idx" ON "WeezeventProductComponent"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventProductComponent_productId_idx" ON "WeezeventProductComponent"("productId");

-- CreateIndex
CREATE INDEX "WeezeventProductComponent_weezeventId_idx" ON "WeezeventProductComponent"("weezeventId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventOrder_weezeventId_key" ON "WeezeventOrder"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventOrder_tenantId_idx" ON "WeezeventOrder"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventOrder_eventId_idx" ON "WeezeventOrder"("eventId");

-- CreateIndex
CREATE INDEX "WeezeventOrder_weezeventId_idx" ON "WeezeventOrder"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventOrder_orderDate_idx" ON "WeezeventOrder"("orderDate");

-- CreateIndex
CREATE INDEX "WeezeventOrder_status_idx" ON "WeezeventOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventPrice_weezeventId_key" ON "WeezeventPrice"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventPrice_tenantId_idx" ON "WeezeventPrice"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventPrice_eventId_idx" ON "WeezeventPrice"("eventId");

-- CreateIndex
CREATE INDEX "WeezeventPrice_productId_idx" ON "WeezeventPrice"("productId");

-- CreateIndex
CREATE INDEX "WeezeventPrice_weezeventId_idx" ON "WeezeventPrice"("weezeventId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventAttendee_weezeventId_key" ON "WeezeventAttendee"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventAttendee_tenantId_idx" ON "WeezeventAttendee"("tenantId");

-- CreateIndex
CREATE INDEX "WeezeventAttendee_eventId_idx" ON "WeezeventAttendee"("eventId");

-- CreateIndex
CREATE INDEX "WeezeventAttendee_weezeventId_idx" ON "WeezeventAttendee"("weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventAttendee_email_idx" ON "WeezeventAttendee"("email");

-- AddForeignKey
ALTER TABLE "WeezeventProductMapping" ADD CONSTRAINT "WeezeventProductMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductMapping" ADD CONSTRAINT "WeezeventProductMapping_weezeventProductId_fkey" FOREIGN KEY ("weezeventProductId") REFERENCES "WeezeventProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductMapping" ADD CONSTRAINT "WeezeventProductMapping_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductVariant" ADD CONSTRAINT "WeezeventProductVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductVariant" ADD CONSTRAINT "WeezeventProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "WeezeventProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductComponent" ADD CONSTRAINT "WeezeventProductComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductComponent" ADD CONSTRAINT "WeezeventProductComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "WeezeventProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventOrder" ADD CONSTRAINT "WeezeventOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventOrder" ADD CONSTRAINT "WeezeventOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeezeventEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventPrice" ADD CONSTRAINT "WeezeventPrice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventPrice" ADD CONSTRAINT "WeezeventPrice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeezeventEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventPrice" ADD CONSTRAINT "WeezeventPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "WeezeventProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventAttendee" ADD CONSTRAINT "WeezeventAttendee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventAttendee" ADD CONSTRAINT "WeezeventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeezeventEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
