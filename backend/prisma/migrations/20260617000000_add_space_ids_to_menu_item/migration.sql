-- Ajoute spaceIds (association MenuItem -> Space, sans FK) et spacePrices (prix par space)
-- sur MenuItem. Reconstruction 2026-09-07 : ce fichier de migration avait disparu du dépôt
-- alors que la vraie base (Supabase) l'a déjà appliqué — cf. le commentaire "GELÉS en DB" sur
-- MenuItem dans schema.prisma et 20260705180000_space_menu_item_table/migration.sql qui lit
-- déjà spaceIds/spacePrices en confirmant leurs types (TEXT[] / JSONB). IF NOT EXISTS : no-op
-- sur une base où les colonnes existent déjà, applique proprement sur une base neuve.

ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "spaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "spacePrices" JSONB;
