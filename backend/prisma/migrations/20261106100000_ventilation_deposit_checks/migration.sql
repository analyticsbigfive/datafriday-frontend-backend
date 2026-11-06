-- Validations de dépôt de la Ventilation, partagées entre appareils.
-- elementId '' = coche de l'article entier. Table neuve, idempotente.

CREATE TABLE IF NOT EXISTS "VentilationDepositCheck" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "elementId" TEXT NOT NULL DEFAULT '',
  "checked" BOOLEAN NOT NULL DEFAULT false,
  "quantity" DECIMAL(14,3),
  "comment" TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VentilationDepositCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VentilationDepositCheck_tenantId_spaceId_eventKey_itemKey_elementId_key"
  ON "VentilationDepositCheck"("tenantId", "spaceId", "eventKey", "itemKey", "elementId");

CREATE INDEX IF NOT EXISTS "VentilationDepositCheck_spaceId_eventKey_idx"
  ON "VentilationDepositCheck"("spaceId", "eventKey");
