-- Reconstruction 2026-09-07 : "kind" et "meta" existent déjà en base réelle sur
-- StockReconciliation, ajoutées via des scripts manuels prisma/sql/2026-07-20_* et
-- prisma/sql/2026-07-24_* (cf. commentaires schema.prisma) plutôt que via `prisma migrate`.

ALTER TABLE "StockReconciliation" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "StockReconciliation" ADD COLUMN IF NOT EXISTS "meta" JSONB;
