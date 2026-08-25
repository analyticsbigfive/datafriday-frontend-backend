# BUG-143-01 — Endpoints batch Analyse sans cache Redis : 7-27 s par paquet, ~110 s par page

- **Statut** : corrigé (2026-08-24) — à recetter sur Jean Bouin
- **Modules** : spaces (event-timeline batch, transaction-baskets batch), aggregation (invalidation)
- **Fiches liées** : frontend 363-01 (chargement progressif, l'autre moitié du même chantier),
  361-01 (concurrence des paquets), 137-01 (unmapped : PAS de cache, voir §Décisions)

## En clair

La page Analyse d'un espace à beaucoup de matchs (Jean Bouin : 77) mettait ~110 secondes à
charger, à CHAQUE visite, pour tout le monde. Or l'historique d'un match passé ne change
jamais : le serveur recalculait pourtant tout, à chaque fois. Il mémorise maintenant le
résultat par match pendant 6 heures : le premier chargement reste long, tous les suivants
sont quasi instantanés. Une re-agrégation (recalcul des données d'un match) efface la copie
mémorisée pour resservir du frais.

## Symptôme

- `GET /spaces/:id/event-timeline?eventIds=…` (paquets de 15) : 7 à 27 s par paquet côté
  backend, mesuré sur Jean Bouin (`cmsufah9p0c08gpkz2wsg5pzo`, 77 events, 275 715 lignes
  d'agrégat `SpaceRevenueMinuteItemAgg`, réponses ~1,4 Mo). Idem `transaction-baskets`.
- Aucun cache : chaque visiteur repaie le SQL complet. Le SQL lui-même est sain (fenêtres
  bornées par `resolveEventSalesScope`, index `(tenantId, spaceId, minute, …)` présents) —
  c'est le volume qui coûte.
- Bonus Lighthouse (24/08) : chaque requête payait AUSSI un preflight CORS OPTIONS
  (~180-380 ms) faute d'`Access-Control-Max-Age`.

## Cause racine

Les trois endpoints batch de l'Analyse ont été écrits sans couche Redis alors que leur
donnée est immuable pour un event passé. Le seul cache existant était côté navigateur
(LRU session dans `space.api.js`) — perdu à chaque reload et par utilisateur.

## Correctif

`backend/src/features/spaces/spaces.service.ts` :

- `getEventTimelineBatch` et `getTransactionBasketsBatch` : cache Redis PAR EVENT —
  clés `spaces:evtimeline:{tenantId}:{spaceId}:{eventId}` et `spaces:baskets:…`.
  Lookup en tête (seuls les manquants vont au SQL, `resolveEventSalesScope` reçoit la
  liste réduite), écriture par event en sortie (y compris `[]` : « aucune vente » est
  un résultat, pas une absence de résultat).
- **TTL différencié** via `eventBatchCacheTtl` : event passé (fin de fenêtre < maintenant,
  fenêtres exposées par `resolveEventSalesScope.windows`) → **6 h** ; event du jour/futur
  → **60 s** (le Live re-poll toutes les 15 s ; 60 s est le compromis déjà utilisé par
  `SPACE_SHOPDETAILS_CACHE_TTL`).
- **Invalidation** à deux endroits, alignés par la constante partagée
  `shared/constants/event-batch-cache.ts` (`eventBatchCachePatterns`) :
  - `invalidateSpaceCache` (écritures espace/builder) ;
  - `AggregationService.executeProcessEvents` à la complétion du job — sans ça, une
    re-agrégation servirait jusqu'à 6 h de timeline périmée. Injection directe de
    `RedisService` (global) pour éviter un cycle de modules vers SpacesService.
- CORS : `maxAge: 86400` ajouté dans `main.ts` (`app.enableCors`) — le navigateur met le
  preflight en cache, ~la moitié des requêtes API disparaît.

## Décisions

- `getAnalyseUnmappedBatch` **volontairement NON caché** : décision BUG-137-01 — un
  re-mapping fait en Data Integration doit se voir au prochain chargement de la page.
- Réimport Digifood : pas de purge dédiée — le runbook impose déjà une re-agrégation
  après réimport, et c'est elle qui purge.

## Recette

1. Charger Jean Bouin (premier chargement ≈ inchangé), recharger → requêtes
   `event-timeline` en < 1 s (cache hit).
2. `redis-cli keys 'spaces:evtimeline:*'` peuplé après le premier chargement.
3. Re-agréger un event → clé purgée → données fraîches au chargement suivant.
4. Module Live : re-poll 15 s intact (TTL 60 s sur les events non passés).

JLH
