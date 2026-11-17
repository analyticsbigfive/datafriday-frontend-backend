# Page Analyse, template, filtres et watchers (rapport perf, partie 01c)

Statut: PARTIEL (template, store de filtres, useFilters, composables rendement lus; panneau de filtres `filters/*`, entête et voile NON lus, voir section 7). Complète `01_analyse_orchestration.md` (non répété ici). Frontend seulement, lecture seule.
Chemins relatifs à la racine du dépôt, base `frontend/src/components/space-workspace/analyse/`. Durées: uniquement celles
des commentaires du code, signalées "commentaire". Rien n'est mesuré.

## 1. Fiche (rappel)
`views/AnalyseView.vue` 3331 lignes: template `:1-871`, script `:873-2685`, style `:2687+`. Fichiers couverts ici:
`AnalyseAppHeader.vue` 960, `FilterPanel.vue` (racine) 754, `filters/FilterPanel.vue` 1331, `filters/*` 7 autres fichiers
(77+141+28+327+133+145+106 lignes), `AnalyseSkeletonVeil.vue` 58.

## 2. Template d'AnalyseView: ce qui est monté à l'ouverture (TEMPLATE lu en entier sauf `:300-425`)

Aucune balise `<keep-alive>`, `<Suspense>` ni `<component :is>` dans le template de ce fichier (grep sur `AnalyseView.vue`:
seul `onActivated/onDeactivated` est importé en `:874`). Le mécanisme keepAlive est dans le layout parent (non lu ici).

Imports (`AnalyseView.vue:873-962`): TOUS statiques (FilterPanel, FinancialMetricsGrid, EventRevenueByShopChart,
EventTimelineChart, ShopDistributionPieChart, TransactionCategoryMixChart, MenuItemRevenueDistribution, MenuItemsByShopTable,
SummaryPanel, FilterEditorPanel, GenericByEventChart, PromotionSection, 3 dialogs, ComparisonDrawer + Content + Head + Switch +
MenuItem + MainKpiStrip, ReportJ1 x3, DeltaPill). La SEULE exception est `EventPredictView` via `asyncComponentWithChunkReload`
(`:896-901`, commentaire: "~71KB gz JS + 13KB gz CSS" téléchargés seulement à l'ouverture de l'overlay). `defineAsyncComponent`
n'est pas utilisé ailleurs dans ce fichier: les composants du drawer Comparaison et du Rapport J+1, absents du DOM à
l'ouverture, sont néanmoins dans le chunk initial.

