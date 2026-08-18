# BUG-130-01 — RPC `get_space_shop_details` : 14,7 s par appel (scan heap 185k lignes + costMap via transactions)

- **Statut** : 🟡 Corrigé non déployé (appliqué sur la base datafriday-dev le 2026-08-18)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux (volet frontend : `datafriday-web` BUG-323-01 — la page Analyse payait cette RPC DEUX fois en série, ~36 s)
- **Découvert le** : 2026-08-18
- **Fichiers** : `supabase/migrations/20260731120000_shop_details_rpc_resolve_datafriday_event_ids.sql` (version corrigée), `src/features/spaces/spaces.service.ts:1114-1131` (appelant + cache Redis 60 s), `src/core/redis/redis.service.ts:getOrSet`

## Symptôme

`GET /spaces/:id/shop-details` en 17-18 s sur l'espace « Stade Jean Bouin »
(`cmsufah9p0c08gpkz2wsg5pzo`, tenant à ~950k WeezeventTransaction). Mesure SQL directe :
`get_space_shop_details(granular=1, limit=200)` = **14 731 ms** pour… 3 events et
0 ligne granulaire.

## Cause racine

Deux contributions, mesurées par EXPLAIN ANALYZE :

1. **Temp table `_space_event_ids` (~11,4 s)** : `SELECT DISTINCT we.id ... FROM
   "WeezeventTransaction" t ... WHERE tenantId + status='V' + locationId = ANY(112 ids)`.
   Le planner choisissait l'index mono-colonne `WeezeventTransaction_locationId_idx`
   (estimation 13k lignes, réalité 185 384) puis re-filtrait tenant/status en heap :
   143k buffers dont **42k lectures disque**. L'index composite
   `(tenantId, locationId, status)` de 20260731000000 existait mais ne couvrait pas
   `eventId` (seule colonne projetée) → heap fetch de toute façon. Variante EXISTS
   inversée testée : 12,3 s (pas d'index couvrant `(eventId, locationId)`).
2. **`menuItemCostMap` (le reste)** : scan de `WeezeventTransactionItem` via un IN sur les
   transactions des locations/events paginés, alors que la valeur produite
   (`MIN(mi."totalCost")` par `wpm."menuItemId"`) ne dépend QUE de
   `WeezeventProductMapping` ⋈ `MenuItem` — le détour par les transactions ne faisait que
   restreindre les clés aux items vendus, restriction inutile (le front n'interroge la map
   que par id d'item vendu).

Aggravants : la page Analyse appelait la RPC deux fois en série (granular=0 puis granular=1,
BUG-323-01 côté front — granular=1 est un surensemble strict), la clé de cache Redis inclut
`page:limit:granular` (jamais partagée entre les deux appels, TTL 60 s), et
`RedisService.getOrSet` n'avait pas de single-flight (double-dispatch/2 onglets = N calculs
identiques concurrents).

## Correction

Branche `fix/analyse-page-load-perf` (2026-08-18) :

1. Index 4 colonnes → scan index-only :
   `prisma/migrations/20260818000000_weezevent_tx_tenant_location_status_eventid_idx`
   (`CREATE INDEX ... ON "WeezeventTransaction"("tenantId","locationId","status","eventId")`),
   reporté dans `schema.prisma` avec la réconciliation du drift des 3 index de 20260731000000
   (jamais reportés — un `prisma migrate dev` les aurait droppés ; vérifié : les 3 existent
   bien sur datafriday-dev).
2. costMap depuis les mappings :
   `supabase/migrations/20260818120000_shop_details_rpc_costmap_from_mappings.sql`
   (surensemble de clés, valeurs identiques ; 178 → 383 clés sur l'espace de test).
3. Single-flight in-process dans `RedisService.getOrSet` (map de promesses en vol par clé).

**Mesure après (1)+(2) sur datafriday-dev : 14 731 ms → 646 ms** (même appel granular=1).

Volontairement PAS touché : la sous-requête granulaire ignore toujours `v_paginated_ids`
(mix d'ids Weezevent/DataFriday dans `SpaceRevenueMinuteAgg."weezeventEventId"`, cf.
BUG-123-01 — filtrer droppait silencieusement des lignes ; et EventPredict consomme le
dataset complet), et le travail `_space_event_ids`/`events` n'est pas gaté par
`p_include_granular` (les fronts non redéployés appellent encore granular=0).

## Risque de régression / à surveiller

- Appliquer l'index en prod en `CREATE INDEX CONCURRENTLY` (table de faits à forte
  écriture — voir l'en-tête de la migration).
- costMap : clés supplémentaires (items mappés jamais vendus) — sans effet connu côté
  front (lookup par id) ; vérifier colonnes coût/marge Analyse + EventPredict.
- Shape de réponse RPC inchangée (`shops`/`shopGranularData`/`events`/`menuItemCostMap`/`meta`).
- Rollback RPC : ré-appliquer le corps de 20260731120000.

## Références

- Frontend : `datafriday-web` `docs/bugs/323_01_analyse_shop_details_double_appel_serialise.md`
- `prisma/migrations/20260731000000_analyse_page_perf_indexes/migration.sql` (précédent audit)
