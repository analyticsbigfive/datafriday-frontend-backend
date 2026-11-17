# 09d. Page Live, périmètre restant (inventaire live, listes, SSE, live-status, onglet caché)

Complément de `09_live_pos_cost.md` (partie Live). Ce fichier ne refait pas l'arbre ni la cascade de 09. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code, jamais d'une mesure. Ce qui n'est pas lu est marqué "non vérifié".

## 1. Fiche de la page
Rappel: route `/spaces/:spaceId/live`, `LiveView.vue` (611 lignes), keepAlive true, permission `front.fb.live` (voir 09, section 1).
Fichiers lus dans ce complément: `LiveShopList.vue` (140), `LiveItemsList.vue` (137), `usePredictedNeed.js` (245, partie 150-245), `space-analytics.controller.ts` (lignes 196-348), `stock-level.service.ts` (lignes 280-360).

## 2. Arbre des composants (listes)
| composant | fichier | lignes | rôle | monté | données |
|---|---|---|---|---|---|
| LiveShopList | `frontend/src/components/space-workspace/live/LiveShopList.vue` | 140 | classement des PdV par CA | à l'ouverture | `shops` (= `filteredShopTotals`) |
| LiveItemsList | `frontend/src/components/space-workspace/live/LiveItemsList.vue` | 137 | classement des articles par CA | à l'ouverture | `records` (= `filteredItemRecords`) |

## 3. Appels API (complément)

