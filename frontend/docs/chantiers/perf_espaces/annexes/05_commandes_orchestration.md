# 05. Page Commandes (restock), orchestration du chargement

Périmètre: côté chargement de la page. Statut de la lecture: le FRONTEND a été lu (extraits ciblés). Le BACKEND n'a PAS été lu
(arrêt demandé par le coordinateur à 130k tokens). Toute affirmation backend ci-dessous est marquée "non vérifié".
Les durées citées viennent des commentaires du code, pas de mesures. Chemins relatifs à la racine du dépôt.

## 1. Fiche de la page

| Élément | Valeur | Preuve |
|---|---|---|
| Route | `/spaces/:spaceId/restock`, nom `space-restock` | frontend/src/router/index.js:259-260 |
| Composant | `SpaceRestockView.vue`, import dynamique (lazy) | frontend/src/router/index.js:261 |
| Meta | `title: 'Commandes'`, `keepAlive: true`, `permission: ['front.fb.restock','front.fb.restockBoard']` | frontend/src/router/index.js:262 |
| Garde de nom/permission | code `front.fb.restock` / `front.fb.restockBoard` mappé sur `space-restock` | frontend/src/router/guards.js:206 |
| beforeEnter | non vérifié | |
| Fichier principal | `frontend/src/components/space-workspace/restock/views/SpaceRestockView.vue`, 9773 lignes (wc -l) | |
| Composables dédiés | `restock/composables/useRestockCatalogReadiness.js` (90 l.), `useRestockReturnRefresh.js` (93 l.) | |
| Composables/utilitaires lus | `frontend/src/composables/useLogisticRemaining.js` (149 l.), `frontend/src/utils/componentCatalog.js` (183 l.), `frontend/src/composables/useSpaceData.js` (527 l.), `frontend/src/utils/retryRequest.js`, `frontend/src/composables/useRefreshOnReturn.js` | |

keepAlive: `mounted` ne rejoue pas au retour. Le retour passe par `activated()` (SpaceRestockView.vue:3978-3988) et par
`useRestockReturnRefresh` (voir section 5, point 7).

## 2. Arbre des composants

Non traité en détail (périmètre: sous-composants visuels confiés à un autre agent). Seuls les éléments d'orchestration sont
connus: `WorkspaceAppHeader` en tête du template (SpaceRestockView.vue:5), dossiers `restock/components`, `restock/drawers`
(RestockItemShopsDrawer.vue), `restock/components/*` (Panels, Drawers de stockage, Tabs). Montage immédiat ou différé: non vérifié.

## 3. Appels API, composant par composant

Légende: S = séquentiel bloquant pour `loadAll`, P = parallèle non attendu, "non lu" = backend ou store non ouvert.
Payload: non mesuré partout.

