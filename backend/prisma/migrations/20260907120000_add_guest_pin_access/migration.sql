-- Accès invité par PIN pour managers de PDV (sans compte utilisateur). InventoryWindow =
-- une fenêtre d'inventaire pré/post-événement ouverte par le directeur de site ; fermer la
-- fenêtre révoque en bloc tous les GuestPinAccess qui lui sont rattachés (vérifié à chaque
-- requête invité côté application, pas de cascade de statut ici). pinLookupHash stocke un
-- HMAC-SHA256 du PIN (jamais le PIN en clair), nullable pour pouvoir libérer la valeur
-- numérique à la révocation/clôture sans violer la contrainte unique.

-- CreateTable
CREATE TABLE "InventoryWindow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "showExpected" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "pushedToLogisticAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestPinAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "pinLookupHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "boundDeviceHash" TEXT,
    "boundAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestPinAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryWindow_tenantId_spaceId_status_idx" ON "InventoryWindow"("tenantId", "spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryWindow_tenantId_spaceId_eventId_phase_key" ON "InventoryWindow"("tenantId", "spaceId", "eventId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "GuestPinAccess_pinLookupHash_key" ON "GuestPinAccess"("pinLookupHash");

-- CreateIndex
CREATE INDEX "GuestPinAccess_tenantId_status_idx" ON "GuestPinAccess"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GuestPinAccess_spaceId_elementId_idx" ON "GuestPinAccess"("spaceId", "elementId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestPinAccess_windowId_elementId_key" ON "GuestPinAccess"("windowId", "elementId");

-- AddForeignKey
ALTER TABLE "GuestPinAccess" ADD CONSTRAINT "GuestPinAccess_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "InventoryWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
