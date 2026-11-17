# 08. Page Logistique, Ventilation, version invité /pdv/ventilation

Statut de ce rapport: PARTIEL. Le frontend de la vue hôte et de la Ventilation a été lu. Le backend (backend/src/features/logistics) n'a PAS été lu, seulement compté (wc -l). Tout ce qui touche au backend est marqué "non vérifié". Aucune mesure inventée: aucune durée ni taille de réponse n'a été mesurée.

## 1. Fiche de la page

| Élément | Valeur | Preuve |
|---|---|---|
| Route staff | /spaces/:spaceId/logistic, nom `space-logistic` | frontend/src/router/index.js:252-253 |
| Composant | import dynamique de `SpaceLogisticView.vue` (2216 lignes) | frontend/src/router/index.js:254 |
| Meta | `keepAlive: true`, `permission: 'front.fb.logistic'` | frontend/src/router/index.js:255, guards.js:205 |
| beforeEnter | aucun vu sur les lignes 252-255 (le contrôle de permission passe par guards.js, mécanisme non lu) | non vérifié |
| Route invité | /pdv/ventilation, nom `guest-ventilation`, `beforeEnter: requireGuestPinSession`, meta `guestMode`, `noindex`, pas de keepAlive | frontend/src/router/index.js:112-118 |
| Phase invité | une session de phase `ventilation` ne mène qu'à `guest-ventilation` | frontend/src/router/guards.js:177-186 |
| Vue hôte staff | frontend/src/components/space-workspace/logistic/views/SpaceLogisticView.vue (2216 l.) | wc -l |
| Vue invité | frontend/src/views/GuestVentilationView.vue (286 l.) | wc -l |
| Dossier logistic | 21 fichiers .vue, 6402 lignes au total, dont la vue hôte | wc -l |
| Backend logistics | logistics.controller.ts 485 l., stock-level.service.ts 525, recipe-explosion.service.ts 607, logistics.queries.ts 121, stock-movement 494, sales-simulation 588, ventilation-deposits 199, ventilation-checks 101, ventilation-events 101 | wc -l seulement |

## 2. Arbre des composants

Tous les composants sont importés statiquement dans la vue hôte (SpaceLogisticView.vue:598-622) et déclarés en 690-717. Aucun `defineAsyncComponent` vu. Ils sont donc tous dans le même chunk que la route (taille du chunk non mesurée).

