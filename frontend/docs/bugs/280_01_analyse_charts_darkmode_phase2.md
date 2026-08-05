# BUG-280-01 — Charts Analyse : « phase 2 » dark mode (reportée depuis BUG-196) — titres gris foncé et cartes pastel illisibles en sombre

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟡 Mineur (page lisible globalement, titres/légendes/bandeaux illisibles)
- **Domaine** : Analyse & agrégation / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (audit dark mode complet ; dette déclarée « phase 2 » dans BUG-196 §exclusions) — JLH
- **Fichiers** : `src/components/analyse/charts/{GenericByEventChart,DonutChartCard,ShopPerformanceByTransactionRate,TransactionCategoryMixChart,ShopDistributionPieChart}.vue`

## Symptôme

Page `/spaces/:id` en thème sombre : titres de sections `#212121` et sous-titres `#757575`
quasi invisibles sur cartes `#1f2937` ; toggle de tri clair ; grille Chart.js `#EEEEEE`
éblouissante ; carte « Shop performance » en dégradé pastel violet clair avec textes indigo
foncés en ligne (`#4527A0`/`#0D47A1`/`#C2185B`) ; pagination de cette carte blanche (cf.
BUG-278).

## Cause racine

BUG-196 avait passé les 17 fichiers UI d'Analyse en dark mais déclarait explicitement les
charts Chart.js « phase 2 » (couleurs `<canvas>` hors CSS, à piloter en JS). Phase jamais
faite, sauf `EventTimelineChart` (traité dans BUG-198, devenu le modèle).

## Correction

Corrigé le 2026-08-02 (modèle `EventTimelineChart.vue` : `isDark` via `useTheme`, couleurs
canvas dérivées en JS, réactives au changement de thème) :

- `GenericByEventChart.vue` : `gridColor`/`tickColor` JS (clair strictement identique —
  `undefined` = défaut Chart.js) + bloc `.gbe--dark` (titres, toggle de tri).
- `DonutChartCard.vue` : `sliceBorderColor` JS (`#1f2937` en sombre, `#fff` en clair) + bloc
  `.donut-card--dark` (titres, légende, shimmer squelette).
- `ShopPerformanceByTransactionRate.vue` : 3 styles inline remplacés par classes (valeurs
  claires identiques) + bloc `--dark` : dégradé pastel → équivalent sombre même teinte
  (`#2E1A33→#1f2937`), accents `#4527A0→#b39ddb`, `#0D47A1→#90caf9`, `#C2185B→#f48fb1`,
  pagination = override BUG-278.
- `TransactionCategoryMixChart.vue` / `ShopDistributionPieChart.vue` : blocs `--dark` titres +
  `#b26a00→#fcd34d`.
- Vérifiés conformes, rien à faire : `LiveSaleSimulatorWidget.vue` (rouge de marque + panneaux
  déjà sombres), `panels/FinancialMetricsGrid.vue` (layout pur, délègue à `KpiCard`).

## Risque de régression / à surveiller

- Vérifier à l'écran le rendu clair des 5 charts (non modifié par construction — fallbacks et
  overrides gatés) et la bascule à chaud clair↔sombre (options Chart.js recalculées).
- Anomalie pré-existante notée, hors périmètre : `GenericByEventChart` importe `@/lib/chartjs`
  sans appeler `registerChartJs()` contrairement aux autres charts.

## Références

- [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) — déclarait cette
  phase 2. [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md) — modèle
  `EventTimelineChart`. [BUG-278](278_01_analyse_pagination_v_pagination_blanc_sur_sombre.md).
