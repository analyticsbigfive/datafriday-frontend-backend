-- Component taxonomy (ComponentType / ComponentCategory), independent from
-- ProductType/ProductCategory (Menu Item) and MarketPriceType/MarketPriceCategory.
-- MenuComponent.category / componentCategory (free text) are untouched.

-- ============================================================
-- 0. Drop the dead, never-used "ComponentCategory" enum type
--    (created in 0_init, never referenced by any column) so the name is
--    free for the new table below — Postgres tables and types share a
--    namespace.
-- ============================================================
DROP TYPE IF EXISTS "ComponentCategory";

-- ============================================================
-- 1. Create the new taxonomy tables
-- ============================================================
CREATE TABLE "ComponentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComponentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponentCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComponentCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComponentType_tenantId_name_key" ON "ComponentType"("tenantId", "name");
CREATE INDEX "ComponentType_tenantId_idx" ON "ComponentType"("tenantId");
CREATE INDEX "ComponentType_name_idx" ON "ComponentType"("name");

CREATE UNIQUE INDEX "ComponentCategory_tenantId_typeId_name_key" ON "ComponentCategory"("tenantId", "typeId", "name");
CREATE INDEX "ComponentCategory_tenantId_idx" ON "ComponentCategory"("tenantId");
CREATE INDEX "ComponentCategory_typeId_idx" ON "ComponentCategory"("typeId");
CREATE INDEX "ComponentCategory_name_idx" ON "ComponentCategory"("name");

ALTER TABLE "ComponentCategory" ADD CONSTRAINT "ComponentCategory_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "ComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 2. Add the new FK columns on MenuComponent (additive, nullable, no backfill)
-- ============================================================
ALTER TABLE "MenuComponent" ADD COLUMN "componentTypeId" TEXT;
ALTER TABLE "MenuComponent" ADD COLUMN "componentCategoryId" TEXT;

CREATE INDEX "MenuComponent_componentTypeId_idx" ON "MenuComponent"("componentTypeId");
CREATE INDEX "MenuComponent_componentCategoryId_idx" ON "MenuComponent"("componentCategoryId");

ALTER TABLE "MenuComponent" ADD CONSTRAINT "MenuComponent_componentTypeId_fkey"
    FOREIGN KEY ("componentTypeId") REFERENCES "ComponentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MenuComponent" ADD CONSTRAINT "MenuComponent_componentCategoryId_fkey"
    FOREIGN KEY ("componentCategoryId") REFERENCES "ComponentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
