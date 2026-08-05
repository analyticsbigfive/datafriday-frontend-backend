-- Migration: InventorySnapshot + new InventoryCount + KvStore + EventPredictVersion
--
-- Replaces the old Inventory (upsert-only) + InventoryCount (packagingId-based) models
-- with the shapes actually consumed by the front-end:
--   POST /inventory          -> InventorySnapshot (append-only JSON blob)
--   POST /inventory-counts   -> InventoryCount    (upsert per space+event+shop+item)
-- Also adds KvStore (GET/PUT /kv/:key) and EventPredictVersion.

-- ── Drop old tables (InventoryCount has FK to Inventory, drop child first) ───

DROP TABLE IF EXISTS "InventoryCount";
DROP TABLE IF EXISTS "Inventory";

-- ── InventorySnapshot ─────────────────────────────────────────────────────────

CREATE TABLE "InventorySnapshot" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"        TEXT        NOT NULL,
  "spaceId"         TEXT        NOT NULL,
  "eventId"         TEXT,
  "inventoryCounts" JSONB       NOT NULL,
  "createdBy"       TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventorySnapshot_tenantId_idx"       ON "InventorySnapshot" ("tenantId");
CREATE INDEX "InventorySnapshot_spaceId_eventId_idx" ON "InventorySnapshot" ("spaceId", "eventId");
CREATE INDEX "InventorySnapshot_spaceId_createdAt_idx" ON "InventorySnapshot" ("spaceId", "createdAt");

-- ── InventoryCount (new shape) ────────────────────────────────────────────────

CREATE TABLE "InventoryCount" (
  "id"                TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"          TEXT        NOT NULL,
  "spaceId"           TEXT        NOT NULL,
  "eventId"           TEXT,
  "shopId"            TEXT,
  "itemId"            TEXT        NOT NULL,
  "packedUnits"       INTEGER     NOT NULL DEFAULT 0,
  "looseUnits"        INTEGER     NOT NULL DEFAULT 0,
  "isCounted"         BOOLEAN     NOT NULL DEFAULT false,
  "storageLocation"   TEXT,
  "countingStatus"    TEXT        NOT NULL DEFAULT 'pending',
  "discardedQuantity" INTEGER     NOT NULL DEFAULT 0,
  "discardedReason"   TEXT,
  "countedBy"         TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uniq_inventory_count"
    UNIQUE NULLS NOT DISTINCT ("tenantId", "spaceId", "eventId", "shopId", "itemId")
);

CREATE INDEX "InventoryCount_tenantId_idx"        ON "InventoryCount" ("tenantId");
CREATE INDEX "InventoryCount_spaceId_eventId_idx" ON "InventoryCount" ("spaceId", "eventId");
CREATE INDEX "InventoryCount_shopId_idx"          ON "InventoryCount" ("shopId");
CREATE INDEX "InventoryCount_itemId_idx"          ON "InventoryCount" ("itemId");

-- ── KvStore ──────────────────────────────────────────────────────────────────

CREATE TABLE "KvStore" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "key"       TEXT        NOT NULL,
  "tenantId"  TEXT,
  "value"     JSONB       NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "KvStore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uniq_kv_store"
    UNIQUE NULLS NOT DISTINCT ("tenantId", "key")
);

CREATE INDEX "KvStore_tenantId_idx" ON "KvStore" ("tenantId");

-- ── EventPredictVersion ───────────────────────────────────────────────────────

CREATE TABLE "EventPredictVersion" (
  "id"                         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"                   TEXT,
  "eventId"                    TEXT        NOT NULL,
  "spaceId"                    TEXT,
  "name"                       TEXT        NOT NULL,
  "isDefault"                  BOOLEAN     NOT NULL DEFAULT false,
  "eventSnapshot"              JSONB       NOT NULL,
  "totalRevenue"               DOUBLE PRECISION NOT NULL DEFAULT 0,
  "adjustedTotalRevenue"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "perCapita"                  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "adjustedPerCapita"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "menuConfig"                 JSONB       NOT NULL,
  "quantityAdjustments"        JSONB       NOT NULL,
  "selectedPredictionEventIds" TEXT[]      NOT NULL DEFAULT '{}',
  "createdBy"                  TEXT,
  "createdAt"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EventPredictVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventPredictVersion_tenantId_idx" ON "EventPredictVersion" ("tenantId");
CREATE INDEX "EventPredictVersion_eventId_idx"  ON "EventPredictVersion" ("eventId");
CREATE INDEX "EventPredictVersion_spaceId_idx"  ON "EventPredictVersion" ("spaceId");
