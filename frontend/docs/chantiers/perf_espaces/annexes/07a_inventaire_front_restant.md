# 07a. Inventaire, frontend restant (complément de 07_inventaire.md)

Rapport en lecture seule. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code, jamais d'une mesure.
Ce fichier complète `07_inventaire.md` (non répété ici: fiche de page, appels de `loadForSpace`, polling 20 s, autosave, chemin invité). Il couvre `useInventoryData.js`, `api/client.js`, `guestPinAdmin` et les fonctions `fetchPredictedNeed`, `sendPostEventContext`, `buildReconciliationLines` de `SpaceInventoryView.vue`. Complété au fil des lectures, voir section 7 pour ce qui reste non lu.

## 1. Fiche (rappel)

Page: `frontend/src/components/space-workspace/inventory/views/SpaceInventoryView.vue` (4438 l.), routes `/spaces/:spaceId/inventory` et `/pre-inventory` (+ invité `/pdv/...`), voir 07_inventaire.md section 1.
Fichiers lus dans ce complément (lignes): `frontend/src/composables/useInventoryData.js` 593, `frontend/src/api/client.js` 386, `frontend/src/store/modules/guestPinAdmin.js` 106, `SpaceInventoryView.vue` 2640-2819.

## 2. Arbre (compléments et corrections au rapport partiel)

Template de `SpaceInventoryView.vue` lu par extraction des conditions (grep des `v-if`/`v-for`, lignes 160-797), pas en lecture intégrale.

| Composant ou bloc | Fichier:ligne | Lignes | Monté / différé | Données reçues |
|---|---|---|---|---|
| `useInventoryData` (composable) | `frontend/src/composables/useInventoryData.js` | 593 | instancié aussi en invité mais `loadContext` n'y est jamais appelé (commentaire 196-199) | `selectedConfigId` |
| Computed `shopsWithInventory` | `useInventoryData.js:471-510` | | recalculé pour TOUS les PdV dès que `menuItems`, `marketPrices` ou `components` du store changent (134-137, 473-482) | |
| Computed `storagesWithInventory` | `useInventoryData.js:512-547` | | dépend de `shopsWithInventory` (513), rappelle `buildStorageInventory` par stockage | |
| `InventoryPinBand` | `inventory/InventoryPinBand.vue` (templ. `SpaceInventoryView.vue:254-255`) | 182 | `v-if="pinAccess && !activeReconciliation"`, donc monté dès l'ouverture en staff | `spaceId`, `eventId` |
| Liste de cartes | `SpaceInventoryView.vue:545-585` | | `InventoryShopCard v-for entry in filteredCards` (`:key` element.id), `InventoryStorageCard` idem; 6 squelettes pendant `loading \|\| contextLoading`; non virtualisé, non paginé | `filteredCards` (1775-1783) |
| `InventoryCountingInterface` desktop | `SpaceInventoryView.vue:423` | 1063 | `v-if="countingShopView && !isMobile"`: monté seulement à l'ouverture d'un PdV | `countingShopView` (1810-1812, `withItemFilters`) |
| `InventoryCountingInterface` mobile | `SpaceInventoryView.vue:688-695` | | dans un `v-dialog`, avec `v-if="countingShopView"` | idem |
| `InventoryAggregateView` desktop | `SpaceInventoryView.vue:600-603` | 1341 | `v-if="!guestSession.isGuestMode && !isMobile && (activeTab==='shops'\|\|'storage')"` | `inventoryCounts` (objet entier), `shopsWithInventory` (tableau entier), `pastEvents`, `unitCostByItemId`, `reconciliation`, filtres, `spaceId`, `eventId` (`InventoryAggregateView.vue:271-286`) |
| `InventoryAggregateView` mobile | `SpaceInventoryView.vue:659-661` | | `InventoryMobileSummaryDialog v-if="isMobile && !guestSession.isGuestMode"` | idem |
| Section impression `si-print` | `SpaceInventoryView.vue:748-779` | | toujours dans le DOM mais sa table n'est rendue que si `printMode === 'inventory'` (760); `printMode: null` par défaut (1125), posé à 'inventory' ligne 1956: pas de coût hors impression | `realShops` |

Correction au rapport partiel (point 12 de 07_inventaire.md): les deux instances de `InventoryAggregateView` (desktop et mobile) sont exclusives par `isMobile` (`!isMobile` à la ligne 600, `isMobile` à la ligne 659). Elles ne sont donc montées ensemble qu'au passage d'une taille d'écran à l'autre. Le doublon n'existe pas à l'ouverture.