| Zone | Composant | Fichier | Condition de montage (template) | Props / données reçues |
|---|---|---|---|---|
| Entête global | WorkspaceAppHeader | `components/WorkspaceAppHeader.vue` | Toujours (`:3-12`) | `kpis=headerKpis` (ou `[]` en comparaison) |
| Colonne gauche | FilterPanel (version `filters/`, 1331 l.) | `analyse/filters/FilterPanel.vue` | Toujours, même panneau replié (le repli est CSS via `an-side-collapsed`, `:18-29`) | `events=analysableEvents`, `shops=shopNames`, event `update:toolbox` |
| Bandeau titre | bloc `av-header` (inline, PAS `AnalyseAppHeader.vue`) | `AnalyseView.vue:45-` | Toujours | état local (`:55-`) |
| KPI | FinancialMetricsGrid | `analyse/panels/FinancialMetricsGrid.vue` | `v-else` de `chartsLoading` (`:544-561`), sous `v-can` | `metrics`, `itemSummary`, `kpiSourceState`, `rendementCards`, `widgetDeltas` |
| PdV taux | ShopPerformanceByTransactionRate | `analyse/charts/` | `v-if="showTransactionRateShops"` (`:564`), ouvert par clic | `shopPerformance.shops` |
| Graphe KPI inline | GenericByEventChart | `analyse/charts/` | `v-if="inlineChartVisible"` (`:576-598`), ouvert par clic KPI | `filteredEventAggregates`, `chartRecords`, `filteredEvents`, `menuItemCostMap`, `menuItemCostByEvent` |
| Carte unique | EventTimelineChart XOR EventRevenueByShopChart | `shared/EventTimelineChart.vue`, `charts/` | Timeline si `isTimelineActive`, sinon barres (skeleton si `chartsLoading`) (`:609-678`) | `chartRecords`, `filteredEvents` / `filteredTimelineData` |
| Donuts | ShopDistributionPieChart | `charts/` | Monté toujours (même pendant le chargement, `:loading`) (`:686-694`) | `chartRecords`, `mainDeltas` |
| Combinaisons | TransactionCategoryMixChart | `charts/` | Monté toujours (`:698-703`) | `filteredBaskets` (paniers par transaction) |
| Tables | MenuItemRevenueDistribution, PromotionSection, MenuItemsByShopTable | `tables/` | `v-else` de `chartsLoading` (`:714-755`) | `articleRecords`, `articleDimensionsIndex`, `mainDeltas` |
| Colonne droite | FilterEditorPanel | `panels/` | `v-if="activeFilterEditor"` (`:763`), clic sur un tag | items, selected |
| Colonne droite | SummaryPanel | `panels/SummaryPanel.vue` | Toujours (même replié `summaryDrawer`), sous `v-can` (`:773-785`) | `chartRecords`, `itemLevelRecords`, `filteredEvents`, `shopPerformance.shops`, `ensureAssistantDataset` |
| 4e colonne | ComparisonDrawer + Head + Content | `analyse/comparison/` | `v-if="comparison.open.value"` (`:789-813`): absent du DOM tant que fermé | `comparison`, `comparisonForm`, `comparisonRuntime` |
| Overlay | ReportJ1PlacementDrawer | `analyse/report-j1/` | Toujours monté (`:818`), pas de `v-if` | `reportJ1` |
| Mobile | WorkspaceMobileToolDrawer | `components/` | Toujours monté (`:821`) | `v-model showMobileToolDrawer` |
| Overlay | EventPredictView | `event-predict/views/` | `v-if="showPredictOverlay && space"` + import async (`:830`) | `space` |
| Dialogs | ShopItemEventsDialog, UnalignedEventsDialog | `analyse/dialogs/` | Toujours montés (`:841-854`), `v-model` booléen | `articleRecords`, `filteredEvents` |
| Rapport | ReportJ1Document | `analyse/ReportJ1Document.vue` | `v-if="reportJ1Data"` (`:868`), seulement pendant la génération | `data` |

Constats de montage:
- Pas de `v-show`: tout est `v-if` ou toujours monté (grep sur le template). Les panneaux repliés (filtres `drawer`, résumé
  `summaryDrawer`) restent montés et calculent: le repli est une classe CSS de grille (`an-side-collapsed`,
  `an-summary-collapsed`, `AnalyseView.vue:21`). Un utilisateur qui replie les deux panneaux continue de payer FilterPanel et
  SummaryPanel.
- `AnalyseAppHeader.vue` (960 lignes): l'entête réellement utilisé est `WorkspaceAppHeader` plus un bloc inline. À vérifier plus
  bas si `AnalyseAppHeader` est importé quelque part (voir section 7).
- `FilterPanel.vue` à la racine d'`analyse/` (754 lignes): `AnalyseView` importe `../filters/FilterPanel.vue`
  (`AnalyseView.vue:884` environ, `import FilterPanel from '../filters/FilterPanel.vue'`). Voir statut du fichier racine plus bas.
- Dans le template, `v-can="'stats.financial.view'"` est posé sur une dizaine de composants lourds (grille KPI, carte
  graphe, donuts, paniers, tables, SummaryPanel). Si la directive agit après le `setup`, les composants sont quand même
  instanciés avant d'être retirés: comportement de `v-can` non lu, non vérifié.

## 3. Appels API (nouveaux par rapport au rapport 01)

Seuls les appels lus ici. Colonnes backend (contrôleur, service, tables, Redis, payload): non vérifié pour toutes les lignes.

