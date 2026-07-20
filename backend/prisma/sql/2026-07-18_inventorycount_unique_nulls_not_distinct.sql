-- InventoryCount — contrainte d'unicité effective avec eventId/shopId NULL (2026-07-18)
--
-- Problème : @@unique([tenantId, spaceId, eventId, shopId, itemId]) est créé par
-- Prisma en NULLS DISTINCT (défaut Postgres) → deux lignes identiques dont
-- eventId ou shopId est NULL ne violent PAS la contrainte. Combiné au
-- findFirst+create de saveInventoryCounts (TOCTOU), des doublons réels existent.
--
-- Correctif en 2 temps, dans CET ordre :
--   1) Dédoublonnage : pour chaque clé (NULLs considérés égaux), on garde la
--      ligne la plus récemment modifiée (updatedAt max, tie-break id max).
--   2) Recréation de l'index unique en NULLS NOT DISTINCT (Postgres 15+ —
--      local = postgres:16-alpine, Supabase >= 15).
--
-- ⚠️ Drift Prisma assumé : Prisma ne sait pas déclarer NULLS NOT DISTINCT dans
-- le schema — un `prisma db push` ultérieur peut vouloir recréer l'index au
-- défaut. Rejouer ce script après tout db push touchant InventoryCount.
-- Rejouable (le DELETE ne matche plus rien une fois dédoublonné).
--
-- ⚠️ Fenêtre de maintenance recommandée : les étapes 1 et 2 sont enveloppées
-- dans une transaction pour fermer la fenêtre de course entre le dédoublonnage
-- et la pose de la contrainte (sans quoi le code applicatif — même patché pour
-- gérer P2002 — pourrait réinsérer un doublon juste avant le CREATE UNIQUE
-- INDEX et le faire échouer). Conséquence : CREATE INDEX CONCURRENTLY est
-- impossible ici (interdit dans une transaction) — l'étape 2 prend un verrou
-- ACCESS EXCLUSIVE sur InventoryCount pendant sa construction (lectures ET
-- écritures bloquées). À lancer hors heures de forte activité.

BEGIN;

-- 1) Dédoublonnage (garde updatedAt max ; à updatedAt égal, id max)
DELETE FROM "InventoryCount" a
USING "InventoryCount" b
WHERE a.id <> b.id
  AND a."tenantId" = b."tenantId"
  AND a."spaceId"  = b."spaceId"
  AND a."itemId"   = b."itemId"
  AND a."eventId" IS NOT DISTINCT FROM b."eventId"
  AND a."shopId"  IS NOT DISTINCT FROM b."shopId"
  AND (a."updatedAt" < b."updatedAt"
       OR (a."updatedAt" = b."updatedAt" AND a.id < b.id));

-- 2) Index unique NULLS NOT DISTINCT (même nom que celui généré par Prisma)
DROP INDEX IF EXISTS "InventoryCount_tenantId_spaceId_eventId_shopId_itemId_key";
CREATE UNIQUE INDEX "InventoryCount_tenantId_spaceId_eventId_shopId_itemId_key"
  ON "InventoryCount" ("tenantId", "spaceId", "eventId", "shopId", "itemId")
  NULLS NOT DISTINCT;

COMMIT;
