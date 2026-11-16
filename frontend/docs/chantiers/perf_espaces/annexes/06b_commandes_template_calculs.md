# 06b. Commandes (SpaceRestockView) : template et logique de calcul

Périmètre: `frontend/src/components/space-workspace/restock/views/SpaceRestockView.vue` (9773 lignes), template et calculs, hors chargement initial (mounted/loadAll/loadPreviousInventory/restoreRestockState, traités ailleurs). Lecture seule. Aucune mesure: les durées citées viennent des commentaires du code, les volumes sont des formules à instancier. Tout ce qui n'a pas été lu est marqué "non vérifié". Rapport partiel: l'agent a atteint son budget de contexte (voir section 7).

Découpage du fichier (grep): template L1-1619, script L1621, data() L1852, computed L2054-3810 (environ 1750 lignes), watch L3811-3941, methods L3994-6887, style L6888-9773.

## 1. Fiche de la page

- Composant: `SpaceRestockView.vue` (options API). Route, meta et garde: non vérifié ici (autre rapport).
- Les 4 étapes de la commande ne sont PAS des routes ni des composants différés. Ce sont des sections du même template, affichées par `v-show` (jamais `v-if`): étape 1 L270, étape 2 L746, étape 3 L1196. L'étape 4 (Commande composants) est `RestockComponentOrdersPanel` dans la colonne droite (L1407), rendue en permanence, comme `RestockStorageSummary` (L1402, Résumé commande) et `RestockSuppliersPanel` (L1408).

## 2. Arbre des composants (partie template lue)

