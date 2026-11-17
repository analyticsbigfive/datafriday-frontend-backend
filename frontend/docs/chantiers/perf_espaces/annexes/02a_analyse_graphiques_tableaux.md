# 02a. Analyse : graphiques, tableaux, panneaux, dialogues

Périmètre: `frontend/src/components/space-workspace/analyse/{panels,charts,tables,dialogs}` et `AggregationGapAlert.vue`.
Parent: `frontend/src/components/space-workspace/analyse/views/AnalyseView.vue` (3331 lignes). Orchestration et comparaisons: autres rapports.
Statut: SQUELETTE, complété au fil des lectures. Tout ce qui est marqué "non vérifié" n'a pas été lu.

## 1. Fiche de la page

- Parent: `AnalyseView.vue`, 3331 lignes (`wc -l`). Composants de ce périmètre importés statiquement, sans `defineAsyncComponent` (grep: aucune occurrence dans AnalyseView, imports lignes 885 à 906).
- Fichiers du périmètre (lignes `wc -l`): panels 1208 (SummaryPanel 911, FinancialMetricsGrid 197, FilterEditorPanel 100), charts 2648 (DonutChartCard 457, EventMetricFooter 70, EventRevenueByShopChart 922, GenericByEventChart 423, ShopDistributionPieChart 217, ShopPerformanceByTransactionRate 369, TransactionCategoryMixChart 190), tables 1572 (ArticleDimensionDonuts 140, MenuItemRevenueDistribution 457, MenuItemsByShopTable 829, PromotionSection 146), dialogs 339 (ByEventChartDialog 73, ShopItemEventsDialog 169, UnalignedEventsDialog 97), AggregationGapAlert 57.
- Route, meta, garde: hors périmètre (voir rapport orchestration).

## 2. Arbre des composants

Montage dans AnalyseView (template): tous importés statiquement (`AnalyseView.vue:885-906`), aucun `defineAsyncComponent`. Seul `ByEventChartDialog.vue` n'est importé par aucun composant du dépôt (grep des imports: seule sa propre référence, `dialogs/ByEventChartDialog.vue:27` importe GenericByEventChart), donc code mort probable.

| Composant | Fichier | Lignes | Rôle | Monté à l'ouverture ou différé | Props reçues d'AnalyseView |
|---|---|---|---|---|---|
| AggregationGapAlert | `analyse/AggregationGapAlert.vue` | 57 | bandeau events sans détail de vente | monté d'emblée (`AnalyseView.vue:502`), vide si pas d'events | `events=aggregationGapEvents` |
| FinancialMetricsGrid | `panels/FinancialMetricsGrid.vue` | 197 | bandeau KPI (CA, marge, tx/min, CA/TPE, CA/collab, stock) | `v-else` du skeleton `chartsLoading` (`AnalyseView.vue:544-561`), donc remplacé par 5 skeletons tant que la phase 2 charge | `metrics`, `summary=itemSummary`, `source-state`, `rendement`, `deltas` |
| ShopPerformanceByTransactionRate | `charts/ShopPerformanceByTransactionRate.vue` | 369 | panneau PdV par taux de transactions | `v-if=showTransactionRateShops` (`AnalyseView.vue:564`), différé (ouvert par clic KPI) | `shops`, `loading`, `selected-shop-ids` |
| GenericByEventChart | `charts/GenericByEventChart.vue` | 423 | barres par event d'un KPI | `v-if=inlineChartVisible` (`AnalyseView.vue:576-589`), différé (clic KPI) | `event-aggregates`, `records=chartRecords`, `events`, `cost-map`, `cost-by-event`, `initial-metric`, `extra-metrics` |
| EventRevenueByShopChart | `charts/EventRevenueByShopChart.vue` | 922 | barres empilées CA par PdV par event | monté d'emblée dans une carte, sauf si timeline active ou `chartsLoading` (`AnalyseView.vue:609-677`) | `records=chartRecords`, `events`, `is-predict-mode` |
| ShopDistributionPieChart | `charts/ShopDistributionPieChart.vue` | 217 | 3 donuts PdV / type / zone | monté d'emblée, même pendant `chartsLoading` (`AnalyseView.vue:686`) | `records`, `loading`, `deltas=mainDeltas` |
| TransactionCategoryMixChart | `charts/TransactionCategoryMixChart.vue` | 190 | donut combinaisons de catégories par transaction | monté d'emblée (`AnalyseView.vue:698`) | `records=filteredBaskets`, `loading=basketsLoading` |
| MenuItemRevenueDistribution | `tables/MenuItemRevenueDistribution.vue` | 457 | donuts CA par article/type/catégorie + dimensions | `v-else` de `chartsLoading` (`AnalyseView.vue:714-719`) | `records=articleRecords`, `loading`, `deltas`, `dimensions-index`, `dimensions-status` |
| PromotionSection | `tables/PromotionSection.vue` | 146 | 2 donuts promotion | idem, dans le même `<template v-else>` (`AnalyseView.vue:737`) | `records=articleRecords`, `dimensions-index`, `status`, `mode`, `deltas` |
| MenuItemsByShopTable | `tables/MenuItemsByShopTable.vue` | 829 | tableau article x PdV | idem (`AnalyseView.vue:747`) | `records=articleRecords`, `loading`, `deltas` |
| ArticleDimensionDonuts | `tables/ArticleDimensionDonuts.vue` | 140 | donuts industriel/marque/fournisseur, enfant de MenuItemRevenueDistribution (`MenuItemRevenueDistribution.vue:166`) | monté avec son parent | voir plus bas |
| FilterEditorPanel | `panels/FilterEditorPanel.vue` | 100 | éditeur d'un filtre (liste à cocher) en colonne droite | `v-if=activeFilterEditor` (`AnalyseView.vue:763`), différé | `label`, `items`, `model-value`, `label-fn`, `icon-fn` |
| SummaryPanel | `panels/SummaryPanel.vue` | 911 | classements PdV / events / articles + assistant | monté d'emblée, colonne droite (`AnalyseView.vue:773`) | `records=chartRecords`, `item-records=itemLevelRecords`, `events`, `shop-rates`, `ensure-dataset`, `show-events-perf` |
| ShopItemEventsDialog | `dialogs/ShopItemEventsDialog.vue` | 169 | events d'un couple PdV x article | monté d'emblée (`AnalyseView.vue:841`, `v-model`, pas de `v-if`), contenu v-dialog | `records=articleRecords`, `events` |
| UnalignedEventsDialog | `dialogs/UnalignedEventsDialog.vue` | 97 | events écartés de la moyenne | monté d'emblée (`AnalyseView.vue:850`) | `events=timelineSkippedEvents` |
| ByEventChartDialog | `dialogs/ByEventChartDialog.vue` | 73 | dialog de GenericByEventChart | non utilisé dans AnalyseView | n/a |

