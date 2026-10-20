-- Saison multi-choix : jointure N-N MenuItem <-> Season, avec reprise de MenuItem.seasonId.
-- La colonne seasonId est conservée (dépréciée, plus lue) pour qu'un ancien conteneur encore en
-- ligne pendant le déploiement ne casse pas ; à supprimer dans une migration ultérieure.

CREATE TABLE "MenuItemSeason" (
  "menuItemId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  CONSTRAINT "MenuItemSeason_pkey" PRIMARY KEY ("menuItemId", "seasonId")
);

CREATE INDEX "MenuItemSeason_seasonId_idx" ON "MenuItemSeason"("seasonId");

ALTER TABLE "MenuItemSeason" ADD CONSTRAINT "MenuItemSeason_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItemSeason" ADD CONSTRAINT "MenuItemSeason_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MenuItemSeason" ("menuItemId", "seasonId")
SELECT "id", "seasonId" FROM "MenuItem" WHERE "seasonId" IS NOT NULL
ON CONFLICT DO NOTHING;