| # | Déclencheur | Méthode + URL | Fonction front | Séquence / bloque | Cache front | Coût |
|---|---|---|---|---|---|---|
| 20 | SETUP du composant (watch `immediate`), si `canView` (`stats.financial.view`) | GET `/analyse/stock-valuation` (params CSV: shopNames, shopIds, shopTypes, shopAreas, industrialIds, supplierIds) | `getStockValuation` (`api/endpoints/analyse-rendement.api.js`), appelé par `useStockValuation.run` (`composables/useStockValuation.js:42-57`), câblé par `useRendementWidgets.js:72-75`, instancié `AnalyseView.vue:1934-1946` | Part au setup, AVANT `onMounted` donc avant getSession et /preferences. Ne bloque pas le rendu (carte "Valorisation stock" en skeleton, `useStockValuation.js:64-67`). Parallèle aux autres | Aucun (pas de cache, `data` en ref locale). Une réponse périmée est ignorée via `requestId` (`:41`, `:46`) | Backend non lu. Absent du tableau 3 du rapport 01 |
| 21 | Changement d'un filtre PdV / type / zone / industriel / fournisseur | même URL | idem, `schedule()` (`useStockValuation.js:60-70`) puis `setTimeout(run, 300)` (`DEBOUNCE_MS`, `:15`) | Statut repassé à `loading` immédiatement (`:67`), requête après 300 ms de calme | La clé de re-déclenchement est `signature = JSON.stringify([spaceId, params, unresolved])` (`:36`): un filtre hors de ce périmètre (date, event, marque, article) ne rappelle pas l'endpoint | 1 requête par rafale de filtres PdV |
| 22 | Ouverture du graphe "Valorisation stock" (`inlineChartVisible` et `byEventMetric === 'stockValue'`, `AnalyseView.vue:1933`) | GET `/analyse/event-valuation` | `getEventValuations`, `useEventValuations.js:46`, debounce 300 ms (`:11`) | Différé, activé par `enabled` | non lu | Lazy, hors chemin critique |
| 23 | Setup, si permission | GET `/analyse/article-dimensions` | `getArticleDimensions`, `useArticleDimensions.js:19-37` | Parallèle, hors portillon. `useRendementWidgets` rappelle `useArticleDimensions()` SANS argument (`useRendementWidgets.js:55`): même cache de module, aucune requête en plus | Cache de MODULE (`status`, `indexRef` lignes 14-17): une requête par espace, pas de TTL, `reset()` défini (`:51-56`) mais son appelant n'a pas été cherché. Au changement d'espace, `indexRef` est remis à `null` (`:30`), donc les filtres marque / industriel / fournisseur ne filtrent plus rien le temps du rechargement (commentaire en tête de fichier) | non lu |
| 24 | Par paquet d'events | GET `/analyse/:spaceId/event-costs?eventIds=` (par lots de 100, `EVENT_COSTS_BATCH_SIZE`) | `getEventCosts` | cf. rapport 01 #14 | cf. rapport 01 | cf. rapport 01 |

Changer un filtre ne rappelle PAS les endpoints item-level pour les events déjà en cache (voir 4).

### Composables lus

