# Passation lot C (rendu PDF page 2)

Arrêt sur alerte budget 130k. AUCUN fichier de code n'a été écrit ni modifié : le lot a été entièrement consacré à l'analyse. Aucun test lancé.

## Fait
- Lecture du PLAN, de la passation B, de useReportJ1, ReportJ1Document, useComparisonReport et de ses briques, des composants écran.
- Conception complète (ci-dessous), prête à coder.

## Reste à faire (tout)
1. `utils/reportJ1Draw.js` : extraire `drawDonut` + `textColorOn` de ReportJ1Document.vue (l.~285-343 et ~270), et les faire utiliser par la page 1 sans changer le rendu.
2. `utils/reportJ1Page2Groups.js` : `groupSlotsByFilters(slots)` (clé = JSON trié des filtres), fusion `{...DEFAULT_FILTERS, ...snapshot, selectedEventIds:[eventJ1]}`.
3. `utils/reportJ1Page2Tables.js` : capacité de lignes selon la hauteur, `paginate(rows, cap)` -> `{shown, hiddenCount}`, aplatissement items-par-PdV, `clampAtWord`, légende donut qui tient dans la hauteur.
4. `utils/reportJ1Page2Build.js` : `buildSlotData(slot, ctx)` par kind (voir sources ci-dessous).
5. `composables/useReportJ1Page2Data.js`, `ReportJ1Page2.vue`, `print/Print{KpiBar,WidgetBar,Donut,PerfTable,RevenueBars,ItemsByShop}.vue`.
6. Intégration `useReportJ1.js` (avant `reportData.value = ...`, l.~215), montage conditionnel dans ReportJ1Document.vue, i18n FR/EN (après `rj1KindItemsByShop` : l.2162 EN, l.7834 FR), tests unitaires.
7. Export de `DEFAULT_FILTERS` dans `store/modules/analyse.js` (l.540, non exporté ; seul `getDefaultTimeRange` l.607 l'est) : ajouter `export const getDefaultFilters = () => DEFAULT_FILTERS()`.

## Sources de données par kind (fonctions existantes à réutiliser)
- kpi-bar : `chipsFromMetrics(metrics)` (utils/comparisonReportSnapshot.js l.55), formats de `headerKpis` (AnalyseView l.1828).
- widget-bar : `widgetsFromMetrics(metrics, rendementRaw)` (l.76) ; marge `formatDecimal(m,1)+'%'`, tx/min `formatDecimal(r,2)+'/min'` (FinancialMetricsGrid l.130/146).
- donut shop/shopType/shopArea : `buildShopDistributionGroups` (utils/shopDistribution.js).
- donut articleType/articleCategory/displayName : `groupBy` (utils/analyseAggregations.js) avec `resolveItemType/Category`, top 10 pour displayName (logique dans MenuItemRevenueDistribution.vue, locale au composant).
- donut industrial/brand/supplier/promotion/promotionType : `industrialBreakdown`, `brandBreakdown`, `supplierCostBreakdown`, `promotionBreakdown`, `promotionTypeBreakdown` + `entriesToDonut` (utils/articleDimensionBreakdown.js) ; index null -> status error.
- donut basketMix/basketMixItem : `groupBasketsByCombo` (utils/transactionBaskets.js), topN 19.
- perf-table : calcul enfermé dans SummaryPanel.vue (`topShops` l.~160, `topEvents`, `topItems`) : à extraire en util pur (tri CA desc, mode total).
- revenue-bars : `groupBy(records, r => r.shopName, r => r.revenue)`.
- items-by-shop : `aggregateByShop(articleRecords)`.

## Chargement (piège central)
`useComparisonReport` n'est PAS appelable hors setup tel quel : `useAnalyseItemRecords` et `useTransactionBaskets` appellent `useRoute()`, `useRendementWidgets` appelle `useStore()` (vuex) ; `useComparisonPredictScenarios` appelle `onBeforeUnmount`. Solution prévue : capturer `getCurrentInstance().appContext.app` dans le setup de `useReportJ1` (appelé dans le setup d'AnalyseView), puis par groupe : `app.runWithContext(() => effectScope(true).run(() => useComparisonReport({ input: ref({kind:'event', eventIds:[ev.id]}), mainFilters: ref(filtres), spaceId, canView, translate })))`. Attendre via `watch` (timeout ~60 s) : `status` hors idle/loading, `dimensionsStatus` ready/error, `rendementCards.stockValue.loading` false. Groupes en séquence (le cache session de l'API évite de retélécharger l'event). `scope.stop()` à la fin. Prédicat `kind:'event'` de `buildComparisonFilters` remet à zéro les filtres niveau event, ce qui est voulu. Si l'event J+1 n'est pas dans `spaceAnalysableEvents`, status `empty`.

## Pièges
- html2canvas : pas d'`overflow:hidden` sur les éléments de texte (glyphes rognés) ; pas d'oklch ; troncature uniquement aux espaces. Les tokens `var(--fs-*)` sont déjà utilisés par la page 1.
- Les styles scoped de ReportJ1Document ne s'appliquent pas aux enfants : ReportJ1Page2 doit porter ses propres styles (classe `rj1-page` sur sa racine pour la boucle de capture de `renderPdf`).
- Géométrie estimée : zone grille ~742 x 930 px, case 1x1 ~366 x 300.
- `useReportJ1` n'attend que 2 nextTick : les données page 2 doivent être prêtes avant de poser `reportData`.
- Couleur des catégories par type parent (MenuItemRevenueDistribution) non reproduite dans le plan (palette simple).

## Tests
Aucun lancé. Les specs reportJ1Grid et reportJ1FilterSnapshot (lot B : 15 et 9 OK) n'ont pas été relancés.

## C1 fait / reste (mise à jour)
Fait (fonctions pures, tests OK) : `utils/reportJ1Draw.js` (drawDonut, textColorOn, utilisés par ReportJ1Document), `getDefaultFilters` exporté de `store/modules/analyse.js`, `utils/reportJ1Page2Groups.js`, `utils/reportJ1Page2Tables.js`, `utils/reportJ1PerfTables.js` (SummaryPanel l'utilise), `utils/reportJ1Page2Build.js` (`buildSlotData(slot, ctx)`), specs `reportJ1Page2Groups/Tables/Build`.
Choix : donuts shop* sur `chartRecords`, article* et dimensions sur `articleRecords`, paniers sur `baskets` (top 19) ; perf-table items sur `itemRecords` sinon `articleRecords` ; `options.metric` = 'quantity' donne valueFormat 'count' (fournisseur et paniers : currency / count fixes) ; dimensions non prêtes ou sans index = status 'error'.
Reste (C2) : chargement des données par groupe (useReportJ1Page2Data), ReportJ1Page2.vue et print/*, intégration useReportJ1, i18n. Non fait ici : recette navigateur de SummaryPanel et de la page 1 (extraction drawDonut).