Autres consommateurs: `LiveView.vue:182-184` réutilise ShopDistributionPieChart, TransactionCategoryMixChart, MenuItemRevenueDistribution (coût de rendu mutualisé avec la page Live).

Bibliothèque de graphique: Chart.js 4.5.1 via vue-chartjs 5.3.3 (`frontend/package.json:20,32`), enregistrement unique mutualisé `src/lib/chartjs.js` (`registerChartJs`, flag `registered`). Aucun autre moteur de graphique dans le périmètre (grep `apexcharts|echarts` vide).
Instances Chart.js à plein régime (comptées par les `<DonutChartCard`/`<Bar` du template): 1 Bar (EventRevenueByShopChart `:120`) + 13 donuts = ShopDistributionPieChart 3, TransactionCategoryMixChart 2 (`TransactionCategoryMixChart.vue:31,49`), MenuItemRevenueDistribution 3 (`:91,109,127`), ArticleDimensionDonuts 3 (`:17,36,57`), PromotionSection 2 (`:22,41`). S'ajoutent GenericByEventChart (1 Bar) si un KPI est cliqué, et la timeline (hors périmètre). Un DonutChartCard en `loading` n'instancie pas le `<Doughnut>` (`DonutChartCard.vue:23` branche `v-if="loading"`).

Comportement vue-chartjs important: son watch sur `[options, data]` est `deep: true` (`node_modules/vue-chartjs/dist/index.js:164-203`) et appelle `chart.update` dans un `nextTick`. Une option recréée (computed non stable) déclenche donc `setOptions` + `update` à chaque recalcul.

## 3. Appels API, composant par composant

