-- Audit perf page Analyse (backend, 2026-07-31) : 3 index manquants sur des requêtes réellement
-- exécutées par GET /spaces/:id/shop-details, /event-timeline, /transaction-baskets.
--
-- ATTENTION PRODUCTION : "WeezeventTransaction" est une table de faits à fort volume/écriture
-- (ingestion Weezevent quasi temps réel pendant un event live). Un CREATE INDEX classique prend un
-- verrou SHARE le temps de la construction (bloque les écritures concurrentes, pas les lectures).
-- Sur un espace de taille significative, préférer une exécution manuelle hors transaction :
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "WeezeventTransaction_tenantId_integrationId_status_transactionDate_idx"
--     ON "WeezeventTransaction"("tenantId", "integrationId", "status", "transactionDate");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "WeezeventTransaction_tenantId_locationId_status_idx"
--     ON "WeezeventTransaction"("tenantId", "locationId", "status");
-- (CONCURRENTLY ne peut pas s'exécuter dans une transaction ; ce fichier reste en CREATE INDEX
-- standard pour rester compatible avec le runner transactionnel de `prisma migrate deploy` — à
-- l'équipe ops de décider si un run manuel CONCURRENTLY est nécessaire selon le volume réel.)

-- (1) event-timeline / transaction-baskets (spaces.service.ts: resolveEventSalesScope) : le JOIN
-- filtre tenantId + integrationId (si l'espace a une intégration mappée) + status + fenêtre de
-- transactionDate. Aucun index existant ne couvre les 4 colonnes ensemble.
CREATE INDEX IF NOT EXISTS "WeezeventTransaction_tenantId_integrationId_status_transactionDate_idx"
  ON "WeezeventTransaction"("tenantId", "integrationId", "status", "transactionDate");

-- (2) RPC get_space_shop_details, reconstruction de la liste d'events d'un espace (_space_event_ids)
-- filtre tenantId + locationId (IN liste) + status. Rend ce scan sargable au lieu de dépendre d'un
-- index simple sur locationId seul + recheck des deux autres prédicats.
CREATE INDEX IF NOT EXISTS "WeezeventTransaction_tenantId_locationId_status_idx"
  ON "WeezeventTransaction"("tenantId", "locationId", "status");

-- (3) RPC get_space_shop_details, résolution de v_shop_ids (Builder v2) : la branche Zone du filtre
-- SpaceElement.type IN (...) n'avait pas d'équivalent composite à floorId+type / forecourtId+type.
CREATE INDEX IF NOT EXISTS "SpaceElement_zoneId_type_idx"
  ON "SpaceElement"("zoneId", "type");
