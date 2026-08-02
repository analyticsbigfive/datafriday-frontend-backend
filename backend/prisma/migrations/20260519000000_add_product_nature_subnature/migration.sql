-- Migration: add nature, subnature, productType, categoryId to WeezeventProduct
-- Replaces the unused `category` String? column (was always NULL — API returns category_id not category)

-- Drop old unused column
ALTER TABLE "WeezeventProduct" DROP COLUMN IF EXISTS "category";

-- Add new columns
ALTER TABLE "WeezeventProduct" ADD COLUMN "nature"      TEXT;
ALTER TABLE "WeezeventProduct" ADD COLUMN "subnature"   TEXT;
ALTER TABLE "WeezeventProduct" ADD COLUMN "productType" TEXT;
ALTER TABLE "WeezeventProduct" ADD COLUMN "categoryId"  TEXT;

-- Backfill from rawData for existing rows
UPDATE "WeezeventProduct"
SET
  "nature"      = "rawData"->>'nature',
  "subnature"   = "rawData"->>'subnature',
  "productType" = "rawData"->>'type',
  "categoryId"  = "rawData"->>'category_id'
WHERE "rawData" IS NOT NULL;

-- Indexes for analytics filters
CREATE INDEX IF NOT EXISTS "WeezeventProduct_nature_idx"      ON "WeezeventProduct"("nature");
CREATE INDEX IF NOT EXISTS "WeezeventProduct_subnature_idx"   ON "WeezeventProduct"("subnature");
CREATE INDEX IF NOT EXISTS "WeezeventProduct_productType_idx" ON "WeezeventProduct"("productType");