`InventoryAggregateView` (lu 270-312 seulement): `useShoppingList().compute` ne part qu'au choix d'un event de référence (`watch(referenceEventId, runShoppingList)`, l.310), pas à l'ouverture. Prix de vente HT (`spaceId`, `eventId`): chargés par un composable non lu.

## 3. Appels API

### 3.1 `useInventoryData.loadContext` (composable, 593 l.)

Lu en entier. Propriétaire unique des refs `shops`, `storageElements`, `merchElements` (`useInventoryData.js:118-124`). Appelé par la vue en staff seulement (commentaire 196-199).

| Déclencheur | Méthode + URL | Fonction (fichier:ligne) | Séquentiel / parallèle | Cache front |
|---|---|---|---|---|
| début de `loadContext` | `storageTypes/fetchStorageTypes` (store, URL non lue) | `useInventoryData.js:200` | fire-and-forget, avant tout | store `storageTypes` (non lu) |
| `Promise.allSettled` (219-226), 1/4 | via `loadStorageInventory(spaceId, {force:true})` (composable `useStorageInventory`, non lu) | 222 | parallèle | `force: true` donc aucun cache lu |
| idem, 2/4 | `spaceShops/fetchForSpace` avec `configId` (null si périmètre espace) = `GET /spaces/:id/shops?configId=` (d'après le commentaire 1-3, URL de l'API non relue) | 223 | parallèle | store `spaceShops` (non lu) |
| idem, 3/4 | `getConfiguration(configId)` (`api/endpoints/configuration.api`, URL non lue) | 224 | parallèle | aucun lu |
| idem, 4/4 | seulement périmètre `space`: `loadOtherConfigFloors` = un `getConfiguration(id)` par AUTRE configuration de l'espace, concurrence 4 (`runWithConcurrency(others, 4, ...)`) | 166-182, 225 | parallèle interne borné à 4 | aucun |
| APRÈS le `allSettled` | `getConfigShopMenuItemsLight(spaceId, configId, {itemsScope:'space', shopsScope?:'space'})` (import dynamique `@/api/endpoints/menu.api`) | 323-332 | SÉQUENTIEL après les 4 appels ci-dessus (await 329), bloque la fin de `loadContext` | aucun |
| repli si le batch échoue | `store.dispatch('shopMenuItems/fetchForShop', {shopId, configId})` par PdV, concurrence 6, puis une passe de retry à concurrence 3 | 345-373 | séquentiel après le batch en échec; N requêtes | store `shopMenuItems` (non lu) |

Constats lus:
- Le batch menu des PdV (323-332) est lancé APRÈS `allSettled`, alors qu'il ne dépend que de `spaceId` et `configId`, pas des floors ni des rows. Il pourrait partir dans le même `Promise.all`. Seule la liste `union` (308) sert à remplir la map (335-337), et le batch retourne déjà tous les PdV de la config (`byShop`, 328-332).
- Commentaire du code (312-319): avant le batch, c'était un GET par PdV (N+1, "jusqu'à ~2× N requêtes au premier rendu"); la photo des articles dans le batch pesait "5,6 Mo / 53 s" (BUG-227), retirée. Ces chiffres sont ceux du commentaire, non mesurés ici.
- `loadStorageInventory(..., {force:true})` (222) force le rechargement des lignes « stocké » à chaque `loadContext`, y compris en revalidation silencieuse au retour sur la page (`silent: true`).
- Single-flight par clé `space::config::scope` (205), jeton anti-race `reqSeq` (131, 206).

### 3.2 `api/client.js` (386 l.)

- Instance Axios unique, `timeout: 60000` (14-22). Commentaire: les requêtes catalogue lourdes dépassaient 30 s.
- Warm-up: `fetch(API_BASE_URL + '/health')` fire-and-forget dès le chargement du module (34-41), donc à chaque ouverture d'onglet, y compris pages invité.
- Intercepteur requête (124-152): si pas de token en mémoire et pas de déconnexion explicite, `import('@/lib/supabase')` puis `getSessionOnce()` (130-131), ce qui peut ajouter un aller-retour au premier appel. Pour le mode invité le token est posé avant (non vérifié où).
- Intercepteur réponse: 401 retry unique (165-204), 401 invité = redirection vers la page d'attente (176-182); 429 retry unique si `Retry-After` <= 5 s (211-219); timeout `ECONNABORTED`: retry unique, GET seulement, si `/health` répond en < 5 s (228-239; `isBackendAwake` 47-59). Un timeout de 60 s bloque donc jusqu'à 60 s + sonde 5 s + une seconde tentative possible de 60 s.
- Aucune annulation (`AbortController`) des requêtes en vol au changement de page ou d'espace, aucune déduplication globale: la dédup est faite au cas par cas dans les stores (vérifié dans `inventory.js` par le rapport partiel, `useInventoryData.js:132`).
- En développement, un `console.log` par requête (144-147).

