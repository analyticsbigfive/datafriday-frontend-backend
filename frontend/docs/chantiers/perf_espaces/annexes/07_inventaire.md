# 07. Inventaire Post-event / Pre-event (staff) et versions invité PIN

Rapport en lecture seule. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code, jamais d'une mesure.
Couverture PARTIELLE (arrêt demandé par le coordinateur à 130k tokens). Tout ce qui n'a pas été lu est marqué "non vérifié" et listé en section 7.

## 1. Fiche de la page

| Page | Route | Nom | Composant | Meta | Garde |
|---|---|---|---|---|---|
| Post-event Inventory (staff) | `/spaces/:spaceId/inventory` | `space-inventory` | `frontend/src/components/space-workspace/inventory/views/SpaceInventoryView.vue` (4438 l.: template 1-797, script 799-3339, style 3341+) | `keepAlive: true`, `permission: 'front.fb.spaceInventory'`, `inventoryMode: 'post'` (`frontend/src/router/index.js:235-238`) | garde d'espace de l'arbre parent (non lu) |
| Pre-event Inventory (staff) | `/spaces/:spaceId/pre-inventory` | `space-pre-inventory` | même composant | idem, `inventoryMode: 'pre'` (`index.js:245-248`) | idem |
| Post-event invité PIN | `/pdv/inventory` | `guest-inventory` | même composant | `guestMode: true`, `inventoryMode: 'post'`, pas de keepAlive (`index.js:105-109`) | `beforeEnter: requireGuestPinSession` |
| Pre-event invité PIN | `/pdv/pre-inventory` | `guest-pre-inventory` | même composant | `guestMode: true`, `inventoryMode: 'pre'` (`index.js:98-102`) | `requireGuestPinSession` |
| Connexion PIN | `/login/pin/:slug?` | `login-pin` | `frontend/src/views/PinLoginView.vue` (420 l., non lu) | `noindex` (`index.js:81-86`) | `guestPinLoginOnly` |

Gardes (`frontend/src/router/guards.js`):
- `guestPinLoginOnly` (152-163): `auth/initialize` si le store auth n'est pas initialisé, redirige un staff connecté.
- `requireGuestPinSession` (172-183): `await store.dispatch('guestPin/restore')` puis refuse si pas de session et force la route de la phase (`guestRouteForPhase`, 187-192). `restore` (`frontend/src/store/modules/guestPin.js:79-98`) fait un `GET /guest-pin/session` bloquant, une seule fois (flag `initialized`).

Fichiers du périmètre (lignes): front `inventory/` 21 .vue + 1 .js = 10777 l.; composables `useInventoryData` 593, `useGuestInventorySession` 229, `useInventoryLivePolling` 68, `useInventoryKeepAlive` 57; store `inventory.js` 441, `guestPin.js` 152, `guestPinAdmin.js` 106; API `inventory.api.js` 195, `guestPin.api.js` 111. Backend `backend/src/features/inventory/` (4780 l. hors spec).

Choix d'architecture à noter: le même composant sert 4 routes (staff pre/post et invité pre/post). En staff, deux instances sont gardées en cache (keep-alive), `useInventoryKeepAlive.js:3-6`.

## 2. Arbre des composants

Tous les enfants sont importés statiquement dans `SpaceInventoryView.vue:830-850` (aucun `defineAsyncComponent` trouvé dans les imports lus). Le seul découpage de chunk est l'import dynamique de la vue par le routeur (`index.js:100,107,237,247`). Le "monté ou différé" ci-dessous est celui lu dans le template aux lignes citées; les conditions des lignes 160-797 n'ont pas été lues.