| Composant | Fichier | Lignes | Rôle | Monté à l'ouverture ou différé | Données reçues |
|---|---|---|---|---|---|
| SpaceLogisticView | logistic/views/SpaceLogisticView.vue | 2216 | hôte, onglets, polling, état | monté | route, store `logistics` |
| WorkspaceAppHeader, WorkspaceToolSelect, SidebarPanel x4 | components/ | non lu | en-tête, outils, panneaux gauche | monté (aside `v-if="!drillElement && showFilters"`, l.13) | KPI calculés |
| LogisticConfigSelect | logistic/ | 180 | puce de configuration | monté sauf onglet Ventilation (l.196), masquée en CSS sous 560 px (commentaire l.190-192) | configurations |
| LogisticEventSelect | logistic/ | 117 | sélecteur de matchs | monté partout (l.203) | events du `useLogisticEventSelection` |
| LogisticElementRow | logistic/ | 154 | ligne PDV/Storage | monté, `v-for` non virtualisé (l.400-412), onglets Shops/Storage | element, totaux, compteurs rupture |
| LogisticByItemView | logistic/ | 297 | onglet By Item | différé par `v-else-if` (l.417) | `[...shopEntries, ...storageEntries]`, ~12 props et fonctions |
| LogisticItemCard | logistic/ | 428 | carte article en drill-in | différé (drill, l.439-463), `v-for` non virtualisé | ~12 props par carte |
| LogisticVentilationView | logistic/ | 159 | onglet Ventilation (barre + liste) | différé (l.336), mais ses données sont chargées dès l'ouverture (voir 4) | groupes, stockages, mode |
| LogisticVentilationShopList / ItemList | logistic/ventilation/ | 155 / 142 | cartes Par PdV / Par article | différé; lignes de détail seulement si carte dépliée (ShopList l.30, ItemList l.41) | groupes filtrés |
| LogisticVentilationRow | logistic/ventilation/ | 114 | ligne, coche, crayon | seulement si carte dépliée | row, item |
| LogisticSupplierSelect | logistic/ventilation/ | 86 | filtre fournisseur | si options (VentilationView l.21-26) | options |
| LogisticVentilationTransfers | logistic/ventilation/ | 150 | transferts stockage source vers PDV | onglet Ventilation (l.355) | controller `useVentilationTransfers` |
| LogisticVentilationDeposits | logistic/ | 121 | liste "Déjà déposé" | onglet Ventilation, `v-if movements.length`, `v-show` pour le repli, `v-for` non virtualisé (l.2-12) | movements |
| LogisticAggregateView | logistic/ | 355 | ruptures et stock bas | monté si `!drillElement` (l.478, 490) | `aggregateStats` (rows avec image) |
| LogisticTasksPanel | logistic/ | 462 | tâches de réarmement | monté si `!drillElement` (l.478, 509), remonté à chaque sortie de drill-in | spaceId |
| LogisticMovementDialog | space-workspace/shared/ | non lu | popup + / - | déclaré en permanence (l.515), contenu interne non vérifié | listes shops/storages enrichies |
| LogisticPrintDialog, VentilationAccessDialog | logistic/dialogs/ | 83 / 135 | impression, QR/PIN | déclarés en permanence (l.531-541) | non lu |
| LogisticDepositConfirmDrawer, TransferConfirmDrawer, LossesDrawer, HistoryDrawer | logistic/drawers/ | 218 / 248 / 215 / 367 | drawers | déclarés en permanence (l.542-569), chargement interne non vérifié | non lu |
| GuestVentilationView | views/GuestVentilationView.vue | 286 | page invité | route lazy (router l.116) | composants: VentilationView, VentilationDeposits, DepositConfirmDrawer |

Composants jamais lus: ByItemView, ItemCard, ElementRow, AggregateView, ConfigSelect, EventSelect, tous les drawers et dialogs, SupplierSelect, VentilationTransfers (composant), LogisticMovementDialog. Leur rôle vient des props du template hôte.

## 3. Appels API, composant par composant

### 3.1 Vue hôte, ouverture (loadForSpace, SpaceLogisticView.vue:1288-1323)

Déclencheur: watcher `routeContextKey` immediate (l.1004-1014), gardé par `route.name === 'space-logistic'` (l.1010); `activated` recharge si la clé a changé (l.1058-1065). Tout part dans un `Promise.all` (l.1299-1317), `loading` ne repasse à false qu'après le dernier (l.1320-1322), et le squelette est affiché tant que `loading || stockLoading` (l.307).

| # | Appel | Fonction front | Cache front | Backend | Notes |
|---|---|---|---|---|---|
| 1 | GET /logistics/:spaceId/stock?configId&eventId | logistics.api.js:17-21, store logistics.js:218-245 | aucun (store remplacé), anti-race `_stockSeq` | LogisticsController puis StockLevelService.getStock (non lu), commentaire front l.1292-1293: le backend résout configId > event > 1re config | porte space, configs, elements+items, levels, consumption, anchor (logistics.js:226-235) |
| 2 | GET /logistics/:spaceId/ventilation-events | logistics.api.js:81-82, useLogisticEventSelection.js:47 | non lu | ventilation-events.service.ts (non lu) | liste des matchs |
| 3 | suppliers/fetchSuppliers | store suppliers (non lu) | store (TTL non lu) | non lu | best effort, l.1303 |
| 4 | getLatestInventory(spaceId) | inventory.api (URL non lue), l.1417-1425 | aucun | non lu | renvoie `inventoryCounts` complet |
| 5 | getMarketPrices() (catalogue complet) | market.price.api (non lu), l.1429-1444 | idempotent par instance (l.1430) | non lu | commentaire l.836-838: images en base64 data-URI; seuls id/itemName/supplier/supplierId servent à la Ventilation (l.1440) |
| 6 | storageInventory/fetchForSpace avec `force: true` | useStorageInventory.js:13, l.1309 | cache du store contourné par force | non lu | filtre des articles de Storage |
| 7 | GET /logistics/:spaceId/reconciliations | logistics.api.js:145-146 | aucun | non lu | seulement si `canReconcile` (l.1313-1316) |
| 8 | GET /logistics/:spaceId/losses/summary | logistics.api.js:170-171 | aucun | non lu | idem |
| 0 | assignable staff (fetchStaff) | useAssignableStaff.js:14-19, déclenché par watch immediate l.768 | aucun | non lu | part au setup, même hors onglet Ventilation |

