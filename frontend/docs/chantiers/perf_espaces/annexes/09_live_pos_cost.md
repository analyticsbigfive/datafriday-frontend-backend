# 09. Pages Live, POS (et caisse invité), Cost tracking

Statut de couverture: la page Live est analysée en profondeur (frontend et backend). Les pages POS, caisse invité et Cost tracking ne sont couvertes que pour la fiche de route et l'inventaire des fichiers; tout le reste est marqué "non vérifié" (section 7). Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code, jamais d'une mesure.

## 1. Fiche de la page

| Page | Route / nom | Composant routé | Lignes | Meta | Garde | Preuve |
|---|---|---|---|---|---|---|
| Live | `/spaces/:spaceId/live`, `space-live` | `frontend/src/components/space-workspace/live/views/LiveView.vue` | 611 | title Live, keepAlive true, permission `front.fb.live` | aucun beforeEnter sur la route (garde du parent non lue) | `frontend/src/router/index.js:276-279` |
| POS | `/spaces/:spaceId/pos`, `space-pos` | `.../space-workspace/pos/views/SpacePosView.vue` | 290 | title POS, permission `front.fb.pos`, pas de keepAlive | non vérifié | `frontend/src/router/index.js:284-287` |
| Cost tracking | `/spaces/:spaceId/cost-tracking`, `space-cost-tracking` | `.../space-workspace/cost-tracking/views/SpaceCostTrackingView.vue` | 361 | title Cost tracking, permission `front.fb.costTracking`, pas de keepAlive | non vérifié | `frontend/src/router/index.js:292-295` |
| Caisse invité | `/pdv/pos`, `guest-pos` | `frontend/src/components/guest-pos/views/GuestPosView.vue` | non vérifié | guestMode, noindex | `beforeEnter: requireGuestPinSession` | `frontend/src/router/index.js:123-127` |