| Composant | Fichier (dans `components/space-workspace/inventory/` sauf mention) | Lignes | Rôle | Monté / différé | Données reçues |
|---|---|---|---|---|---|
| SpaceInventoryView | `views/SpaceInventoryView.vue` | 4438 | page, orchestration, 10 appels API directs | route | route, store |
| WorkspaceAppHeader | `components/WorkspaceAppHeader.vue` (hors périmètre) | non lu | entête staff | `v-if="!guestSession.isGuestMode"` (l.6) | `overviewMetrics` (KPIs) |
| InventoryMenuCoverageDrawer | `drawers/InventoryMenuCoverageDrawer.vue` | 154 | couverture menu | présent dans le template sans `v-if` (l.16), contenu non vérifié | `menuCoverageReports` |
| InventoryMobileOptionsSheet | `InventoryMobileOptionsSheet.vue` | 138 | feuille d'options mobile | sans `v-if` (l.23) | pinAccess, toolItems |
| InventoryFilterDrawer | `drawers/InventoryFilterDrawer.vue` | 345 | filtres mobile | sans `v-if` (l.40), ~40 props dont les listes d'options et `reconciliations` | listes d'options, réconciliations |
| InventoryFilterPanel | `components/InventoryFilterPanel.vue` | non lu | filtres gauche desktop | `v-if="showLeftFilters"` (l.91, conteneur) | mêmes listes que le drawer |
| WorkspaceToolSelect | hors périmètre | non lu | navigation inter-outils | idem (l.93) | |
| InventoryReconciliationSection | `InventoryReconciliationSection.vue` | 214 | liste des documents de réconciliation | idem (l.132) | `reconciliations` (tout le tableau) |
| InventoryPinBand | `InventoryPinBand.vue` | 182 | bandeau PIN | l.254, condition non lue | pinAccess |
| AppSearchBar, InventoryCountingStatusMenu | `components/common/`, `InventoryCountingStatusMenu.vue` | non lu, 105 | recherche, statuts | l.348, 378 | |
| InventoryCountingInterface | `InventoryCountingInterface.vue` | 1063 | écran de saisie d'un PdV | l.423 (desktop) et l.695 dans un `v-dialog` (mobile) | fonctions `getCount`, `totalForItem`, `isItemCounted`, `expectedFor`, `logisticStockFor` passées en props |
| InventoryShopCard / InventoryStorageCard | `InventoryShopCard.vue`, `InventoryStorageCard.vue` | 309, 252 | cartes PdV / stockages | l.546, 568, listes non virtualisées (non vérifié: `v-for` non lu) | |
| InventoryReconciliationView | `InventoryReconciliationView.vue` | 700 | vue d'un document de réconciliation | l.588, condition non lue | |
| InventoryAggregateView | `InventoryAggregateView.vue` | 1341 | résumé de droite (articles) | l.602 (desktop) ET l.660 dans `InventoryMobileSummaryDialog` (`v-if="isMobile && !guestSession.isGuestMode"`, l.659) | |
| InventoryStorageAggregateView | `InventoryStorageAggregateView.vue` | 639 | résumé stockages | l.620 et l.678 | |
| LogisticMovementDialog | `components/space-workspace/shared/LogisticMovementDialog.vue` | non lu | transfert Logistic | l.725 | |
| Autres (GuestPinBadge 257, PdvRecountButton 95, PdvAccessToggle 106, InventoryPinActionButtons 101, InventoryStatusDot 39, InventorySummaryHeader 127, InventorySummaryItemTotal 58) | | | | non lus | |

Constat de montage: le mode invité masque l'entête staff (l.6) mais exécute le même composant de 4438 lignes, avec les mêmes computed (1136-1885, non lus).

## 3. Appels API, composant par composant

### 3.1 SpaceInventoryView, chemin STAFF (chargement)