### 3.1 GET `/spaces/:id/live/inventory` (onglet Inventaire, polling 15 s côté front, voir 09 section 3.3)
| point | constat | preuve |
|---|---|---|
| contrôleur | `@Get(':id/live/inventory')`, permission `front.fb.live`, aucun cache, aucun `@Throttle` lu | `backend/src/features/spaces/space-analytics.controller.ts:287-347` |
| délégation | `SpaceShopsService.getLiveInventory` est un simple passage vers `StockLevelService.getLiveInventory` | `backend/src/features/spaces/services/space-shops.service.ts:266-268` |
| service | appelle `getStock(spaceId, tenantId)` complet (celui de l'écran Logistic), puis reformate en deux arbres (shops et items inversés) en mémoire | `backend/src/features/logistics/services/stock-level.service.ts:302-359` |
| `getStock` | 1 `space.findFirst`, puis en parallèle `config.findMany`, `findNextEventBeforeDoorsOpen` (`space.findFirst` + `event.findMany take 10`), `getLevelsAndConsumption` | `stock-level.service.ts:200-215`, `:178-198` |
| `getLevelsAndConsumption` | en parallèle `stockLevel.findMany` (tous les niveaux de l'espace, sans pagination), `stockReconciliation.findFirst`, `stockMovement.findFirst` (tri createdAt asc), `getSpaceElementIds`; puis `deriveSalesRaw` + `explodeSalesToConsumption`; puis `canonicalizeLevelItemKeys` (jusqu'à 5 `findMany` sur MarketPrice, Ingredient, Packaging, MenuComponent, MenuItem) | `stock-level.service.ts:37-85`, `:87-130` |
| requête lourde | `salesByElementSince`: `WeezeventTransactionItem` JOIN `WeezeventTransaction` JOIN `WeezeventLocation` JOIN `WeezeventLocationShopMapping` (jointure avec `OR` sur `wl.id` ou `wl.weezeventId`) JOIN `WeezeventProductMapping`, filtre `tenantId`, `status='V'`, `deletedAt IS NULL`, `transactionDate > anchorAt`, `GROUP BY` élément, article, event. Pas de filtre `integrationId` ni de borne haute | `backend/src/features/logistics/logistics.queries.ts:6-29`, `backend/src/features/logistics/services/recipe-explosion.service.ts:426-431` |
| ancre | `anchorAt` = date de la dernière `StockReconciliation` (kind null), sinon du premier `StockMovement`. La fenêtre de ventes relue à chaque appel va donc de la dernière réconciliation à maintenant, pas seulement du match en cours | `stock-level.service.ts:57-67` |
| explosion | `explodeSalesToConsumption`: `menuItem.findMany` avec recette complète (ingrédients, composants, enfants) + `expandCombosByName` + `expandComponentsById` (requêtes supplémentaires en cascade), à chaque appel | `recipe-explosion.service.ts:458-502` |
| cache Redis | aucun trouvé sur ce chemin (`getLiveInventory`, `getStock`, `getLevelsAndConsumption`, `deriveSalesRaw`) | `stock-level.service.ts:302`, `:200`, `:37`; `recipe-explosion.service.ts:426` |
| index | la requête de ventes filtre `(tenantId, status, transactionDate)` : l'index `@@index([tenantId, status, transactionDate])` existe (`backend/prisma/schema.prisma:1579`). Le plan réel n'a pas été vu (EXPLAIN non fait) | non vérifié |

Coût par appel (inféré du code): 6 à 8 requêtes ORM + 1 requête SQL à 5 jointures sur la table transactions + 3 à 6 requêtes de recettes. Par onglet Inventaire ouvert: 1 appel toutes les 15 s (09, section 3.3). Le calcul ne dépend que d'événements rares (réconciliation, mouvement, vente), donc un cache court ou une invalidation par signal SSE est possible.

### 3.2 `loadPredictedNeed` (`frontend/src/composables/usePredictedNeed.js:224-245`)
- Appelle `listEventPredictVersions(eventId)` (liste complète des versions, pas de cache front dans cette fonction) puis `pickReferenceVersion(rows)` côté client (`usePredictedNeed.js:229`, `:237`). Repli sur `localDb.getEventPredictVersions` si l'API échoue ou renvoie vide (`:231-235`).
- Aucun cache ni mémoïsation par `eventId`: chaque appelant relit la liste. Appelants dans le périmètre Live: `useLiveRemainingNeed.js:51` (appel avec `elements: [], menuItems: [], components: []`, donc seulement la version est utilisée). Autres appelants hors Live: `SpaceLogisticView.vue:1355`, `SpaceInventoryView.vue:2673`, `:3070`.
- Conséquence: Live relit predict-versions jusqu'à trois fois par session (voir problème 8 de 09). Confirmé pour la 3e lecture: `useLiveRemainingNeed.js:51` appelle bien `loadPredictedNeed`.

### 3.3 GET `/spaces/:id/live-status` (backend)
- Contrôleur `space-analytics.controller.ts:204-232`, permission `front.fb.live`, aucun cache.
- Service `space-shops.service.ts:162-223`. Étapes: (1) `event.findMany` (7 derniers jours, `eventDate <= now`, tri desc, sans `take`) ligne 172; (2) `space.findFirst` pour le fuseau si candidats (`:187`); (3) en parallèle `locationSpaceMapping.findMany` (`:247`) et `resolveShopIdsForSpace` (`:199-202`); (4) une requête SQL sur `WeezeventTransaction`.
- `resolveShopIdsForSpace` EST en cache Redis, TTL 30 s (`backend/src/features/spaces/services/space-sales-scope.service.ts:42-69`, `backend/src/features/spaces/services/space-cache.service.ts:86`). Correction de 09 qui notait "cache non vérifié".
- SQL `eventTimelineRows` (`backend/src/features/spaces/spaces.queries.ts:140-154`): `SELECT MIN(t."transactionDate")` sur `WeezeventTransaction t` LEFT JOIN `WeezeventLocationShopMapping mem` (sur `weezeventLocationId = t.locationId` et `tenantId`), filtres `tenantId`, intégration, `status='V'`, `deletedAt IS NULL`, `transactionDate >= effectiveWindowStart`, périmètre PdV. La fenêtre est au plus de 30 min (`windowStart = now - LIVE_STATUS_WINDOW_MINUTES`, `space-shops.service.ts:212`; la valeur 30 vient du texte du contrôleur `space-analytics.controller.ts:210`, constante non lue), plus étroite si l'event a démarré après.
- Index candidats existants sur `WeezeventTransaction`: `(tenantId, integrationId, status, transactionDate)` (`backend/prisma/schema.prisma:1588`) et `(tenantId, integrationId, status, transactionDate, deletedAt, eventId, locationId, locationName, id)` (`:1596`). La clause d'intégration est `=` ou `= ANY(...)` (`space-shops.service.ts:255-258`), ce qui colle à ces index; sans intégration mappée la clause est vide et seul `(tenantId, status, transactionDate)` (`schema.prisma:1579`) sert. Le plan réel n'a pas été vu.
- `MIN` sans `LIMIT` oblige à parcourir toutes les lignes de la fenêtre de 30 min (pas d'arrêt anticipé). Un `EXISTS` ou `ORDER BY ... LIMIT 1` aurait le même résultat pour `isLive` mais pas pour `since` (le front l'utilise: non vérifié).
- Coût par appel: 3 à 4 requêtes ORM + 1 SQL agrégé sur une fenêtre de 30 min d'un match plein. Faible par appel, mais appelé par page (chaque rafraîchissement) ET par le flux global (voir 3.4).

### 3.4 Signaux SSE: émetteur, cadence, payload, connexions
| élément | constat | preuve |
|---|---|---|
| point de publication unique | `AggregationProcessor.onCompleted` publie sur `liveSpaceChannel(tenantId, spaceId)` à la fin d'un job `process-events` ou `process-event-minutes` (pas `synchronize`) | `backend/src/features/aggregation/aggregation.processor.ts` (méthode `onCompleted`, bloc de publication; numéros de ligne non relevés, le fichier a été lu par `sed`), canal défini `backend/src/shared/live-channel.util.ts:12` |
| payload | `{ spaceId, at }` seulement, quelques dizaines d'octets. Aucun payload métier | même méthode; commentaire `space-analytics.controller.ts:235-240` |
| producteur 1: webhook | à chaque transaction écrite, `queueLiveAggregation` appelle `findLiveEvents()` puis `queueMinuteAggregation` par groupe live | `backend/src/features/weezevent/services/webhook-event.handler.ts:150-178` |
| producteur 2: boucle de sync | cadence par défaut: 10 s en direct sans webhook sain, 120 s avec webhook sain, 30 s si 429, 60 s en période calme (après 10 min sans vente), 1800 s hors event | `backend/src/features/weezevent/services/live/live-sync-cadence.ts:14-27`, appel `backend/src/features/weezevent/jobs/live-sync-scheduler.service.ts:164` |
| producteur 3: rebuild complet | cron toutes les 5 min (`process-events`, plus lourd) | `backend/src/features/weezevent/jobs/live-reconciliation-cron.service.ts:28`, `:43` |
| producteur 4: POS | `pos-live-trigger.service.ts` (72 lignes), même mécanique de coalescence d'après son commentaire ligne 18; corps non relu | `backend/src/features/pos/sales/pos-live-trigger.service.ts:18` |
| coalescence | au plus un job minute en attente par (espace, intégration): clé `live:agg:pending:{space}:{integration}`, TTL 15 min, levée au démarrage du job. Les webhooks suivants retournent `false` sans mise en file | `backend/src/features/weezevent/services/live/live-aggregation-trigger.service.ts:28-47`, `backend/src/shared/constants/live-aggregation.ts` (`livePendingKey`, `LIVE_PENDING_TTL_SEC = 15 * 60`) |
| fréquence réelle | non mesurée. Bornée par la durée d'un job d'agrégation (un signal par job terminé) tant qu'un événement est live; plafond de côté page: 1 rafraîchissement par 30 s (voir 09, section 3.1). Un webhook par transaction fait quand même une requête `findLiveEvents()` même quand le job est déjà en attente | `webhook-event.handler.ts:168-172`, `live-aggregation-trigger.service.ts:33` |
| heartbeat | 20 s par flux SSE, `setInterval` par abonné | `space-analytics.controller.ts:271-273` |
| connexions Redis | `redisClient.duplicate()` + `subscribe` par client SSE de page; le flux global ajoute une 2e connexion avec `psubscribe` (voir 09). Total: 2 connexions Redis dédiées et 2 requêtes HTTP longues par onglet Live ouvert. Fermées par `sub.quit()` au démontage | `space-analytics.controller.ts:258-278` |
| diffusion d'un signal | chaque message du flux global déclenche `verifySpace(spaceId)` pour l'espace concerné, limité à 1 appel `/live-status` par 30 s et par espace et par onglet | `frontend/src/composables/useGlobalLiveIndicator.js:56-72`, `:84-91` |

### 3.5 Double `loadSpace` entre `onMounted` et `onActivated` (confirmation)
- `LiveView.vue:435-436`: `onMounted(() => { ensureSpaceLoaded(); liveData.startPolling() })` et `onActivated(() => { ensureSpaceLoaded(); liveData.startPolling() })`. Sous `<keep-alive>`, Vue exécute `mounted` puis `activated` au premier montage (comportement du framework, pas observé ici dans le navigateur).
- `ensureSpaceLoaded` (`LiveView.vue:236-244`) lance `analyse/loadSpace` si `store.state.analyse.space` est absent ou d'un autre espace.
- `loadSpace` ne partage aucune requête en vol: aucune occurrence de `inFlight`, `inflight`, `loadingPromise` ni `_pending` dans `frontend/src/store/modules/analyse.js` (grep). `SET_SPACE` n'est commis qu'en fin de chargement (`analyse.js:1875`), et `fresh` exige `state.space?.id === spaceId` (`analyse.js:1711-1719`).
- Conclusion: à la première visite (ou après un changement d'espace), les deux crochets voient `space` absent et deux `loadSpace` complets partent presque ensemble: 4 requêtes de phase 1 (`getSpace`, `getSpaceConfigurations`, `getEvents` limit 200, RPC shop-details) puis la vague 2a, chacune en double. À la 2e visite avec store frais, aucun des deux n'appelle; c'est `useRefreshOnReturn` qui relance `loadSpace` (branche `fresh`, revalidation de fond). Statut: confirmé par lecture du code, non observé dans l'onglet Network.

### 3.6 Pause quand l'onglet est caché
- Dans le périmètre Live, aucune occurrence de `visibilitychange`, `document.hidden` ou `visibilityState` dans `components/space-workspace/live/`, `LiveInventoryPanel.vue`, `useLive*.js`, `useGlobalLiveIndicator.js`, `useRefreshOnReturn.js` (grep). Seul `frontend/src/composables/useInventoryLivePolling.js:27`, `:50-59` gère la visibilité, et `LiveInventoryPanel` ne l'utilise pas.
- Conséquence: un onglet Live caché garde le flux SSE, les rafraîchissements timeline et paniers (jusqu'à 1 par 30 s), le calcul client complet (09, problème 7) et le polling `/live/inventory` toutes les 15 s si l'onglet Inventaire est affiché.

### 3.7 Listes et composants d'affichage (calculs côté client)
| composant | calcul | virtualisation | constat | preuve |
|---|---|---|---|---|
| `LiveShopList` | `sorted` = copie triée de `shops`; `maxRevenue` par `reduce` | aucune; 5 lignes par défaut (`sorted.slice(0, 5)`), tout rendu après "Voir tout" | O(s log s) par tick, s = nombre de PdV (dizaines); négligeable. Le toggle Total/Moy ne change rien (commentaire) et la règle CSS `.lsl-row` est morte | `LiveShopList.vue:11-14`, `:62-69`, `:138` |
| `LiveItemsList` | agrège TOUS les `records` dans une `Map` par `menuItemName`, tri, `maxRevenue` | aucune; 5 lignes par défaut, tout après "Voir tout" | O(n) sur `filteredItemRecords` à chaque tick; le DOM reste petit tant que "Voir tout" est fermé. Ouvert, un catalogue de centaines d'articles est rendu entier avec `v-btn`, `v-avatar` (Vuetify) par ligne | `LiveItemsList.vue:9-10`, `:60-72` |
| `LiveFilterPanel` | 6 `countBy(props.records, ...)` indépendants (PdV, type de PdV, zone, article, type d'article, catégorie) puis listes filtrées | aucune; `v-for` sur tous les PdV, articles, types, catégories (cases à cocher) | 6 parcours complets des enregistrements à chaque nouvelle liste `records` (donc chaque tick), plus mise à jour du DOM de toutes les cases. Panneau toujours monté, replié par CSS (09). Implémentation de `countBy` non lue | `LiveFilterPanel.vue:241-261`, `:272-278`, `v-for` aux lignes 39, 57, 77, 109, 130, 145 |
| `LiveHeader` | `computeUnmappedVolume(props.allRecords)` | n/a | 1 parcours des enregistrements par tick, léger; implémentation non lue | `LiveHeader.vue:177` |

## 4. Cascade au premier affichage (ajouts à 09)
- t1 (mount, même tick): ajout par rapport à 09, le second `ensureSpaceLoaded()` de `onActivated` relance en parallèle un `loadSpace` complet identique (3.5).
- Hors chemin critique de la page: le flux global a déjà reçu des messages et peut lancer un `/live-status` par espace avant ou pendant le premier `/live-status` de la page (3.4).
- Onglet Inventaire (à l'entrée): `loadVersion` (predict-versions, 3.2) puis `GET /live/inventory` (3.1), puis un cycle de 15 s. Le chemin critique de l'onglet est D1.

## 5. Problèmes de performance
Numérotation D1 à D9 pour ne pas entrer en conflit avec les 10 problèmes de `09_live_pos_cost.md`.

1. **D1. `GET /live/inventory` recalcule tout le stock à chaque appel, sans cache (haut).** Chaîne complète `getStock` + dérivation des ventes + explosion de recettes, 6 à 8 requêtes ORM, 1 SQL à 5 jointures sur la table transactions et 3 à 6 requêtes de recettes, voir 3.1. Aucun cache Redis ni partage de requêtes en vol (`stock-level.service.ts:200-215`, `:37-85`, `recipe-explosion.service.ts:426-431`, `:458-502`). Appelé toutes les 15 s par onglet Inventaire (09, section 3.3). Pages: Live (onglet Inventaire), et par construction Logistic qui partage `getStock`.
2. **D2. La fenêtre de ventes relue va de la dernière réconciliation à maintenant, sans filtre d'intégration ni de borne haute (haut, à confirmer par EXPLAIN).** `transactionDate > anchorAt` (`recipe-explosion.service.ts:428`) avec `tenantId`, `status='V'` seuls côté transaction; le périmètre espace n'est appliqué que par la jointure sur `WeezeventLocationShopMapping` (`logistics.queries.ts:17-25`). Le volume lu croît avec l'âge de la dernière réconciliation et avec le nombre d'espaces du tenant. La jointure de localisation utilise un `OR` (`logistics.queries.ts:19`), qui limite le choix d'index. Pages: Live Inventaire, Logistic.
3. **D3. `loadPredictedNeed` n'a aucun cache et relit la liste entière des versions (moyen).** `usePredictedNeed.js:224-245`; sur Live, `useLiveRemainingNeed.js:51` n'utilise que la version (`elements: [], menuItems: [], components: []`), ce qui confirme la 3e lecture de predict-versions notée en 09 (problème 8). Pages: Live, Logistic, Inventaire.
4. **D4. Double `loadSpace` complet au premier montage, confirmé par le code (moyen).** Voir 3.5. Pages: Live.
5. **D5. `/live-status` sans cache, appelé par la page ET par le flux global (moyen).** Voir 3.3 et 3.4. Détails: `event.findMany` sans `take` sur 7 jours (`space-shops.service.ts:172-180`), puis `space.findFirst`, `locationSpaceMapping.findMany` (non caché, `:246-252`), `MIN()` sur la fenêtre de 30 min (`spaces.queries.ts:140-154`). `resolveShopIdsForSpace` est en revanche en cache 30 s. Le coût par appel est modeste, c'est la multiplication (n utilisateurs du tenant × espaces actifs × 1 par 30 s, plus la page) qui compte. Pages: toutes (indicateur global), Live.
6. **D6. Aucune pause onglet caché sur Live (moyen).** Voir 3.6. Pages: Live.
7. **D7. Deux connexions Redis et deux flux SSE par onglet (bas à moyen, selon le nombre d'utilisateurs simultanés).** `space-analytics.controller.ts:258`; flux global voir 09. Les messages sont minuscules, le coût est dans les connexions longues, pas dans la bande passante. Pages: toutes (flux global), Live.
8. **D8. `LiveFilterPanel` fait 6 parcours complets des enregistrements par tick et rend toutes ses cases, même replié (moyen).** Voir 3.7. S'ajoute au recalcul client de 09 (problème 7). Pages: Live.
9. **D9. Listes `LiveItemsList` / `LiveShopList` et `LiveHeader` (bas).** Un parcours chacune par tick; le rendu est borné à 5 lignes tant que "Voir tout" est fermé. Aucune virtualisation, mais pas nécessaire sauf si "Voir tout" est ouvert sur un grand catalogue (`LiveItemsList.vue:9`). Pages: Live.

## 6. Recommandations
### Backend
| action | gain attendu | risque | effort | fichiers |
|---|---|---|---|---|
| Cache Redis court (10 à 15 s) de `getLiveInventory` par (tenant, espace), avec requêtes concurrentes fusionnées (single-flight) | divise les appels par le nombre d'onglets; absorbe le polling 15 s | stock affiché périmé de quelques secondes; invalidation à prévoir sur écriture de mouvement ou de réconciliation | S à M | `stock-level.service.ts:302`, `space-shops.service.ts:266`, service de cache existant (`space-cache.service.ts`) |
| Borner et alléger la dérivation des ventes: ajouter le filtre intégration/espace dans `salesByElementSince`, ou calculer la consommation par watermark (somme incrémentale depuis le dernier calcul) | supprime la relecture de toutes les ventes depuis la dernière réconciliation à chaque appel | cohérence avec `deriveEventConsumption` et la règle de l'ancre (commentaire `stock-level.service.ts:369-378`); à valider par EXPLAIN | M à L | `logistics.queries.ts:6-29`, `recipe-explosion.service.ts:426-431` |
| Cache du contexte de recettes (`menuItem` + combos + composants) par tenant, TTL court, hors du chemin chaud | retire 3 à 6 requêtes par appel | périmètre d'invalidation des recettes | M | `recipe-explosion.service.ts:458-502` |
| Cache Redis 10 à 20 s de `getLiveStatus` par (tenant, espace) et `take` sur `event.findMany` | divise les doublons page + flux global + utilisateurs | statut périmé de 10 à 20 s, bien sous la fenêtre de 30 min | S | `space-shops.service.ts:162-223`, `:172` |
| Mettre `locationSpaceMapping.findMany` des intégrations dans le cache `spaces:salesscope` déjà existant (60 s) | 1 requête de moins par `live-status` | purge à l'édition de mapping (déjà prévue par `invalidateSpaceCache`) | S | `space-shops.service.ts:246-252`, `space-sales-scope.service.ts:114-130` |
| Webhook: ne pas appeler `findLiveEvents()` quand le job minute est déjà en attente (tester la clé `pending` avant) | moins de requêtes par transaction en rafale | ordre des vérifications, la clé dépend du groupe | S | `webhook-event.handler.ts:168-172`, `live-aggregation-trigger.service.ts:33` |

### SQL / index
| action | gain attendu | risque | effort | fichiers |
|---|---|---|---|---|
| EXPLAIN (ANALYZE, BUFFERS) de `salesByElementSince` sur une prod avec une ancre ancienne, et de `eventTimelineRows` | confirme ou infirme D2 avant tout changement | aucun (lecture, transaction `begin read only`) | S | `logistics.queries.ts:6`, `spaces.queries.ts:140` |
| Si D2 est confirmé: remplacer le `OR` de jointure de localisation par deux jointures `UNION` ou une normalisation du mapping | ouvre l'accès par index sur `WeezeventLocationShopMapping` | résultat identique à prouver (même ensemble de lignes) | M | `logistics.queries.ts:17-19` |

### Frontend
| action | gain attendu | risque | effort | fichiers |
|---|---|---|---|---|
| Remplacer le `setInterval` 15 s de l'inventaire par un rafraîchissement déclenché par le signal SSE (déjà reçu par la page) avec plancher 15 s, et utiliser `useInventoryLivePolling.js` (garde `document.hidden`) | moins d'appels D1, zéro appel onglet caché | rattrapage si SSE coupé (garder un filet lent de 60 s) | S | `LiveInventoryPanel.vue:369`, `:388-391`, `useInventoryLivePolling.js` |
| Pause globale sur `document.hidden` dans `useLiveData` et le flux de page (déconnecter ou ignorer, rattrapage immédiat à la reprise) | supprime le trafic et le calcul des onglets cachés | un rafraîchissement forcé à la reprise | S | `useLiveData.js`, `useLiveStream.js`, `useGlobalLiveIndicator.js` |
| Un seul `ensureSpaceLoaded()` (garde de requête en vol dans `loadSpace`, ou crochet unique) | évite 4 requêtes de phase 1 et la vague 2a en double à la première visite | effet de bord sur d'autres écrans si la garde est dans le store | S | `LiveView.vue:435-436`, `analyse.js:1705` |
| Cache mémoïsé par `eventId` (TTL court) pour `listEventPredictVersions` dans `loadPredictedNeed` | 1 lecture au lieu de 3 sur Live; profite à Logistic et Inventaire | invalidation après sauvegarde d'une version | S à M | `usePredictedNeed.js:224-245` |
| `LiveFilterPanel`: calculer les 6 comptages en une seule passe, et ne pas rendre (`v-if`) le contenu du panneau tant qu'il est replié | divise le coût de comptage par 6, DOM allégé | état des cases à conserver à l'ouverture | S à M | `LiveFilterPanel.vue:241-261` et gabarit |
| `LiveItemsList`: limiter le rendu après "Voir tout" (pagination par 50 ou virtualisation) | borne le DOM sur gros catalogue | faible | S | `LiveItemsList.vue:9-10` |
| Retirer la règle CSS morte `.lsl-row` et le toggle Total/Moy sans effet | propreté, pas de gain perf | faible | S | `LiveShopList.vue:5-8`, `:138` |

## 7. Points non vérifiés
- Plan d'exécution réel (EXPLAIN) de `salesByElementSince` et de `eventTimelineRows`; durée et volume de lignes sur un espace à plusieurs saisons sans réconciliation récente.
- Durée d'un appel `GET /live/inventory`, taille de sa réponse, et âge typique de `anchorAt` en production.
- Fréquence réelle des signaux SSE pendant un match (nombre de jobs `process-event-minutes` par minute, durée d'un job), nombre de connexions Redis simultanées.
- Numéros de ligne de `onCompleted` dans `aggregation.processor.ts`, corps de `useLiveStream.js`, `live.controller.ts` (flux global), `live-sync-scheduler.service.ts`, `pos-live-trigger.service.ts` (corps), implémentations de `countBy` (`LiveFilterPanel`) et `computeUnmappedVolume` (`LiveHeader`): non relus dans ce complément.
- Existence d'un partage de requêtes en vol dans `useSpaceData.js` (non lu; `analyse.js` n'en a pas d'après grep). Observation du double `loadSpace` dans l'onglet Network à faire.
- Usage de `since` retourné par `/live-status` côté front (décide si un `EXISTS`/`LIMIT 1` suffit).
- Constante `LIVE_STATUS_WINDOW_MINUTES` (valeur 30 déduite du texte du contrôleur, définition non lue) et taille réelle de `StockLevel` par espace.
- `LiveInventoryPanel` (858 lignes): non relu, seules les lignes déjà citées en 09 sont utilisées.
