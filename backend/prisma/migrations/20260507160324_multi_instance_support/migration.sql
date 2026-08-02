/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventAttendee` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventLocation` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventMerchant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventPrice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventProduct` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventProductComponent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventProductVariant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,syncType]` on the table `WeezeventSyncState` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventUser` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,integrationId,weezeventId]` on the table `WeezeventWallet` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `integrationId` to the `WeezeventAttendee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventLocation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventMerchant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventPrice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventProduct` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventProductComponent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventProductVariant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventSyncState` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventWallet` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `WeezeventWebhookEvent` table without a default value. This is not possible if the table is not empty.

*/
-- Truncate all Weezevent data tables in dependency order (staging: no data to preserve)
TRUNCATE TABLE "WeezeventPayment" CASCADE;
TRUNCATE TABLE "WeezeventTransactionItem" CASCADE;
TRUNCATE TABLE "WeezeventWebhookEvent" CASCADE;
TRUNCATE TABLE "WeezeventAttendee" CASCADE;
TRUNCATE TABLE "WeezeventPrice" CASCADE;
TRUNCATE TABLE "WeezeventOrder" CASCADE;
TRUNCATE TABLE "WeezeventProductMapping" CASCADE;
TRUNCATE TABLE "WeezeventProductComponent" CASCADE;
TRUNCATE TABLE "WeezeventProductVariant" CASCADE;
TRUNCATE TABLE "WeezeventTransaction" CASCADE;
TRUNCATE TABLE "WeezeventProduct" CASCADE;
TRUNCATE TABLE "WeezeventMerchant" CASCADE;
TRUNCATE TABLE "WeezeventLocation" CASCADE;
TRUNCATE TABLE "WeezeventWallet" CASCADE;
TRUNCATE TABLE "WeezeventUser" CASCADE;
TRUNCATE TABLE "WeezeventEvent" CASCADE;
TRUNCATE TABLE "WeezeventSyncState" CASCADE;

-- DropIndex
DROP INDEX "WeezeventAttendee_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventEvent_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventLocation_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventMerchant_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventOrder_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventPrice_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventProduct_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventProductComponent_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventProductVariant_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventSyncState_tenantId_syncType_key";

-- DropIndex
DROP INDEX "WeezeventTransaction_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventUser_tenantId_weezeventId_key";

-- DropIndex
DROP INDEX "WeezeventWallet_tenantId_weezeventId_key";

-- AlterTable
ALTER TABLE "WeezeventAttendee" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventEvent" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventLocation" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventMerchant" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventOrder" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventPrice" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventProduct" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventProductComponent" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventProductVariant" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventSyncState" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventTransaction" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventUser" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventWallet" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeezeventWebhookEvent" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "WeezeventAttendee_integrationId_idx" ON "WeezeventAttendee"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventAttendee_tenantId_integrationId_weezeventId_key" ON "WeezeventAttendee"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventEvent_integrationId_idx" ON "WeezeventEvent"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventEvent_tenantId_integrationId_weezeventId_key" ON "WeezeventEvent"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventLocation_integrationId_idx" ON "WeezeventLocation"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventLocation_tenantId_integrationId_weezeventId_key" ON "WeezeventLocation"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventMerchant_integrationId_idx" ON "WeezeventMerchant"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventMerchant_tenantId_integrationId_weezeventId_key" ON "WeezeventMerchant"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventOrder_integrationId_idx" ON "WeezeventOrder"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventOrder_tenantId_integrationId_weezeventId_key" ON "WeezeventOrder"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventPrice_integrationId_idx" ON "WeezeventPrice"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventPrice_tenantId_integrationId_weezeventId_key" ON "WeezeventPrice"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProduct_integrationId_idx" ON "WeezeventProduct"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProduct_tenantId_integrationId_weezeventId_key" ON "WeezeventProduct"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProductComponent_integrationId_idx" ON "WeezeventProductComponent"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProductComponent_tenantId_integrationId_weezeventI_key" ON "WeezeventProductComponent"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventProductVariant_integrationId_idx" ON "WeezeventProductVariant"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventProductVariant_tenantId_integrationId_weezeventId_key" ON "WeezeventProductVariant"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventSyncState_integrationId_idx" ON "WeezeventSyncState"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventSyncState_tenantId_integrationId_syncType_key" ON "WeezeventSyncState"("tenantId", "integrationId", "syncType");

-- CreateIndex
CREATE INDEX "WeezeventTransaction_integrationId_idx" ON "WeezeventTransaction"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventTransaction_tenantId_integrationId_weezeventId_key" ON "WeezeventTransaction"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventUser_integrationId_idx" ON "WeezeventUser"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventUser_tenantId_integrationId_weezeventId_key" ON "WeezeventUser"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventWallet_integrationId_idx" ON "WeezeventWallet"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WeezeventWallet_tenantId_integrationId_weezeventId_key" ON "WeezeventWallet"("tenantId", "integrationId", "weezeventId");

-- CreateIndex
CREATE INDEX "WeezeventWebhookEvent_integrationId_idx" ON "WeezeventWebhookEvent"("integrationId");

-- AddForeignKey
ALTER TABLE "WeezeventEvent" ADD CONSTRAINT "WeezeventEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventMerchant" ADD CONSTRAINT "WeezeventMerchant_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventLocation" ADD CONSTRAINT "WeezeventLocation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProduct" ADD CONSTRAINT "WeezeventProduct_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventUser" ADD CONSTRAINT "WeezeventUser_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventWallet" ADD CONSTRAINT "WeezeventWallet_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventTransaction" ADD CONSTRAINT "WeezeventTransaction_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventSyncState" ADD CONSTRAINT "WeezeventSyncState_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventWebhookEvent" ADD CONSTRAINT "WeezeventWebhookEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductVariant" ADD CONSTRAINT "WeezeventProductVariant_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventProductComponent" ADD CONSTRAINT "WeezeventProductComponent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventOrder" ADD CONSTRAINT "WeezeventOrder_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventPrice" ADD CONSTRAINT "WeezeventPrice_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeezeventAttendee" ADD CONSTRAINT "WeezeventAttendee_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WeezeventIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
