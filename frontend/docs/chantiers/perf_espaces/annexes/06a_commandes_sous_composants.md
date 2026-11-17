# 06a. Page Commandes (Réarmement), sous-composants du dossier restock (hors SpaceRestockView.vue)

Périmètre: `frontend/src/components/space-workspace/restock/` sauf `views/SpaceRestockView.vue` (9773 lignes, traité par d'autres agents).
Rapport en cours de rédaction (squelette écrit tôt, complété par étapes). Tout ce qui n'est pas lu est marqué "non vérifié".

## 1. Fiche de la page

Non vérifié ici (route, meta, garde): traité dans les sections des autres agents. Fichiers du périmètre et lignes (wc -l):

| Fichier | Lignes |
|---|---|
| RestockEventScenarioPicker.vue | 300 |
| RestockPlanDuplicateDialog.vue | 123 |
| RestockPlansPanel.vue | 359 |
| components/RestockCollapseToggle.vue | 40 |
| components/RestockComponentOrdersPanel.vue | 129 |
| components/RestockFilterToggle.vue | 80 |
| components/RestockGlobalAdjustMenu.vue | 47 |
| components/RestockSelectButton.vue | 64 |
| components/RestockStockFilters.vue | 75 |
| components/RestockStorageBuffersDrawer.vue | 219 |
| components/RestockStorageSpotsDrawer.vue | 53 |
| components/RestockStorageSummary.vue | 232 |
| components/RestockSuppliersPanel.vue | 216 |
| components/RestockWorkflowTabs.vue | 105 |
| composables/useRestockCatalogReadiness.js | 89 |
| composables/useRestockReturnRefresh.js | 92 |
| drawers/RestockItemShopsDrawer.vue | 373 |
| restockEventPicker.css | 50 |
| views/restockChrome.css | 45 |
| views/restockStep1.css | 489 |
| views/restockStep2.css | 224 |

Remarque: il n'y a PAS de `useLogisticRemaining` ni de "api de plans" dans ce dossier (le dossier ne contient que 2 composables). A chercher ailleurs (voir section 7).

## 2. Arbre des composants

| Composant | Fichier | Lignes | Rôle | Monté / différé | Props |
|---|---|---|---|---|---|
| RestockPlansPanel | RestockPlansPanel.vue | 359 | Liste des plans sauvegardés (sidebar), renommer/supprimer/charger | Monté par le parent (non vérifié où) ; `v-show` pour le repli (le DOM de la liste reste monté), `v-dialog` suppression monté mais fermé | plans[], loading, activePlanId, canWrite, error (RestockPlansPanel.vue:149-159) |
| RestockEventScenarioPicker | RestockEventScenarioPicker.vue | 300 | Liste des évènements prédits, checkbox multiple + cartes de scénarios | Non vérifié (parent) ; utilisé desktop et sheet mobile (commentaire l.5) | events[], selectedEventIds[], selectedScenarioByEventId{} (l.108-115) |

| RestockStorageSummary | components/RestockStorageSummary.vue | 232 | Carte "Stockage" (CA, marge, coût, 5 premières lignes + "voir tout") | Parent (non vérifié) ; corps en `v-show` | summary{lines[]}, predictedRevenue, includeStorage (l.87-93). Liste tronquée à 5 (VISIBLE_COUNT, l.81, l.126-128), `expanded` rend toutes les lignes sans virtualisation |
| RestockComponentOrdersPanel | components/RestockComponentOrdersPanel.vue | 129 | Carte "Commande composants" (liste + total) | Parent ; `v-show` | panel{lines[],total,hasUnknownCost} (l.49). Même troncature à 5 (l.42, 59-61) |
| RestockSuppliersPanel | components/RestockSuppliersPanel.vue | 216 | Aperçu des groupes fournisseurs de la feuille de course (colonne droite) | Parent ; `v-show` | groups[], generated (l.66-67). Liste complète sans troncature ni virtualisation (l.18-46) |
| RestockItemShopsDrawer | drawers/RestockItemShopsDrawer.vue | 373 | Drawer gauche: répartition d'un article par PDV (sliders %, NumberField) | `EventDrawerShell` avec `modelValue && !!data` (l.3) ; contenu `v-if="data"` (l.13), donc rien de rendu tant qu'aucun article n'est ouvert (le composant lui-même est monté) | data{itemName,rows[],circuit} formaté par le parent (SpaceRestockView.shopsDrawerData, l.123-143). Pas d'API |
| RestockStorageBuffersDrawer | components/RestockStorageBuffersDrawer.vue | 219 | Drawer "Paramétrer" d'un stockage: articles stockés + tampon en colis | `Teleport` + `v-if="modelValue"` (l.2-4), mais le `<script setup>` et `useStorageBuffers` s'exécutent dès le montage du composant (watch `isOpen` immediate, useStorageBuffers.js:83-90) | modelValue, spaceId, spaceName, elementId, storageName (l.108-114) |
| RestockStorageSpotsDrawer | components/RestockStorageSpotsDrawer.vue | 53 | Enveloppe du drawer Stockage de la page Stockage (menu-fb), mode "storages" | Monté par le parent ; enfant `StorageSpotsDrawer` | modelValue, product{name,marketPriceId,reference}, spaceId, spaceName (l.24-30). Watch sur `store.state.storageInventory.bySpace[spaceId]` (l.45-48) |
| RestockPlanDuplicateDialog | RestockPlanDuplicateDialog.vue | 123 | Dialogue "commande existante": remplacer ou créer | `v-dialog` piloté par `modelValue` | modelValue, existing, suggestedName, plans[] (l.60-66). Pas d'API |
| RestockCollapseToggle, RestockFilterToggle, RestockGlobalAdjustMenu, RestockSelectButton, RestockStockFilters, RestockWorkflowTabs | components/*.vue | 40/80/47/64/75/105 | Boutons/onglets/filtres purement présentationnels | Parent | Aucun import d'API ni de store (grep sur les imports: uniquement `useI18n` et `RestockSelectButton`/`RestockCollapseToggle`) ; `computed` simples dans RestockWorkflowTabs.vue:43 et RestockStockFilters.vue:51 (non lus en détail) |
| useRestockCatalogReadiness | composables/useRestockCatalogReadiness.js | 89 | Calcule "catalogue prêt" depuis le store (analyse, inventory, marketPriceTypes/Categories) | Instancié par SpaceRestockView (non vérifié) | store |
| useRestockReturnRefresh | composables/useRestockReturnRefresh.js | 92 | Revalidation au retour (keepAlive) | Instancié par la vue | store |
| CSS | restockEventPicker.css 50, views/restockChrome.css 45, views/restockStep1.css 489, views/restockStep2.css 224 | | Styles | Non vérifié (hors perf réseau) | |

Hors dossier mais appelés par ce périmètre (lus): `frontend/src/composables/useRestockPlans.js` (138 l.), `frontend/src/composables/useLogisticRemaining.js` (149 l.), `frontend/src/composables/useStorageBuffers.js` (107 l.). Ils n'existent pas dans `restock/`.

## 3. Appels API, composant par composant

Composants purs (aucun réseau): RestockPlansPanel (commentaire l.138-141: "ne parle jamais à l'API lui-même"), RestockEventScenarioPicker, RestockStorageSummary, RestockComponentOrdersPanel, RestockSuppliersPanel, RestockItemShopsDrawer, RestockPlanDuplicateDialog, petits boutons/filtres. Les appels réseau du périmètre se concentrent dans 5 endroits.

### 3.1 useRestockPlans (liste/CRUD des plans, alimente RestockPlansPanel)

| Déclencheur | Méthode + URL | Fonction front | Séq./parallèle | Cache front | Backend | SQL | Redis | Payload | Coût |
|---|---|---|---|---|---|---|---|---|---|
| `refresh(spaceId)` appelé par la vue (non vérifié où) | `GET /spaces/:spaceId/restock-plans` (restock.api.js:110-111) | useRestockPlans.js:52-78 | await simple, `loading` affiché par spinner (RestockPlansPanel.vue:14) | AUCUN (commentaire l.3-4 "sans miroir localStorage"), `plans` en shallowRef | voir 3.7 (controller l.47-62, service l.103-110) | findMany indexé, sans blobs (3.7) | aucun | métadonnées seules (useRestockPlans.js:12-13), jusqu'à 1000 plans | bas, 1 requête indexée |
| Après chaque create/update/duplicate/remove | même liste re-fetchée | useRestockPlans.js:94, 101, 109, 114 | séquentiel: écriture puis re-GET complet de la liste | aucun | idem | idem | | | 1 aller-retour de plus par mutation |
| Ouverture d'un plan | `getRestockPlan(planId)` | useRestockPlans.js:81-89 | await | aucun | voir 3.7 (`GET /restock-plans/:id`) | findFirst ligne entière | aucun | plan complet (photo, max 1 Mo) | moyen |

### 3.2 useLogisticRemaining.loadLogisticRemainingIndex (stock Logistic, alimente le netting)

| Déclencheur | Méthode + URL | Fonction front | Séq./parallèle | Cache front | Backend | Payload |
|---|---|---|---|---|---|---|
| Appelé par la vue (non vérifié où) avec les configs objectif | `getLogisticsStock(spaceId, configId)` PAR config | useLogisticRemaining.js:36-96 | `Promise.all` sur les configs (l.42-44), donc N requêtes parallèles, N = nombre de configs distincts des évènements cochés | AUCUN cache (commentaire l.6-11: volontairement hors store Vuex) | voir 3.7 (`GET /logistics/:spaceId/stock`, logistics.controller.ts:54-77 -> stock-level.service.ts) | levels + items + consumption par config (taille non mesurée) |

### 3.3 useStorageBuffers (drawer RestockStorageBuffersDrawer)

| Déclencheur | Méthode + URL | Fonction front | Séq./parallèle | Cache | Remarque |
|---|---|---|---|---|---|
| `watch(isOpen, ..., { immediate: true })` (useStorageBuffers.js:83-90) puis `load()` | dispatch `storageInventory/fetchForSpace` avec `force: true` (l.44) | useStorageBuffers.js:38-52 | `Promise.all` avec `ensureLoaded()` (produits du stockage, useStorageProductOptions) | `force: true` ignore le cache du store | La vue SpaceRestockView a déjà chargé l'inventaire des stockages (loadStorageInventory) ; chaque ouverture du drawer REFORCE un fetch complet de l'espace |
| Saisie / coche | upsert via `useStorageRowWriter` (writer.queue, l.63, 72) | useStorageBuffers.js:59-73 | file d'écritures groupées, flush à la fermeture (`finish`, l.76-81) | invalidation `storageInventory/invalidate` si écrit | |
| Erreur d'écriture | relit tout (`load()`, l.93-98) | | | | |

### 3.4 RestockStorageSpotsDrawer

Pas d'appel direct; délègue à `components/menu-fb/views/storage/drawers/StorageSpotsDrawer.vue` (non lu, hors périmètre). `watch(cachedEntry)` (RestockStorageSpotsDrawer.vue:45-48) émet `closed` quand l'entrée de cache `storageInventory.bySpace[spaceId]` disparaît, ce qui force la vue à recharger l'inventaire (l.42-44).

### 3.5 useRestockReturnRefresh (revalidation au retour keepAlive)

Déclencheur: `useRefreshOnReturn(refresh)` (useRestockReturnRefresh.js:90), à chaque retour sur la page. `Promise.allSettled` de 8 tâches PARALLELES (l.75-84), chacune enveloppée dans `quiet` (erreurs avalées par console.warn):

| # | Appel | Ligne | Remarque |
|---|---|---|---|
| 1 | `analyse/useSpaceDataFetch` (si même espace) | l.76 | recharge catalogue menus/composants/ingrédients/packagings (détail du store non lu) |
| 2 | `inventory/loadMarketPrices` `forceRefresh: true` | l.77 | force le contournement du cache |
| 3 | `inventory/loadPackagingTypes` `forceRefresh: true` | l.78 | idem |
| 4 | `host.loadStorageInventory(spaceId, { force: true })` | l.79 | force |
| 5 | `getSuppliers()` (menu.api) | l.31-35 | |
| 6 | `refreshPredictedEvents` : `resolvePredictedEventIds` + `syncBddVersions` + `refreshSelectedPredictions` | l.37-43 | séquentiel interne |
| 7 | `host.loadRestockShopAssignment({ force: true })` | l.82 | force |
| 8 | `getMenuItemRecipes(ids)` pour TOUTES les recettes déjà chargées (`Object.keys(host.recipeByMenuItemId)`) | l.46-60 | batch de toutes les recettes du cache de la vue, remplacement complet de `recipeByMenuItemId` (nouvel objet, l.54-59) |

Le garde `host.loading` (l.68) évite le doublon avec le chargement initial. Il n'y a pas de seuil d'ancienneté: chaque retour sur la page (changement d'onglet/route keepAlive) relance ces 8 tâches (non vérifié: `useRefreshOnReturn` peut avoir un throttle, non lu).

### 3.6 useRestockCatalogReadiness

Pas d'appel réseau en dehors de `retryFailed` (l.69-86: re-dispatch ciblé). `waitUntilReady` installe un `watch` + `setTimeout` de 150 s (CATALOG_WAIT_MAX_MS, l.19, 54-66); le garde-fou de 150 s est un plafond de sécurité, pas une durée mesurée.

### 3.7 Complément backend (lu)

| Appel front | URL | Contrôleur / service | SQL / index | Cache Redis | Payload |
|---|---|---|---|---|---|
| `listRestockPlans` (restock.api.js:110-111) | `GET /spaces/:spaceId/restock-plans` | `RestockPlansController.list` backend/src/features/restock-plans/restock-plans.controller.ts:47-62 -> `RestockPlansService.list` restock-plans.service.ts:103-110 | `restockPlan.findMany where {tenantId, spaceId} orderBy updatedAt desc take 1000 select LIST_SELECT` (l.42-54), index `@@index([tenantId, spaceId, updatedAt])` backend/prisma/schema.prisma:3856 (annoté "Couvre la liste"). Les blobs JSON ne sont pas sélectionnés | aucun (non lu dans le service) | `eventsSnapshot` (Json) est inclus dans chaque ligne de liste (l.47); jusqu'à 1000 plans sans pagination (MAX_LIST_TAKE l.8) |
| `getRestockPlan` (restock.api.js:121) | `GET /restock-plans/:id` | Standalone controller l.93-101 -> `findById` service l.113-117 | `findFirst {id, tenantId}` sur toute la ligne, donc tous les blobs (stockLines, restockLines, shoppingGroups...) | aucun | photo complète, jusqu'à 1 Mo selon `MAX_PAYLOAD_BYTES` (l.13) et 5000 lignes (l.12) |
| `patchRestockPlan` | `PATCH /restock-plans/:id` | service l.144-156 | `findById` (lit TOUTE la ligne avec les blobs, uniquement pour contrôler le tenant, l.149) puis `update`; l'`update` renvoie aussi la ligne complète | aucun | écho du plan complet vers le client, puis refresh de la liste (useRestockPlans.js:101) |
| `duplicateRestockPlan` | `POST /restock-plans/:id/duplicate` | service l.160-170 | lecture complète + `create` | aucun | idem |
| `createRestockPlan` | `POST /spaces/:spaceId/restock-plans` | service l.119-142 | `assertSpaceInTenant` + `create`; `JSON.stringify(body)` pour mesurer la taille (l.69) | aucun | réponse = plan complet |
| `getSuppliers` (useRestockReturnRefresh.js:32, menu.api.js:415-420) | `GET /suppliers` sans `page`/`limit` | `SuppliersService.findAll` backend/src/features/suppliers/suppliers.service.ts:65-97 | défaut `limit=100` (l.65): `findMany` + `count` en `$transaction`, tri par nom ; si utilisateur restreint, une requête d'espaces accessibles en plus (l.72) | aucun lu | max 100 fournisseurs; un tenant au-delà de 100 aurait une liste tronquée sans pagination côté front (l.415-420 n'envoie aucun page/limit) |
| `getLogisticsStock` (logistics.api.js:17-22) | `GET /logistics/:spaceId/stock?configId=` | `logistics.controller.ts:54-77` -> `StockLevelService.getStock` backend/src/features/logistics/services/stock-level.service.ts | au moins `space.findFirst`, puis `Promise.all` de `config.findMany`, `event.findFirst`, etc., puis `getSpaceElementsWithItems` et `marketPrice.findMany` des orphelins (lus en extrait, détail complet non vérifié) | non vérifié | levels + items + consumption par config |
| `restock-state` (appelé par la vue, hors périmètre direct) | `GET/PUT /spaces/:spaceId/restock-state` | `restock-state.service.ts` 44 lignes: `restockState.findUnique` / `upsert` | un enregistrement par espace | aucun | non vérifié |

## 4. Cascade au premier affichage (périmètre sous-composants uniquement)

La cascade complète est portée par SpaceRestockView (autres agents). Pour les éléments de ce dossier:

- t0: la vue monte; les composants purs (PlansPanel, ScenarioPicker, StorageSummary, ComponentOrdersPanel, SuppliersPanel, ItemShopsDrawer, PlanDuplicateDialog) ne déclenchent aucun appel. Ils ne bloquent rien.
- t1: `useRestockPlans.refresh(spaceId)` (1 GET léger indexé) alimente RestockPlansPanel; spinner local seulement (RestockPlansPanel.vue:14), ne bloque pas le reste.
- t1 (si utilisé): `loadLogisticRemainingIndex` lance N `GET /logistics/:spaceId/stock` en parallèle, N = configs distincts des évènements cochés; ce chargement est sur le chemin du netting (commentaire l.1-11), donc probablement sur le chemin critique du calcul des quantités à commander (où il est awaité: non vérifié, dans SpaceRestockView).
- t2: `useRestockCatalogReadiness.catalogReady` garde le squelette tant que menuItems, composants, coûts Market Price ne sont pas arrivés (useRestockCatalogReadiness.js:38-44), avec plafond de 150 s (l.19). Le squelette dépend donc de la plus lente des ressources du store `analyse` + `inventory`.
- Drawers: `RestockStorageBuffersDrawer` s'exécute (script setup) au montage, `useStorageBuffers` lance `watch(isOpen, ..., {immediate:true})` mais ne charge que si `open` est vrai (l.83-85), donc pas de fetch avant l'ouverture. Montage du composant: non vérifié (v-if du parent).
- Retour sur la page (keepAlive): 8 tâches parallèles (section 3.5) dont 4 en `force`/`forceRefresh`, sans squelette.

## 5. Problèmes de performance

1. Revalidation au retour trop large et sans condition d'ancienneté: chaque retour keepAlive refait 8 fetchs dont 4 forcés (market prices, packaging types, inventaire stockage, affectations PDV) + `analyse/useSpaceDataFetch` + toutes les recettes (`getMenuItemRecipes(ids)` avec TOUS les ids déjà chargés) + liste fournisseurs. Preuve: useRestockReturnRefresh.js:75-84 et :46-60. Impact: moyen à haut (rafale à chaque changement d'onglet, charge DB et bande passante). Page Commandes. Non vérifié: un throttle éventuel dans `useRefreshOnReturn`.
2. Le drawer Tampons force un refetch complet de l'inventaire de l'espace à CHAQUE ouverture (`force: true`) alors que la vue vient de le charger, puis `ensureLoaded()` des produits. Preuve: useStorageBuffers.js:44 et :83-90. Impact: moyen (latence perçue à l'ouverture, spinner `v-progress-linear` RestockStorageBuffersDrawer.vue:35). Le fetch est aussi relancé après toute erreur d'écriture (l.93-98).
3. Après toute fermeture du drawer Stockage (RestockStorageSpotsDrawer) ou Tampons avec écriture, `storageInventory/invalidate` puis rechargement complet de l'inventaire par la vue. Preuve: RestockStorageSpotsDrawer.vue:42-48 et useStorageBuffers.js:79. Impact: moyen (rechargement complet pour une ligne modifiée).
4. Écritures de plans: `PATCH` fait un `findById` qui charge tous les blobs JSON (jusqu'à 1 Mo) juste pour contrôler le tenant, puis l'`update` renvoie le plan complet, puis le front relance `GET` liste. Preuve: restock-plans.service.ts:149, 155; useRestockPlans.js:100-101. Impact: moyen (plans lourds, sauvegarde automatique à chaque "Générer la Commande", cf. commentaire service l.5-7). Même motif pour `duplicate` (lecture complète nécessaire ici) et `create` (écho du plan complet).
5. Liste des plans sans pagination ni virtualisation: jusqu'à 1000 plans, tous rendus en `<li>` avec `v-btn` + `v-menu` chacun, dans une zone `max-height: 320px` (CSS seulement). Comme "depuis le 31/10 le plan est sauvegardé à chaque Générer la Commande" (service l.5-7), la liste croît sans plafond. `planEventsLabel` et `updatedLabel` recalculés à chaque rendu, avec `new Intl.DateTimeFormat` instancié par ligne. Preuve: RestockPlansPanel.vue:34-114, 182-187, 276-278; service l.8. Impact: moyen à terme.
6. `eventsSnapshot` (JSON) renvoyé pour chaque plan dans la liste, alors que l'UI n'en lit que les noms (RestockPlansPanel.vue:176-181). Preuve: restock-plans.service.ts:47. Impact: bas à moyen selon la taille du snapshot (non mesurée).
7. `loadLogisticRemainingIndex`: N requêtes `GET /logistics/:spaceId/stock` (une par config), sans cache, avec reconstruction de l'index à chaque appel; `logisticPoolEntriesForElements` parcourt tout l'index (`Object.entries(index)` + `startsWith`) pour CHAQUE élément, soit O(éléments x entrées). Preuve: useLogisticRemaining.js:42-44, 124-147. Impact: moyen sur gros espaces (nombre d'entrées non mesuré).
8. `getSuppliers()` appelé sans `limit`: défaut backend 100, aucune pagination côté front: risque de liste tronquée silencieusement et de requête redondante avec le chargement initial. Preuve: menu.api.js:415-420, suppliers.service.ts:65. Impact: bas (perf), moyen (exactitude).
9. Panneaux de la colonne de droite repliés par `v-show` (RestockPlansPanel.vue:21, RestockStorageSummary.vue:9 et 38, RestockSuppliersPanel.vue:12, RestockComponentOrdersPanel.vue:12): le DOM reste monté et réactif même replié. StorageSummary et ComponentOrders tronquent à 5 lignes mais "voir tout" rend toutes les lignes sans virtualisation (RestockStorageSummary.vue:126-128, RestockComponentOrdersPanel.vue:59-61); SuppliersPanel rend tous les groupes. Impact: bas à moyen selon volumétrie (non mesurée).
10. `RestockSuppliersPanel.share()` recalcule `unitsTotal` de tous les groupes pour chaque groupe (O(n^2) sur les fournisseurs), à chaque rendu (méthodes, pas de computed). Preuve: RestockSuppliersPanel.vue:94-101 et :40. Impact: bas (n petit).
11. RestockItemShopsDrawer: chaque ligne PDV a 4 directives `v-value-pulse`, un `NumberField` et un slider; `badges(row)` et `packsText` recalculés à chaque rendu (méthodes), sans mémoïsation. Preuve: RestockItemShopsDrawer.vue:57, 68-80, 154-182. L'événement `input` du slider émet à chaque pas (l.93), donc un recalcul du parent à chaque mouvement du curseur (coût réel porté par SpaceRestockView, non lu). Impact: moyen potentiel, non mesuré.
12. `RestockStorageBuffersDrawer` et `RestockStorageSpotsDrawer` ajoutent chacun un `window.addEventListener('theme-changed')` et lisent `localStorage` au setup; si les drawers sont montés en permanence leur script s'exécute à l'ouverture de la page. Impact: bas.

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Frontend: ajouter un seuil d'ancienneté (par exemple ne revalider que si la dernière revalidation a plus de N minutes) et retirer les `forceRefresh` systématiques de la revalidation au retour | Fin de la rafale de 8 requêtes à chaque retour | Données légèrement plus anciennes; choisir N avec Bertrand | S | frontend/src/components/space-workspace/restock/composables/useRestockReturnRefresh.js |
| Frontend: ne pas passer `force: true` à l'ouverture du drawer Tampons si l'inventaire du store est frais; garder le refetch sur erreur d'écriture | Ouverture instantanée du drawer | Voir les écritures d'un autre utilisateur plus tard | S | frontend/src/composables/useStorageBuffers.js |
| Frontend: remplacer la relecture complète de l'inventaire après fermeture du drawer par une mise à jour locale de la ligne | Moins de rechargement complet | Complexité de synchro du store | M | useStorageBuffers.js, store storageInventory, RestockStorageSpotsDrawer.vue |
| Frontend: virtualiser ou paginer la liste des plans (afficher les 20 derniers + "voir plus"), instancier un seul `Intl.DateTimeFormat` | Rendu borné quand les plans s'accumulent | Faible | S | RestockPlansPanel.vue |
| Frontend: `share()`/`unitsTotal` en `computed` mémoïsé dans SuppliersPanel; `badges` en computed par ligne dans ItemShopsDrawer | Rendus moins coûteux | Faible | S | RestockSuppliersPanel.vue, RestockItemShopsDrawer.vue |
| Frontend: debouncer l'émission `update-percent` du slider (ou émettre sur `change` en plus de `input`) | Moins de recalculs du parent pendant le glissement | Retour visuel légèrement différé | S | RestockItemShopsDrawer.vue |
| Backend: dans `patch`, remplacer `findById` par un `findFirst` avec `select: { id: true }`, et faire `update` avec `select` léger (ou `LIST_SELECT`) au lieu de renvoyer la photo | Moins de lecture/écriture de blobs et de bande passante | Le front doit tolérer une réponse allégée | S | backend/src/features/restock-plans/restock-plans.service.ts (l.144-156) |
| Backend: pagination (`take`/curseur) par défaut de 50 sur la liste des plans; exclure `eventsSnapshot` ou le réduire aux noms | Liste bornée et plus légère | Contrat API à adapter (front useRestockPlans) | M | restock-plans.service.ts, restock.api.js, useRestockPlans.js |
| Backend/Frontend: éviter le re-GET de liste après mutation en mettant à jour `plans` localement avec la réponse | -1 requête par sauvegarde | Divergence si autre utilisateur | S | frontend/src/composables/useRestockPlans.js |
| SQL/index: aucun index manquant identifié pour la liste (index `[tenantId, spaceId, updatedAt]` présent, schema.prisma:3856); à confirmer par EXPLAIN | n/a | n/a | S | n/a |
| Frontend: transmettre `limit` explicite à `getSuppliers` ou paginer; réutiliser la liste déjà dans le store plutôt que de relire | Exactitude + 1 requête en moins | Faible | S | menu.api.js, useRestockReturnRefresh.js |
| Frontend: pour `logisticPoolEntriesForElements`, indexer par élément (Map elementId -> entrées) à la construction de l'index | O(entrées) au lieu de O(éléments x entrées) | Faible | S | frontend/src/composables/useLogisticRemaining.js |

## 7. Points non vérifiés

- Où et comment SpaceRestockView monte et utilise chaque composant (v-if, onglet, lazy): non lu, hors périmètre. Les colonnes "monté / différé" ne portent que sur ce qui est visible dans les fichiers du dossier.
- `useRefreshOnReturn` (frontend/src/composables/useRefreshOnReturn): existence d'un throttle non lue.
- `StorageSpotsDrawer` (components/menu-fb/views/storage/drawers/StorageSpotsDrawer.vue), `useStorageRowWriter`, `useStorageProductOptions`, `storageInventory/fetchForSpace`: leurs appels réseau et leurs caches n'ont pas été lus.
- `StockLevelService.getStock` en entier (stock-level.service.ts): seul un extrait de ses requêtes a été vu; coût SQL et cache Redis éventuels non vérifiés. `GET /logistics/:spaceId/stock` à passer en EXPLAIN / Network.
- Backend restock-state (`restock-state.controller.ts`, service 44 lignes): méthodes vues seulement par signature; taille du snapshot `PUT` non mesurée.
- `EventDrawerShell`, `NumberField`, `v-value-pulse` (useValuePulse): coût de rendu non lu.
- Lignes 150-232 de RestockStorageSummary.vue, 140-219 de RestockStorageBuffersDrawer.vue, 80-123 de RestockPlanDuplicateDialog.vue, 230-373 de RestockItemShopsDrawer.vue (surtout CSS ou fin de script), les petits composants (CollapseToggle, FilterToggle, GlobalAdjustMenu, SelectButton, StockFilters, WorkflowTabs) et les 4 fichiers CSS: non lus en détail (grep d'imports seulement).
- Tailles réelles des réponses (liste des plans avec `eventsSnapshot`, photo d'un plan, stock Logistic par config), nombre de plans par espace en production, durée réelle des requêtes: à mesurer via Network et EXPLAIN. Aucune durée n'est citée dans ce rapport hors plafonds du code (150 s CATALOG_WAIT_MAX_MS, 1000 plans, 1 Mo, 5000 lignes).