| Déclencheur | Méthode + URL | Fonction front | Séq./parallèle, bloque ? | Cache front | Backend | SQL / tables | Redis | Payload | Coût probable |
|---|---|---|---|---|---|---|---|---|---|
| mount: watcher `routeContextKey` immediate (`SpaceInventoryView.vue:3311-3319`) puis `loadForSpace` (2182) | `GET /inventory/:spaceId/reconciliations` | `loadReconciliations` (3187-3199), `inventory.api.js:92` | fire-and-forget (2185), ne bloque pas | aucun | `inventory.controller.ts:84-97` puis `services/inventory-reconciliation.service.ts:172-184` | `stockReconciliation.findMany` kind in (post-event, pre-event), sans `select`, sans limite, `lines` JSON complet; + `assertSpaceInTenant`; + `loadPostEventDraftStates` pour les brouillons (186-202) | aucun lu | non mesuré, croît avec chaque match de l'espace | moyen, croissant |
| mount | `analyse/loadSpace` (dispatch) | 2187-2193 | AWAIT, seulement si l'espace courant diffère | store analyse (non lu) | non lu | non lu | | | non vérifié |
| mount | `GET /market-prices` paginé (200 par page) | `inventory/loadMarketPrices` (2212; `store/modules/inventory.js:319-367`) | fire-and-forget | store TTL 15 min (l.22, 78-79) + SWR localStorage `localDb.getMarketPricesCache` (340-346) + dédup en vol (47, 327-330) | `market.price.api` (non lu) | non lu | non lu | catalogue complet; commentaire du code: "~60 s à froid" (inventory.js:45-46) | haut à froid |
| mount | `GET /packaging` | `loadPackagingTypes` (2213; inventory.js:369-400) | fire-and-forget | store TTL 15 min, dédup en vol | non lu | non lu | | petit | bas |
| mount | `loadContext` (composable `useInventoryData`, 593 l.) | 2216 | AWAIT, en parallèle avec loadInventory | non vérifié | non vérifié | non vérifié | | | probablement le plus lourd (non lu) |
| mount | `GET /inventory/:spaceId/:eventId?phase=` | `inventory/loadInventory` (2217; inventory.js:135-196; `inventory.api.js:18`) | AWAIT, parallèle avec loadContext | store (`inventoryCounts`), dédup en vol par clé (inventory.js:35-39, 138) | `inventory.controller.ts:448-472` puis `services/inventory-count.service.ts:31-96` | `inventorySnapshot.findFirst` SANS select (blob JSON `inventoryCounts` complet) + `inventoryCount.findMany` + (post) `inventorySnapshot.findFirst` select createdAt (l.39-54) | aucun | tous les comptages du match (PdV x articles) | moyen |
| après loadContext | `GET /inventory/:s/pre-event-baseline/:e` ou `post-event-baseline/:e` | `fetchPreExpected` (2496-2519; `inventory.api.js:125,139`) | séquentiel après le contexte, ne bloque pas le squelette (non vérifié côté template) | aucun, et remet `preExpected=null` à chaque appel (2497-2500) | `inventory.controller.ts:120-169` puis `InventoryBaselineService` (427 l., non lu) | non vérifié | non lu | non mesuré | non vérifié |
| après loadContext | `fetchPredictedNeed` | 2231-2232, 2655-2673 | appelle `listRestockPlans`, `getRestockPlan` (restock.api) et `loadPredictedNeed` | non vérifié | hors périmètre | | | | non vérifié |
| post-event seulement | `postDraftScheduler.schedule()` puis `sendPostEventContext` (2786-2797) | 2235 | différé et sérialisé (commentaire 2233-2235) | | `POST /inventory/:s/post-event-context` (`inventory.controller.ts:371`) | non lu | | lignes de réconciliation complètes | non vérifié |
| même chaîne | `buildReconciliationLines` appelle `getPreEventInventory` (2858), `getPostEventBaseline` (2899), `getEventSalesConsumption` (2965), `getSpaceEventTimelineBatch` (3009), `loadPredictedNeed` (3070) | lignes issues d'un grep, corps de fonction non lu | | | `inventory.controller.ts:279-333` | non lu | | | potentiellement lourd, non vérifié |
| mount | `logistics/loadStock` | 2239 | fire-and-forget | store logistics (non lu) | hors périmètre | | | | non vérifié |
| mount, pre staff | `GET /inventory/:s/pre-event-window/:e` via `usePreEventEditWindow` (`SpaceInventoryView.vue:969-974`) | composable non lu | | | `inventory.controller.ts:210-228`, `pre-event-inventory-flow.service.ts:142-155` | `event.findFirst` (avec `sessions` JSON) + `kvStore.findUnique` | | petit | bas |

### 3.2 Retour sur la page (keep-alive), staff

`useRefreshOnReturn` (délai non lu) appelle `revalidateInventory` (`useInventoryKeepAlive.js:51-54`, `SpaceInventoryView.vue:2152-2180`): `analyse/loadSpace` en AWAIT (2159), puis `spaceShops/fetchForSpace` avec `forceRefresh: true` en AWAIT (2161-2165), puis seulement ensuite en parallèle `loadContext`, `loadInventory`, `loadReconciliations`; puis `fetchPreExpected`, `fetchPredictedNeed`, `logistics/loadStock`. Séquentiel puis parallèle: le rafraîchissement forcé des PdV est sur le chemin critique.

### 3.3 Polling STAFF (fenêtre PIN ouverte)