Ensuite, hors du chemin critique (non attendu, l.1319): `fetchPredictedNeed` (l.1328-1363). Si au moins un match est sélectionné: `listRestockPlans(spaceId)` puis `getRestockPlan(id)` pour chaque feuille retenue en parallèle (useLogisticVentilation.js:132-135), puis `refresh`: GET ventilation-deposits et GET ventilation-movements en parallèle (l.158-161, logistics.api.js:55-64), GET ventilation-storages lancé en parallèle (l.128, logistics.api.js:72-73), puis GET ventilation-checks (l.1344, logistics.api.js:91-92). Sans feuille, repli `loadPredictedNeed` (usePredictedNeed.js, non lu). Ce bloc est lancé même si l'onglet Ventilation n'est pas actif, parce que l'onglet affiche `ventilation.pendingCount` (l.292) et que la colonne "À déposer" sert aux fiches PDV (l.853-855).

### 3.2 Polling et retours

| Déclencheur | Appels | Preuve | Remarque |
|---|---|---|---|
| setInterval 10 s, `enabled = () => true`, saute si `document.hidden` ou tick déjà en cours | `refreshLive`: loadStock silent, getLatestInventory, et en onglet Ventilation: ventilation.refresh (2 GET) + ventilationChecks.load (1 GET) | SpaceLogisticView.vue:727-731, 1260-1274; useInventoryLivePolling.js:26-41 | 2 GET hors Ventilation, 5 GET en Ventilation, toutes les 10 s par onglet ouvert. Tick immédiat au retour de visibilité (useInventoryLivePolling.js:48-51). Le timer survit au keep-alive (arrêt seulement en `beforeUnmount`, l.57) mais `refreshLive` sort si la route n'est plus `space-logistic` (l.1262) |
| useRefreshOnReturn | `revalidateOnReturn`: eventSelection.load + refreshLive + fetchPredictedNeed silent (donc listRestockPlans + getRestockPlan + dépôts) | SpaceLogisticView.vue:735, 1276-1287 | déclencheur exact de useRefreshOnReturn non lu |
| Changement de sélection de matchs | ensureVentilationAccess (PIN) + `fetchPredictedNeed` non silencieux (vide et recharge tout) | l.1024-1029 | aucun cache des feuilles |
| LogisticTasksPanel | GET tâches au mount + `setInterval(fetchTasks, POLL_MS)`; après pickup/drop: fetchTasks + loadStock silent | LogisticTasksPanel.vue:226-227, 238, 288, 301-361 | `POLL_MS` non lu; le composant est sous `v-if="!drillElement"` (hôte l.478), donc nouveau fetch et nouveau timer à chaque retour de drill-in |
| Entrée en drill-in | `loadPendingTransfers({elementId})` | l.1031-1036, logistics.js:283-291, logistics.api.js:126-127 | 1 GET par ouverture |
| Onglet Ventilation actif ou QR | `ventilationAccess.ensure` (crée ou lit le PIN) | l.1016-1022, 1112-1115 | endpoint non lu |
| Ouverture popup +/- | `loadMarketPricesForItem` GET /logistics/:spaceId/market-prices | l.1516-1534, logistics.api.js:31-35 | scopé par denrée |
| Soumission mouvement | createStockMovement puis UPSERT_LEVEL | logistics.js:252-275 | pas de rechargement complet |

