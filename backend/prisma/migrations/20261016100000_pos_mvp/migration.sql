-- POS MVP (lot L1) : provider POS et réglages de caisse par PdV / par évènement.
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'POS';

CREATE TABLE IF NOT EXISTS "PosPdvSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "responsibleHrPersonId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosPdvSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PosEventSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "paymentMethodIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promosEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cancelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lowStockUnits" INTEGER NOT NULL DEFAULT 5,
    "tipsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosEventSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethod_tenantId_name_key" ON "PaymentMethod"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "PaymentMethod_tenantId_active_idx" ON "PaymentMethod"("tenantId", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "PosPdvSetting_eventId_elementId_key" ON "PosPdvSetting"("eventId", "elementId");
CREATE INDEX IF NOT EXISTS "PosPdvSetting_tenantId_spaceId_idx" ON "PosPdvSetting"("tenantId", "spaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "PosEventSetting_eventId_key" ON "PosEventSetting"("eventId");
CREATE INDEX IF NOT EXISTS "PosEventSetting_tenantId_spaceId_idx" ON "PosEventSetting"("tenantId", "spaceId");

-- POS MVP (lot L2) : une fenêtre d'accès 'pos' PAR PdV (selectionKey = elementId), donc
-- plusieurs fenêtres pos ouvertes en même temps sur un espace. L'inventaire garde sa règle :
-- une seule fenêtre ouverte par espace et par phase (pre-event, post-event).
DROP INDEX IF EXISTS "InventoryWindow_one_open_per_space_phase";
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryWindow_one_open_per_space_phase"
  ON "InventoryWindow"("tenantId", "spaceId", "phase")
  WHERE "status" = 'open' AND "phase" NOT IN ('ventilation', 'pos');
