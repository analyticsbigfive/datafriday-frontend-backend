-- Saison multi-choix des composants : jointure N-N MenuComponent <-> Season, parité avec MenuItemSeason.
-- Table neuve, aucune reprise de données. Idempotente.

CREATE TABLE IF NOT EXISTS "MenuComponentSeason" (
  "componentId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  CONSTRAINT "MenuComponentSeason_pkey" PRIMARY KEY ("componentId", "seasonId")
);

CREATE INDEX IF NOT EXISTS "MenuComponentSeason_seasonId_idx" ON "MenuComponentSeason"("seasonId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuComponentSeason_componentId_fkey') THEN
    ALTER TABLE "MenuComponentSeason" ADD CONSTRAINT "MenuComponentSeason_componentId_fkey"
      FOREIGN KEY ("componentId") REFERENCES "MenuComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuComponentSeason_seasonId_fkey') THEN
    ALTER TABLE "MenuComponentSeason" ADD CONSTRAINT "MenuComponentSeason_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