| # | Déclencheur | Méthode + URL | Fonction front | Séquence / blocage | Cache front | Backend (contrôleur/service, SQL, Redis) |
|---|---|---|---|---|---|---|
| 1 | mounted | GET `/spaces/:id`, `/spaces/:id/configurations`, `/events?spaceId&limit=200` (en parallèle) | `fetchSpaceData` phase 1, useSpaceData.js:124-150, via `analyse/loadSpace` (analyse.js:1705) | S, attendu par `loadAll` (SpaceRestockView.vue:4024). Appelé seulement si espace différent, `menuItems` vide, ou `recipeCatalogLoaded` faux (4016-4023) | `loadSpace` cache-first 15 min si même espace ET `recipeCatalogLoaded` (analyse.js:1716-1723) | non lu |
| 2 | t0 de fetchSpaceData (avant phase 1) | GET `/spaces/:id/shop-details?granular=1&page=1&limit=200` | `getSpaceShopGranular`, space.api.js:86-98, lancé useSpaceData.js:116 | P, consommé en vague 2a (useSpaceData.js:226). Le commentaire donne 15-20 s sur un gros espace, RPC `get_space_shop_details` (useSpaceData.js:6-8, durée non mesurée) | aucun | non lu (RPC SQL non vérifiée) |
| 3 | vague 2a | GET `/menu-items?page=1&limit=150&spaceId=` puis pages 2..N en `Promise.all` NON borné | `getAllMenuItems`, menu-item.api.js:36-64 (pages 2+ lignes 52-57) | P dans la vague 2a, mais bloque la publication de la vague 2b (voir 4) | `settleRequest` (2 retries, retryRequest.js:17) | non lu |
| 4 | vague 2a | GET `/product-types`, `/product-categories`, produits Weezevent (`catalogSpaceId`), mappings produits | useSpaceData.js:227-241 | P, mais dans le même `Promise.all` que 2 et 3, donc la vague 2b attend le plus lent | aucun | non lu |
| 5 | vague 2b, lancée EN PARALLÈLE de 2a (useSpaceData.js:211-218) | GET `getIngredients` paginé (`fetchAllPaginated`), `/menu-components?page&limit=100` (page 1 puis reste concurrence 4, useSpaceData.js:84-99), packaging | useSpaceData.js:215-217 | requêtes réseau parallèles à 2a, MAIS leur résultat n'est lu qu'après 2a (`await recipeCatalogRequests`, useSpaceData.js:339) | `settleRequest` | non lu |
| 6 | fin de 2b | GET `/menu-components/:id` pour chaque composant sans `subComponents`, concurrence 5 | `hydrateSubComponents`, componentCatalog.js:131-183 (filtre 134, pool 148-162), `getMenuComponent` menu.api.js:113-115 | S dans la chaîne critique: `await hydrateSubComponents` (useSpaceData.js:373) avant que `components` soit publié et `recipeCatalogLoaded` posé (analyse.js:1838-1842) | aucun, échec toléré (componentCatalog.js:159) | non lu |
| 7 | loadAll, non attendus | `inventory/loadMarketPrices`, `loadPackagingTypes`, `marketPriceTypes/fetchMarketPriceTypes`, `marketPriceCategories/fetchMarketPriceCategories` | SpaceRestockView.vue:4026-4030 | P, mais `pricesSettled` (marketPricesCachedAt ou erreur) conditionne `catalogReady` (useRestockCatalogReadiness.js:42) | TTL 15 min pour market prices et packaging (inventory.js:22,79-81) | non lu |
| 8 | loadAll | storage inventory (builder state) | `loadStorageInventory`, SpaceRestockView.vue:4033 | P | TTL 15 min d'après le commentaire (4031), store non lu | `builder-v2/state`: non lu |
| 9 | loadAll | GET `/suppliers` (sans page/limit) | `ensureBomSuppliers`, SpaceRestockView.vue:5681-5688 ; menu.api.js:415-421 | P, une fois si `bomSuppliers` vide | mémoire instance | non lu |
| 10 | loadAll | GET résumé `predict-versions/summary` (groupé) | `resolvePredictedEventIds`, restockPredictedIds.js (appel `getEventIdsWithPredictVersions`) | S, attendu (SpaceRestockView.vue:4049) | aucun | non lu |
| 11 | loadAll | GET versions Event Predict PAR event prédit, `Promise.all` | `syncBddVersions`, SpaceRestockView.vue:4867-4884 (appel 4873) | S, attendu (4053), N requêtes si N events prédits | miroir localStorage (4880) | non lu |
| 12 | loadAll après catalogue prêt | GET `/logistics/:space/stock?configId=` pour chaque config objectif, `Promise.all` | `loadLogisticRemainingIndex`, useLogisticRemaining.js:36-96 ; `getLogisticsStock` logistics.api.js:17-22 ; appelé via `loadLogisticRemaining` SpaceRestockView.vue:5859-5875 | S, attendu en tête de `loadPreviousInventory` (5878), lui-même attendu (4109). Aucun cache ni dédup, seulement un compteur anti-race (5865) | aucun | `stock-level.service.ts`, `salesByElementSince`, `recipe-explosion.service.ts`: NON LUS |
| 13 | loadPreviousInventory | `inventory/loadInventory` (store) puis GET `/inventory/:space/:event`, puis GET `/inventory/:space/latest` si vide | SpaceRestockView.vue:5895, 5920, 5932 ; inventory.api.js:11-32 | S enchaînés, attendus | le commentaire (3985) affirme une dédup in-flight dans le store, non vérifié | non lu |
| 14 | mounted et watcher route.params.spaceId | GET `/inventory/:space/reconciliations` | `loadInventoryReconciliations`, SpaceRestockView.vue:5553-5564 ; inventory.api.js:91-93 | P, non attendu, best-effort | aucun | non lu |
| 15 | loadAll (dernier) | GET `restock-state` | `restoreRestockState`, SpaceRestockView.vue:4139-4152 (`getRestockState` 4145) | S, attendu (4114). Repli localStorage | miroir localStorage (4154) | non lu |
| 16 | mounted | `plansApi.refresh(spaceId)` (liste des restock-plans) puis `plansApi.load(planId)` | SpaceRestockView.vue:3955, 4262-4269 ; `useRestockPlans` non lu | liste: P (3955), attendue après loadAll (3961) ; `openLatestPlanOnEntry` (4520-4536) puis `loadPlan` sont S après loadAll | aucun | non lu |
| 17 | mounted | `kitchens/fetchKitchens` | SpaceRestockView.vue:3959 | P, non attendu | cache 15 min d'après le commentaire (3958), store non lu | non lu |
| 18 | loadAll, non attendu, et watcher `objectiveEvents` | `spaceShops/fetchForSpace` puis `shopMenuItems` par PdV, concurrence 3 | `loadRestockShopAssignment`, SpaceRestockView.vue:4953-5009 | P ; cache par `cfgId` dans l'instance (4972-4980) | single-flight + TTL du store partagé (commentaire 5003-5006), non vérifié | non lu |
| 19 | watcher `missingRecipeIdsKey` / génération | batch `getMenuItemRecipes(missing)`, repli détail par id concurrence 4 | `loadMissingRecipes`, SpaceRestockView.vue:6074-6124 | hors chaîne critique du squelette (déclenché par watcher) | `recipeByMenuItemId` | non lu |
| 20 | tout changement du snapshot (deep) | PUT `restock-state` débouncé 500 ms + écriture localStorage immédiate | `persistRestockState`, SpaceRestockView.vue:4223-4251 ; watcher 3922-3927 | P | | non lu |
| 21 | retour sur la page > 30 s | `analyse/useSpaceDataFetch` complet, market prices et packaging forcés, storage forcé, suppliers, predicted events, shop assignment forcé, batch recettes | `useRestockReturnRefresh.js:65-84` ; seuil `minAwayMs` 30000 dans useRefreshOnReturn.js | P, silencieux | | non lu |

