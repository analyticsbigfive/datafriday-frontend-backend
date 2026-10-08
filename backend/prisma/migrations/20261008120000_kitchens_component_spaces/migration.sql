-- Cuisines (Settings > Menu F&B > Cuisines, demande Bertrand 2026-10-08) ; image et
-- espaces des composants ; cuisine des composants et menu items reliée à une cuisine.

-- CreateTable
CREATE TABLE "Kitchen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "picture" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "tel" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "sites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Kitchen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kitchen_tenantId_idx" ON "Kitchen"("tenantId");

-- AlterTable
ALTER TABLE "MenuComponent" ADD COLUMN "kitchenId" TEXT,
ADD COLUMN "picture" TEXT,
ADD COLUMN "spaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "kitchenId" TEXT;

-- AddForeignKey
ALTER TABLE "Kitchen" ADD CONSTRAINT "Kitchen_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuComponent" ADD CONSTRAINT "MenuComponent_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise des données : l'option « Cuisine Centrale » disparaît au profit des cuisines
-- de Settings. Chaque client qui l'utilisait reçoit une cuisine « Cuisine Centrale »
-- rattachée à tous ses espaces (renommable ensuite), et les fiches y sont reliées.
-- Identifiant déterministe : rejouable sans doublon.
INSERT INTO "Kitchen" ("id", "name", "sites", "tenantId", "updatedAt")
SELECT 'kitchen_central_' || md5(t."tenantId"),
       'Cuisine Centrale',
       COALESCE((SELECT array_agg(s."id" ORDER BY s."name") FROM "Space" s WHERE s."tenantId" = t."tenantId"), ARRAY[]::TEXT[]),
       t."tenantId",
       CURRENT_TIMESTAMP
FROM (
  SELECT "tenantId" FROM "MenuComponent" WHERE "kitchenType" = 'Central'
  UNION
  SELECT "tenantId" FROM "MenuItem" WHERE "kitchenType" = 'Central'
) t
ON CONFLICT ("id") DO NOTHING;

UPDATE "MenuComponent"
SET "kitchenId" = 'kitchen_central_' || md5("tenantId")
WHERE "kitchenType" = 'Central' AND "kitchenId" IS NULL;

UPDATE "MenuItem"
SET "kitchenId" = 'kitchen_central_' || md5("tenantId")
WHERE "kitchenType" = 'Central' AND "kitchenId" IS NULL;