| Composable | Fichier | Lignes | Rôle | Monté | Réseau | Watchers / computed lourds |
|---|---|---|---|---|---|---|
| useFilters | `composables/useFilters.js` | 201 | Façade du store `analyse.filters` + debounce | Setup | Aucun | Voir 4 |
| useRendementWidgets | `composables/useRendementWidgets.js` | 203 | Cartes CA/TPE, CA/collaborateur, valorisation stock, métriques du graphe par event | Setup, toujours instancié | `stock-valuation` (#20), `event-valuation` (#22, lazy) | `headcount('tpe')` et `headcount('collaborator')` = 2 computed `computeRevenuePerHeadcount` sur `filteredEvents` (`:60-66`) recalculés à chaque changement de CA par event ou de filtre |
| useArticleDimensions | `composables/useArticleDimensions.js` | 70 | Index marque / industriel / fournisseur / promotion | Setup (avec `spaceId`+`enabled`), puis sans argument dans useRendementWidgets | `article-dimensions` (#23) | `options = listDimensionOptions(indexRef)` (`:66`) |
| useStockValuation | `composables/useStockValuation.js` | 88 | Valorisation du stock Logistique actuel | Setup via useRendementWidgets | #20, #21 | watch sur `signature` (string) donc pas de rappel sur filtre hors périmètre |
| useEventValuations | `composables/useEventValuations.js` | 76 | Rapport par event | Setup, inactif tant que le graphe n'est pas ouvert | #22 | watch `[signature, enabled]` |
| useAnalyseTimeline | `composables/useAnalyseTimeline.js` | 144 | Timeline minute d'un event | Setup, aucune requête avant clic | `getSpaceEventTimelineBatch` (grain minute) sur clic | `eventTimelineData` en `shallowRef` (`:25`). Lignes 60-144 NON LUES |
| useAnalyseItemRecords (relu) | `composables/useAnalyseItemRecords.js` | 295 | Cache par event + `itemRecords` réconcilié | Setup, 2 instances (`AnalyseView.vue:1134` et `:1489`) | rapport 01 #12 | `itemRecords` mémoïsé par event via WeakMap (`:208-225`) |

## 4. Cascade au changement de filtre

Aucune durée mesurée.

### 4.1 Mécanique de dispatch (lu)
- `UPDATE_FILTER` écrit `state.filters[key] = value` (`store/modules/analyse.js:1564-1566`): réactivité par clé. Un computed ne rejoue que s'il a lu cette clé.
- Trois chemins d'écriture dans `useFilters.js`:
  - `toggleArrayFilter` / `toggleArrayFilterMany`: coalescés 150 ms PAR CLÉ (`:119-136`, `:147-164`), un seul dispatch après accalmie.
  - `setFilter`: debounce 150 ms avec UN SEUL minuteur partagé entre toutes les clés (`:48-54`, `:101-104`). Deux clés écrites à moins de 150 ms: seule la dernière part (mise à jour perdue possible). L'appelant n'a pas été identifié (FilterPanel non lu).
  - `setFilterImmediate`: aucun debounce, dispatch direct (`:166-174`). Utilisé par le panneau droit `FilterEditorPanel` (`AnalyseView.vue:770`): chaque coche d'une multi-sélection déclenche la cascade complète.
- `filtersRecomputing` (ref de module, `useFilters.js:14`) passe à `true` à l'interaction et retombe 2 `requestAnimationFrame` après le dispatch (`:15-24`), pour laisser peindre des voiles squelettes avant le burst synchrone de recalculs (commentaire `:8-13`). Les consommateurs du signal (AnalyseSkeletonVeil, donuts, tableaux) n'ont pas été lus.

### 4.2 Cas A: filtre PdV / type de PdV / zone / article / type d'article / catégorie (le plus fréquent, clic donut ou tag)
`filteredEvents` NE bouge PAS: `filterEvents` ne lit que des clés event (selectedEventIds, searchQuery, dates, MULTI_CRITERIA, intermission, plages de billets, jour/météo, `utils/analyseEventFilter.js:59-112`). Donc les watchers `watch(filteredEvents, ...)` de `useAnalyseItemRecords.js:149` et `useTransactionBaskets.js:138` ne se déclenchent pas: AUCUNE requête réseau item-level. Coût = recalcul CPU sur le thread principal, en cascade synchrone:

| Ordre | Computed / watcher | Fichier:ligne | Nature du coût |
|---|---|---|---|
| 1 | `filteredShopGranularData` | `store/modules/analyse.js:903-991` | Un filtre complet de TOUS les records shop-level réconciliés; `normalizeStr(r.shopName)` recalculé par record à chaque passe (`:954`) |
| 2 | `itemLevelRecords` | `AnalyseView.vue:1158-1169` | Filtre de tous les records item-level (jusqu'à 100 events, grain summary) par `buildItemFilterPredicate` |
| 3 | `filteredTimelineData` | `AnalyseView.vue:1205` | Idem sur la timeline minute si un event est ouvert |
| 4 | `filteredBaskets` | `AnalyseView.vue:1261` | Filtre de tous les paniers (volume potentiel de l'ordre de 480 000 lignes, extrapolation du rapport 01, non mesurée) |
| 5 | `perShopTransactionRateSum` | `AnalyseView.vue:~1265` | `sumShopTransactionRates(filteredBaskets)` |
| 6 | `chartRecords` et `kpiRecords` | `AnalyseView.vue:1345-1346` | Deux computed identiques `pickRevenueRecords(recordsArgs())`. Corps de `pickRevenueRecords` non lu |
| 7 | `articleRecords` | `AnalyseView.vue:1417` | Hors predict = `chartRecords`; en predict: filtre + map + filtre réconcilié, non mémoïsé (`:1396-1404`) |
| 8 | `itemSummary` | `AnalyseView.vue:1510` | Parcourt `comparisonItemRecords` et `eventsMatchingFiltersExceptDate` si comparaison active |
| 9 | `metrics` (`useMetricsCalculator`), `headerKpis` | `AnalyseView.vue:1760`, `:1828` | Non lus |
| 10 | `rendementCards` | `useRendementWidgets.js:60-66`, `:157-161` | 2 `computeRevenuePerHeadcount` + carte stock |
| 11 | `timelineFilterSignature` | `AnalyseView.vue:1296-1307` | Trie et joint 12 tableaux, léger |
| 12 | Props des enfants | template `:552-755` | `FinancialMetricsGrid`, `EventRevenueByShopChart`, `ShopDistributionPieChart`, `TransactionCategoryMixChart` (reçoit `filteredBaskets`), `MenuItemRevenueDistribution`, `PromotionSection`, `MenuItemsByShopTable`, `SummaryPanel` (reçoit `chartRecords` ET `itemLevelRecords`): chacun ré-agrège ses records, calculs internes hors périmètre de ce rapport |
| 13 | Si filtre PdV / type / zone / industriel / fournisseur | `useStockValuation.js:49-51`, `:79` | +1 requête réseau `stock-valuation` après 300 ms |

Nombre de computed nommés rejoués sur un filtre de ce type: au moins 12 côté vue et store (lignes 1 à 11), plus le rendu de 8 composants lourds. Le watcher `soldItemOptionRecords` (`AnalyseView.vue:1672-1692`) ne rejoue PAS, car `soldItemOptionRecords = globalItemRecords` (`:1311`) ne dépend que de `filteredEvents` et du cache. Le watcher de purge (`:1697-1710`) rejoue seulement si l'un de ses 6 getters se recalcule.

### 4.3 Cas B: filtre event (période, événement, catégorie, équipe, billets...) qui RÉTRÉCIT le périmètre
`filteredEvents` change de référence (`store/modules/analyse.js:859-863`, `filterEvents` renvoie toujours un nouveau tableau). Les deux watchers appellent `ensureLoaded` / `load`; `ensureLoaded` ne cherche que les events absents du cache (`useAnalyseItemRecords.js:70-72`, `if (!missing.length) return`). Périmètre plus petit = tous les events déjà en cache = aucun réseau. `itemRecords` se recompose depuis le cache mémoïsé par WeakMap (`:208-225`), mais les paniers sont re-mappés (voir problème 3). Le watcher `soldItemOptionRecords` rejoue (nouveau `globalItemRecords`), ainsi que `getSpaceEventTimelineBatch` pour rien. Coût = cas A + scan des options + recomposition des listes.

### 4.4 Cas C: filtre event qui ÉLARGIT le périmètre (période plus large, retrait d'un filtre)
Mêmes watchers, mais `missing` non vide: paquets timeline (30 events par paquet, 2 en vol) + paquets paniers (6 par paquet) + `ensureEventCosts`, via le même portillon que le premier chargement (rapport 01 #12 à #14). Pendant ce temps `itemRecordsSourceState` repasse à `loading` (`useAnalyseItemRecords.js:~255-262`, tant que tous les events scopés ne sont pas tentés), donc `kpiSourceState` = `loading` (`AnalyseView.vue:1349-1355`) et `chartsLoading` = vrai (`:1081-1083`). Conséquence template:
- `FinancialMetricsGrid` remplacé par 5 skeletons (`:544-561`);
- la carte graphe passe de `EventRevenueByShopChart` à un `v-skeleton-loader` (`:666-677`): le canvas Chart.js est DÉMONTÉ puis REMONTÉ (le commentaire `:601-608` dit pourtant éviter ce démontage pour le crash `ownerDocument`; il ne vaut que pour la timeline);
- `MenuItemRevenueDistribution`, `PromotionSection`, `MenuItemsByShopTable` sont démontés (`v-if="chartsLoading"` à `:707`, `v-else` à `:714`) et remontés à l'arrivée du dernier paquet;
- la barre "x / N" (`:523-542`) apparaît.
Élargir la période coûte donc un remontage de la moitié basse de la page, en plus du réseau.

### 4.5 Premier montage: instances inutiles
`useAnalyseItemRecords` est instancié 2 fois (principal `:1134`, comparaison `:1489`); la seconde reste vide tant que `comparisonMode` est off (`:1460-1463`) et attend la fin du chargement principal (`comparisonEventsGated`, `:1469-1471`). `useComparisonForm` (`:1046`), `useComparisonRuntime` (`:1965`), `useMainReportSnapshot` (`:1953`) sont instanciés à chaque ouverture même drawer fermé; leur coût "nul tant que fermé" n'est affirmé que par commentaire (`:1951-1952`), non vérifié.

## 5. Problèmes de performance

1. `GET /analyse/stock-valuation` part au setup, avant `onMounted`, donc avant getSession et /preferences, et n'était pas listé dans le rapport 01. Il rejoue ensuite (300 ms de debounce) à chaque filtre PdV / type / zone / industriel / fournisseur et remet la carte en skeleton. Preuve: `useRendementWidgets.js:72-75`, `useStockValuation.js:49-51`, `:60-70`, `:79`; instanciation `AnalyseView.vue:1934`. Impact: moyen (coût backend non lu). Pages: Analyse.
2. Élargir un filtre event démonte puis remonte la moitié basse de la page (Chart.js, 3 tables) car les blocs sont en `v-if/v-else` sur `chartsLoading`, alors que les donuts, eux, restent montés avec `:loading`. Preuve: `AnalyseView.vue:1081-1083`, `:544-561`, `:666-677`, `:707-755`, comparer `:686-703`. Impact: haut (ressenti et coût de rendu). Pages: Analyse.
3. Les paniers sont re-mappés en entier à chaque recomposition: `reconciledBaskets` fait `recs.map(reconcileRecord)` sans mémoïsation par event (`AnalyseView.vue:~1247-1255`), alors que BUG-364-01 a introduit cette mémoïsation (WeakMap) pour les records item-level (`useAnalyseItemRecords.js:198-225`). Le cache paniers est réassigné à chaque event reçu (`useTransactionBaskets.js:96-103`): jusqu'à un re-map complet par paquet de 6 events si un rendu passe entre deux paquets (17 paquets pour 100 events, rapport 01). À CONFIRMER: la définition de `basketRecords` n'a pas été lue. Impact: haut potentiel (volume paniers de l'ordre de 4 800 lignes par event sur Jean Bouin, commentaire du rapport 01). Pages: Analyse.
4. Un filtre PdV / article fait au minimum 4 balayages complets de grosses listes (shop-level, item-level, timeline, paniers) sur le thread principal, sans index ni mémoïsation des prédicats, puis ré-agrégation par 8 composants. `normalizeStr` est recalculé côté record à chaque passe (`analyse.js:954`). Preuve: tableau 4.2. Impact: moyen à haut selon volume, non mesuré. Pages: Analyse.
5. Debounce incohérent: `setFilterImmediate` sans debounce pour le panneau droit (`AnalyseView.vue:770`, `useFilters.js:166-174`); `setFilter` utilise un minuteur unique pour toutes les clés (`useFilters.js:101-104`), d'où une mise à jour perdue possible si deux clés différentes sont écrites à moins de 150 ms. Impact: moyen (perf: cascade complète à chaque coche; justesse: mise à jour perdue possible). Pages: Analyse.
6. Le watcher `soldItemOptionRecords` balaie tous les records item-level (3 résolveurs par record) à chaque paquet reçu et à chaque changement de `filteredEvents`, puis dispatche vers le store, ce qui recalcule les getters `salesMenuItem*` et réveille le watcher de purge. Preuve: `AnalyseView.vue:1672-1692`, `:1311`, `:1697-1710`. Impact: moyen (jusqu'à 21 passes pendant le chargement initial, selon la cadence de rendu). Pages: Analyse.
7. Panneaux repliés toujours montés et calculés: `FilterPanel` et `SummaryPanel` restent dans le DOM, le repli est une classe CSS (`AnalyseView.vue:18-29`, `:773-785`). `SummaryPanel` reçoit `chartRecords` et `itemLevelRecords`. Impact: moyen (intérieur de SummaryPanel non lu). Pages: Analyse.
8. Chunk initial alourdi: tout est importé statiquement (drawer Comparaison x6, Rapport J+1 x4, dialogs, ReportJ1Document) alors que ces composants sont absents du DOM à l'ouverture; seul `EventPredictView` est asynchrone (`AnalyseView.vue:873-962`, commentaire PERF `:894-896`). Impact: moyen (taille du chunk non mesurée). Pages: Analyse.
9. `chartRecords` et `kpiRecords` sont deux computed identiques (`AnalyseView.vue:1345-1346`). Impact: bas (dépend de `pickRevenueRecords`, non lu).
10. `itemRecords` concatène par `out.push(...rows)` (`useAnalyseItemRecords.js:~224`): un spread de très grand tableau peut lever une RangeError au-delà de plusieurs dizaines de milliers d'éléments; taille de `rows` par event non vérifiée. Impact: bas, risque de robustesse.
11. `onActivated` / `onDeactivated` sont importés (`AnalyseView.vue:874`) mais le grep sur le fichier ne trouve aucun autre usage: aucune logique de réactivation si l'instance est conservée par keepAlive (mécanisme du layout non lu). Impact: bas, à confirmer.
12. `useArticleDimensions`: cache de module sans TTL; au changement d'espace l'index passe à `null`, ce qui neutralise les filtres marque / industriel / fournisseur / promotion jusqu'à la réponse (`useArticleDimensions.js:25-31`, commentaire d'en-tête). Impact: bas.
13. Fichier `analyse/FilterPanel.vue` (754 lignes) à la racine: aucun import trouvé par grep sur `src/` (le seul usage est `../filters/FilterPanel.vue`, `AnalyseView.vue:884`). Probablement du code mort, non lu. Même question pour `AnalyseAppHeader.vue` (960 lignes): `AnalyseView.vue` ne l'importe pas, les autres importeurs ne sont pas cherchés. Impact: bas (maintenance, pas de coût runtime si non importé).

## 6. Recommandations

Les gains ne sont pas chiffrés (aucune mesure).

### Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Garder `EventRevenueByShopChart` et les 3 tables montés pendant `chartsLoading` et passer `:loading` (comme les donuts) au lieu de `v-if/v-else` | Plus de remontage Chart.js et tables à chaque élargissement de filtre; respecte la règle "zéro valeur provisoire" si le composant masque ses valeurs en loading | Chaque composant doit gérer `loading` sans crash sur données vides | M | `AnalyseView.vue:544-561`, `:666-677`, `:707-755` et les 4 composants |
| Mémoïser `reconciledBaskets` par event (WeakMap, comme `useAnalyseItemRecords.js:208-225`) | Fin des re-maps complets à chaque paquet | Aucun connu (records gelés) | S | `AnalyseView.vue:~1247-1255`, `useTransactionBaskets.js` |
| Différer `useStockValuation` après `kpiSourceState !== 'loading'` (ou `onMounted` + idle) | Retire une requête du pic de t0 | Carte stock plus tardive | S | `useRendementWidgets.js:72-75`, `AnalyseView.vue:1934` |
| Un seul mécanisme de debounce par clé pour `setFilter` (map de minuteurs comme `toggleArrayFilter`) et debounce 150 ms pour `FilterEditorPanel` | Supprime la mise à jour perdue et réduit les cascades | Latence 150 ms sur le panneau droit | S | `useFilters.js:101-104`, `AnalyseView.vue:770` |
| Précalculer les clés normalisées une fois dans `reconcileRecord` (champ `shopNameKey`) pour `filteredShopGranularData` | Retire un `normalizeStr` par record et par passe | Champ de plus dans chaque record | S | `analyse.js:954`, `analyseReconciliation.js` (non lu) |
| Différer le watcher `soldItemOptionRecords` (idle ou à la fin des paquets) | Retire les balayages par paquet | Options d'articles prêtes plus tard | S | `AnalyseView.vue:1672-1692` |
| Charger en `defineAsyncComponent` le drawer Comparaison, le Rapport J+1 et `ReportJ1Document` (via `asyncComponentWithChunkReload`, déjà utilisé pour EventPredict) | Chunk initial plus léger | Latence à la première ouverture du drawer | S | `AnalyseView.vue:873-962` |
| Ne pas monter `SummaryPanel` / `FilterPanel` tant que repliés sur mobile (`v-if` sur `drawer`) ou les rendre inactifs | Moins de calcul quand replié | Perte d'état interne si démonté (accordéons) | M | `AnalyseView.vue:24`, `:773` |
| Supprimer `kpiRecords` (alias de `chartRecords`) | Un computed de moins | Aucun | S | `AnalyseView.vue:1345-1346` |
| Retirer `FilterPanel.vue` racine et `AnalyseAppHeader.vue` s'ils sont confirmés inutilisés | Maintenance | Vérifier les importeurs | S | `analyse/FilterPanel.vue`, `analyse/AnalyseAppHeader.vue` |

### Backend et SQL
Aucune action nouvelle déduite de ce passage; seul `GET /analyse/stock-valuation` (#20) est à profiler (EXPLAIN, Redis) car il est appelé à chaque ouverture et à chaque filtre PdV. Backend non lu.

## 7. Points non vérifiés

Statut du rapport: PARTIEL. Ce qui n'a PAS été lu, malgré le périmètre demandé:
- `filters/FilterPanel.vue` (1331 lignes) et les 7 autres fichiers de `filters/` (ArticleDimensionFilters, CheckboxListFilter, DayOfWeekFilter, FilterBottomSheet, FilterSelectAll, MultiSelectFilter, WeatherTemperatureFilters): rôle des filtres, quelle fonction d'écriture (`setFilter`, `setFilterImmediate`, `toggleArrayFilter`) chacun appelle, nombre de listes rendues, appels réseau éventuels. Le calcul du nombre de recalculs par action du panneau gauche est donc INCOMPLET.
- `analyse/FilterPanel.vue` racine (754 lignes) et `AnalyseAppHeader.vue` (960 lignes): lignes comptées seulement (`wc -l`). Pour le premier, absence d'import constatée par grep; pour le second, importeurs non cherchés.
- `AnalyseSkeletonVeil.vue` (58 lignes): non lu (conditions d'affichage, lien avec `filtersRecomputing`).
- `useAnalyseTimeline.js` lignes 60-144 (chargement sur clic, annulation); `useStockValuation` et `useRendementWidgets` lus en entier; `useEventValuations` lu par grep seulement.
- `seasons/fetchAll` et `inventory/loadMarketPrices`: non lus (pourquoi Analyse charge les prix de marché reste sans réponse; seule l'hypothèse du rapport 01 existe: charge pour d'autres pages).
- Plafond de 30 entrées du cache session API (`space.api.js:~142`): non relu ici, le point 7 du rapport 01 reste la référence.
- Template `AnalyseView.vue` lignes 300-425: lu seulement par recherche de balises (menu mobile, rangée de tags, bande KPI mobile). Montage exact de ces blocs non confirmé.
- Watchers `AnalyseView.vue:1923`, `:2098`, `:2155`, `:2570`, `:2601`, `:2615` et `useMetricsCalculator` (`:1760`), `pickRevenueRecords`, `basketRecords`, `headerKpis` (`:1828`): non lus.
- Directive `v-can` (retire-t-elle le composant ou le masque-t-elle après `setup`): non lue.
- Mécanisme keepAlive réel (layout parent), voir rapport 01.
- À mesurer dans le navigateur: temps du burst de recalculs après un clic donut (Performance), nombre de lignes réelles de `reconciledBaskets` et `filteredShopGranularData`, durée de remontage de la moitié basse lors d'un élargissement de période, poids du chunk AnalyseView.
