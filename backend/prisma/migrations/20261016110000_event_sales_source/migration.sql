-- Agrégation multi-source (lot L4, ADR_MULTI_SOURCE) : liste des sources de ventes d'un évènement.
-- Additive : aucune table existante modifiée, aucune donnée réécrite (sources historiques dérivées).
CREATE TABLE IF NOT EXISTS "EventSalesSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "salesEventId" TEXT,
    "windowMode" TEXT NOT NULL DEFAULT 'sales-event-range',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSalesSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventSalesSource_eventId_integrationId_key" ON "EventSalesSource"("eventId", "integrationId");
CREATE INDEX IF NOT EXISTS "EventSalesSource_tenantId_eventId_idx" ON "EventSalesSource"("tenantId", "eventId");
CREATE INDEX IF NOT EXISTS "EventSalesSource_salesEventId_idx" ON "EventSalesSource"("salesEventId");
