-- BUG-128-01 (perf page Analyse) : la reconstruction de `_space_event_ids` dans la RPC
-- get_space_shop_details lisait ~185k lignes de heap (~42k pages disque, ~11 s mesurés sur
-- l'espace "Stade Jean Bouin") parce que le planner choisissait l'index mono-colonne
-- "WeezeventTransaction_locationId_idx" puis re-filtrait tenantId/status en heap — l'index
-- composite (tenantId, locationId, status) existant ne suffisait pas : eventId (la seule
-- colonne projetée) restait à chercher en heap.
--
-- Cet index 4 colonnes rend le scan index-only : mesuré 14,7 s → 0,65 s sur l'appel RPC
-- complet granular=1 (combiné avec la réécriture costMap de
-- supabase/migrations/20260818120000_shop_details_rpc_costmap_from_mappings.sql).
--
-- ATTENTION PRODUCTION : même précaution que 20260731000000_analyse_page_perf_indexes —
-- "WeezeventTransaction" est une table de faits à fort volume/écriture. Sur une base
-- volumineuse, préférer une exécution manuelle hors transaction :
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "WeezeventTransaction_tenantId_locationId_status_eventId_idx"
--     ON "WeezeventTransaction"("tenantId", "locationId", "status", "eventId");
-- (Déjà appliqué manuellement sur la base datafriday-dev le 2026-08-18.)

CREATE INDEX IF NOT EXISTS "WeezeventTransaction_tenantId_locationId_status_eventId_idx"
  ON "WeezeventTransaction"("tenantId", "locationId", "status", "eventId");