### 3.3 `guestPinAdmin` (store, 106 l.)

Pas de cache TTL, volontaire (commentaire 1-5). `fetchStatusBoard` (48-57) = `getStatusBoard(spaceId, eventId)` (URL à lire dans `guestPinAdmin.api.js`), commit `SET_WINDOWS` qui REMPLACE le tableau `windows` entier à chaque tick de 20 s (voir 07_inventaire.md 3.3). `fetchPeriods` remet `periods` à null avant l'appel (60) puis refait l'appel. `startWindow/stopWindow/startElement/stopElement` renvoient le tableau à jour, pas de second aller-retour (66-83). `validate` et `requestCorrection` font un `fetchStatusBoard` supplémentaire après l'action (88, 95).

### 3.4 `fetchPredictedNeed` (`SpaceInventoryView.vue:2649-2681`)

| Déclencheur | Appel | Séquentiel ? | Remarques |
|---|---|---|---|
| après `loadContext` (2231-2232 selon le rapport partiel), permission `canSeePredicted` requise (2652) | 1) `listRestockPlans(spaceId)` (restock.api, URL non lue) 2) si une feuille contient l'event: `getRestockPlan(match.id)` 3) sinon (ou si `buildRestockNeedIndex` renvoie null): `loadPredictedNeed({eventId, elements, menuItems, components})` (composable `usePredictedNeed`, non lu) | 1 puis 2 en série, puis 3 en série seulement en repli | tout est séquentiel: jusqu'à 3 allers-retours, plus ce que fait `loadPredictedNeed` (non lu). `this.predictedNeed = null` au début (2650) vide l'index à chaque appel, donc à chaque revalidation. `listRestockPlans` ramène la liste de TOUTES les feuilles de l'espace pour n'en utiliser qu'une (2655-2656); filtrage côté client (`selectedEventIds`). |

### 3.5 `sendPostEventContext` et `buildReconciliationLines` (`SpaceInventoryView.vue:2781-2819+`)

Déclencheurs de `sendPostEventContext`: planificateur après le chargement (2235) et à chaque PdV qui devient complet (watcher `postEventCompletedKey`, 3262-3268). Le computed `postEventCompletedKey` (1307-1315) appelle `isElementComplete` (corps non lu) pour tous les éléments à chaque changement de `inventoryCounts`.

`buildReconciliationLines` (lu 2804-3152), appels réseau, tous en AWAIT et en SÉRIE:

| Ordre | Méthode + URL | Fonction (ligne) | Condition |
|---|---|---|---|
| 1 | `GET /inventory/:spaceId/pre-event/:eventId` | `getPreEventInventory` (2858; `inventory.api.js:114`) | hors démo |
| 2 | `GET /inventory/:spaceId/post-event-baseline/:eventId` | `getPostEventBaseline` (2899; `inventory.api.js:138`) | `canSeeExpected` |
| 3 | `GET /inventory/:spaceId/event-consumption/:eventId` | `getEventSalesConsumption` (2965; `inventory.api.js:151`) | hors démo; 404 = repli |
| 3 bis | `getSpaceEventTimelineBatch(spaceId, [eventId])` (URL non lue) | 3009 (`space.api.js:318`) | seulement si 404 sur 3 |
| 4 | `GET /events/:eventId/predict-versions` | `loadPredictedNeed` (3070) puis `listEventPredictVersions` (`usePredictedNeed.js:229`, `eventPredict.api.js:20`) | toujours; puis `buildStockRequirements` sur les `predictedRecords` (`usePredictedNeed.js:65-72`) |
| 5 | `POST /inventory/:spaceId/post-event-context` | `savePostEventContext` (2787; `inventory.api.js:72`) | après les 4 lectures |

