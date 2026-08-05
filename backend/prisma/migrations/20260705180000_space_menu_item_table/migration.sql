-- SpaceMenuItem : association espace↔menu item + prix par espace (source de vérité).
-- Remplace MenuItem.spaceIds (String[] sans FK) et MenuItem.spacePrices (Json), GELÉS en DB
-- (plus lus ni écrits par le code — drop différé dans une migration de nettoyage après validation).
--
-- IDEMPOTENTE : rejouable telle quelle. Au déploiement staging/prod, l'appliquer AVANT le code,
-- puis la REJOUER juste après le déploiement du code pour rattraper la fenêtre où l'ancien code
-- écrivait encore spaceIds/spacePrices (l'UPDATE prix ne touche que les lignes priceTtc IS NULL,
-- il n'écrase jamais un prix déjà posé par le nouveau code).

-- 1. Table
CREATE TABLE IF NOT EXISTS "SpaceMenuItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "priceTtc" DECIMAL(10,2),
    "vatRate" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SpaceMenuItem_menuItemId_spaceId_key" ON "SpaceMenuItem"("menuItemId", "spaceId");
CREATE INDEX IF NOT EXISTS "SpaceMenuItem_spaceId_idx" ON "SpaceMenuItem"("spaceId");

DO $$ BEGIN
    ALTER TABLE "SpaceMenuItem" ADD CONSTRAINT "SpaceMenuItem_spaceId_fkey"
        FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SpaceMenuItem" ADD CONSTRAINT "SpaceMenuItem_menuItemId_fkey"
        FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Backfill association depuis spaceIds.
-- JOIN Space = garde d'intégrité : les ids d'espaces supprimés qui traînent dans les arrays
-- (aucune FK ne les retenait) sont ignorés au lieu de casser l'insert.
INSERT INTO "SpaceMenuItem" ("id", "spaceId", "menuItemId")
SELECT DISTINCT gen_random_uuid()::text, s."id", mi."id"
FROM "MenuItem" mi
CROSS JOIN LATERAL unnest(mi."spaceIds") AS sid("spaceId")
JOIN "Space" s ON s."id" = sid."spaceId"
ON CONFLICT ("menuItemId", "spaceId") DO NOTHING;

-- 3. Backfill prix depuis spacePrices, uniquement sur les associations existantes
-- (une clé de prix sans association ne crée PAS de ligne : la présence d'une ligne = condition 0,
-- on ne change pas la visibilité au passage). Deux formes legacy gérées :
--   { "spaceId": 12.5 }                        (number, 1re version)
--   { "spaceId": { "ttc": 12.5, "vatRate": 10 } }
UPDATE "SpaceMenuItem" smi
SET "priceTtc" = COALESCE(
        CASE WHEN jsonb_typeof(mi."spacePrices"::jsonb -> smi."spaceId") = 'number'
             THEN (mi."spacePrices"::jsonb ->> smi."spaceId")::numeric(10,2) END,
        CASE WHEN jsonb_typeof(mi."spacePrices"::jsonb -> smi."spaceId" -> 'ttc') = 'number'
             THEN (mi."spacePrices"::jsonb -> smi."spaceId" ->> 'ttc')::numeric(10,2) END
    ),
    "vatRate" = CASE WHEN jsonb_typeof(mi."spacePrices"::jsonb -> smi."spaceId" -> 'vatRate') = 'number'
             THEN (mi."spacePrices"::jsonb -> smi."spaceId" ->> 'vatRate')::numeric(5,2) END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "MenuItem" mi
WHERE mi."id" = smi."menuItemId"
  AND mi."spacePrices" IS NOT NULL
  AND mi."spacePrices"::jsonb ? smi."spaceId"
  AND smi."priceTtc" IS NULL;
