# BUG-123-01 — `SpaceRevenueMinuteAgg."weezeventEventId"` contient des ids DataFriday → la RPC shop-details renvoie des UUID en guise de noms d'events

**Statut : corrigé (migration `20260731120000_shop_details_rpc_resolve_datafriday_event_ids.sql`)** — JLH

## Symptôme

Mode Predict (AnalyseView, graphe barres « Event Revenue ») : les events prédits affichent leur
nom, toutes les autres barres affichent un UUID (`3f196bc1-…`). Reproduit en base dev : chaque
record de `shopGranularData` sort `eventName = eventId = UUID DataFriday`.

## Cause

1. L'agrégation (`aggregation.service.ts`, `executeProcessEvents`, INSERT ~L293) écrit
   **`event.id` de l'`Event` DataFriday** (UUID, source `prisma.event.findMany`) dans la colonne
   `SpaceRevenueMinuteAgg."weezeventEventId"`. La colonne est donc **mal nommée** : elle contient
   des ids DataFriday, pas des ids `WeezeventEvent` (cuid).
2. La RPC `get_space_shop_details` (version 20260721210000, BUG-021) résolvait le nom via
   `COALESCE(ev_df.name, we.name, srma."weezeventEventId")` avec `we.id = srma."weezeventEventId"`
   (ne matche jamais un UUID) et `ev_df` joint via `we.id` (idem) → repli sur l'id brut.
3. Régression **révélée** par BUG-021 : l'ancienne jointure par DATE
   (`DATE(ev_df."eventDate") = DATE(we."startDate")`) retrouvait un nom malgré la colonne fausse.
4. Frontend : l'UUID matche `state.events` (API `/events` DataFriday) → le record passe les
   filtres, et le label (`EventRevenueByShopChart.vue`, `r.eventName || meta?.name || ''`)
   court-circuite sur l'`eventName` truthy (l'UUID) sans consulter la map de noms.

## Fix

- **SQL** : `20260731120000_shop_details_rpc_resolve_datafriday_event_ids.sql` — ajout d'une
  jointure directe `LEFT JOIN "Event" ev_direct ON ev_direct.id = srma."weezeventEventId"`
  (tenant + space), prioritaire dans les COALESCE de `datafridayEventId` / `eventName` /
  `eventDate`. Repli id brut conservé en dernier recours (lignes réellement orphelines).
- **Frontend** (défense en profondeur, couvre le cache Redis 60 s et d'anciens payloads) :
  `EventRevenueByShopChart.vue` et `GenericByEventChart.vue` ignorent un `eventName` égal à
  l'`eventId` et retombent sur la map de noms construite depuis `props.events` ; plus aucun
  repli « id brut » dans les labels.

## Reste à faire / dette

- La colonne `weezeventEventId` devrait être renommée (`eventId` ou `datafridayEventId`) — hors
  scope ici : touche le schéma Prisma, l'agrégation, la RPC et les index/contraintes UNIQUE.
- 242 042 lignes d'agrégat (105 events) sont orphelines en dev (id sans `Event` ni
  `WeezeventEvent` correspondant) : elles restent filtrées côté frontend (events inconnus du
  store) mais gonflent la table.

## Vérification

```sql
WITH res AS (
  SELECT get_space_shop_details('<spaceId>','<tenantId>', 1, 200, true) AS j
)
SELECT DISTINCT g->>'eventId', g->>'eventName'
FROM res, jsonb_array_elements(res.j->'shopGranularData') g;
-- Attendu : eventName = vrais noms, plus d'UUID (sauf lignes orphelines).
```
