-- CreateEnum
CREATE TYPE "LogisticTaskPriority" AS ENUM ('VERY_URGENT', 'URGENT', 'TODO', 'NOT_PRIORITY');

-- CreateEnum
CREATE TYPE "LogisticTaskStatus" AS ENUM ('PENDING', 'PICKED_UP', 'COMPLETED');

-- CreateTable
CREATE TABLE "LogisticTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "menuItemId" TEXT,
    "sourceElementId" TEXT NOT NULL,
    "destinationElementId" TEXT NOT NULL,
    "packedQty" INTEGER NOT NULL DEFAULT 0,
    "looseQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assignedToUserId" TEXT NOT NULL,
    "priority" "LogisticTaskPriority" NOT NULL,
    "status" "LogisticTaskStatus" NOT NULL DEFAULT 'PENDING',
    "pickupMovementId" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticTask_tenantId_spaceId_assignedToUserId_status_idx" ON "LogisticTask"("tenantId", "spaceId", "assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "LogisticTask_tenantId_spaceId_status_idx" ON "LogisticTask"("tenantId", "spaceId", "status");

-- CreateIndex
CREATE INDEX "Notification_tenantId_userId_read_createdAt_idx" ON "Notification"("tenantId", "userId", "read", "createdAt");