| Déclencheur | Appels | Fonction | Séquentiel ? | Backend | Remarques |
|---|---|---|---|---|---|
| `useInventoryLivePolling` toutes les 20 s (`useInventoryLivePolling.js:15`), actif si `livePollingEnabled && keepAlive.isActive` (`SpaceInventoryView.vue:990-1000`), saute si `document.hidden` (l.27) | 1) `inventory/refreshInventorySilently` = `GET /inventory/:s/:e?phase=` (inventory.js:204-214, saute si saisie locale < 5 s) 2) `guestPinAdmin/fetchStatusBoard` (store `guestPinAdmin.js`, endpoint non lu) 3) `loadReconciliations` silencieux = `GET /inventory/:s/reconciliations` (created 3327) | tick | 3 `await` en série (992-998) | voir 3.1 | rien ne limite le tick quand rien n'a changé; pas d'ETag lu côté client. Un tick relit donc le blob snapshot + tous les comptages + toutes les réconciliations de l'espace |

### 3.4 Saisie (autosave), staff

| Déclencheur | Appel | Chemin front | Backend | SQL | Payload |
|---|---|---|---|---|---|
| chaque frappe (`@input`, `InventoryCountingInterface.vue:207,238`; `onFieldInput` 483-490 émet `change-value`) et chaque clic stepper (507-512) | `POST /inventory-counts` | `onCountValue` (`SpaceInventoryView.vue:2433-2440`) puis `inventory/upsertCount` (inventory.js:217-277): commit optimiste `UPSERT_COUNT` puis POST. AUCUN debounce, AUCUNE file: une frappe = un POST. Payload `{spaceId, shopId, itemId, packedUnits, looseUnits, isCounted, eventId, phase}` (242-255), quelques centaines d'octets (estimation lecture du code) | `InventoryCountsController` (`inventory.controller.ts:487-505`) -> `PreEventInventoryFlowService.saveCount` (`pre-event-inventory-flow.service.ts:166-200`) | pre-event: `event.findFirst` (181-182, `findEvent` 581-598 avec `sessions` JSON) ; `saveInventoryCounts` = `findFirst` puis `update`/`create` (`inventory-count.service.ts:192-230`) ; après les portes `kvStore.upsert` (markDirty 465-473) |
| clic "compté" (`markCounted`, `SpaceInventoryView.vue:2441-2463`) | même POST avec `isCounted: true`, puis si pre et PdV complet: `POST /inventory/:s/pre-event-reconciliations/regenerate` (2475-2493) puis `GET reconciliations` | idem | en plus: `markLogisticDirty` (`kvStore.upsert`, flow.service.ts:508-521) et `logisticFlush.schedule` (l.171-174) | voir 3.5 |

### 3.5 Envoi Logistic déclenché par un "compté" (backend)

- Throttle en mémoire du processus: premier envoi 2 s après le clic, au plus un envoi toutes les 10 s par clé (espace, event, phase) (`logistic-flush-throttle.ts:12-35`, valeurs 2_000 et 10_000). Le code précise "mémoire du processus seulement" (l.9-10); le cron à la minute est le filet (`jobs/inventory-logistic-sync.cron.ts`, non lu).
- `flushLogisticMarker` (`pre-event-inventory-flow.service.ts:543-577`): pre-event -> `regenerate` (file par match, 213-244, corps `regenerateNow` non lu); post-event -> `pushPendingCountToLogistic` puis `postEventDraft.rebuild` (568).
- `pushEventCountToLogistic` (`services/inventory-logistic-push.service.ts:275-291`): `loadLogisticPushState` (`inventoryCount.findMany` de tout le match, 175-194) + `getBySpaceAndEvent` (second chargement complet des comptages, 285) + `resolveItemKeysByIds` + `resolveInventoryUnitsPerPack` + `subtractSalesSinceCount` -> `stockLevelService.deriveEventConsumption` (130-139) + `stockReconciliationService.reset` (148) + `markInventoryCountsPushed`. Le commentaire du throttle indique que "chaque envoi recalcule le stock de tout l'espace" (`logistic-flush-throttle.ts:5-6`). SQL de `reset` et de `deriveEventConsumption`: non vérifié.
- Tout cela tourne dans le processus API (pas dans un worker) d'après les fichiers lus; non vérifié pour le module `jobs/`.

