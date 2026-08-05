-- Écrit à la main (comme les migrations précédentes, cf. 20260804160000_add_space_revenue_minute_item_agg) :
-- SQL identique à ce que Prisma aurait généré pour les modèles Season/SeasonSpace (schema.prisma),
-- repris de prisma/sql/2026-08-04_seasons.sql, appliqué via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "allSpaces" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonSpace" (
    "seasonId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,

    CONSTRAINT "SeasonSpace_pkey" PRIMARY KEY ("seasonId","spaceId")
);

-- CreateIndex
CREATE INDEX "Season_tenantId_idx" ON "Season"("tenantId");

-- CreateIndex
CREATE INDEX "SeasonSpace_seasonId_idx" ON "SeasonSpace"("seasonId");

-- CreateIndex
CREATE INDEX "SeasonSpace_spaceId_idx" ON "SeasonSpace"("spaceId");

-- AddForeignKey
ALTER TABLE "SeasonSpace" ADD CONSTRAINT "SeasonSpace_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonSpace" ADD CONSTRAINT "SeasonSpace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