Les lectures 1, 2, 3 et 4 ne dépendent pas les unes des autres pour partir (seul l'USAGE du résultat 2 dépend de `preEventSource`, 2900). Calcul local: boucle PdV x articles avec `totalForItem` donc `getCount` (2823-2840), `buildUnitCostByItemId`, `buildUnitInfoByItemId` sur tous les articles comptés (3102-3112). Bornes: `salesUnjoined` tronqué à 50 noms (3136-3137).

Doublons d'URL au premier affichage post-event (appels en double, d'après le code lu ici et `07_inventaire.md` 3.1):
- `post-event-baseline` : `fetchPreExpected` (rapport partiel, `inventory.api.js:139`) puis `buildReconciliationLines` (2899).
- `predict-versions` : `fetchPredictedNeed` en repli (2673) puis `buildReconciliationLines` (3070), avec deux fois `buildStockRequirements`.

### 3.6 Autres déclencheurs réseau lus dans ce complément

| Source | Appel | Détail |
|---|---|---|
| `InventoryPinBand.vue:97-108` au mount et au changement `[spaceId, eventId]` | `GET /inventory-windows/:spaceId/:eventId` et `GET /inventory-windows/:spaceId/:eventId/periods` (`guestPinAdmin.api.js:4,12`) | parallèles, non bloquants |
| `InventoryPinBand.vue:114-123` | `setInterval` 30 s: `GET /inventory-windows/:spaceId/:eventId` | saute si onglet masqué ou action en cours; arrêté seulement à `onBeforeUnmount` (123). Tourne EN PLUS du tick 20 s de `useInventoryLivePolling` qui rappelle `fetchStatusBoard` (07_inventaire.md 3.3) |
| `PdvAccessToggle`, `GuestPinBadge`, store `guestPinAdmin` | `POST /inventory-windows/start\|stop`, `/elements/start\|stop`, `/pins/:id/validate\|request-correction` (`guestPinAdmin.api.js:28-58`) | clic; `validate` et `requestCorrection` relisent le tableau (store 88, 95) |
| `PinLoginView.vue:160-169` | `guestPin/getContext` (`checkContext`) puis `tryRememberedPin` puis `guestPin/login` | séquentiel: le PIN mémorisé n'est tenté qu'après le contexte |
| `PinLoginView.vue:207-212` | `setInterval` (`AUTO_CHECK_MS`, valeur non lue): `checkContext` si onglet visible | page d'attente PDV; `startAutoCheck` appelé d'un endroit non lu |
| `PinLoginView.vue:291` | `setTimeout 700 ms` avant `router.replace` | délai artificiel |

## 4. Cascade au premier affichage (complément pour le staff post-event)

- t1: `loadForSpace` (2182). Fire-and-forget: reconciliations (2185), market-prices (2212), packaging (2213). Séquentiel si l'espace diffère: `analyse/loadSpace` (2187-2193).
- t2: `Promise.all[loadContext, loadInventory]` (2215-2226).
  - Dans `loadContext`: `fetchStorageTypes` en tir-et-oublie (200), puis `Promise.allSettled` de 4 appels (`loadStorageInventory` force, `GET shops`, `GET configuration/:id`, autres configurations si "tout l'inventaire", 219-226). Ensuite, SEULEMENT après, `GET /space-menu/:spaceId/:configId/shop-items?itemsScope=space` (`menu.api.js:484-495`, appel 329). Deux allers-retours en série sur le chemin critique; si le batch échoue, N appels `fetchForShop` (concurrence 6) puis une passe de retry (361-373).
  - `loadInventory` en parallèle.