| Section | Lignes | Montage | Données |
|---|---|---|---|
| Panneau événements | L54-260 | `v-show="!eventsCollapsed"` L67, monté d'emblée | selectedEvents, sélecteurs |
| Étape 1 (Stock PDV / Espaces de stockage) | L270-740 | `v-show="currentStep === 1"` L270; onglets `v-if="stockTab === 'shops'"` L361 / `v-else` L524 (un seul des deux est rendu); contenu en `v-show="!collapsed.stock"` | `filteredStockSettingsRows` (L374), `circuitStorageGroups` (L582) |
| Étape 2 (Réarmement) | L746-1195 | `v-show="currentStep === 2"` L746, monté d'emblée, corps en `v-show="!collapsed.restock"` L808 | `pagedRestockGroups` (L840, L1046), page de 10 groupes (`groupPageSize: 10` L1929) |
| Étape 3 (Liste de courses) | L1196-1396 | `v-show="currentStep === 3"` L1196, corps en `v-show="!collapsed.shopping"` L1267 | `pagedShoppingGroups` (L1292), 10 fournisseurs par page, tous leurs articles rendus (L1328) |
| Colonne droite: Résumé commande | L1402-1406 | toujours rendue (aucun v-if sur l'étape) | prop `storageSummary` (computed L3490) |
| Colonne droite: Commande composants | L1407 | toujours rendue | prop `componentOrdersPanel` (computed L3483) |
| Colonne droite: panneau fournisseurs | L1408-1412 | toujours rendue | prop `suppliersPanelGroups` (computed L3284) |
| Dialogues email, config mobile, garde plan, snackbar | L1418-1590 | `v-dialog`/`v-bottom-sheet`, contenu paresseux Vuetify | |

Ventilation: pas de template Ventilation dans ce fichier d'après les lectures (seul un commentaire L2969 dit que `remainingFromLogistic` est "lue par la Ventilation"). Page et composant de Ventilation: non vérifié.

## 3. Appels API, autosave du plan

| Déclencheur | Méthode + URL | Fonction front | Séquence / debounce | Cache | Payload |
|---|---|---|---|---|---|
| Watcher deep sur `restockPersistSnapshot` (SpaceRestockView L3922) | localStorage, puis `PUT /spaces/:spaceId/restock-state` | `persistRestockState` L4223, `localDb.setRestockState` (`frontend/src/data/localDb.js` L65, `write` L20: `JSON.stringify` + `setItem` synchrone), `putRestockState` (`frontend/src/api/endpoints/restock.api.js` L40-78) | localStorage: SANS debounce, à chaque changement. PUT: debounce 500 ms (L4231-4250) | localStorage (fallback) | snapshot de 17 champs (L3754-3779): selectedEventIds, stockAdjustments (une entrée par article), restockedRows, stockExcluded, stockShopPercents, storagePercents, etc. Taille réelle: non mesurée |
| Fin de "Générer la Commande" | `POST /spaces/:id/restock-plans` ou `PATCH /restock-plans/:id`, puis `GET /spaces/:id/restock-plans`, puis `GET /restock-plans/:id` | `autosavePlan` L4411, `buildPlanPayload` L4366, `plansApi.create/update` L4454-4457 (`useRestockPlans.js` L98-109: chaque write enchaîne `refresh`), `loadPlan(planId)` L4460 | séquentiel: `ensureRecipesLoaded` (mode ingrédients) puis `ensureBomSuppliers` puis build puis HTTP puis refresh liste puis GET photo | aucun | photo complète (stockRows, restockLines, shoppingGroups, recipeCoeffs, stockOutcomes, orderQuantities). Plafond front 900 000 octets (L1776), backend 1 000 000 octets et 5000 lignes (`restock-plans.service.ts` L12-13) |
| Correction de ligne sur plan chargé | `PATCH /restock-plans/:id` `{ lineOverrides, restockedRows }` puis `GET /spaces/:id/restock-plans` | `markPlanDirty` L4600 (debounce 1500 ms, `restockPlanAutosave.js` L5), `updateLoadedPlan` L4613 (passe `spaceId`, donc refresh liste) | debounce 1,5 s | aucun | petit |

Backend lu:

| Endpoint | Fichier | Opérations DB | Remarque |
|---|---|---|---|
| `PUT /spaces/:spaceId/restock-state` | `backend/src/features/restock-state/restock-state.controller.ts` L43-63, `restock-state.service.ts` L20-38 | `assertSpaceInTenant` (1 lecture) puis `restockState.upsert` (blob jsonb opaque) | aucune limite de taille, pas de comparaison avec l'état précédent |
| `POST /spaces/:id/restock-plans` | `restock-plans.service.ts` L119-142 | `assertPayloadSize` (L62-75: `JSON.stringify` du body entier), `assertSpaceInTenant`, `restockPlan.create` | |
| `PATCH /restock-plans/:id` | `restock-plans.service.ts` L144-155 | `assertPayloadSize`, puis `findById` = `findFirst` SANS `select` (L113-117, relit toute la photo jsonb), puis `update` | la relecture complète ne sert qu'au contrôle 404/tenant |
| `GET /spaces/:id/restock-plans` | `restock-plans.service.ts` L103-111 | `findMany` plafonné à 1000, `LIST_SELECT` sans photos mais avec `eventsSnapshot` | rappelé après chaque create/update/duplicate/remove |
| `GET /restock-plans/:id` | `restock-plans.service.ts` L113-117 | `findFirst` photo complète | relu après chaque autosave |

Index SQL et EXPLAIN: non vérifiés (`restockState` est lu par `tenantId_spaceId`, `restockPlan` par `id` et `tenantId`, probablement indexés, non confirmé).

Watchers réseau (déclencheurs non détaillés, corps non lus): `components.length` et `components` (L3814-3822, `ensureComponentsHydrated`), `objectiveEvents` (L3825, `loadRestockShopAssignment`), `missingRecipeIdsKey` (L3828, `ensureRecipesLoaded`), `route.params.spaceId` (L3834, refresh plans + `loadInventoryReconciliations`), `selectedEventIds` deep (L3861, `refreshSelectedPredictions` + `loadPreviousInventory`), `objectiveSource` (L3910, `loadReferenceSales` + `loadPreviousInventory`), `referenceEventId` (L3918).

## 4. Cascade de recalcul (pas la chronologie du premier affichage, traitée ailleurs)

Cas d'un déplacement du curseur "ajuster le besoin" d'un article (étape 1):

1. `<input type="range" step="5" @input>` (L457-467) appelle `setStockAdjustment` (L5440), sans debounce ni throttle. Une action par cran de 5 %.
2. Elle recrée l'objet `stockAdjustments` par copie complète (L5442), recrée `stockShopPercents` (L5448) et appelle `resetGeneratedOutputs` (L5348-5356: `restockGenerated=false`, `shoppingGenerated=false`, `restockedRows={}`).
3. `stockRowsRaw` (L2729) ne dépend pas de `stockAdjustments`: la boucle événements x enregistrements n'est PAS relancée par le curseur (bon point, vérifié L2729-2811).
4. En revanche `liveRestockRowsAll` (L2941) en dépend via `adjustedQuantity` (L5716) et se recalcule en entier: pour chaque ligne PDV x article, `adjustedQuantity`, `packagingForItem` deux fois (L2949, L2953), `remainingQuantityForRow` (L2950), `lookupLogisticRemaining`, `computeRestockOutcome`, `buildSourceBreakdown` (L2978, L6567).
5. En cascade: `restockScenario` (L2988, circuit par article), `stockShopRowsByItem`, `stockOutcomeByItem`, `liveRestockRows`, `restockRows`, `shoppingSupplierGroups`, `nettedShopping`, `shoppingGroups`, `suppliersPanelGroups`, `storageSummary`, `componentOrdersPanel`, `buyInfoByItem`.
6. Ces computed sont consommés par la colonne droite (props L1404, L1407, L1409) qui est rendue quelle que soit l'étape. Ni `liveRestockRows` (L3035) ni `shoppingSupplierGroups` (L3294-3299) ne testent `restockGenerated`/`shoppingGenerated`: tout le calcul de la liste de courses est donc évalué à chaque cran, même à l'étape 1 et même "non généré".
7. En parallèle, `restockPersistSnapshot` (L3754) change, le watcher deep (L3922) écrit le localStorage de façon synchrone et reprogramme le PUT à 500 ms.

## 5. Problèmes de performance

1. Recherche de catalogue linéaire dans une boucle ligne par ligne (impact haut). `findStockReference` (`frontend/src/utils/stockPlanning.js` L500-540) parcourt 4 pools (ingredients, components, menuItems, marketPrices) par `.find`, avec allocation d'un tableau par élément (`matchesId` L523) et `normalizeName` par élément en passe "nom" (L536). `computePackagingForQuantity` (L624) l'appelle, et si la référence n'a pas de colisage, relance `findStockReferenceCandidates` (L593-622: parcours complet des 4 pools avec `normalizeName` et `out.includes`). Appelants par ligne: `liveRestockRowsAll` L2949 et L2953 (2 appels par ligne PDV x article), `shoppingSupplierGroups` L3300 et L3355 (1 `findStockReference` + 1 `packagingForItem` par ligne, plus `marketPrices.find` L3309 et `suppliers.find` L3317 linéaires), `nettedShopping` L3597 (par article), `storageSummary` L3505 et L3509, `suppliersPanelGroups` L3287 et L3291. Estimation de coût (formule, pas de mesure): lignes R (PDV x articles) x environ 4 appels x taille du catalogue C. Exemple purement illustratif à mesurer: R = 3000 et C = 3000 donneraient de l'ordre de 36 millions de tests par recalcul, relancés à chaque cran du curseur. Pages: Commandes (étapes 1, 2, 3 et colonne droite).
2. Colonne droite toujours évaluée (impact haut). Les trois panneaux reçoivent leurs props depuis des computed lourds sans `v-if` sur l'étape ni sur `shoppingGenerated` (SpaceRestockView L1402-1412), et les computed amont ne se gardent pas (L3035, L3294). Le calcul de la feuille de course, des fournisseurs et des composants se fait dès l'étape 1. Pages: Commandes.
3. Curseur sans debounce (impact haut). `@input` L466 vers `setStockAdjustment` L5440: chaque cran de 5 % déclenche toute la cascade de la section 4, plus `resetGeneratedOutputs`. Pages: Commandes étape 1.
4. Persistance : watcher deep sur un computed qui construit un nouvel objet de 17 champs (L3754, L3922) et écriture localStorage synchrone sans debounce (`persistRestockState` L4227, `localDb.js` L20-28) (impact moyen). `JSON.stringify` de tout le snapshot sur le thread principal à chaque cran; le PUT est debounced à 500 ms mais pas l'écriture locale. Lien possible avec l'hypothèse mémoire "localStorage plein" (non vérifié ici). Pages: Commandes.
5. Liste de l'étape 1 non paginée ni virtualisée (impact moyen). `v-for="item in filteredStockSettingsRows"` (L374), une ligne par article avec un `v-tooltip` (L431), un slider, des appels de méthodes (`stockAdjustment` L5424, `isStockAdjustmentMixed` L5471 qui reconstruit la liste des shopIds, `canOpenStockShops` L5476, `stockSliderFill` L5428). Un commentaire L2889 parle d'une pagination de l'étape 1, mais le v-for L374 itère la liste complète filtrée; le composant de pagination de l'étape 1 n'a pas été lu. Pages: Commandes étape 1.
6. Étapes 2 et 3 paginées par groupes de 10, mais le contenu d'un groupe n'est pas borné (impact moyen). Étape 3: tous les articles d'un fournisseur rendus (L1328), avec 5 appels `formatDiagQty` (L1337-1341), `formatShoppingQuantity` (L1351) et `isShopsExpanded` x2 (L1361, L1367) par article. Étape 2: par ligne `depositFieldValue`, `depositPackSize`, `depositPackLabel`, `depositHelp` x2, `depositPackCount`, `depositPackDetail`, `formatRestockQuantity`, `isRestocked` x4 (L883-931). Corps de ces méthodes non lus; L6283 et L6288 appellent `packagingForItem` et sont probablement atteints depuis le rendu (non confirmé). Les computed `restockGroupsByItem`/`activeRestockGroups` (L3227, L3254) groupent toute la liste avant de paginer.
7. Doubles boucles événements (impact moyen). `stockRowsRaw` (L2732-2804) et `menuItemDemandRows` (L3393-3424) refont chacun `resolveConfigForRecords` et `deriveSelectedMenuItemsByShop` par événement. Dans `buildMenuItemDemand`, `deriveSelectedMenuItemsByShop(configuration, predictedRecords)` est recalculé DANS la boucle des shops quand `explicitIds` est vide (`stockPlanning.js` L462-466). `menuItemDemandRows` n'est lu par `missingRecipeIdsKey` (L3436) que si la garde L3435 passe (feuille générée, mode ingrédients, pas de plan chargé). Fusion des sources dans `stockRowsRaw` avec `existing.sources.find` imbriqué (L2785): quadratique en nombre de sources.
8. `shoppingSupplierGroups` résout la référence et le fournisseur par LIGNE alors qu'il groupe par article (L3299-3355), et rappelle `packagingForItem` à chaque ajout de ligne (L3355) au lieu d'une fois en fin d'accumulation (impact moyen).
9. `recipeComponentsForStockItem` (L5367-5403) fait un `menuItems.find` avec `normalize` par menu item, une fois par article dans `liveStockSettingsRows` (L2846) (impact moyen, quadratique articles x menuItems).
10. Backend: `PATCH /restock-plans/:id` relit la photo entière pour un simple contrôle d'existence (`restock-plans.service.ts` L146 via `findById` L113-117), à chaque correction de ligne (toutes les 1,5 s de saisie) (impact moyen, jusqu'à 1 Mo de jsonb lu par appel, taille réelle non mesurée).
11. Réseau en rafale après chaque écriture de plan: PATCH, puis `GET` liste (avec `eventsSnapshot`), et en autosave aussi `GET` photo complète (`useRestockPlans.js` L98-109, SpaceRestockView L4460). L'autosave sérialise la photo 3 fois: `estimateSnapshotBytes` (L4448), axios, `assertPayloadSize` (impact moyen).
12. Watchers qui réinitialisent: `selectedEventIds` deep (L3861) appelle `resetGeneratedOutputs` (L3865) et `loadPreviousInventory` (L3866) à tout changement de sélection (impact bas à moyen, réseau, détaillé par l'autre agent).

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Frontend: indexer le catalogue une fois (Map par id, sourceId, marketPriceId et par nom normalisé) et faire résoudre `findStockReference` dessus; mémoïser `packagingForItem` par (itemKey, quantité) | supprime le terme R x C, le plus gros coût de la cascade | moyen: conserver l'ordre des pools et la règle id-d'abord (BUG-299-01) | M | `frontend/src/utils/stockPlanning.js` L500-672, SpaceRestockView L5727 |
| Frontend: gater la colonne droite et la chaîne feuille de course (`v-if` sur `shoppingGenerated`/étape, ou retour `[]` dans `shoppingSupplierGroups` si non généré et pas de plan) | évite tout le calcul liste de courses aux étapes 1 et 2 | bas: le Résumé commande doit rester vivant à l'étape 1 | S | SpaceRestockView L1402-1412, L3294, L3567 |
| Frontend: valeur locale du curseur pendant le glissement, commit sur `change` ou debounce 150 à 250 ms; ne pas réinitialiser les sorties à chaque cran | divise le nombre de cascades par la durée du glissement | bas: perte du recalcul instantané pendant le glissement | S | SpaceRestockView L457-467, L5440-5450 |
| Frontend: debounce de l'écriture localStorage (flush sur `beforeunload`/`visibilitychange`), snapshot sans watcher deep (watch sur une clé de version) | retire un `JSON.stringify` synchrone par cran | bas | S | SpaceRestockView L3922, L4223-4251, `frontend/src/data/localDb.js` L20 |
| Frontend: paginer ou virtualiser la liste de l'étape 1, un seul tooltip partagé | DOM borné | moyen: UX de recherche et de sélection | M | SpaceRestockView L371-490 |
| Frontend: résoudre référence et fournisseur par article, `packagingForItem` une fois par article; factoriser la résolution de configuration par événement entre `stockRowsRaw` et `menuItemDemandRows`; sortir `deriveSelectedMenuItemsByShop` de la boucle | moins de passes sur les enregistrements | bas | M | SpaceRestockView L2729, L3294, L3391; `stockPlanning.js` L443-498 |
| Frontend: pré-calculer les libellés par ligne (computed) au lieu de méthodes appelées dans le template | rendu moins coûteux | bas | M | SpaceRestockView L883-931, L1337-1367 |
| Backend: `findById` avec `select: { id: true }` dans `patch`, ou `updateMany` scopé tenant | évite la relecture de la photo à chaque correction | bas | S | `backend/src/features/restock-plans/restock-plans.service.ts` L144-155 |
| Frontend: ne pas rafraîchir la liste après un PATCH `lineOverrides`/`restockedRows`; utiliser la réponse du create/update au lieu du `GET` photo | retire 1 à 2 requêtes par écriture | moyen: la réponse doit contenir la photo normalisée | M | `useRestockPlans.js` L98-109, SpaceRestockView L4460, L4621 |
| SQL/index | aucun correctif prouvé | | | EXPLAIN à faire sur `restockPlan` et `restockState` |

## 7. Points non vérifiés

- Non lus (budget de contexte atteint): corps de `ensureComponentsHydrated`, `loadRestockShopAssignment`, `refreshSelectedPredictions`, `buyInfo` (L6290), `buyInfoForQuantity`, `circuitPackSizeOf`, `depositPackSize` et les autres méthodes de rendu étape 2 et 3, `aggregateCountsForElements`, `storageRestockGroups` (L2355), `liveStorageRestockRows` (L2514), `storageRefillLines` (L2546), `restockGroupsByItem` (L3227), `restockGroupsByShopSplit`, `recomputeShoppingFromOverrides`, `buildStorageSummary`, `collectComponentOrders`, `buildComponentOrdersPanel`, `computeIngredientCircuit`, `buildStockRequirements`, `getPredictedQuantityForElement`, `normalizeName`.
- Non lus côté template: onglet "Espaces de stockage" de l'étape 1 (L524-740), vue "Par item" de l'étape 2 (L1046-1170, seule la vue "Par shop" L835-1040 a été lue en partie), composants enfants `RestockStorageSummary`, `RestockComponentOrdersPanel`, `RestockSuppliersPanel`, `RestockItemShopsDrawer`.
- Ventilation: page/composant non identifiés dans ce fichier.
- Volumes réels (lignes R, taille du catalogue C, taille du snapshot, taille de la photo) et durées: à mesurer (Performance du navigateur, Network, EXPLAIN).
- Effet réel de Vue sur le watcher deep d'un computed (nombre de déclenchements par cran): non mesuré.
