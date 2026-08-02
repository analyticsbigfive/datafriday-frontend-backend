-- Fix: WeezeventTransaction.weezeventId must be unique per tenant (not per integration).
-- Scenario: a tenant deletes and recreates a Weezevent integration → new integrationId →
-- all transactions get re-inserted under the new integrationId → duplicates for the tenant.
--
-- Steps:
--   1. Remove duplicates (keep the most recently synced row per tenantId+weezeventId)
--   2. Drop the loose (tenantId, integrationId, weezeventId) index
--   3. Create the strict (tenantId, weezeventId) unique index

-- ── 1. Deduplicate ────────────────────────────────────────────────────────────
-- For each (tenantId, weezeventId) group, keep the row with the latest syncedAt.
-- Cascade deletes on WeezeventTransactionItem are handled by the FK onDelete: Cascade.
DELETE FROM "WeezeventTransaction"
WHERE id NOT IN (
    SELECT DISTINCT ON ("tenantId", "weezeventId") id
    FROM "WeezeventTransaction"
    ORDER BY "tenantId", "weezeventId", "syncedAt" DESC, id
);

-- ── 2. Drop the (tenantId, integrationId, weezeventId) unique index ──────────
DROP INDEX IF EXISTS "WeezeventTransaction_tenantId_integrationId_weezeventId_key";

-- ── 3. Create the (tenantId, weezeventId) unique index ───────────────────────
CREATE UNIQUE INDEX "WeezeventTransaction_tenantId_weezeventId_key"
    ON "WeezeventTransaction"("tenantId", "weezeventId");