## 4. Cascade au premier affichage

Chronologie déduite du code (aucune durée mesurée).

- t0, `mounted` (SpaceRestockView.vue:3949): lance en parallèle `plansApi.refresh` (3955), `loadInventoryReconciliations` (3957), `fetchKitchens` (3959), puis `await loadAll()` (3960).
- t1, `loadAll`: `await analyse/loadSpace` (4024). Dedans: shop-details granular part immédiatement (useSpaceData.js:116, RPC lente), phase 1 (3 GET parallèles). `loadSpace` rend la main après la phase 1, l'enrichissement tourne en fond (useSpaceData.js:422-443).
- t1b, juste après: lancement non attendu de market prices, packaging, types, catégories, storage, fournisseurs, hydratation composants (4026-4037).
- t2: `await resolvePredictedEventIds` (4049) puis `await syncBddVersions` (4053), N requêtes. Bloque la suite.
- t3: `await catalogApi.waitUntilReady()` (4102). Prêt = menu réglé ET `recipeCatalogLoaded` (ou erreur) ET prix réglés (useRestockCatalogReadiness.js:38-44). Plafond 150 s (ligne 19). `recipeCatalogLoaded` n'est posé qu'à la 2e émission `onEnrichment` (analyse.js:1838-1842), donc après: la fin de la vague 2a (granular + menu-items + Weezevent, useSpaceData.js:223-242), puis la résolution de 2b (339), puis l'`await hydrateSubComponents` (373).
- t4: `await loadPreviousInventory` (4109): Logistic fan-out (attendu), puis `inventory/loadInventory`, puis GET inventaire de l'event précédent, puis GET `latest` si vide.
- t5: `await restoreRestockState` (4114): GET `restock-state`, applique la sélection restaurée (4166-4171), dont `selectedEventIds`.
- t6: `loading = false` seulement au `finally` de `loadAll` (4117-4120).
- t7, retour dans `mounted`: `await plansReady`, `openLatestPlanOnEntry` (3964) puis `loadPlan` (4535) puis GET du plan, après tout le reste. Un `loadPlan` est aussi lancé sans attendre par `restoreRestockState` (4211-4213) quand `loadedPlanId` est sauvegardé.

