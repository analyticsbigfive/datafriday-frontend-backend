CREATE TABLE IF NOT EXISTS public."RestockState" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "spaceId"   TEXT NOT NULL,
  "state"     JSONB NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RestockState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RestockState_tenantId_spaceId_key"
  ON public."RestockState"("tenantId", "spaceId");

CREATE INDEX IF NOT EXISTS "RestockState_tenantId_idx"
  ON public."RestockState"("tenantId");

CREATE INDEX IF NOT EXISTS "RestockState_spaceId_idx"
  ON public."RestockState"("spaceId");
