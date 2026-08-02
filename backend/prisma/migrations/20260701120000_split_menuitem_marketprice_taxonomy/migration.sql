-- Split taxonomy: Market Price gets its own MarketPriceType / MarketPriceCategory,
-- decoupled from Menu Item's ProductType / ProductCategory (which stay unchanged).
-- Option B: copy the ProductType/ProductCategory currently referenced by MarketPrice
-- rows into the new tables and repoint the MarketPrice FKs.

-- ============================================================
-- 1. Create the new taxonomy tables
-- ============================================================
CREATE TABLE "MarketPriceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketPriceType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketPriceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketPriceCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketPriceType_tenantId_name_key" ON "MarketPriceType"("tenantId", "name");
CREATE INDEX "MarketPriceType_tenantId_idx" ON "MarketPriceType"("tenantId");
CREATE INDEX "MarketPriceType_name_idx" ON "MarketPriceType"("name");

CREATE UNIQUE INDEX "MarketPriceCategory_tenantId_typeId_name_key" ON "MarketPriceCategory"("tenantId", "typeId", "name");
CREATE INDEX "MarketPriceCategory_tenantId_idx" ON "MarketPriceCategory"("tenantId");
CREATE INDEX "MarketPriceCategory_typeId_idx" ON "MarketPriceCategory"("typeId");
CREATE INDEX "MarketPriceCategory_name_idx" ON "MarketPriceCategory"("name");

ALTER TABLE "MarketPriceCategory" ADD CONSTRAINT "MarketPriceCategory_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "MarketPriceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 2. Add the new FK columns on MarketPrice
-- ============================================================
ALTER TABLE "MarketPrice" ADD COLUMN "marketPriceTypeId" TEXT;
ALTER TABLE "MarketPrice" ADD COLUMN "marketPriceCategoryId" TEXT;

-- ============================================================
-- 3. Copy referenced ProductType -> MarketPriceType (option B)
--    Only the ProductTypes actually used by a MarketPrice, either directly
--    (MarketPrice.typeId) or as the parent type of a referenced category.
-- ============================================================
CREATE TEMPORARY TABLE _mpt_map (
    old_type_id TEXT,
    new_type_id TEXT,
    name TEXT,
    "tenantId" TEXT
);

INSERT INTO _mpt_map (old_type_id, new_type_id, name, "tenantId")
SELECT pt."id", gen_random_uuid()::text, pt."name", pt."tenantId"
FROM "ProductType" pt
WHERE pt."id" IN (
    SELECT DISTINCT mp."typeId" FROM "MarketPrice" mp WHERE mp."typeId" IS NOT NULL
    UNION
    SELECT DISTINCT pc."typeId" FROM "ProductCategory" pc
    WHERE pc."id" IN (
        SELECT DISTINCT mp."categoryId" FROM "MarketPrice" mp WHERE mp."categoryId" IS NOT NULL
    )
);

INSERT INTO "MarketPriceType" ("id", "name", "tenantId", "createdAt", "updatedAt")
SELECT new_type_id, name, "tenantId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM _mpt_map;

-- ============================================================
-- 4. Copy referenced ProductCategory -> MarketPriceCategory
-- ============================================================
CREATE TEMPORARY TABLE _mpc_map (
    old_cat_id TEXT,
    new_cat_id TEXT,
    name TEXT,
    "tenantId" TEXT,
    new_type_id TEXT
);

INSERT INTO _mpc_map (old_cat_id, new_cat_id, name, "tenantId", new_type_id)
SELECT pc."id", gen_random_uuid()::text, pc."name", pc."tenantId", m.new_type_id
FROM "ProductCategory" pc
JOIN _mpt_map m ON m.old_type_id = pc."typeId"
WHERE pc."id" IN (
    SELECT DISTINCT mp."categoryId" FROM "MarketPrice" mp WHERE mp."categoryId" IS NOT NULL
);

INSERT INTO "MarketPriceCategory" ("id", "name", "typeId", "tenantId", "createdAt", "updatedAt")
SELECT new_cat_id, name, new_type_id, "tenantId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM _mpc_map;

-- ============================================================
-- 5. Repoint MarketPrice to the new taxonomy
-- ============================================================
UPDATE "MarketPrice" mp
SET "marketPriceTypeId" = m.new_type_id
FROM _mpt_map m
WHERE mp."typeId" = m.old_type_id;

UPDATE "MarketPrice" mp
SET "marketPriceCategoryId" = c.new_cat_id
FROM _mpc_map c
WHERE mp."categoryId" = c.old_cat_id;

DROP TABLE _mpt_map;
DROP TABLE _mpc_map;

-- ============================================================
-- 6. Drop the old ProductType/ProductCategory FKs from MarketPrice
--    (ProductType/ProductCategory themselves stay, now owned by Menu Item)
-- ============================================================
ALTER TABLE "MarketPrice" DROP CONSTRAINT IF EXISTS "MarketPrice_typeId_fkey";
ALTER TABLE "MarketPrice" DROP CONSTRAINT IF EXISTS "MarketPrice_categoryId_fkey";
DROP INDEX IF EXISTS "MarketPrice_typeId_idx";
DROP INDEX IF EXISTS "MarketPrice_categoryId_idx";
ALTER TABLE "MarketPrice" DROP COLUMN "typeId";
ALTER TABLE "MarketPrice" DROP COLUMN "categoryId";

-- ============================================================
-- 7. Index + FK for the new MarketPrice columns
-- ============================================================
CREATE INDEX "MarketPrice_marketPriceTypeId_idx" ON "MarketPrice"("marketPriceTypeId");
CREATE INDEX "MarketPrice_marketPriceCategoryId_idx" ON "MarketPrice"("marketPriceCategoryId");

ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_marketPriceTypeId_fkey"
    FOREIGN KEY ("marketPriceTypeId") REFERENCES "MarketPriceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_marketPriceCategoryId_fkey"
    FOREIGN KEY ("marketPriceCategoryId") REFERENCES "MarketPriceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