Chemin critique: loadSpace phase 1 -> (granular + 2a le plus lent) -> hydratation N+1 composants -> summary + versions par event (déjà passés avant waitUntilReady, donc en série dans le temps avec lui seulement si plus lents) -> Logistic -> inventaire -> restore-state -> plan.

## 5. Problèmes de performance

1. **La disponibilité du catalogue de Commandes est conditionnée par des appels dont elle ne se sert pas (haut).** `recipeCatalogRequests` démarre en parallèle (useSpaceData.js:211) mais n'est lu qu'après le `Promise.all` de la vague 2a qui inclut `granularPromise` (shop-details granular, 15-20 s selon le commentaire, useSpaceData.js:6-8,226), produits Weezevent et mappings (235,241). `recipeCatalogLoaded` n'est posé qu'ensuite (analyse.js:1838-1842) et `waitUntilReady` l'exige (useRestockCatalogReadiness.js:41). Que Commandes n'exploite pas `shopGranularData`: déduit, non vérifié exhaustivement. Page: Commandes (Analyse/Live ont `skipRecipeCatalog`, analyse.js:1714).
2. **N+1 `/menu-components/:id` bloquant (haut).** `hydrateSubComponents` récupère un détail par composant sans `subComponents` (componentCatalog.js:134,148-150), concurrence 5 (132), attendu avant publication des composants (useSpaceData.js:373). Les commentaires affirment que la liste ne renvoie pas `subComponents` (componentCatalog.js:5-6, useSpaceData.js:369-370). Observation front vérifiée: `buildSubComponentsFromDetail` (componentCatalog.js:78-114) ne lit que `full.ingredients` et `full.children`, et ne s'applique qu'à la réponse détail; les lignes de la liste ne lui sont jamais passées (`mergeSubComponentsFromCatalog` ne lit que `hit.subComponents`, 48-55). Si la liste cachée contient bien `ingredients` et `children` (affirmation du coordinateur), le fan-out est évitable côté front sans appel supplémentaire. Contenu réel de la liste backend: non vérifié.
3. **Chaîne séquentielle derrière le catalogue (haut).** `summary` puis `syncBddVersions` (N requêtes), `waitUntilReady`, `loadPreviousInventory` (Logistic puis store inventaire puis GET event puis GET latest), `restoreRestockState`, enfin `loadPlan` dans `mounted`: tout est `await` successif (SpaceRestockView.vue:4049, 4053, 4102, 4109, 4114, 3961-3964). Beaucoup de ces appels ne dépendent pas du catalogue (Logistic, inventaire, restore-state, plan) mais attendent derrière lui. Dépendance réelle de `loadPreviousInventory` au catalogue: `resolvedObjectiveConfigIds` (2297) dépend de configs/events, non du catalogue d'après la lecture partielle, à confirmer.
4. **Fan-out Logistic par config sans cache ni dédup (haut).** `loadLogisticRemainingIndex` fait un GET `/logistics/:space/stock?configId=` par config (useLogisticRemaining.js:42-47). L'appel ne passe que `configId` (logistics.api.js:17-22). Chaque appel de `loadPreviousInventory` le rejoue: seul un compteur anti-race existe (SpaceRestockView.vue:5865,5874), pas de dédup ni de cache. Le commentaire compte 8 points d'appel (5860). Que chaque config recalcule le même résultat côté serveur: non vérifié (backend non lu).
5. **`loadPreviousInventory` rejoué plusieurs fois à l'entrée (moyen, déduit).** Watchers `selectedEventIds` deep (3861-3867) et `objectiveSource` (3910-3917) l'appellent. À l'entrée, `loadAll` affecte `selectedEventIds` et `objectiveSource` (4077-4091), puis l'appel explicite (4109), puis `restoreRestockState` réécrit `selectedEventIds` (4170) et `loadPlan` aussi (4286-4288). Chaque passe refait Logistic + inventaire. Nombre exact d'appels réseau: non mesuré. La première passe (sélection par défaut) est inutile quand l'état restauré change la sélection.
6. **Timeouts empilés (moyen, cold start haut).** Axios timeout 60 s (client.js:18), un retry sur timeout si `/health` répond < 5 s (client.js:221-234), un retry 429 (211-216), puis `retryRequest` 2 essais à 1,5 s et 4 s (retryRequest.js:17,39-49) sur chaque catalogue via `settleRequest`. Cumul théorique par ressource (calcul à partir des constantes, non mesuré): jusqu'à 3 essais, chacun jusqu'à 2 x 60 s, plus 5,5 s d'attente. `waitUntilReady` borne l'attente à 150 s (useRestockCatalogReadiness.js:19). Le squelette reste donc affiché jusqu'à 150 s dans le pire cas.
7. **Retour sur la page = rechargement complet de l'espace (moyen/haut).** `useRestockReturnRefresh` relance `analyse/useSpaceDataFetch` sans `skipRecipeCatalog` (useRestockReturnRefresh.js:76), donc granular RPC + 2a + 2b + hydratation N+1 à chaque retour après plus de 30 s (useRefreshOnReturn.js, `minAwayMs: 30000`). En plus, `activated()` rappelle `loadPreviousInventory` à chaque réactivation sans seuil (SpaceRestockView.vue:3986), donc le fan-out Logistic à chaque retour. Autre cas: si le store a été chargé par Analyse/Live avec `skipRecipeCatalog`, Commandes force un chargement complet à l'entrée (analyse.js:1716-1723, 1721 commentaire; condition 4022 de la vue).
8. **Composants à recette vide re-fetchés (moyen).** Le filtre `needDetail` (componentCatalog.js:134) ne distingue pas "jamais chargé" de "chargé, recette vide"; un composant sans ingrédients reste dans `needDetail` à chaque passage. Le watcher `components(_fresh, previous)` remet `componentsHydrated=false` et relance (SpaceRestockView.vue:3812-3817, 6038-6059). Le commentaire (6045-6047) présente l'appel comme un no-op quand le catalogue est déjà hydraté, ce qui est faux pour ces composants.
9. **Pages `/menu-items` 2..N en `Promise.all` non borné (moyen, risque non mesuré).** menu-item.api.js:52-57. Le code de la vue documente déjà un 429 `TenantThrottlerGuard` avec ~40 requêtes simultanées (SpaceRestockView.vue:6092-6097). Aucune mesure sur ce chemin-ci.
10. **`syncBddVersions` N requêtes (moyen).** Une requête par event prédit (4871-4873) alors qu'un endpoint groupé `summary` existe déjà pour les ids (restockPredictedIds.js). Existence d'un endpoint groupé pour les versions: non vérifié.
11. **Écriture localStorage à chaque changement du snapshot (bas/moyen).** `persistRestockState` écrit `localDb.setRestockState` sans débounce (4227), le PUT est débouncé (4231). Taille du snapshot: non mesurée.
12. **`getSuppliers()` sans pagination (bas).** menu.api.js:415-421, appelé sans paramètres (SpaceRestockView.vue:5684). Volume et plafond côté backend: non vérifié.

