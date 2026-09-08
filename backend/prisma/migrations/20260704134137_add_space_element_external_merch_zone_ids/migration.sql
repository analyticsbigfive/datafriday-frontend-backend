-- Reconstruction 2026-09-07 : "externalMerchId" et "zoneId" existent déjà sur SpaceElement en
-- base réelle (vérifié via information_schema + pg_constraint) mais leur ADD COLUMN n'a jamais
-- eu de migration dans ce dépôt — même cause que 20260422000001_backfill_missing_tables (ajout
-- probable via `prisma db push`). Placé juste après la création de "Zone" (Builder v2) car
-- "zoneId" y a une FK ; "ExternalMerch" existe depuis 20260422000001_backfill_missing_tables.

ALTER TABLE "SpaceElement" ADD COLUMN IF NOT EXISTS "externalMerchId" TEXT;
ALTER TABLE "SpaceElement" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

CREATE INDEX IF NOT EXISTS "SpaceElement_externalMerchId_idx" ON "SpaceElement"("externalMerchId");
CREATE INDEX IF NOT EXISTS "SpaceElement_zoneId_idx" ON "SpaceElement"("zoneId");
CREATE INDEX IF NOT EXISTS "SpaceElement_zoneId_type_idx" ON "SpaceElement"("zoneId", "type");

DO $$ BEGIN
    ALTER TABLE "SpaceElement" ADD CONSTRAINT "SpaceElement_externalMerchId_fkey"
        FOREIGN KEY ("externalMerchId") REFERENCES "ExternalMerch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "SpaceElement" ADD CONSTRAINT "SpaceElement_zoneId_fkey"
        FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