### 3.3 Checkmark de dépôt (Ventilation), écriture

Chemin: Row, ShopList ou ItemList appellent `checks.setRows` (useVentilationDepositChecks.js:50-81). Verrou `busy` pour un geste à la fois (l.29, 51).

| Geste | Écritures | Preuve |
|---|---|---|
| Cocher une ligne | 1 mouvement par part de feuille (un par match concerné): `store.dispatch('logistics/createMovement')` avec payload `{spaceId, elementId, itemKey, itemKind, itemRefId, direction:'add', packed, loose, reason:'VENTILATION', eventId}`; `await` en boucle, donc séquentiel | useLogisticVentilation.js:228-252, 285-289 |
| Cocher une carte PDV ou un article | N lignes x parts, tous séquentiels (`for ... await`, "un mouvement après l'autre") | useVentilationDepositChecks.js:60-69; ItemList.vue:102-109; ShopList.vue:129-137 |
| Décocher | 1 POST /logistics/movements/:id/cancel-ventilation par dépôt actif, séquentiel | useLogisticVentilation.js:292-297, logistics.api.js:101-102 |
| Fin de lot | `afterBatch`: `ventilation.refresh` (2 GET) et, si annulation, `refreshLive` (stock + dernier inventaire + 3 GET Ventilation) | SpaceLogisticView.vue:1049-1052 |
| Crayon (quantité, commentaire) | mouvement(s) + refresh (2 GET) + PUT ventilation-checks | l.1376-1394, logistics.api.js:96-97 |

Effets côté store à chaque mouvement: `UPSERT_LEVEL` copie toute la map `levels` (`{ ...state.levels, ... }`, logistics.js:160-163) et `createMovement` incrémente `_stockSeq` (l.258), ce qui jette toute réponse /stock en vol. L'état coché étant déduit des lignes `covered` de la feuille (useVentilationDepositChecks.js:35-37) et la feuille n'étant relue qu'en fin de lot (useLogisticVentilation.js:154-174), il n'y a pas d'affichage optimiste: la coche n'apparaît qu'après le dernier POST et les 2 GET. Pas de debounce, protégé seulement par `busy`. Fréquence d'écriture: une écriture par ligne cochée, tirée par l'utilisateur. Payload d'un POST: environ 10 champs scalaires (taille réelle non mesurée). Coût backend d'un mouvement (StockLevel, ledger): non vérifié.

### 3.4 Calcul de consommation et dépendance à configId