## 6. Recommandations

Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Publier `components`/`recipeCatalogLoaded` dès la fin de 2b liste, avant l'hydratation, ou sans attendre `granularPromise` (séparer la promesse 2b de `Promise.all` 2a) | Lève le squelette sans attendre shop-details ni Weezevent | Moyen: ordre des commits du store, `SET_ENRICHING` | M | useSpaceData.js, analyse.js |
| Option `skipGranular` (ou chargement catalogue seul) pour Commandes: ne pas lancer shop-details granular ni Weezevent | Retire l'appel le plus lent du chemin critique de Commandes | Moyen: vérifier que Commandes n'utilise pas `shopGranularData` | M | useSpaceData.js, analyse.js, SpaceRestockView.vue:4024 |
| Dériver `subComponents` de `ingredients`/`children` de la liste quand présents (via `buildSubComponentsFromDetail`), fetch détail seulement en repli | Supprime le N+1 si le backend les renvoie dans la liste (à confirmer) | Faible si backend confirmé | S/M | componentCatalog.js, useSpaceData.js:368-375 |
| Marquer les composants déjà tentés (Set d'ids) pour ne pas re-fetch les recettes vides | Évite les doublons de détail | Faible | S | componentCatalog.js:134, SpaceRestockView.vue:6038 |
| Paralléliser: lancer `loadPreviousInventory`, `restoreRestockState` et `plansApi.load` sans attendre `waitUntilReady` quand ils ne dépendent pas du catalogue | Raccourcit la chaîne critique | Moyen: ordre de restauration/sélection | M | SpaceRestockView.vue:4010-4121, 3949-3977 |
| Charger l'état restauré (`restock-state`) avant la sélection par défaut pour éviter la première passe inutile | Supprime au moins un fan-out Logistic | Moyen | M | SpaceRestockView.vue:4076-4114 |
| Dédupliquer et mettre en cache court `loadLogisticRemainingIndex` (clé espace+config, in-flight partagé) ; debounce des watchers | Moins d'appels Logistic répétés | Moyen: fraîcheur du stock (ledger temps réel) | M | useLogisticRemaining.js, SpaceRestockView.vue:3861,3910,3986,5859 |
| Retour de page: ne pas relancer `useSpaceDataFetch` complet (ou avec seuil plus long) ; seuil sur `activated()` | Évite RPC granular + N+1 à chaque retour | Moyen | S | useRestockReturnRefresh.js:76, SpaceRestockView.vue:3978 |
| Borner `getAllMenuItems` (asyncPool) | Évite les 429 | Faible | S | menu-item.api.js:52-57 |
| Ne pas empiler 3 couches de retry sur le même GET de catalogue (choisir une couche) | Pire cas plus court | Moyen: robustesse cold start | S | retryRequest.js, client.js |

Backend (à confirmer, non lu): lire `stock-level.service.ts`, `recipe-explosion.service.ts`, `salesByElementSince` pour factoriser le calcul par espace quand plusieurs configs sont demandées ; ajouter `ingredients`/`children` à la liste `/menu-components` si absents ; endpoint groupé pour les versions Event Predict ; cache Redis court sur `/logistics/:space/stock`.

SQL/index: aucune action proposable sans EXPLAIN (règle du projet). Cibles à analyser: RPC `get_space_shop_details`, requêtes de `salesByElementSince`, liste `/menu-components`.

## 7. Points non vérifiés

- TOUT le backend: `stock-level.service.ts`, `salesByElementSince`, `recipe-explosion.service.ts`, contrôleurs et services de `menu-components` (liste et `:id`), `menu-items`, `inventory` (`reconciliations`, `:space/:event`, `latest`), `restock-plans`, `restock-state`, `predict-versions`, `builder-v2/state`, `market-prices`, `suppliers`, `shop-details`. Donc aucun SQL, index, cache Redis ni N+1 Prisma n'est établi ici. Les constats "fan-out Logistic avec recalcul identique" et "liste cachée contenant ingredients et children" restent des hypothèses du coordinateur, non confirmées ni infirmées.
- Stores non ouverts: `kitchens`, `storageInventory`, `spaceShops`, `shopMenuItems`, `marketPriceTypes`, `marketPriceCategories`, contenu de `inventory/loadInventory` (dédup in-flight annoncée par un commentaire, SpaceRestockView.vue:3985), `useStorageInventory`, `useRestockPlans`.
- Utilitaires non lus: `fetchAllPaginated` (utils/paginateAll), `runWithConcurrency` (utils/asyncPool), `getRestockState`/`putRestockState`/`isRestockApiDown`, `getEventIdsWithPredictVersions`, `listEventPredictVersions`, `getMenuItemRecipes`.
- Non vérifié dans la vue: usage réel de `loading` pour le squelette (le commentaire 4099 l'affirme), nombre exact de déclenchements de `loadPreviousInventory` à l'entrée, lignes 5209 et 5252 (autres appelants de `syncBddVersions` / `loadPreviousInventory`), `beforeEnter` de la route.
- À mesurer dans l'onglet Network: durée de chaque appel de la section 3, taille des réponses (stock Logistic, `/menu-components`, `shop-details`), nombre de requêtes Logistic à l'entrée, effet des 429, durée de `waitUntilReady` en cold start et à chaud.