### 3.6 Chemin INVITÉ PIN

| Déclencheur | Méthode + URL | Fonction | Séq./parallèle | Cache | Backend | Payload / coût |
|---|---|---|---|---|---|---|
| garde `requireGuestPinSession` (premier accès) | `GET /guest-pin/session` | `guestPin/restore` (`guestPin.js:79-98`), `guestPin.api.js:36` | BLOQUE la navigation | session dans `sessionStorage` (guestPin.js:20-38), revalidée à chaque rechargement | `guest-pin-access` (non lu) | petit |
| mount page: `loadForGuest` (`SpaceInventoryView.vue:2078-2090`) | `GET /guest-pin/catalog` et `GET /guest-pin/inventory` | `loadGuestInventory` (`useGuestInventorySession.js:79-124`), `guestPin.api.js:52,58` | parallèle (`Promise.all`, l.80), après le garde | AUCUN (ni store, ni localStorage) | `GuestPinAccessService.getCatalog` (nommé en commentaire l.18-19, non lu) | le catalogue contient `availableMenuItems`, `allMenuItemsData`, `marketPrices` (catalogue prix complet), `components`, `bufferRows`, `storage` (l.86-98); taille non mesurée |
| après les données | calcul local `buildConsolidatedInventory` (`utils/inventoryUtils.js`, 995 l., non lu) ou `buildStorageInventory` | l.89-94, 137-145 | synchrone, thread principal | | | coût CPU non mesuré, grandit avec le menu du PdV |
| chaque frappe ou clic | `POST /guest-pin/inventory/counts` | `upsertGuestCount` (l.171-195), `guestPin.api.js:73` | séquentiel par appel, sans debounce; remplace tout `guestInventoryCounts` (177-180); si "soumis": en plus `GET /guest-pin/session` (192-194) | | non lu | idem staff côté fréquence |
| "compté" sur dernier article (pre) | `POST /guest-pin/element-complete` | `notifyElementComplete` (l.159-166) | après le POST | | non lu | déclenche régénération feuille et Logistique côté serveur (commentaire l.155-158) |
| poll 30 s en continu | `GET /guest-pin/session` | `SpaceInventoryView.vue:1004-1008`, `guestPin.js:131-136` (réécrit aussi `sessionStorage`) | toutes les 30 s tant que `isGuestMode && keepAlive.isActive` (page sans keep-alive, donc toujours actif); saute si onglet masqué | | non lu | N responsables PdV x 2 requêtes par minute |
| J'ai terminé | `POST /guest-pin/submit` puis `GET /guest-pin/session` | `submitGuestInventory` (l.199-202) | | | | bas |

Différences staff/invité vérifiées: l'invité ne charge ni `analyse/loadSpace`, ni events, ni logistics, ni prix marché via le store (commentaire `SpaceInventoryView.vue:2073-2077`); `revalidateInventory` retourne tout de suite en mode invité (l.2156); l'invité n'a pas de keep-alive, donc pas de revalidation au retour d'onglet autre que le poll 30 s.

## 4. Cascade au premier affichage

