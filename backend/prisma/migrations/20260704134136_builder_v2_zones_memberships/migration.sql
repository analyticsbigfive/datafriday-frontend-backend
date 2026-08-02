-- Builder v2 (docs/REFONTE_3D_BUILDER_V2.md §2) — Zone (par espace) + ConfigurationElement
-- (adhésions) + colonnes v2 sur SpaceElement. Migration STRICTEMENT limitée au chantier
-- builder-v2 : le diff brut contenait aussi du drift étranger (Team/Event, ALTER cosmétiques
-- InventoryCount/KvStore) volontairement exclu — il appartient à d'autres chantiers.

-- CreateEnum
CREATE TYPE "ZoneKind" AS ENUM ('FLOOR', 'FORECOURT', 'EXTERNAL');

-- AlterTable
ALTER TABLE "SpaceElement" ADD COLUMN     "area" TEXT,
ADD COLUMN     "subtypes" TEXT[],
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "zoneId" TEXT;

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" "ZoneKind" NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "geometry" JSONB,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationElement" (
    "configId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationElement_pkey" PRIMARY KEY ("configId","elementId")
);

-- CreateIndex
CREATE INDEX "Zone_spaceId_idx" ON "Zone"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_spaceId_kind_level_key" ON "Zone"("spaceId", "kind", "level");

-- CreateIndex
CREATE INDEX "ConfigurationElement_elementId_idx" ON "ConfigurationElement"("elementId");

-- CreateIndex
CREATE INDEX "SpaceElement_zoneId_idx" ON "SpaceElement"("zoneId");

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationElement" ADD CONSTRAINT "ConfigurationElement_configId_fkey" FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationElement" ADD CONSTRAINT "ConfigurationElement_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceElement" ADD CONSTRAINT "SpaceElement_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
