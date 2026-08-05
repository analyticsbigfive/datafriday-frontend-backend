/*
  Warnings:

  - You are about to drop the column `category` on the `MenuItem` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `MenuItem` table. All the data in the column will be lost.
  - You are about to drop the `FloorElement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ForecourtElement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ForecourtElementInventory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ForecourtElementPerformance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ForecourtElementStaff` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SpaceMenuConfig` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[elementId,menuItemId]` on the table `MenuAssignment` will be added. If there are existing duplicate values, this will fail.
  - Made the column `typeId` on table `MenuItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `categoryId` on table `MenuItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ElementInventory" DROP CONSTRAINT "ElementInventory_elementId_fkey";

-- DropForeignKey
ALTER TABLE "ElementPerformance" DROP CONSTRAINT "ElementPerformance_elementId_fkey";

-- DropForeignKey
ALTER TABLE "ElementStaff" DROP CONSTRAINT "ElementStaff_elementId_fkey";

-- DropForeignKey
ALTER TABLE "FloorElement" DROP CONSTRAINT "FloorElement_floorId_fkey";

-- DropForeignKey
ALTER TABLE "ForecourtElement" DROP CONSTRAINT "ForecourtElement_forecourtId_fkey";

-- DropForeignKey
ALTER TABLE "ForecourtElementInventory" DROP CONSTRAINT "ForecourtElementInventory_elementId_fkey";

-- DropForeignKey
ALTER TABLE "ForecourtElementPerformance" DROP CONSTRAINT "ForecourtElementPerformance_elementId_fkey";

-- DropForeignKey
ALTER TABLE "ForecourtElementStaff" DROP CONSTRAINT "ForecourtElementStaff_elementId_fkey";

-- DropForeignKey
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_typeId_fkey";

-- DropIndex
DROP INDEX "MenuItem_category_idx";

-- AlterTable
ALTER TABLE "MenuAssignment" ADD COLUMN     "elementId" TEXT,
ALTER COLUMN "stationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MenuItem" DROP COLUMN "category",
DROP COLUMN "type",
ALTER COLUMN "typeId" SET NOT NULL,
ALTER COLUMN "categoryId" SET NOT NULL;

-- DropTable
DROP TABLE "FloorElement";

-- DropTable
DROP TABLE "ForecourtElement";

-- DropTable
DROP TABLE "ForecourtElementInventory";

-- DropTable
DROP TABLE "ForecourtElementPerformance";

-- DropTable
DROP TABLE "ForecourtElementStaff";

-- DropTable
DROP TABLE "SpaceMenuConfig";

-- DropEnum
DROP TYPE "MenuItemCategory";

-- CreateTable
CREATE TABLE "SpaceElement" (
    "id" TEXT NOT NULL,
    "floorId" TEXT,
    "forecourtId" TEXT,
    "name" TEXT NOT NULL,
    "type" "ElementType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "height3d" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION DEFAULT 0,
    "image" TEXT,
    "notes" TEXT,
    "capacity" INTEGER,
    "cornerRadiusTL" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusTR" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusBL" DOUBLE PRECISION DEFAULT 0,
    "cornerRadiusBR" DOUBLE PRECISION DEFAULT 0,
    "shopTypes" TEXT[],
    "storageTypes" TEXT[],
    "hospitalityTypes" TEXT[],
    "accessTypes" TEXT[],
    "entertainmentTypes" TEXT[],
    "entranceTypes" TEXT[],
    "kitchenTypes" TEXT[],
    "attributes" JSONB,
    "tags" TEXT[],

    CONSTRAINT "SpaceElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" INTEGER NOT NULL,
    "response" TEXT,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpaceElement_floorId_idx" ON "SpaceElement"("floorId");

-- CreateIndex
CREATE INDEX "SpaceElement_forecourtId_idx" ON "SpaceElement"("forecourtId");

-- CreateIndex
CREATE INDEX "SpaceElement_type_idx" ON "SpaceElement"("type");

-- CreateIndex
CREATE INDEX "Webhook_tenantId_idx" ON "Webhook"("tenantId");

-- CreateIndex
CREATE INDEX "Webhook_active_idx" ON "Webhook"("active");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_idx" ON "WebhookLog"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookLog_event_idx" ON "WebhookLog"("event");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "MenuAssignment_elementId_idx" ON "MenuAssignment"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuAssignment_elementId_menuItemId_key" ON "MenuAssignment"("elementId", "menuItemId");

-- AddForeignKey
ALTER TABLE "SpaceElement" ADD CONSTRAINT "SpaceElement_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceElement" ADD CONSTRAINT "SpaceElement_forecourtId_fkey" FOREIGN KEY ("forecourtId") REFERENCES "Forecourt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementPerformance" ADD CONSTRAINT "ElementPerformance_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementStaff" ADD CONSTRAINT "ElementStaff_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementInventory" ADD CONSTRAINT "ElementInventory_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAssignment" ADD CONSTRAINT "MenuAssignment_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
