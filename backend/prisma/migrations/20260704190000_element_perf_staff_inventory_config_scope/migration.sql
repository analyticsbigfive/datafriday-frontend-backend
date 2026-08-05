-- Scope ElementPerformance / ElementStaff / ElementInventory par CONFIGURATION.
-- Suite du patron MenuAssignment (20260704160000) : en builder v2 un élément est partagé
-- entre configs — perf/staffing/stock doivent pouvoir différer par config (Concert vs Match).
-- Backfill = RÉPLICATION vers chaque config adhérente (v2 ConfigurationElement, v1 parent
-- Floor/Forecourt/ExternalMerch) ; les lignes d'éléments sans config restent configId NULL.
-- ⚠️ ElementPerformance perd son unique(elementId) → déployer le backend aussitôt.

-- ════ 1) Colonnes + FK ════
ALTER TABLE "ElementPerformance" ADD COLUMN "configId" TEXT;
ALTER TABLE "ElementPerformance" ADD CONSTRAINT "ElementPerformance_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElementStaff" ADD COLUMN "configId" TEXT;
ALTER TABLE "ElementStaff" ADD CONSTRAINT "ElementStaff_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElementInventory" ADD COLUMN "configId" TEXT;
ALTER TABLE "ElementInventory" ADD CONSTRAINT "ElementInventory_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════ 2) Drop de l'unique(elementId) de la perf AVANT réplication ════
ALTER TABLE "ElementPerformance" DROP CONSTRAINT IF EXISTS "ElementPerformance_elementId_key";
DROP INDEX IF EXISTS "ElementPerformance_elementId_key";

-- ════ 3) Backfill ElementPerformance ════
INSERT INTO "ElementPerformance" ("id", "elementId", "configId", "revenue", "numberOfPOS",
  "numberOfTransactions", "transactionsPerMinute", "staffCost", "revenuePerEmployee", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ep."elementId", ce."configId", ep."revenue", ep."numberOfPOS",
  ep."numberOfTransactions", ep."transactionsPerMinute", ep."staffCost", ep."revenuePerEmployee", ep."createdAt", ep."updatedAt"
FROM "ElementPerformance" ep
JOIN "ConfigurationElement" ce ON ce."elementId" = ep."elementId"
WHERE ep."configId" IS NULL;

INSERT INTO "ElementPerformance" ("id", "elementId", "configId", "revenue", "numberOfPOS",
  "numberOfTransactions", "transactionsPerMinute", "staffCost", "revenuePerEmployee", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ep."elementId", COALESCE(f."configId", fc."configId", em."configId"),
  ep."revenue", ep."numberOfPOS", ep."numberOfTransactions", ep."transactionsPerMinute",
  ep."staffCost", ep."revenuePerEmployee", ep."createdAt", ep."updatedAt"
FROM "ElementPerformance" ep
JOIN "SpaceElement" se ON se."id" = ep."elementId"
LEFT JOIN "Floor" f ON f."id" = se."floorId"
LEFT JOIN "Forecourt" fc ON fc."id" = se."forecourtId"
LEFT JOIN "ExternalMerch" em ON em."id" = se."externalMerchId"
WHERE ep."configId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ConfigurationElement" ce2 WHERE ce2."elementId" = ep."elementId")
  AND COALESCE(f."configId", fc."configId", em."configId") IS NOT NULL;

DELETE FROM "ElementPerformance"
WHERE "configId" IS NULL
  AND "elementId" IN (SELECT DISTINCT "elementId" FROM "ElementPerformance" WHERE "configId" IS NOT NULL);

-- ════ 4) Backfill ElementStaff ════
INSERT INTO "ElementStaff" ("id", "elementId", "configId", "position", "count", "hourlyRate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, st."elementId", ce."configId", st."position", st."count", st."hourlyRate", st."createdAt", st."updatedAt"
FROM "ElementStaff" st
JOIN "ConfigurationElement" ce ON ce."elementId" = st."elementId"
WHERE st."configId" IS NULL;

INSERT INTO "ElementStaff" ("id", "elementId", "configId", "position", "count", "hourlyRate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, st."elementId", COALESCE(f."configId", fc."configId", em."configId"),
  st."position", st."count", st."hourlyRate", st."createdAt", st."updatedAt"
FROM "ElementStaff" st
JOIN "SpaceElement" se ON se."id" = st."elementId"
LEFT JOIN "Floor" f ON f."id" = se."floorId"
LEFT JOIN "Forecourt" fc ON fc."id" = se."forecourtId"
LEFT JOIN "ExternalMerch" em ON em."id" = se."externalMerchId"
WHERE st."configId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ConfigurationElement" ce2 WHERE ce2."elementId" = st."elementId")
  AND COALESCE(f."configId", fc."configId", em."configId") IS NOT NULL;

DELETE FROM "ElementStaff"
WHERE "configId" IS NULL
  AND "elementId" IN (SELECT DISTINCT "elementId" FROM "ElementStaff" WHERE "configId" IS NOT NULL);

-- ════ 5) Backfill ElementInventory ════
INSERT INTO "ElementInventory" ("id", "elementId", "configId", "name", "quantity", "unit",
  "minStock", "maxStock", "isCustom", "menuItemId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, inv."elementId", ce."configId", inv."name", inv."quantity", inv."unit",
  inv."minStock", inv."maxStock", inv."isCustom", inv."menuItemId", inv."createdAt", inv."updatedAt"
FROM "ElementInventory" inv
JOIN "ConfigurationElement" ce ON ce."elementId" = inv."elementId"
WHERE inv."configId" IS NULL;

INSERT INTO "ElementInventory" ("id", "elementId", "configId", "name", "quantity", "unit",
  "minStock", "maxStock", "isCustom", "menuItemId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, inv."elementId", COALESCE(f."configId", fc."configId", em."configId"),
  inv."name", inv."quantity", inv."unit", inv."minStock", inv."maxStock", inv."isCustom",
  inv."menuItemId", inv."createdAt", inv."updatedAt"
FROM "ElementInventory" inv
JOIN "SpaceElement" se ON se."id" = inv."elementId"
LEFT JOIN "Floor" f ON f."id" = se."floorId"
LEFT JOIN "Forecourt" fc ON fc."id" = se."forecourtId"
LEFT JOIN "ExternalMerch" em ON em."id" = se."externalMerchId"
WHERE inv."configId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ConfigurationElement" ce2 WHERE ce2."elementId" = inv."elementId")
  AND COALESCE(f."configId", fc."configId", em."configId") IS NOT NULL;

DELETE FROM "ElementInventory"
WHERE "configId" IS NULL
  AND "elementId" IN (SELECT DISTINCT "elementId" FROM "ElementInventory" WHERE "configId" IS NOT NULL);

-- ════ 6) Index ════
CREATE UNIQUE INDEX "ElementPerformance_elementId_configId_key" ON "ElementPerformance"("elementId", "configId");
CREATE INDEX "ElementPerformance_elementId_idx" ON "ElementPerformance"("elementId");
CREATE INDEX "ElementPerformance_configId_idx" ON "ElementPerformance"("configId");
CREATE INDEX "ElementStaff_configId_idx" ON "ElementStaff"("configId");
CREATE INDEX "ElementInventory_configId_idx" ON "ElementInventory"("configId");
