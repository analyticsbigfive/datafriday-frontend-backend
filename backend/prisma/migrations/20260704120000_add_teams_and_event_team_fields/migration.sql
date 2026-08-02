-- Teams pour les events sport : catalogue Team (scopé tenant + compétition)
-- + colonnes équipe sur Event (homeTeamName texte libre, visitingTeamId FK,
-- visitingTeamName dénormalisé en repli d'affichage).
-- Additif : colonnes nullable, aucun backfill requis.

-- ============================================================
-- 1. Table Team
-- ============================================================
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventCategoryId" TEXT,
    "eventSubcategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Team_tenantId_idx" ON "Team"("tenantId");
CREATE INDEX "Team_eventCategoryId_idx" ON "Team"("eventCategoryId");
CREATE INDEX "Team_eventSubcategoryId_idx" ON "Team"("eventSubcategoryId");

ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_eventCategoryId_fkey"
    FOREIGN KEY ("eventCategoryId") REFERENCES "EventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_eventSubcategoryId_fkey"
    FOREIGN KEY ("eventSubcategoryId") REFERENCES "EventSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 2. Colonnes équipe sur Event
-- ============================================================
ALTER TABLE "Event" ADD COLUMN "homeTeamName" TEXT;
ALTER TABLE "Event" ADD COLUMN "visitingTeamId" TEXT;
ALTER TABLE "Event" ADD COLUMN "visitingTeamName" TEXT;

CREATE INDEX "Event_visitingTeamId_idx" ON "Event"("visitingTeamId");

ALTER TABLE "Event" ADD CONSTRAINT "Event_visitingTeamId_fkey"
    FOREIGN KEY ("visitingTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
