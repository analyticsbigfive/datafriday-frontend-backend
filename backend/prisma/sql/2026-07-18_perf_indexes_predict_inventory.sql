-- Index de performance — audit /analyse + predict + stock (2026-07-18)
--
-- 1) EventPredictVersion (tenantId, eventId) :
--    couvre `findAll` (predict-versions.service.ts) : where { eventId, tenantId }.
-- 2) InventoryCount (tenantId, spaceId, updatedAt DESC) :
--    couvre `getLatestBySpace` (inventory.service.ts:66) :
--    findFirst({ where: { tenantId, spaceId }, orderBy: { updatedAt: desc } }).
--    Aucun index existant ne mène par tenantId ni ne porte updatedAt → scan + tri.
--
-- Sûr et additif : CREATE INDEX CONCURRENTLY IF NOT EXISTS, aucun impact données.
-- Rejouable. CONCURRENTLY évite le verrou SHARE (qui bloquerait les écritures
-- pendant la construction) — chaque instruction doit s'exécuter hors
-- transaction (comportement par défaut de psql/Supabase SQL editor tant
-- qu'aucun BEGIN explicite n'entoure ce script).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventPredictVersion_tenantId_eventId_idx"
  ON "EventPredictVersion" ("tenantId", "eventId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "InventoryCount_tenantId_spaceId_updatedAt_idx"
  ON "InventoryCount" ("tenantId", "spaceId", "updatedAt" DESC);