Conséquence du keepAlive: Live reste monté en mémoire quand on le quitte (timers arrêtés sur `onDeactivated`, voir section 3). POS et Cost tracking sont démontés à chaque sortie, donc rechargent tout à chaque visite (inféré de l'absence de keepAlive, comportement réel non vérifié).

Fichiers (lignes): `live/` 8 .vue (LiveDoorsCountdown 68, LiveKpiRow 102, LiveItemsList 137, LiveShopList 140, LiveHrPanel 245, LiveHeader 320, LiveFilterPanel 508, views/LiveView 611). `pos/` 25 .vue dont PosPdvCard 196, PosTabs 146, PosFilterCard 146, PosSalesFilters 144, PosBand 135, PosSalesSummaryCard 128, PosSalesTable 127, PosEventPicker 99, PosPinSummary 100, PosSalesHistory 89 (liste complète par `wc -l`). `cost-tracking/` 25 .vue dont CostTrackingHistoryDrawer 219, CostTrackingChart 236, CostTrackingFilterPanel 203, CostTrackingVersionItem 166, CostTrackingTable 158, CostTrackingSummaryPanel 117, CostTrackingRankCard 116.

## 2. Arbre des composants

### Live (lu)

| Composant | Fichier | Lignes | Rôle | Monté | Données reçues |
|---|---|---|---|---|---|
| WorkspaceAppHeader | `frontend/src/components/WorkspaceAppHeader.vue` | 319 | bandeau + KPI header | à l'ouverture | `headerKpis` (LiveView.vue:403-419) |
| LiveFilterPanel | `live/LiveFilterPanel.vue` | 508 | filtres PdV/types/zones/articles | à l'ouverture (replié par CSS, pas v-if, LiveView.vue:467-487) | `itemRecords` complets |
| LiveHeader | `live/LiveHeader.vue` | 320 | titre, compte à rebours, boutons | à l'ouverture | `filteredItemRecords`, `allRecords` |
| LiveKpiRow | `live/LiveKpiRow.vue` | 102 | KPI (v-can `stats.financial.view`) | onglet analyse | `metrics`, `txPerMinute` |
| EventTimelineChart | `space-workspace/shared/EventTimelineChart.vue` | 947 | courbe minute, fond prédit | onglet analyse | `filteredTimelineRows`, fond predict |
| ShopDistributionPieChart | `analyse/charts/ShopDistributionPieChart.vue` | 217 | donut PdV | onglet analyse | `filteredItemRecords` |
| TransactionCategoryMixChart | `analyse/charts/TransactionCategoryMixChart.vue` | 190 | donut catégories par panier | onglet analyse | `filteredBasketRows` |
| MenuItemRevenueDistribution | `analyse/tables/MenuItemRevenueDistribution.vue` | 457 | table articles | onglet analyse | `filteredItemRecords` |
| LiveHrPanel | `live/LiveHrPanel.vue` | 245 | classement RH | seulement si onglet hr (v-else-if) | `liveHr.rows` |
| LiveInventoryPanel | `space-workspace/shared/LiveInventoryPanel.vue` | 858 | inventaire live + prévu restant | seulement si onglet inventaire (v-else, détruit au changement d'onglet) | `timelineRows`, `predictedTimeline` |
| LiveShopList / LiveItemsList | `live/LiveShopList.vue` (140), `live/LiveItemsList.vue` (137) | | colonne droite (v-can CA) | à l'ouverture | `filteredShopTotals`, `filteredItemRecords` |
| LiveSaleSimulatorWidget | `analyse/LiveSaleSimulatorWidget.vue` | 454 | QA, `v-if="!isProdEnv"` | hors prod seulement | non vérifié |
| EventFormDrawer | `events/drawers/EventFormDrawer.vue` | 1353 | édition event | monté à l'ouverture de la page (pas de v-if, LiveView.vue:143-150), `v-model` | `liveData.event` |
| WorkspaceMobileToolDrawer | `components/WorkspaceMobileToolDrawer.vue` | non vérifié | nav outils | monté, `v-model` | |

Les onglets sont des `v-if` (analyse), `v-else-if` (hr), `v-else` (inventaire): un seul onglet est monté à la fois (LiveView.vue:59-107). Virtualisation des listes (LiveShopList, LiveItemsList, MenuItemRevenueDistribution, LiveInventoryPanel): non vérifié.

### POS, Cost tracking, caisse invité
Arbre non lu. Seul l'inventaire de fichiers est établi (section 1). Non vérifié.

## 3. Appels API, composant par composant

### 3.1 Live, chargement et cycle de rafraîchissement (`useLiveData`)

Fichier: `frontend/src/composables/useLiveData.js` (289 lignes). Constantes: `FALLBACK_POLL_MS` 30 s, `MIN_REFRESH_MS` 30 s, `DELTA_OVERLAP_MIN` 5, `FULL_RESYNC_MS` 10 min, `EVENTS_LIST_TTL_MS` 10 min, `CLOCK_TICK_MS` 30 s (useLiveData.js:38-51).

| Déclencheur | Méthode + URL | Front | Séquentiel / bloquant | Cache front | Backend | Tables / SQL | Redis | Coût probable |
|---|---|---|---|---|---|---|---|---|
| mount / activated, puis chaque signal SSE (limité à 1 par 30 s) | GET `/spaces/:id/live-status` | `space.api.js:31`, appelé `useLiveData.js:112` | premier maillon, bloque tout le reste | aucun | `space-analytics.controller.ts:204-232`, `space-shops.service.ts:162-223` | Event (7 jours), Space, LocationSpaceMapping, shopIds, puis SQL brut `MIN(transactionDate)` sur `WeezeventTransaction` JOIN `WeezeventLocationShopMapping`, fenêtre 30 min (`spaces.queries.ts:140-153`) | aucun vu dans ce chemin (cache de `resolveShopIdsForSpace` non vérifié) | 4 à 5 requêtes DB par appel, une sur la table transactions |
| 1re résolution, event changé, ou toutes les 10 min | GET `/events?spaceId&limit=200&excludeSimulated=false` | `useLiveData.js:131` | séquentiel après live-status, bloque le chargement des lignes | `resolvedKey`, `eventsFetchedAt` (TTL 10 min) | EventsController (non lu) | non vérifié | non vérifié | liste de 200 events |
| 1er chargement, event changé, après 10 min, retour sur la page, `refresh()` manuel | GET `/spaces/:id/event-timeline?eventIds&granularity=minute` et GET `/spaces/:id/transaction-baskets?eventIds`, en parallèle | `space.api.js:318`, `:419`, appelés `useLiveData.js:156-159` avec `bypassCache: true` | parallèles entre eux, bloquent `loading=false` | écrit dans les caches session de space.api, mais `bypassCache` les ignore | `space-analytics.controller.ts:41-75` et `:80-150`; `space-event-timeline.service.ts:33-262`; `space-analyse-batch.service.ts:58-145` | timeline: `SpaceRevenueMinuteItemAgg` (CTE `win` MATERIALIZED), JOIN SpaceElement, WeezeventProductMapping, MenuItem, ProductType, ProductCategory; paniers: `SpaceBasketMinuteAgg` (`basket-agg-read.sql.ts`) + repli brut `WeezeventTransaction` pour les events sans pré-agrégat | clé par event `spaces:evtimeline:{tenant}:{space}:{event}` et `spaces:baskets:...`, TTL 60 s si event du jour/futur, 6 h si passé (`space-cache.service.ts:52-53`) | timeline minute: "~2 Mo/event" d'après le commentaire `space-event-timeline.service.ts:40` |
| tick suivant (SSE ou poll de secours) | mêmes deux URL avec `since=minuteLocal-5min` | `liveDelta.api.js:8-15`, `useLiveData.js:148-154` | parallèles | fusion `mergeSince` en mémoire | mêmes méthodes backend, puis `rowsSinceMinute` (`live-delta.util.ts:11-24`) | voir ci-dessus | voir ci-dessus | voir problème 1 |
| connexion de la page | GET `/spaces/:id/live/stream` (SSE par `fetch` + lecteur) | `useLiveStream.js:13-104` (backoff 1,2,5,10,20 s) | permanent | | `space-analytics.controller.ts:245-280` | aucune | `redisClient.duplicate()` par client, `subscribe(live:tenant:..:space:..)`, heartbeat 20 s | 1 connexion HTTP + 1 connexion Redis par onglet |
| connexion de session (App.vue) | GET `/live/stream` | `useGlobalLiveIndicator.js:70-93` (singleton) | permanent | | `live.controller.ts:42+` | `getAccessibleSpaceIds` à la connexion | `duplicate()` + `subscribe(notif user)` + `psubscribe live:tenant:{tenant}:space:*` (`live-channel.util.ts:12-18`) | 2e connexion HTTP + 2e connexion Redis par utilisateur |
| chaque message du flux global | GET `/spaces/:id/live-status` | `useGlobalLiveIndicator.js:56-69` (throttle 30 s par espace) | arrière-plan | | idem ligne live-status | idem | idem | doublon avec le rafraîchissement de la page (problème 2) |

Nettoyage: `stopPolling` (clearInterval, cancel du limiteur, `stream.disconnect()` avec `AbortController.abort`) est appelé sur `onDeactivated` et `onBeforeUnmount` (`LiveView.vue:437-438`, `useLiveData.js:236-242`). Le flux de session reste connecté tant que l'utilisateur est connecté (voulu).

### 3.2 Live, catalogue d'espace (store `analyse`)

| Déclencheur | Appel | Front | Séquentiel / bloquant | Cache | Remarques |
|---|---|---|---|---|---|
| `onMounted` et `onActivated` (`LiveView.vue:435-436`) si l'espace n'est pas en store | `analyse/loadSpace {skipRecipeCatalog:true}` | `LiveView.vue:236-244`, `analyse.js:1705-1783` | phase 1 en parallèle: `getSpace`, `getSpaceConfigurations`, `getEvents(limit 200)`, `getSpaceShopGranular(page1, limit200)` (RPC shop-details, démarré dès le début); vague 2a: `getAllMenuItems`, types, catégories, produits Weezevent, mappings (`useSpaceData.js:116-241`) | store `analyse`, TTL 15 min, revalidation de fond si frais (`analyse.js:1715-1768`) | `skipRecipeCatalog` évite le catalogue recettes (`useSpaceData.js:326-332`) |
| juste après (garde `allConfigsCtxRequested`, une fois) | `analyse/loadAllConfigsShopContext` | `LiveView.vue:227-234`, `analyse.js:2067-2124` | pool de 3 configs; par config: `getBuilder2SubtypesByName`, `getConfiguration`, `spaceShops/fetchForSpace`, `getConfigShopMenuItemsLight` (`analyse.js:136-180`, `:272-303`) | `buildConfigShopEntryCached` | coût = nb de configs de l'espace |
| retour sur la page (absent depuis 30 s ou plus) | `useRefreshOnReturn` | `LiveView.vue:428-433`, `useRefreshOnReturn.js` | en parallèle: `liveData.refresh` (version forcée: `forceNext`, `lastFullAt=0`, donc event + timeline et paniers en entier), `loadSpace`, `predictBackground.reload`, `liveHr.reloadSilently` | | recharge complète à chaque retour |

### 3.3 Live, predict, RH, inventaire

| Composant | Déclencheur | Appel | Front | Remarques |
|---|---|---|---|---|
| `useLivePredictBackground` | watch immediate sur `eventId`, `enabled` | GET `/events/:id/predict-versions` | `useLivePredictBackground.js:20-34`, `eventPredict.api.js:20-22` | liste complète, la version par défaut est cherchée côté client; lit `predictedTimeline` |
| `useLiveHr` | onglet hr actif | GET predict-versions (2e fois) + `staffing/fetchStaffing` | `useLiveHr.js:30-62`, `:64-69` | lit `def.predictedRecords` de la liste: la liste porte donc les enregistrements prédits (taille non vérifiée). Cache store staffing non vérifié |
| `useLiveRemainingNeed` | watch immediate sur `eventId` (onglet inventaire) | `loadPredictedNeed(...)` (version) | `useLiveRemainingNeed.js:42-62` | source de `loadPredictedNeed` non lue: peut être un 3e appel predict-versions (non vérifié) |
| idem | catalogue recettes pas prêt | `analyse/loadSpace` SANS `skipRecipeCatalog`, attente 45 s, 2e tentative `force:true` | `useLiveRemainingNeed.js:76-95`, `analyse.js:1716-1723` | espace "pas frais" faute de recettes: rechargement complet avec skeleton, ajoute `getComponents` paginé, ingrédients, packagings, fournisseurs (`useSpaceData.js:204-217`) |
| `LiveInventoryPanel` | mount, `active`, activated, puis `setInterval` 15 s | GET `/spaces/:id/live/inventory` | `LiveInventoryPanel.vue:224`, `:369`, `:388-391` | contrôleur `space-analytics.controller.ts:287+`, délègue à `StockLevelService.getLiveInventory` (`space-shops.service.ts:266-268`), SQL et cache non lus. Arrêt sur `deactivated`/`beforeUnmount`. Pas de test `document.hidden` |

### 3.4 POS, caisse invité, Cost tracking
Non vérifié (aucun composant ni composable lu). Fichiers API à analyser: `frontend/src/api/endpoints/pos.api.js` (154 lignes), `guestPos.api.js` (47), `cost-tracking.api.js` (98). Côté backend, les dossiers `backend/src/features/pos/` et `backend/src/features/cost-tracking/` existent. Seul fait lu côté POS: un déclencheur d'agrégation live (`backend/src/features/pos/sales/pos-live-trigger.service.ts:58`, job `process-event-minutes`, regroupement des jobs en attente par espace et intégration d'après le commentaire ligne 19), qui alimente le même signal SSE que Live.

## 4. Cascade au premier affichage (Live)

- t0: import lazy de `LiveView.vue` (chunk), rendu du squelette (`liveData.loading` initial true, `useLiveData.js:60`). Le flux global `/live/stream` est déjà connecté.
- t1 (mount, même tick): (a) `ensureSpaceLoaded` lance `loadSpace` (4 requêtes de phase 1 en parallèle puis vague 2a); (b) `startPolling` lance `refresh` immédiatement (`throttled.request()` sans délai la 1re fois, `throttled-runner`): `live-status`.
- t2: `live-status` répondu -> `getEvents(limit 200)` si event non résolu.
- t3: `event-timeline (minute)` + `transaction-baskets` en parallèle. Si cache Redis vide (purgé à chaque fin d'agrégation, voir 5.1), SQL sous sémaphore (`analyseBatchSemaphore`, 2 en vol, file 32, 60 s puis 503, commentaire `space-event-timeline.service.ts:178`).
- t4: `loading=false`, les calculs client démarrent (section 5.7). En parallèle, `loadAllConfigsShopContext` après `loadSpace`, et `predict-versions` dès que `eventId` est connu.
- Chemin critique: `live-status` -> `events` -> `timeline + baskets` (3 maillons réseau séquentiels), plus le catalogue d'espace dont dépendent les filtres et la réconciliation.
- Doublon possible au t1 (hypothèse, voir 5.4): `onMounted` et `onActivated` s'exécutent tous deux au premier montage keep-alive et appellent chacun `ensureSpaceLoaded()`.

## 5. Problèmes de performance

1. **Le mode delta économise la bande passante, pas le serveur (haut).** `since` est appliqué APRÈS le calcul/la lecture Redis de l'event entier: `getEventTimelineBatch(...)` puis `rowsSinceMinute(byEvent, since)` (`space-analytics.controller.ts:71-74`, `:149-150`, `live-delta.util.ts:11-24`). Chaque tick lit et désérialise en Redis la timeline complète ("~2 Mo/event" selon le commentaire `space-event-timeline.service.ts:40`) et les paniers, puis jette le plus gros. Après chaque fin d'agrégation, le cache est purgé (`event-batch-cache.ts:15-22`, `aggregation.service.ts:353`, `live-minute-aggregation.service.ts:94`) puis le signal SSE est publié (`aggregation.processor.ts:78-87`): le premier client paie le SQL complet de l'event (timeline + paniers), les suivants un hit Redis de 60 s de TTL. Pages: Live.
2. **Doublon de `/live-status` (moyen).** Le flux global appelle `/live-status` par espace à chaque message (throttle 30 s, `useGlobalLiveIndicator.js:56-69`) et la page Live l'appelle aussi à chaque rafraîchissement (`useLiveData.js:112`). La requête touche la table brute `WeezeventTransaction` sans cache Redis visible (`spaces.queries.ts:140-153`). Tous les utilisateurs du tenant avec `front.fb.live` vérifient chaque espace actif (pattern `live:tenant:{id}:space:*`), pas seulement l'espace regardé. Pages: toutes (indicateur global), Live.
3. **Deux flux SSE par onglet Live, deux connexions Redis dédiées (moyen à l'échelle).** `redisClient.duplicate()` par client dans `space-analytics.controller.ts:258` et `live.controller.ts` (flux global). Coût linéaire en nombre d'onglets ouverts, plus un `heartbeat` de 20 s par flux. Le front ne se met pas en pause quand l'onglet est caché (aucun `document.hidden` ni `visibilitychange` dans `useLiveData.js` ni `useLiveStream.js`): le rafraîchissement limité à 30 s continue en arrière-plan. Pages: Live.
4. **Chargement dupliqué au premier montage (moyen, à confirmer).** `onMounted(() => { ensureSpaceLoaded(); liveData.startPolling() })` et `onActivated(...)` identique (`LiveView.vue:435-436`). Au premier montage sous keep-alive, les deux crochets s'exécutent avant la fin du premier `loadSpace`, donc la condition `!store.state.analyse.space` (`LiveView.vue:237`) est vraie deux fois et un second `loadSpace` complet part. Un partage de requêtes en vol éventuel dans `useSpaceData` n'a pas été vérifié. `startPolling` double est sans effet grâce au limiteur (`throttledRunner.js`, `request` ignore si timer présent).
5. **Liste des 200 events chargée deux fois (moyen).** `loadSpace` appelle `getEvents(limit 200, excludeSimulated:true)` (`useSpaceData.js:149`) et `resolveEvent` appelle `getEvents(limit 200, excludeSimulated:false)` (`useLiveData.js:131`). Aussi relue toutes les 10 min et à chaque retour sur la page (`forceNext`).
6. **L'onglet Inventaire déclenche un `loadSpace` complet avec catalogue recettes (haut à l'entrée de l'onglet).** `requestCatalog` sans `skipRecipeCatalog` (`useLiveRemainingNeed.js:80-95`) rend l'espace "non frais" (`analyse.js:1716-1723`): recharge phase 1 + 2a + 2b (composants paginés, ingrédients, packagings, fournisseurs, `useSpaceData.js:84-94`, `:204-217`). Le commentaire de `LiveView.vue:238-241` parle d'un fan-out `/menu-components/:id` "jusqu'à plusieurs centaines" (commentaire, non revérifié). Fenêtre d'attente de 45 s puis seconde tentative `force:true`, soit un second chargement complet si le catalogue est lent. Le panneau est détruit au changement d'onglet (`v-else`), donc `loadVersion` est refait à chaque retour sur l'onglet.
7. **Recalculs client complets à chaque tick de 30 s (moyen).** `timelineRows` est remplacé par `mergeSince` (nouvelle liste), ce qui invalide `itemRecords` (`useLiveItemRecords.js:34-38`: copie `{...r}` de chaque ligne + `preprocessTimelineRecords` + `reconcileRecord` par ligne) ET `processedTimelineRows` (`LiveView.vue:279-282`: `preprocessTimelineRecords` + `reconcileRecord` sur toutes les lignes minute). Puis `filteredItemRecords`, `filteredTimelineRows`, `filteredBasketRows`, `filteredShopTotals`, `metrics` et les graphiques. Deux passes de réconciliation sur les mêmes lignes. Volume de lignes non mesuré. Sur l'onglet Inventaire s'ajoutent `remainingIndex` et `cadenceIndexes` (`useLiveRemainingNeed.js:139-170`) qui reconstruisent des index sur tous les PdV × articles × composants à chaque changement de `timelineRows`.
8. **Predict-versions chargé jusqu'à trois fois (moyen).** `useLivePredictBackground` (à l'ouverture), `useLiveHr` (onglet hr) et `useLiveRemainingNeed` via `loadPredictedNeed` (onglet inventaire, à vérifier) lisent la liste complète des versions pour en extraire la version par défaut, alors que `useLiveHr.js:58-61` lit `def.predictedRecords` dans cette liste (charge utile lourde probable, taille non vérifiée). Aucun partage entre composables. Chaque retour sur la page relit aussi cette liste (`reload` silencieux).
9. **Polling inventaire de 15 s sans pause onglet caché (bas à moyen).** `LiveInventoryPanel` n'utilise pas la garde `document.hidden` pourtant présente dans `useInventoryLivePolling.js:30` (`LiveInventoryPanel.vue:388-391`). Le SQL de `/live/inventory` n'a pas été lu.
10. **Retour sur la page = rechargement complet (moyen).** `useRefreshOnReturn` (absence de 30 s ou plus) déclenche `liveData.refresh` en mode forcé (timeline et paniers en entier au lieu du delta, `useLiveData.js:208-212`) plus `loadSpace` plus predict plus RH (`LiveView.vue:428-433`).
11. **Paniers: repli brut possible (moyen, hypothèse).** Pour les events sans ligne pré-agrégée, `getTransactionBasketsBatchRaw` rejoue l'ancien scan brut de `WeezeventTransaction` (`space-analyse-batch.service.ts:131-145`); la garde ne s'applique que si le rollup `Event.transactionCount === 0`. Début de match (pré-agrégat vide, rollup non à jour): comportement non vérifié.
12. **POS / caisse invité / Cost tracking:** aucun constat établi (non lus).

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| **Backend**: appliquer `since` en SQL (ou lire dans le cache Redis une structure par minute) au lieu de filtrer en mémoire | supprime la lecture/désérialisation de l'event entier à chaque tick, charge DB réduite aux dernières minutes | cohérence du cache par event (clé unique par event), invalidation | M | `space-analytics.controller.ts`, `space-event-timeline.service.ts`, `space-analyse-batch.service.ts`, `live-delta.util.ts` |
| **Backend**: mettre en cache Redis courte durée (ex. aligné sur le tick 30 s) le résultat de `getLiveStatus` par espace | divise les appels doublons (page + flux global + n utilisateurs) | statut périmé de quelques secondes, doit rester sous la fenêtre de 30 min | S | `space-shops.service.ts:162-223` |
| **Backend/SQL**: EXPLAIN de la requête `MIN(transactionDate)` et du repli brut des paniers sur la prod | confirme les index utilisés (règle EXPLAIN avant toute requête sur les tables transactions) | aucun | S | `spaces.queries.ts:140-153`, `space-analyse-batch.service.ts:131-145` |
| **Frontend**: un seul `getEvents` par montage (réutiliser la liste de `loadSpace` ou passer `excludeSimulated:false` partout) | une requête de 200 events en moins au 1er chargement | events simulés visibles dans le store | S | `useLiveData.js:131`, `useSpaceData.js:149` |
| **Frontend**: supprimer l'appel redondant `ensureSpaceLoaded()` d'un des deux crochets (ou garde de requête en vol) | évite un `loadSpace` complet en double | à vérifier d'abord que le doublon existe | S | `LiveView.vue:435-436` |
| **Frontend**: factoriser predict-versions dans un seul composable partagé, mémoïsé par `eventId` | 1 requête au lieu de 2 ou 3, retour de page n'en relit qu'une | invalidation après modification de version | M | `useLivePredictBackground.js`, `useLiveHr.js`, `usePredictedNeed` (non lu) |
| **Frontend**: pause du rafraîchissement et du polling quand `document.hidden` (SSE, tick de secours, inventaire) | supprime le trafic d'onglets en arrière-plan | rattrapage à la reprise (un refresh immédiat) | S | `useLiveData.js`, `LiveInventoryPanel.vue`, réutiliser `useInventoryLivePolling.js:30` |
| **Frontend**: charger le catalogue recettes de l'onglet Inventaire sans repasser par un `loadSpace` complet (requête dédiée ou `skipRecipeCatalog:false` seulement sur les endpoints recettes) | évite phase 1 + 2a rejouées | périmètre du store `analyse` | M | `useLiveRemainingNeed.js:80-95`, `analyse.js:1716-1723`, `useSpaceData.js` |
| **Frontend**: une seule réconciliation partagée entre `itemRecords` et `processedTimelineRows` (calculer une fois, dériver deux vues) | moitié du travail de recalcul par tick | refactor des deux consommateurs | M | `useLiveItemRecords.js`, `LiveView.vue:279-282` |
| **Frontend**: au retour sur la page, utiliser le delta (pas de `forceNext` systématique) | évite un rechargement complet | rattrapage incomplet si absence longue (garder le resync 10 min) | S | `LiveView.vue:428-433`, `useLiveData.js:208-212` |
| **Infra**: mesurer le nombre de connexions Redis/SSE ouvertes en match | dimensionnement du pool Redis | | S | `space-analytics.controller.ts:258`, `live.controller.ts` |

## 7. Points non vérifiés

- POS (`SpacePosView.vue` et les 24 autres .vue, `pos.api.js`, `features/pos/`) : arbre, appels, polling, computed, listes. Rien lu hors `pos-live-trigger.service.ts:58`.
- Caisse invité `/pdv/pos` (`GuestPosView.vue`, `guestPos.api.js`, `requireGuestPinSession`) : intégralement non vérifié, y compris SSE/polling éventuel.
- Cost tracking (`SpaceCostTrackingView.vue` et 24 .vue, `cost-tracking.api.js`, `backend/src/features/cost-tracking/`) : intégralement non vérifié, y compris SQL, index, cache Redis.
- Live: SQL et cache de `GET /spaces/:id/live/inventory` (`StockLevelService.getLiveInventory`), `basket-agg-read.sql.ts` (plan, index), `resolveShopIdsForSpace` (cache éventuel), `loadPredictedNeed` (`usePredictedNeed`), `staffing/fetchStaffing`, `GET /events` (EventsController), `LiveSaleSimulatorWidget`, `WorkspaceMobileToolDrawer`, `LiveFilterPanel`/`LiveHeader`/`LiveShopList`/`LiveItemsList` (computed, virtualisation).
- Fréquence réelle des signaux SSE (cadence des triggers `weezevent/services/live/live-aggregation-trigger.service.ts:37`, `pos-live-trigger.service.ts:58`, cron de secours), donc nombre réel de refresh par minute pendant un match.
- Mesures à faire: taille réelle des réponses event-timeline (minute) et transaction-baskets sur un match plein; durée du SQL timeline/paniers à froid; EXPLAIN de `live-status`; nombre de lignes de `timelineRows` et temps de `itemRecords` / `processedTimelineRows`; poids de `predict-versions`; nombre de connexions Redis par utilisateur.
- Existence réelle du doublon `loadSpace` au premier montage (problème 5.4): confirmer par l'onglet Network.