Staff (post-event):
- t0: import dynamique du chunk `SpaceInventoryView` (taille non mesurée; tous les enfants et utilitaires sont statiques, 10777 lignes de .vue + `inventoryUtils` 995 l.).
- t1: watcher `routeContextKey` immediate -> `reloadForRoute` -> `loadForSpace` (`SpaceInventoryView.vue:3311, 2131, 2182`). `loading = true` (squelette).
- t1 (parallèle, hors chemin critique): `GET reconciliations` (2185), `GET /market-prices` paginé (2212), `GET /packaging` (2213).
- t1 chemin critique: `analyse/loadSpace` seulement si l'espace diffère (2187-2193), puis `resolveEventContext` (2198), puis `Promise.all[loadContext, GET /inventory/:s/:e]` (2215-2226). `loading=false` au `finally` (2257-2259).
- t2 (après le squelette): `fetchPreExpected` (baseline), `fetchPredictedNeed`, planificateur du brouillon post-event (`sendPostEventContext`: jusqu'à 5 appels API, lignes 2858-3070), `logistics/loadStock`.
- t3: si la fenêtre PIN est ouverte, polling 20 s (3 appels en série).

Invité:
- t0: garde `GET /guest-pin/session` (bloquant, première fois).
- t1: chunk de la vue (même chunk que le staff).
- t2: `GET /guest-pin/catalog` + `GET /guest-pin/inventory` en parallèle, puis explosion combo/BOM côté navigateur.
- t3: poll session 30 s.

## 5. Problèmes de performance

1. Autosave sans debounce ni file, staff et invité. Chaque frappe émet `change-value` (`InventoryCountingInterface.vue:207,238,483-490`) puis un POST (`store/modules/inventory.js:257`; `useGuestInventorySession.js:181`). Taper "125" = 3 POST; les réponses peuvent arriver dans le désordre (ordre non vérifié). Impact: haut (réseau, DB, et concurrence sur la même ligne gérée par un rattrapage P2002, `inventory-count.service.ts:223-228`). Pages: les 4.
2. Chaîne backend lourde pour un simple POST de comptage. Au minimum `event.findFirst` + `findFirst` + `update` (+ `kvStore.upsert`) par frappe en pre-event (`pre-event-inventory-flow.service.ts:182,195-197`; `inventory-count.service.ts:205-217`); sur "compté", un envoi Logistic qui relit tous les comptages du match deux fois et recalcule le stock de l'espace (`inventory-logistic-push.service.ts:180,285,130-148`), au plus toutes les 10 s par match (`logistic-flush-throttle.ts:19`). Impact: haut pendant les fenêtres de comptage. Throttle en mémoire du processus (l.9-10): avec plusieurs instances API il n'est pas partagé (déduction, non vérifié).
3. `GET /inventory/:spaceId/reconciliations` non borné et rappelé toutes les 20 s en staff. `findMany` sans `select` ni limite, `lines` JSON complet (`inventory-reconciliation.service.ts:174-181`), rappelé par le tick (`SpaceInventoryView.vue:3327`) et après chaque régénération (2486). Impact: moyen, croissant avec la saison.
4. `GET /inventory/:s/:e` charge le blob JSON du snapshot même quand il n'est pas utilisé. `inventorySnapshot.findFirst` sans `select` (`inventory-count.service.ts:40-43`), alors que la branche "comptages" retourne seulement `id`, dates, `createdBy` du snapshot (63-74). Appelé au chargement, à chaque tick de 20 s, et deux fois dans la chaîne Logistic (285, `freezePostEventSnapshot` 238). Impact: moyen.
5. Tick de polling staff: 3 appels en série, sans condition de changement (`SpaceInventoryView.vue:992-998`), dont l'endpoint du tableau de statuts PIN (non lu). Impact: moyen.
6. Revalidation au retour: `analyse/loadSpace` puis `spaceShops/fetchForSpace forceRefresh` en AWAIT avant le lot parallèle (`SpaceInventoryView.vue:2159-2176`). Impact: moyen (retour sur page en cache plus lent que nécessaire).
7. Charge post-event différée mais lourde: `sendPostEventContext` enchaîne baseline, pre-event, consommation, timeline et besoin prédit (lignes 2858, 2899, 2965, 3009, 3070), puis serveur `rebuild` du brouillon à chaque envoi Logistic (`flow.service.ts:568`). Impact: moyen (corps non lus, à mesurer).
8. Catalogue des prix marché complet chargé pour la page (`inventory.js:353`), "~60 s à froid" d'après le commentaire (45-46). Atténué par SWR localStorage (340-346) et TTL 15 min. Impact: haut au démarrage à froid, bas ensuite.
9. Liste de saisie non virtualisée et props fonctions: `v-for item in shop.consolidatedInventory` (`InventoryCountingInterface.vue:113`) avec, par article, des appels `isItemCounted`, `expectedFor` (x2 à 4), `expectedDetailFor`, `logisticStockFor`, `totalForItem`, `expectedTotalUnits` en rendu (l.164-268). `UPSERT_COUNT` remplace tout l'objet `state.inventoryCounts` (`inventory.js:89-94`), donc chaque frappe invalide tous les lecteurs: re-rendu probable de toute la liste à chaque touche (déduction du code, non mesuré). Impact: moyen à haut sur mobile et gros PdV.
10. Invité: catalogue complet + `marketPrices` envoyé à chaque responsable PdV et explosion combo/BOM sur le téléphone, sans aucun cache (`useGuestInventorySession.js:80-98`). Impact: moyen (taille de réponse et CPU non mesurés).
11. Invité: poll `GET /guest-pin/session` toutes les 30 s en continu pour tous les PdV (`SpaceInventoryView.vue:1004-1008`) + réécriture `sessionStorage` à chaque tick (`guestPin.js:134-135`). Impact: bas à moyen selon le nombre de responsables simultanés.
12. Le composant de 4438 lignes importe statiquement 20 enfants et des dizaines d'utilitaires (`SpaceInventoryView.vue:800-890`); deux vues d'agrégat (1341 + 639 l.) sont instanciées une seconde fois dans le dialogue mobile (l.660, 678). Impact: moyen (taille de chunk non mesurée, doublon mobile dépend de `v-if` non lus).
13. `this.mock = buildSpaceInventoryMock()` exécuté à chaque `loadForSpace` même hors démo (`SpaceInventoryView.vue:2245`, le test `if (this.demo)` n'est qu'à la ligne 2246). Impact: bas (coût du mock non lu).
14. `fetchPreExpected` remet `preExpected`, `postExpectedUnits` à `null` à chaque appel, y compris en revalidation (l.2497-2500), ce qui provoque un retour au vide puis un recalcul des indications attendues dans toute la liste. Impact: bas à moyen.

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| FRONT: debounce par clé (shopId, itemId) de 400 à 600 ms sur la frappe, envoi immédiat au blur et au clic "compté", file ordonnée par clé (un seul POST en vol par clé) | divise le nombre de POST par frappe, supprime les réponses hors ordre | perte de saisie si fermeture d'onglet avant l'envoi: vider la file sur `beforeunload` et `visibilitychange` | M | `store/modules/inventory.js`, `composables/useGuestInventorySession.js`, `InventoryCountingInterface.vue` |
| FRONT: patch ciblé du store (modifier la clé de l'article au lieu de cloner `inventoryCounts`) ou séparer par PdV pour limiter les invalidations | moins de re-rendus par touche | faible | M | `store/modules/inventory.js` (UPSERT_COUNT) |
| FRONT: virtualiser ou paginer la liste d'articles d'un PdV, `loading="lazy"` sur les images | rendu mobile fluide | moyen (accordéon mobile, focus) | M | `InventoryCountingInterface.vue` |
| FRONT: tick de polling en parallèle (`Promise.all`) et seulement pour ce qui change; ne pas rappeler `reconciliations` à chaque tick (le faire sur événement ou toutes les 60 s) | moins de charge serveur | faible | S | `SpaceInventoryView.vue:990-1000, 3327` |
| FRONT: revalidation sans `await` sur `loadSpace` et `fetchForSpace` (les lancer dans le `Promise.all`) | retour sur page plus rapide | faible | S | `SpaceInventoryView.vue:2159-2176` |
| FRONT: ne pas remettre à `null` les attendus pendant une revalidation | pas de clignotement | faible | S | `SpaceInventoryView.vue:2496-2500` |
| FRONT: cache SWR (sessionStorage) du catalogue invité; supprimer l'appel `buildSpaceInventoryMock` hors démo | rechargement invité instantané | cache obsolète, prévoir clé de version | S | `useGuestInventorySession.js`, `SpaceInventoryView.vue:2245` |
| FRONT: n'activer le poll invité que si la fenêtre est ouverte, et monter l'intervalle (60 s) tant que l'onglet est inactif | moins de requêtes | retarde la détection de fermeture (voulue "sans attendre la saisie", commentaire 1001-1003) | S | `SpaceInventoryView.vue:1004-1008` |
| FRONT: `defineAsyncComponent` pour drawers, dialogues, `InventoryReconciliationView`, vues d'agrégat mobiles; extraire la page en sous-composants (règle du projet contre les fichiers monolithiques) | chunk initial plus léger | faible | L | `SpaceInventoryView.vue` |
| BACKEND: `select` explicite sur `inventorySnapshot.findFirst` (id, createdAt, updatedAt, createdBy, sans `inventoryCounts`) quand la branche comptages gagne; lire d'abord les comptages | moins de données lues et transférées par tick | faible (tests existants) | S | `inventory-count.service.ts:39-74` |
| BACKEND: lister les réconciliations sans `lines` (ou borné: 20 derniers, pagination) et charger `lines` à la sélection | payload stable dans la saison | contrat front à adapter | M | `inventory-reconciliation.service.ts:172-184`, `SpaceInventoryView.vue:3187`, `InventoryReconciliationSection.vue` |
| BACKEND: ETag ou `updatedAt` léger (`HEAD`/`since`) pour les ticks | 304 sans lecture complète | moyen | M | `inventory.controller.ts`, `inventory-count.service.ts` |
| BACKEND: dans le POST de comptage, éviter `findEvent` avec `sessions` à chaque frappe (mémoire courte par match), et fusionner `findFirst` + `update` en un seul upsert SQL | moins d'allers-retours DB | faible | M | `pre-event-inventory-flow.service.ts:178-200`, `inventory-count.service.ts:192-230` |
| BACKEND: déporter l'envoi Logistic dans le worker (le throttle mémoire n'est pas partagé entre instances); lire les comptages une seule fois dans `pushEventCountToLogistic` | stabilité sous charge | moyen | L | `logistic-flush-throttle.ts`, `inventory-logistic-push.service.ts:275-291`, `jobs/` |
| SQL: EXPLAIN de `inventoryCount.findMany(tenantId, spaceId, eventId)` (index unique couvre le préfixe, `schema.prisma` bloc `InventoryCount`), de `inventorySnapshot` (index `spaceId,eventId` + tri `createdAt`) et de `stockReconciliation` (index non vérifié, `schema.prisma` non lu pour ce modèle). Règle du projet: EXPLAIN avant toute requête sur tables lourdes | confirme ou écarte les index | nul | S | `backend/prisma/schema.prisma` |

## 7. Points non vérifiés

Non lus (donc aucune affirmation):
- `frontend/src/composables/useInventoryData.js` (593 l.): `loadContext`, seule source des appels de catalogue du premier affichage (menus, composants, PdV, stockages). C'est probablement le plus gros poste, à lire en priorité.
- `SpaceInventoryView.vue`: computed 1136-1885, template 160-797 (conditions `v-if` des cartes, résumés, `v-for` des listes), méthodes `fetchPredictedNeed`, `sendPostEventContext`, `buildReconciliationLines`, poussée Logistic manuelle, impression/export CSV.
- Composants enfants: `InventoryAggregateView` (1341), `InventoryStorageAggregateView` (639), `InventoryReconciliationView` (700), `InventoryShopCard`, `InventoryStorageCard`, `InventoryPinBand`, `GuestPinBadge`, `PdvRecountButton`, `PdvAccessToggle`, `InventoryFilterDrawer`, `InventoryFilterPanel`, `InventoryMenuCoverageDrawer`.
- Composables et stores: `usePreEventEditWindow`, `usePredictedNeed`, `useInventorySalePrices`, `useRefreshOnReturn` (délai), `useInventoryPinActions`, `useInventoryPinAccess`, `store/modules/guestPinAdmin.js` et `api/endpoints/guestPinAdmin.api.js` (tableau de statuts PIN du tick), `utils/inventoryUtils.js`, `api/client.js` (intercepteur 401 invité), `views/PinLoginView.vue` (login: `GET /guest-pin/context/:slug`, `POST` de connexion).
- Backend: module `guest-pin-access` complet (catalog, inventory, counts, session, login, element-complete, submit), `inventory-baseline.service.ts` (SQL des baselines, consommation), `post-event-draft.service.ts`, `regenerateNow` et création des réconciliations, `StockReconciliationService.reset`, `StockLevelService.deriveEventConsumption`, `jobs/inventory-live-init.cron.ts`, `jobs/inventory-logistic-sync.cron.ts`, `inventory-window-closure.ts`, coût de `JwtDatabaseGuard` et de `SpaceAccessService.assertSpaceInTenant`, présence éventuelle de caches Redis (aucun vu dans les fichiers lus, recherche non exhaustive), modèle `StockReconciliation` et ses index.
- Mesures à faire: onglet Network (taille de `GET /inventory/:s/:e`, de `GET reconciliations` sur un espace en fin de saison, de `/guest-pin/catalog`), nombre de POST `/inventory-counts` pour une saisie réelle, EXPLAIN ANALYZE des requêtes ci-dessus, taille du chunk `SpaceInventoryView`, profil de rendu pendant la saisie sur un PdV de plus de 100 articles, durée réelle de `/market-prices` à froid.
