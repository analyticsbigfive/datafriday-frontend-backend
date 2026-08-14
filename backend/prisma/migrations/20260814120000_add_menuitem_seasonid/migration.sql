-- Écrite à la main (comme les migrations précédentes, cf. 20260813160000_add_marketprice_storagetype) :
-- SQL identique à ce que Prisma aurait généré pour MenuItem.seasonId (schema.prisma),
-- appliqué via `prisma migrate deploy`.
-- Ajoute un lien optionnel MenuItem -> Season (Custom Date de Configuration). Nullable, FK
-- ON DELETE SET NULL : supprimer une saison ne supprime pas les menu items, ça détache juste.

ALTER TABLE "MenuItem" ADD COLUMN "seasonId" TEXT;

CREATE INDEX "MenuItem_seasonId_idx" ON "MenuItem"("seasonId");

ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