- t3: `shops.value` posé (419) donc `shopsWithInventory` calcule `buildConsolidatedInventory` pour chaque PdV sur le thread principal (471-482), recalculé ensuite à l'arrivée de `marketPrices` (136), de `components` et de `menuItems`.
- t4 (après le squelette): `fetchPreExpected`, `fetchPredictedNeed` (jusqu'à 3 appels en série: restock-plans, restock-plans/:id, predict-versions), planificateur du brouillon (4 GET en série puis POST), `logistics/loadStock`, `PinBand` (2 GET), puis timers 20 s et 30 s. Compte à la lecture: environ 15 appels réseau hors chemin critique, hors `storageTypes` et `loadStorageInventory`.

## 5. Problèmes de performance (nouveaux, numérotation à la suite de 07_inventaire.md)

15. Batch des articles par PdV lancé APRÈS `allSettled` alors qu'il ne dépend que de `spaceId` et `configId` (`useInventoryData.js:219-226` puis `329`). Un aller-retour de plus sur le chemin critique. Impact: haut. Pages: staff pre et post, et "tout l'inventaire".
16. `loadStorageInventory(spaceId, {force: true})` à chaque `loadContext`, donc aussi à chaque revalidation silencieuse au retour sur la page (`useInventoryData.js:222`). Impact: moyen.
17. `shopsWithInventory` recalcule `buildConsolidatedInventory` de tous les PdV dès qu'un de `menuItems`, `marketPrices`, `components` change (`useInventoryData.js:134-137, 471-482`). `marketPrices` arrive en fire-and-forget, avec un commentaire "~60 s à froid" (`inventory.js:45-46`, rapport partiel). Si le store est mis à jour par page de 200, plusieurs recalculs complets (non vérifié). Impact: moyen à haut au démarrage à froid.
18. `buildReconciliationLines`: 4 lectures indépendantes enchaînées en série (`SpaceInventoryView.vue:2858, 2899, 2965, 3070`). Impact: moyen (latence additionnée, hors chemin critique mais elle précède le POST qui tient le document et elle est rejouée à chaque PdV complété).
19. Appels en double: `post-event-baseline` (fetchPreExpected + 2899) et `predict-versions` + `buildStockRequirements` (2673 + 3070). Impact: moyen.
20. Deux minuteurs sur la même URL `GET /inventory-windows/:s/:e`: 30 s dans `InventoryPinBand.vue:114-123` et 20 s dans le tick de `useInventoryLivePolling`. Soit 5 requêtes par minute quand la fenêtre est ouverte. Le minuteur du bandeau ne s'arrête qu'au démontage (123): en keep-alive (2 instances gardées, `useInventoryKeepAlive.js:3-6` du rapport partiel) il continue probablement en arrière-plan sur une autre page (déduction, le garde `visibilityState` ne couvre que l'onglet masqué). Impact: moyen. Pages: staff pre et post.
21. Recalcul en O(PdV x articles) à chaque frappe: `getCount` crée un objet et copie par spread à chaque appel (`SpaceInventoryView.vue:2310-2319`). Il est appelé par `countedInShop` (2321) pour chaque article, lui-même appelé par `inventoryStats` (1822-1827), `statusFor` dans `countingStatusCounts` (1786-1797), `filteredCards` (1775-1783, `statusOf(c)` évalué deux fois par carte) et `postEventCompletedKey` (1307-1315 via `isElementComplete`). `inventoryCounts` est remplacé entier à chaque saisie (rapport partiel, point 9): ces computed repartent tous. Ordre de grandeur arithmétique, hypothèse 40 PdV x 100 articles: 4 000 objets par computed, de l'ordre de 20 000 allocations par frappe. Ce n'est pas une mesure. Impact: moyen à haut sur mobile.
22. `InventoryAggregateView` reçoit `inventoryCounts` et `shopsWithInventory` entiers en props (`InventoryAggregateView.vue:271-272`): ses computed internes (1341 lignes, non lus) sont invalidés à chaque frappe. Impact: non vérifié.
23. `fetchPredictedNeed`: `listRestockPlans` ramène tous les plans de l'espace pour en retrouver un côté client (`SpaceInventoryView.vue:2655-2656`), puis `getRestockPlan` (plan complet avec photo, `restock.api.js:121`), puis `predict-versions` en repli: trois appels en série. `this.predictedNeed = null` (2650) vide l'index à chaque revalidation. Impact: moyen.
24. `api/client.js`: timeout 60 s (18); un GET en timeout subit une sonde `/health` de 5 s puis un second essai possible de 60 s (228-239, 47-59), soit jusqu'à environ 125 s avant erreur (calcul à partir des constantes). Warm-up `/health` à chaque chargement du module, y compris sur les pages invité (34-41); le commentaire le justifie par un "free tier" qui s'endort, alors qu'une note de projet indique l'offre pro (à confirmer). L'intercepteur de requête charge `@/lib/supabase` dynamiquement tant que le token est absent (130). Aucune annulation des requêtes au changement de page. Impact: bas à moyen.
25. `PinLoginView`: `checkContext` puis `tryRememberedPin` en série (168-169) et `setTimeout` de 700 ms avant la redirection (291). Impact: bas, mais c'est la porte d'entrée du terrain mobile.

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| FRONT: lancer `getConfigShopMenuItemsLight` dans le même `Promise.allSettled` que shops et configuration, puis assembler | enlève un aller-retour du chemin critique | faible (la map ne dépend que des ids) | S | `useInventoryData.js:219-343` |
| FRONT: ne pas forcer `loadStorageInventory` en mode `silent` | revalidation plus légère | lignes « stocké » un peu moins fraîches | S | `useInventoryData.js:222` |
| FRONT: `Promise.allSettled` pour les 4 lectures de `buildReconciliationLines` | latence = la plus lente au lieu de la somme | faible | S | `SpaceInventoryView.vue:2858-3070` |
| FRONT: mutualiser `post-event-baseline` et `predict-versions` (stocker la promesse, TTL court) entre `fetchPreExpected`, `fetchPredictedNeed` et la réconciliation | moins d'appels et un seul `buildStockRequirements` | cache périmé après changement de version | M | `usePredictedNeed.js`, `SpaceInventoryView.vue` |
| FRONT: un seul minuteur du tableau de statut PIN; arrêter celui du bandeau quand la page est désactivée (`onDeactivated`) | moins de requêtes, plus d'écritures concurrentes du store | faible | S | `InventoryPinBand.vue:114-123`, `SpaceInventoryView.vue:990-1000` |
| FRONT: `getCount` sans allocation (lire la clé, valeur par défaut figée) et un index de complétude par PdV calculé une fois, partagé par `inventoryStats`, `countingStatusCounts`, `filteredCards`, `postEventCompletedKey` | beaucoup moins de travail par frappe | faible, tests de statut à garder | M | `SpaceInventoryView.vue:1307, 1775, 1786, 1813, 2310-2341` |
| FRONT: calculer les `shopsWithInventory` de façon incrémentale ou attendre `marketPrices` avant le premier calcul | évite les recalculs complets au démarrage | affichage des prix plus tardif | M | `useInventoryData.js:471-510` |
| FRONT: `PinLoginView` tenter le PIN mémorisé en parallèle du contexte; retirer le délai de 700 ms ou le raccourcir | connexion terrain plus rapide | faible | S | `PinLoginView.vue:168-169, 291` |
| FRONT: revoir le warm-up et le double essai de `client.js` selon l'hébergement réel | moins de requêtes parasites | confirmer l'offre Render | S | `client.js:34-41, 228-239` |
| BACKEND: filtre `?eventId=` sur `GET /spaces/:id/restock-plans` pour ne pas rapatrier toute la liste | un appel au lieu de deux | contrat à adapter | S | `restock.api.js:110`, contrôleur restock (non lu) |
| BACKEND (à examiner par l'autre agent): coût de `event-consumption`, `post-event-baseline`, `pre-event` | non évalué ici | | | `inventory.controller.ts` |
| SQL: aucun point nouveau lu dans ce complément | | | | |

## 7. Points non vérifiés

Non lus, donc aucune affirmation:
- `SpaceInventoryView.vue`: computed 1136-1262 et 1332-1700, `isElementComplete`, `withItemFilters`, `activeCards`, `fetchPreExpected` (corps), `resolveEventContext`, `revalidateInventory`, `useInventoryLivePolling` (hormis ce qu'en dit le rapport partiel), template 160-797 lu seulement par extraction des conditions.
- Enfants: corps de `InventoryAggregateView` (hors props et lignes 270-312), `InventoryStorageAggregateView`, `InventoryReconciliationView`, `InventoryShopCard`, `InventoryStorageCard`, `InventoryFilterDrawer`, `InventoryFilterPanel`, `InventoryMenuCoverageDrawer`, `GuestPinBadge` (hors son dispatch), `PdvRecountButton`.
- Composables et utilitaires: `useStorageInventory.loadStorageInventory` (URL), `usePreEventEditWindow`, `useInventorySalePrices`, `useShoppingList`, `useInventoryPinActions`, `useInventoryPinAccess`, `utils/inventoryUtils.js` (`buildConsolidatedInventory`, coût CPU), `utils/stockPlanning.js` (`buildStockRequirements`), store `spaceShops`, `shopMenuItems`, `storageTypes`, `logistics`, `guestPin` (`getContext`, URL exacte), `useRefreshOnReturn` est lu (40 l., seuil 30 s par défaut, `useRefreshOnReturn.js:17`), mais son appelant dans la vue n'a pas été relu ici.
- `PinLoginView.vue`: lu seulement 160-225 (valeur de `AUTO_CHECK_MS`, appelant de `startAutoCheck`, rendu non vus).
- Mesures à faire: onglet Network au premier affichage post-event (nombre réel d'appels, ordre, doublons de `post-event-baseline` et `predict-versions`), profil de rendu pendant la saisie (durée des computed 21), nombre de mises à jour de `marketPrices` (une ou plusieurs) et durée du recalcul de `shopsWithInventory`, taille de `GET .../shop-items?itemsScope=space`, vérification que le minuteur du bandeau survit bien en keep-alive.