Constat central: AUCUN composant du périmètre n'appelle le réseau. Grep `api|axios|fetch(|apiClient` sur panels, charts, tables, dialogs, AggregationGapAlert: aucune occurrence d'appel HTTP. Tous reçoivent leurs données par props (venant des composables d'AnalyseView: `chartRecords` `AnalyseView.vue:1345`, `articleRecords` `:1417`, `itemLevelRecords` `:1158`, `filteredBaskets` `:1261`). Lectures directes du store Vuex `analyse` (sans dispatch): filtres (`ShopDistributionPieChart.vue:136-138`, `MenuItemRevenueDistribution.vue:219-221`, `ArticleDimensionDonuts.vue:136`, `PromotionSection.vue:120`), `menuItems` (`MenuItemsByShopTable.vue:313-327`, `SummaryPanel.vue:411`), `productTypesList`/`productCategoriesList` (`MenuItemRevenueDistribution.vue:307-309`), `configContextLoading` (`ShopDistributionPieChart.vue:170`).

Seuls chargements différés propres au périmètre:

| Déclencheur | Appel | Fonction (fichier:ligne) | Séquentiel/bloque le rendu ? | Cache | Coût |
|---|---|---|---|---|---|
| Premier envoi dans l'assistant (SummaryPanel), `useSemantic` ON par défaut (`SummaryPanel.vue:443`) | `import('@/utils/analyseAssistantSemantic')` puis `import('@huggingface/transformers')` et téléchargement du modèle `Xenova/multilingual-e5-small`, environ 120 Mo quantifié d'après le commentaire de `analyseAssistantSemantic.js:9` | `ensureSemanticLoaded` `SummaryPanel.vue:450-465`, `runAnalyze` `:467-488` | await dans `runAnalyze`, bloque la réponse de l'assistant, pas le rendu de la page. Attend aussi un `setTimeout(120)` fixe (`:480`) | cache navigateur du modèle (non vérifié) | 120 Mo à la première question (valeur du commentaire du code, non mesurée) |
| Clic export Excel du panneau ShopPerformance | `import('xlsx')` | `ShopPerformanceByTransactionRate.vue` fonction `exportExcel` | clic, hors chemin critique | n/a | chunk xlsx chargé à la demande, bien |

Source des paniers (props de TransactionCategoryMixChart, calcul dans le composable `useTransactionBaskets(filteredEvents)`, `AnalyseView.vue:1212-1218`): endpoint dédié `/transaction-baskets` d'après le commentaire `AnalyseView.vue:1208-1210`. Détail réseau/SQL: voir section "Source paniers" plus bas si lu, sinon non vérifié.

## 4. Cascade au premier affichage

Seule la partie rendu relève de ce périmètre (le réseau est dans les composables d'AnalyseView, autres rapports).

- t0: AnalyseView est monté. Les 17 composants du périmètre sont déjà dans son chunk (imports statiques `AnalyseView.vue:885-906`). Montés tout de suite: AggregationGapAlert, ShopDistributionPieChart (3 donuts en skeleton, `:loading=chartsLoading`), TransactionCategoryMixChart (2 donuts en skeleton si `basketsLoading`), SummaryPanel (3 listes vides), EventRevenueByShopChart remplacé par `v-skeleton-loader` tant que `chartsLoading` (`AnalyseView.vue:665-667`). FinancialMetricsGrid remplacé par 5 skeletons (`:544-548`).
- `chartsLoading` = `kpiSourceState==='loading'` ou (`enriching` et aucun record) (`AnalyseView.vue:1081-1083`). Tant qu'il est vrai, MenuItemRevenueDistribution, PromotionSection et MenuItemsByShopTable ne sont PAS montés (`<template v-else>` `:714`), seulement 2 skeletons (`:707-710`). Les 6 donuts article/dimension et le tableau sont donc différés jusqu'à la fin de la phase 2.
- t1 (records prêts): en un seul passage de rendu, `chartRecords` alimente en parallèle SummaryPanel (3 agrégations), ShopDistributionPieChart (groupes PdV/type/zone + total), EventRevenueByShopChart (1 agrégation + 1 dataset par PdV), FinancialMetricsGrid. Puis les 3 composants du `v-else` se montent: MenuItemRevenueDistribution (4 `groupBy` + 3 donuts) avec ArticleDimensionDonuts (3 donuts), PromotionSection (2 donuts), MenuItemsByShopTable (`aggregateByShop`, pagination 15 PdV). Au total 1 Bar + 13 donuts s'instancient dans la même fenêtre.
- Chemin critique de ce périmètre: la fin de `chartsLoading` bloque le montage de 8 des 14 canvas et du tableau; la dimension article (`articleDimensionsStatus`) est un chargement différé séparé (donuts industriel/marque/fournisseur/promotion en skeleton tant que `status` vaut `loading` ou `idle`, `ArticleDimensionDonuts.vue:116`, `PromotionSection.vue:100`).
- À chaque clic de filtre ensuite: voir problème 3, tous les composants recalculent leurs agrégats sur le même tableau, avec le voile `filtersRecomputing` (DonutChartCard et SummaryPanel utilisent `useFilters`, `DonutChartCard.vue:20`, `SummaryPanel.vue:378`).

## 5. Problèmes de performance

1. Aucun chargement paresseux dans le périmètre. Tous les imports sont statiques (`AnalyseView.vue:885-906`), y compris les composants montés seulement sur clic (GenericByEventChart `:589`, ShopPerformanceByTransactionRate `:564`, FilterEditorPanel `:763`) et les deux dialogs (`:841`, `:850`). Aucun `defineAsyncComponent` dans AnalyseView. Impact: bas à moyen (taille du chunk Analyse, non mesurée). Pages: Analyse. LiveView importe aussi 3 de ces composants (`LiveView.vue:182-184`).
2. 14 canvas Chart.js (1 Bar + 13 donuts) se montent ensemble à la fin de `chartsLoading`, sans IntersectionObserver ni montage progressif, alors que 8 sont sous la ligne de flottaison (article, dimensions, promotion). Preuves: comptage section 2, `AnalyseView.vue:714-755`. Impact: moyen (coût de création Chart.js x14 + animation 200 ms chacun, `DonutChartCard.vue` options `animation: { duration: 200 }`). Pages: Analyse, Live (3 composants).
3. Le même tableau de records est parcouru indépendamment par une dizaine de computed à chaque changement de filtre, sans index partagé: SummaryPanel `computeTopShops/Events/Items` (`SummaryPanel.vue:507-531`, 3 passes + 3 `reduce` de max `:542-551`), ShopDistributionPieChart `totalRevenue` + `buildShopDistributionGroups` (`:68-77`), EventRevenueByShopChart `aggregated` (`:278-398`), MenuItemRevenueDistribution `totalRevenue` + 4 `groupBy` (`:230-326`), MenuItemsByShopTable `aggregateByShop` (`:460-467`), GenericByEventChart `itemLevelTotalsByEvent` (si ouvert), PromotionSection et ArticleDimensionDonuts `entriesToDonut` (corps non lu). Impact: moyen, croissant avec `articleRecords` (grain event x PdV x article). Pages: Analyse, Live.
4. EventRevenueByShopChart crée un dataset par PdV (ou type) et non seulement pour la légende de 5 (`:402-410`, `:427-443`): O(PdV x events) points, avec 3 tableaux de couleurs par dataset (`perBarColors`, `perBarBorderColor`, `perBarBorderWidth`, `:428-432`). vue-chartjs relit `data` en watch profond (`vue-chartjs/dist/index.js:164-203`) puis `setDatasets` + `chart.update`, ce qui retraverse tous les points à chaque recalcul. Impact: moyen (77 events cités dans les commentaires d'AnalyseView `:520-522`). Mesure non faite.
5. SummaryPanel: `useSemantic` vaut true par défaut (`:443`); à la première question l'assistant importe `@huggingface/transformers` et télécharge un modèle de l'ordre de 120 Mo selon le commentaire de `analyseAssistantSemantic.js:9` (valeur du code, non mesurée), précédé d'une attente fixe de 120 ms (`:480`). L'import est bien dynamique (`:453`, `analyseAssistantSemantic.js:173`), donc rien au chargement de la page. Impact: bas pour la page, haut pour la première question. Pages: Analyse.
6. MenuItemsByShopTable (829 lignes): la recherche n'est pas anti-rebond (`v-model="search"` `:30`, aucun `debounce`) et `filteredShops` recopie chaque PdV (`{ ...s, items }`, `:478-493`) même sans requête, avec 4 `toLowerCase()` par ligne article en recherche libre (`:485-490`). Le DOM est borné: 15 PdV par page (`:419`), 25 lignes par PdV (`:420`), corps de panneau Vuetify à montage paresseux par défaut (non vérifié sur ce point). La vue inverse `items`/`filteredItems` est paresseuse (computed non lus tant que `tableView!=='items'`). Impact: bas à moyen.
7. TransactionCategoryMixChart: deux regroupements complets (`byCategory`, `byItem`, `:70-80`) sur des paniers pré-groupés par event x minute x PdV x combinaison (description du contrôleur `space-analytics.controller.ts:80-91`), donc un volume nettement plus grand que le nombre de tickets. Re-exécutés à chaque filtre via `filteredBaskets` (`AnalyseView.vue:1261`). Réseau: `GET /spaces/:id/transaction-baskets?eventIds=...` par paquets de 6 events (`space.api.js:257,296-297`), cache session LRU de 30 entrées (`space.api.js:142`), lecture SQL sur `SpaceBasketMinuteAgg` (`basket-agg-read.sql.ts:5`), clé Redis `spaces:baskets:...` (`event-batch-cache.ts:17`). Impact: moyen, taille de réponse non mesurée. Pages: Analyse, Live.
8. Code mort probable: `dialogs/ByEventChartDialog.vue` (73 lignes) n'est importé nulle part. Impact: nul à l'exécution.
9. DonutChartCard est instancié 13 fois avec chacun son `useTheme`, `useFilters`, `useI18n` et trois watch (`DonutChartCard.vue:100-101`) plus deux computed de décalage; coût unitaire faible, à mesurer en profil. Impact: bas.

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Frontend: `defineAsyncComponent` pour GenericByEventChart, ShopPerformanceByTransactionRate, FilterEditorPanel, ShopItemEventsDialog, UnalignedEventsDialog (montés sur clic) | chunk Analyse plus léger, moins de setup au premier rendu | bas (états de chargement à gérer) | S | `AnalyseView.vue:885-906` |
| Frontend: monter MenuItemRevenueDistribution, ArticleDimensionDonuts, PromotionSection quand ils approchent du viewport (IntersectionObserver / `v-lazy` Vuetify) | moins de canvas créés au pic, `chartsLoading` se termine plus vite en perçu | moyen (hauteur réservée pour éviter les sauts de mise en page) | M | `AnalyseView.vue:714-755`, composants tables |
| Frontend: un seul pré-calcul partagé (index par PdV, par event, par article) calculé une fois dans le parent et passé en props, au lieu de 10 parcours | CPU par clic de filtre divisé, surtout sur gros périmètres | moyen (couplage, tests) | L | `AnalyseView.vue`, `utils/analyseAggregations`, `utils/reportJ1PerfTables.js`, `MenuItemRevenueDistribution.vue`, `ShopDistributionPieChart.vue` |
| Frontend: EventRevenueByShopChart ne construire des datasets que pour les N plus gros PdV + un dataset "Autres" | moins de points Chart.js et de traversées profondes | bas (tooltip à adapter) | M | `EventRevenueByShopChart.vue:402-443` |
| Frontend: anti-rebond 200 ms sur la recherche de MenuItemsByShopTable et ne pas copier les PdV quand `q` est vide | recherche fluide | bas | S | `MenuItemsByShopTable.vue:30,472-495` |
| Frontend: mettre `useSemantic` à false par défaut ou précharger au repos avec confirmation (modèle ~120 Mo) | évite un téléchargement lourd à la première question | métier (qualité des réponses) | S | `SummaryPanel.vue:443` |
| Frontend: supprimer `ByEventChartDialog.vue` après confirmation | code en moins | bas | S | `dialogs/ByEventChartDialog.vue` |
| Backend/SQL: mesurer la taille de réponse de `transaction-baskets` pour un gros espace; si grande, ajouter un mode de grain sans minute pour Analyse (la minute ne sert qu'au filtre horaire) | payload et mémoire réduits | moyen (le filtre horaire en dépend) | M | `basket-agg-read.sql.ts`, `space-analytics.controller.ts:80`, `space.api.js:257` |

## 7. Points non vérifiés

- Mesures réelles: temps de montage des 14 canvas, durée d'un recalcul de filtre par composant, taille du chunk Analyse, taille de la réponse `transaction-baskets` (aucun profil ni Network lancé, lecture seule).
- Non lus en détail: corps de `MenuItemRevenueDistribution.vue` (hors structure et `groupBy`), `ArticleDimensionDonuts.vue`/`PromotionSection.vue` (fonction `entriesToDonut`), `EventMetricFooter.vue`, `FinancialMetricsGrid.vue` template, `KpiCard`, `aggregateByShop`/`aggregateByItem`/`buildShopDistributionGroups` internes, `barColorFor`, `externalTooltipHandler`, corps de `ShopItemEventsDialog` (`eventsList` `:91-113`), `FilterEditorPanel` template et `CheckboxListFilter`.
- Code SQL de `basket-agg-read.sql.ts` et service qui l'appelle non ouverts (seuls le contrôleur, ses commentaires et le nom du fichier ont été lus); index et EXPLAIN non vérifiés.
- Le montage paresseux du contenu des `v-expansion-panel` de MenuItemsByShopTable est une propriété par défaut de Vuetify 3 (option `eager` absente d'après un grep), non confirmée par rendu.
- Comportement de `useFilters` (`filtersRecomputing` singleton ou par instance) et coût de 14 abonnements: non lu.
- La route d'AnalyseView est-elle chargée en lazy import: non vérifié dans ce rapport (voir rapport orchestration).
