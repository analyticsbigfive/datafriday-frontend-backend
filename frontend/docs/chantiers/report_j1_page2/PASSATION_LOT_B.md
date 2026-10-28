# Passation lot B (placement dans Analyse)

## Fait
- utils: reportJ1Page2Catalog.js, reportJ1Grid.js, reportJ1FilterSnapshot.js
- api/endpoints/report-layout.api.js ; composables useReportJ1Layout.js, useReportJ1Placement.js (provide/inject, instance créée dans AnalyseView)
- components/space-workspace/analyse/report-j1/ : ReportJ1AddButton, ReportJ1PlacementDrawer (v-navigation-drawer temporaire), ReportJ1GridPicker
- i18n FR/EN : clés rj1* (après anShopPerformance dans chaque bloc)
- Boutons + : header KPI (slot kpi-actions de WorkspaceAppHeader) et bande KPI mobile, FinancialMetricsGrid (nouveau prop readonly, wrapper .fmg-wrap), EventRevenueByShopChart, MenuItemsByShopTable, SummaryPanel (3 titres), DonutChartCard (prop reportVariant) pour 12 donuts.
- Tests : tests/unit/reportJ1Grid.spec.js (15 OK), reportJ1FilterSnapshot.spec.js (9 OK).

## Reste / pièges
- Lint : aucun eslint.config dans frontend, `npx eslint` échoue (ESLint 9 sans config). Non vérifié.
- Rien testé dans le navigateur (position du + sur la barre de widgets, bouton imbriqué dans le titre d'expansion-panel du SummaryPanel).
- Donut « Combinaisons de produits » (TransactionCategoryMixChart) sans variante : pas dans le contrat.
- Drawer = v-navigation-drawer temporaire à droite, pas ComparisonDrawer (celui-ci est une colonne de grille avec logique de layout).
- Pas de test des composables/composants Vue.
