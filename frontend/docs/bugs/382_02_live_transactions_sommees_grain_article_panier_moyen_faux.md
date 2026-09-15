# BUG-382-02 : Live : transactions sommées au grain article, panier moyen et TX/min faux

- **Statut** : 🟡 Corrigé non déployé (branche `fix/live-realtime-379`, 2026-09-15)
- **Sévérité** : 🔴 Bloquant/impact business (KPIs Live faux d'un facteur ~3 devant le client)
- **Domaine** : Live
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-09-12 (remontée Bertrand : "ça prend toutes les lignes au lieu des transaction ID uniques, ce qui fausse le panier moyen"), mesuré le 2026-09-15
- **Fichiers** : `src/composables/useLiveData.js` (`txPerMinute`, `transactionCount`, `shopTotals`, `timelineByMinute`), `src/components/space-workspace/live/views/LiveView.vue` (`useMetricsCalculator` sans `transactionRecords`, `filteredShopTotals`), nouveau `src/utils/liveKpis.js`

## Symptôme

Écran Live AJA-Nice 12/09/2026, fenêtre 18:33 à 20:20 : bande KPI "Transactions 3 721", "Basket 4,90 €", carte "TX/MIN 61,40/min". Mesuré en base de prod sur la même fenêtre :

| Source | Transactions |
|---|---|
| `WeezeventTransaction` distinct (réel) | **1 299** |
| `SpaceRevenueMinuteAgg` (grain PdV, additif) | 1 299 |
| `SpaceRevenueMinuteItemAgg` sommé (grain article) | 3 739 |

L'écran affichait la somme du grain article. Panier moyen réel : 18 227 € / 1 299 = **14,03 €** (affiché 4,90 €). TX/min réel ~12/min (affiché 61). La transformation (transactions / spectateurs) était faussée dans les mêmes proportions.

## Cause racine

Le backend est correct : `COUNT(DISTINCT t."id")` dans les deux tables (BUG-135-01). Mais `SpaceRevenueMinuteItemAgg` est au grain (minute × PdV × article) : son `transactionsCount` compte les tickets distincts *de cet article*. Un panier à 3 articles différents y pèse 3 dès qu'on somme les lignes (documenté dans `useMetricsCalculator.js`, BUG-354-01).

Le fix BUG-354-01 (passer par `transaction-baskets`, une ligne par ticket) avait été fait pour l'Analyse (`AnalyseView.vue`, `transactionRecords`) mais jamais porté sur le Live :
- `LiveView.vue` appelait `useMetricsCalculator` sans `transactionRecords` → somme item-level pour la bande KPI (transactions, panier, transformation), alors que `filteredBasketRows` était déjà calculé juste au-dessus pour les donuts.
- `useLiveData.js` calculait `txPerMinute`, `transactionCount`, `avgSpendPerTx`, `shopTotals.transactionCount` et `timelineByMinute.transactions` depuis `timelineRows` (grain article).

## Correction

`src/utils/liveKpis.js` (fonctions pures, testées) : CA et quantités restent lus sur le grain article, les tickets viennent toujours des paniers (`sumBasketTransactions`, `basketTransactionsByShop`, `basketTransactionsByMinute`, `buildShopTotals`, `txPerMinuteFromBaskets`, `buildTimelineByMinute`).
- `useLiveData.js` : tous les compteurs de tickets passent par ces fonctions.
- `LiveView.vue` : `transactionRecords: filteredBasketRows` (null pendant le premier chargement, pas de 0 provisoire) et `filteredShopTotals` via `buildShopTotals`.
- Tests : `tests/unit/liveKpis.spec.js`.

## Risque de régression / à surveiller

- Les deux sources arrivent dans le même `Promise.all` de `useLiveData.refresh()` : pas d'état intermédiaire où les paniers manquent. Si un jour elles sont chargées séparément, repasser `transactionRecords` à `null` tant que les paniers ne sont pas terminaux (même règle qu'`AnalyseView`, `basketsSourceState`).
- Filtres PdV / article : les paniers se filtrent par combinaison (un panier mixte "contenant" un article filtré compte), même convention que l'Analyse ; le CA du grain article, lui, est strictement scopé à l'article. Le panier moyen filtré par article est donc "CA de l'article / tickets contenant l'article", cohérent avec l'Analyse.
- Vérifier après déploiement sur un match : bande KPI Live = carte d'accueil / Events Library (`Event.transactionCount`) au ticket près en fin de match.
- Reste ouvert (même écran) : la carte TX/MIN n'a pas de handler de clic (`LiveKpiRow.vue` n'écoute pas `@click` de `KpiCard`), à traiter séparément.

## Références

- BUG-135-01 (COUNT DISTINCT côté writer), BUG-354-01 (source paniers pour l'Analyse), BUG-379-02 (live temps réel, même branche).