Côté front, établi:
- `consumption` arrive dans la réponse /stock, avec `levels`, et est reconstruit en entier à chaque réponse (logistics.js:152-159).
- Clé de consommation: `elementId::itemKey`, sans configId (logistics.js:31, 155).
- L'attendu = niveau moins consommation, avec casse de pack (logistics.js:6-8, 125-138), calculé à chaque appel du getter, sans mémoïsation.
- Le front envoie configId (défaut `'all'`, ou celui de l'URL) et eventId à chaque appel, y compris les relectures de 10 s (SpaceLogisticView.vue:1265-1268, 1297-1298). Sans `?event=` et sans config, `configId = 'all'` (vue agrégée).
- L'ensemble des éléments dépend de configId: `configIds` n'est peuplé qu'en vue 'all' (logistics.js:62-65).

Côté backend, NON VÉRIFIÉ: contenu de `salesByElementSince` (logistics.queries.ts), de `recipe-explosion.service.ts`, et de `StockLevelService.getStock`. On ne peut donc pas affirmer ici (a) que la consommation (ventes depuis l'ancre, explosées en recettes) est recalculée à chaque appel, (b) si elle est filtrée par configId ou seulement par élément et ancre, ni (c) si un cache Redis existe. Le fait que la clé de la réponse ne contienne pas la config suggère une consommation par élément, mais c'est une inférence à confirmer. À mesurer en priorité: ce calcul est déclenché toutes les 10 s par onglet ouvert (3.2).

### 3.5 Page invité (GuestVentilationView.vue, useGuestVentilation.js)

| Déclencheur | Appel | Preuve | Notes |
|---|---|---|---|
| mounted | GET /guest-pin/ventilation (feuille complète: plans, deposits, movements, storages, packSizes, eventOrder) + GET /guest-pin/ventilation/checks | GuestVentilationView.vue (mounted), guestPin.api.js:62-65, 99-111 | contrôleur et service backend guest-pin non lus |
| setInterval 30 s, saute si onglet caché ou drawer ouvert | les deux mêmes GET | GuestVentilationView.vue:97 (AUTO_REFRESH_MS), mounted | pas de tick au retour de visibilité (non vu) |
| Dépôt | POST /guest-pin/ventilation/deposits, séquentiel par part; `reload` true: 1 GET feuille; en lot `reload:false` puis 1 GET (afterBatch) | useGuestVentilation.js:77-100; GuestVentilationView.vue (rowActions) | headers `guestDeviceHeaders()` |
| Annulation | POST /guest-pin/ventilation/deposits/:id/cancel | guestPin.api.js, useGuestVentilation.js:102-105 | séquentiel |

Le reste à déposer est recalculé côté client à chaque réponse (computed `plan`, `lines`, `groups`, useGuestVentilation.js:47-51), même si la feuille n'a pas changé (la ref `sheet` est remplacée à chaque tick, l.68-69). Le gabarit du template invité (lignes 1-94 et 225-286) n'a pas été lu.

## 4. Cascade au premier affichage

- t0: import dynamique du chunk de la route (router index.js:254), qui embarque les 20 composants logistic, le dialogue de mouvement partagé et les utils (taille non mesurée). Permission `front.fb.logistic`.
- t1: setup de la vue hôte: reactive(useLogisticVentilation), useVentilationChecks, useVentilationTransfers, watch spaceId immediate qui lance `fetchStaff` (l.768), useLogisticEventSelection, useVentilationAccess, useStorageInventory. Le watcher `routeContextKey` immediate lance `loadForSpace` (l.1004-1014). `loading = true`, squelettes (l.307-332).
- t1 bis: `LogisticTasksPanel` est monté dans la colonne droite (l.509): GET tâches + timer. Le hook de polling 10 s est armé (l.727).
- t2: 6 à 8 requêtes en parallèle (3.1 lignes 1 à 8). Le premier rendu réel de la liste attend la plus lente d'entre elles, alors que la liste n'a besoin que de /stock. Candidates à être les plus lentes (non mesuré): getMarketPrices (catalogue complet avec images base64), storageInventory forcé, /stock (calcul de consommation, non lu).
- t3: `loading = false`; la liste PDV s'affiche. Calculs de rendu: aggregateStats, filteredShops, totaux par ligne (voir 5.3).
- t4: `fetchPredictedNeed` (si match sélectionné): listRestockPlans, puis getRestockPlan x n, puis 2 GET dépôts, 1 GET stockages, 1 GET checks. Le compteur de l'onglet Ventilation et la colonne "À déposer" arrivent ici.
- t5: premier tick de polling à t1 + 10 s (peut sauter si `loading` est encore vrai, l.1264).

Chemin critique du premier affichage: max(requêtes du t2) puis rendu. Le chemin de la Ventilation: t2 puis t4 en 4 sauts séquentiels (liste des feuilles, feuilles, dépôts, puis checks).

## 5. Problèmes de performance

1. Le premier affichage est conditionné à la plus lente de 6 à 8 requêtes. `loading` est levé après un `Promise.all` complet (SpaceLogisticView.vue:1299-1322, squelette l.307), y compris pour des données non nécessaires à la liste: catalogue MarketPrice complet (l.1307, 1432), inventaire de stockage forcé (l.1309), fournisseurs (l.1303), événements (l.1301), dernier inventaire (l.1306). Impact: haut. Pages: Logistique.
2. Catalogue MarketPrice complet (images base64, commentaire l.836-838) chargé à chaque ouverture pour deux usages minces: photos et repli fournisseur (l.1432-1440). Impact: haut probable (taille non mesurée). Pages: Logistique.
3. Polling 10 s qui relit /stock complet et remplace tout l'état. `SET_STOCK` recrée `elements`, `levels`, `consumption` à chaque réponse (logistics.js:145-159), même sans changement, ce qui invalide tous les computed (shopEntries, storageEntries, aggregateStats, filteredShops, summary) et re-rend les lignes. Le polling est actif en permanence sauf onglet caché (l.727-731). Impact: haut (CPU front, plus charge serveur du calcul de consommation, non lu). Pages: Logistique.
4. Complexité de rendu de la liste PDV: par ligne, `entryStatusCounts` est appelé 2 fois (l.407-408), `totalPackedFor` et `totalLooseFor` chacun repassent sur tous les items (l.1243-1254), chacun appelant `expectedDisplay` (getter non mémoïsé qui alloue un objet, logistics.js:125-138). Le tri "ruptures" appelle `entryStatusCounts` dans le comparateur (l.1209) et "stock-asc" appelle les totaux dans le comparateur (l.1213). `aggregateStats` repasse sur tous les items avec `itemStatus`, `countedFor`, `expectedDisplay`, `resolveItemPicture` (l.943-976). Pas de virtualisation (l.400-412). Impact: moyen à haut selon le nombre de PDV x articles (non mesuré). Pages: Logistique.
5. Props instables: `:entries="[...shopEntries, ...storageEntries]"` et `:is-counted="(elementId, item) => ..."` recréés à chaque rendu de l'hôte (l.419, 422), ce qui force le re-rendu de LogisticByItemView à chaque tick. En drill-in, `visibleItems(drillElement)` est évalué deux fois (l.440, 445) et chaque carte reçoit environ 8 appels de fonctions (l.449-457), dont `pendingTransfersFor` qui filtre avec normalisation de chaînes (logistics.js:96-101). Impact: moyen.
6. Ventilation: `isItemChecked` reconstruit un tableau de toutes les lignes et le filtre, à chaque appel (useVentilationDepositChecks.js:42-45), et `isDone` est appelé 3 fois par article dans le template (ItemList.vue:7, 31, 34). Coût O(articles x lignes totales) par rendu, relancé toutes les 10 s en onglet Ventilation (rowIndex reconstruit à chaque refresh, l.27). Dans ShopList, `isCardDone` (2 fois par carte, l.21 et 24) et `depositCount` (l.13, 63, 67) réallouent des tableaux. Impact: moyen. Liste des cartes non virtualisée, mais le détail n'est rendu que déplié (bon point).
7. `ventilationChecks.load()` vide puis recrée toutes les entrées de la map réactive (useVentilationChecks.js:36-43) à chaque tick de 10 s en Ventilation, ce qui déclenche les computed `entry` de chaque ligne ouverte. Impact: bas à moyen.
8. Cocher un lot est séquentiel, sans affichage optimiste: N POST en série, chaque `UPSERT_LEVEL` copiant la map `levels` entière (logistics.js:160-163), puis 2 GET. La coche n'apparaît qu'à la fin (useVentilationDepositChecks.js:60-82, 35-37). Impact: haut sur l'UX d'une carte PDV complète; coût serveur par mouvement non vérifié.
9. Chaîne Ventilation séquentielle et sans cache: listRestockPlans puis getRestockPlan x n puis dépôts (useLogisticVentilation.js:132-140), refaite à chaque changement de sélection (l.1024-1029) et à chaque retour sur la page (l.1285). Impact: moyen.
10. Chargements inutiles hors onglet: `fetchPredictedNeed` et ses 6 requêtes dès l'ouverture (l.1319), `fetchStaff` au setup (l.768), et ce watcher n'est pas gardé par `route.name` (contrairement à l.1010), donc il se redéclenche si `route.params.spaceId` change pendant que la vue est en cache. Impact: moyen à bas.
11. `LogisticTasksPanel` sous `v-if="!drillElement"` (hôte l.478): chaque sortie de drill-in remonte le panneau, relance un GET tâches et un nouveau timer (LogisticTasksPanel.vue:226-227). Impact: bas à moyen. `resolveItem` appelle `itemByKey`, un scan linéaire non mémoïsé (logistics.js:115-123), 2 à 3 fois par tâche et par rendu.
12. Page invité: relecture complète de la feuille toutes les 30 s et recalcul total des computed (useGuestVentilation.js:47-51), sans condition sur un changement. Impact: moyen (réseau mobile). Le bon point: pas de tick quand l'onglet est caché ou le drawer ouvert.
13. Recherche `elementSearch` appliquée à chaque frappe sur tous les PDV x articles (filterEntries, l.1072-1086); debounce éventuel dans AppSearchBar non vérifié. Impact: bas.

## 6. Recommandations

Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Ne bloquer `loading` que sur /stock; lancer MarketPrice, fournisseurs, inventaire de stockage, événements, dernier inventaire sans les attendre (squelettes locaux) | premier affichage = durée de /stock seule | faible (valeurs grisées et photos arrivent après) | M | SpaceLogisticView.vue:1288-1323 |
| Charger MarketPrice seulement à l'ouverture de l'onglet Ventilation (repli fournisseur) et par endpoint léger pour les photos | retire le catalogue base64 du chemin d'ouverture | moyen (photos différées) | M | SpaceLogisticView.vue:1429-1444, market.price.api |
| Mettre `fetchPredictedNeed` et le chargement Ventilation derrière l'onglet actif, avec un compteur léger pour l'onglet | supprime 6 requêtes à l'ouverture | moyen (compteur d'onglet à fournir) | M | SpaceLogisticView.vue:1319, 292 |
| Fusionner les réponses /stock identiques: ne remplacer `elements`, `levels`, `consumption` que s'ils changent (comparaison par hash ou version renvoyée par le serveur) | supprime les rendus inutiles toutes les 10 s | moyen | M | store/modules/logistics.js:145-159 |
| Allonger ou rendre adaptatif le polling, et le suspendre en drill-in, dialogs ouverts et onglets inactifs | moins d'appels serveur | faible | S | SpaceLogisticView.vue:727-731 |
| Précalculer par entrée (computed unique) statuts, totaux, compteurs, et réutiliser dans tri, rangées et aggregateStats; mémoïser `expectedFor` par tick | rendu de liste plus léger | faible | M | SpaceLogisticView.vue:889-976, 1189-1254, logistics.js:125-138 |
| Stabiliser les props de ByItemView (computed pour `entries`, méthode nommée pour `is-counted`) | évite le re-rendu forcé | faible | S | SpaceLogisticView.vue:419-422 |
| Ventilation: calculer en un computed la table "article coché" (une passe sur rowIndex), appeler une fois par article; mémoïser `isCardDone` et `depositCount` | supprime le O(articles x lignes) | faible | S | useVentilationDepositChecks.js:42-45, ItemList.vue:7-34, ShopList.vue:13-24 |
| Checkmark: affichage optimiste de la coche, journal de dépôts en file avec indicateur de progression; un seul `UPSERT_LEVEL` groupé | UX immédiate sur les lots | moyen (rollback à gérer) | M | useVentilationDepositChecks.js, logistics.js:160-163 |
| `ventilationChecks.load` en fusion différentielle (pas de vidage de la map) | moins de rendus | faible | S | useVentilationChecks.js:33-47 |
| Monter `LogisticTasksPanel` avec `v-show` ou le sortir du `v-if` de drill-in; garder `fetchStaff` sous garde de route | évite les relectures | faible | S | SpaceLogisticView.vue:478, 768 |
| Virtualiser les listes PDV et cartes si le volume réel le justifie (à mesurer d'abord) | selon volume | moyen | M | SpaceLogisticView.vue:400-412, 443-462 |
| Page invité: ne remplacer `sheet` que si elle a changé (ETag ou version), tick au retour de visibilité | moins de recalcul et de réseau | faible | S | GuestVentilationView.vue (mounted), useGuestVentilation.js:63-72 |

Backend (hypothèses à valider après lecture, non vérifiées)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Mesurer puis mettre en cache (Redis, courte durée) ou précalculer la consommation `salesByElementSince` par (espace, ancre) | allège le /stock appelé toutes les 10 s | invalidation à définir | M à L | logistics.queries.ts, stock-level.service.ts, recipe-explosion.service.ts |
| Renvoyer un en-tête ETag ou un numéro de version sur /stock | permet le 304 et la fusion côté store | faible | M | logistics.controller.ts |
| Endpoint unique Ventilation (feuilles fusionnées + dépôts + mouvements + stockages + checks) | 6 appels séquentiels deviennent 1 | moyen | M | logistics.controller.ts, ventilation-*.service.ts, restock |
| Endpoint de dépôts en lot pour le checkmark (une transaction, N mouvements) | remplace N POST séquentiels | transactionnel, idempotence | M | stock-movement.service.ts, ventilation-deposits.service.ts |
| Endpoint photos léger séparé du catalogue MarketPrice | supprime les base64 de l'ouverture | faible | M | module market price |

SQL et index: aucune recommandation fondée, les requêtes n'ont pas été lues. Règle du projet: EXPLAIN avant toute requête sur les tables transactions.

## 7. Points non vérifiés

Backend, non lu du tout:
- logistics.queries.ts (`salesByElementSince`), recipe-explosion.service.ts, stock-level.service.ts (`getStock`, mouvements, normalisation), logistics.controller.ts, stock-movement.service.ts, ventilation-deposits / checks / events.service.ts, logistics-element-scope.service.ts, stock-referential.service.ts, stock-reconciliation.service.ts, stock-loss.service.ts.
- Backend guest-pin (contrôleur et service de /guest-pin/ventilation, deposits, checks), PIN des logisticiens (ventilationAccess), dépôts, stockages de ventilation.
- Dépendance de la consommation à configId, recalcul par appel, cache Redis et TTL, tables, index, SQL, EXPLAIN.

Frontend, non lu:
- Composants: ByItemView, ItemCard, ElementRow, AggregateView, ConfigSelect, EventSelect, SupplierSelect, VentilationTransfers (composant), les 4 drawers, les 2 dialogs, LogisticMovementDialog, SidebarPanel, AppSearchBar (debounce).
- Template de GuestVentilationView.vue (lignes 1-94 et 225-286) et son `mounted` au-delà de ce qui est cité.
- Composables et modules: useRefreshOnReturn (déclencheur), useLogisticEventSelection (sélection par défaut), useVentilationAccess, useAssignableStaff (URL), usePredictedNeed, restock.api (`listRestockPlans`, `getRestockPlan`), market.price.api, inventory.api (`getLatestInventory`), store suppliers et storageInventory (TTL), utils ventilationPlans, restockDepositSheet, ventilationViews (hors `splitGroupRows`), `POLL_MS` du panneau Tâches.
- URL exacte de `createStockMovement` (logistics.api.js:46).

À mesurer: Network (taille de /stock, de getMarketPrices, de la feuille invité), durée de /stock avec et sans `?event=`, nombre réel de PDV x articles par espace (impact des points 4 et 6), profil Vue du tick de 10 s, durée du lot de dépôts d'une carte PDV complète, taille du chunk de la route.
