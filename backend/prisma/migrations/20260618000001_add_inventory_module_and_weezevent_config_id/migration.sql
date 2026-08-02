-- Migration: Inventory module + WeezeventEvent.configurationId
--
-- 1. Inventory / InventoryCount tables for server-side persistence of the
--    Inventory screen (replaces the current localStorage-only fallback).
-- 2. configurationId on WeezeventEvent so the Config filter in Analyse
--    can restrict events to a given plan configuration (G7).

-- ── Inventory ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Inventory" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"  TEXT        NOT NULL,
  "spaceId"   TEXT        NOT NULL,
  "eventId"   TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Inventory_tenantId_spaceId_eventId_key" UNIQUE ("tenantId", "spaceId", "eventId")
);

CREATE INDEX IF NOT EXISTS "Inventory_tenantId_idx"          ON "Inventory" ("tenantId");
CREATE INDEX IF NOT EXISTS "Inventory_tenantId_spaceId_idx"  ON "Inventory" ("tenantId", "spaceId");

-- ── InventoryCount ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "InventoryCount" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "inventoryId" TEXT        NOT NULL,
  "packagingId" TEXT        NOT NULL,
  "quantity"    DOUBLE PRECISION NOT NULL,
  "shopId"      TEXT,
  "countedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCount_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "InventoryCount_inventoryId_idx"  ON "InventoryCount" ("inventoryId");
CREATE INDEX IF NOT EXISTS "InventoryCount_packagingId_idx"  ON "InventoryCount" ("packagingId");

-- ── WeezeventEvent.configurationId (G7) ──────────────────────────────────────

ALTER TABLE "WeezeventEvent"
  ADD COLUMN IF NOT EXISTS "configurationId" TEXT;
