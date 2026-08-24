# BUG-354-01 — Le compteur de transactions compte des LIGNES de ticket, pas des tickets

- **Statut** : 🟡 Corrigé non déployé (recalcul de l'historique à appliquer à la main)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux — fiche miroir api **BUG-135-01**
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/composables/useMetricsCalculator.js:59`, `src/utils/shopPerformanceCompute.js:162-165,191-195,253`, `src/composables/useShopPerformance.js`, `src/composables/useTransactionBaskets.js:5`, `src/utils/timelineBucketing.js:351-360`, `src/components/analyse/AnalyseView.vue:1378`

## Symptôme

Espace Le Mans FC, « Le Mans-Brest » du 22/08/2026 — Analyse : **13 925 transactions**.
Export Weezevent : **5 802 transactions uniques** pour **14 138 lignes de vente**.

Mesuré directement en base sur la fenêtre agrégée réelle (`2026-08-22 16:29` → `21:24` UTC) :

| Mesure | Valeur |
|---|---|
| lignes de vente (`COUNT(WeezeventTransactionItem.id)`) | **13 925** ← ce que la page affiche |
| tickets distincts (`COUNT(DISTINCT WeezeventTransaction.id)`) | **5 721** |
| unités (`SUM(quantity)`) | 25 867 |
| `Event.transactionCount` en base | **13 925** |

Conséquence directe sur le panier moyen : **4,71 €** affichés au lieu de **11,46 €** — invraisemblable
pour un panier de stade, et personne ne l'avait relevé. Le KPI transactions/minute est faux dans la
même proportion.

L'écart résiduel avec l'export (213 lignes, 81 tickets) est un axe **séparé** — complétude d'import
et bornes de fenêtre — à ne pas confondre avec l'erreur de comptage.

## Cause racine

Volet **backend** (détail dans la fiche miroir api BUG-135-01) : deux écrivains alimentaient
`SpaceRevenueMinuteAgg."transactionsCount"` avec des sémantiques **contradictoires** —
`aggregation.service.ts:477` écrivait `COUNT(ti."id")` (des lignes),
`space-aggregation.service.ts:174` écrivait `COUNT(DISTINCT t.id)` (des tickets).

Volet **frontend**, indépendant du précédent : la page ne lisait pas cette table pour les
transactions, mais **sommait le grain article**.

`getEventTimelineBatch` renvoie un `transactionCount` issu de `SpaceRevenueMinuteItemAgg`, dont le
grain inclut `weezeventProductId`. Sa valeur y est bien `COUNT(DISTINCT t."id")`, mais **par
produit** : un ticket contenant 3 articles distincts produit 3 lignes portant chacune 1. La colonne
n'est donc **pas additive** au-delà du grain article — et c'est exactement ce que faisaient
`useMetricsCalculator.js:59`, `shopPerformanceCompute.js:162-165` (txn/min), `analyseAggregations.js:394`
et `analyseAssistant.js:142,257`.

## Correction

**Source des transactions = les PANIERS.** L'endpoint `transaction-baskets`
(`api/src/features/spaces/spaces.service.ts:1613`) est le seul du code à préserver l'identité du
ticket : sa CTE produit **une ligne par transaction**, et le `COUNT(*)` extérieur est donc un
nombre de tickets, additif, filtrable par PdV et par minute. Il alimentait déjà le donut
« Répartition des catégories de produits par transaction » — le KPI et le donut publient désormais
le **même** nombre.

- `useMetricsCalculator.js` — nouvelle entrée `transactionRecords`. Quand elle est fournie, elle
  remplace la somme item-level. `null` (source pas encore chargée) ≠ `[]` (chargée, périmètre vide) :
  seul le second ramène 0, conformément à la règle « aucune valeur provisoire » de BUG-350-01.
- **La bande KPI a désormais DEUX sources canoniques.** `useTransactionBaskets` expose un
  `sourceState` à 3 valeurs (même contrat que l'item-level) et `resolveKpiSourceState` prend un
  `transactionState` : tant que l'une des deux sources n'a pas répondu, l'état est `'loading'` et la
  bande reste en squelette. Sans ça, la séquence au premier rendu était **0 → ~13 925 → 5 721** :
  `basketsLoading` vaut encore `false` avant que le batch parte, `filteredBaskets` vaut `[]`, puis
  le repli item-level s'affiche — exactement la valeur provisoire que BUG-350-01 a retirée.
  `transactionRecords` vaut `null` en Predict (les transactions y viennent des scénarios) et tant
  que `basketsSourceState === 'loading'`.
- `shopPerformanceCompute.js` — `totalTransactions` est posé par `computeRatesFromTimeline`
  lui-même, à partir de la source qu'on lui passe (les paniers). C'est le seul endroit qui résout
  déjà l'alias `shopName`/`shopId` (`aliasToPrimary`, dont le commentaire garde la trace d'un
  « rate 0 partout » causé par un lookup naïf) et qui applique la plage horaire. Un shop absent de
  la source garde sa valeur d'origine — jamais un `0` écrit par défaut.
- `useShopPerformance.js` — `loadAllTimelines` charge désormais **deux** sources en `Promise.allSettled`
  (timeline pour CA/quantités, paniers pour tickets et txn/min) ; une source KO n'emporte pas l'autre.
- **`useTransactionBaskets.js:5` — cap aligné sur `ITEM_LEVEL_EVENT_CAP` (50 → 100).** Sans ça, en
  vue « All history », le CA aurait été calculé sur 100 events et les transactions sur 50 :
  sous-comptage silencieux et panier moyen faux, exactement le défaut que BUG-350-01 / BUG-298-01
  interdisent. `truncatedEventCount` est exposé comme pour l'item-level.

Le champ `transactionCount` de `getEventTimelineBatch` est conservé (documenté comme non sommable
au-delà du grain article) pour ne pas casser les consommateurs restants.

**Coût assumé** : l'endpoint paniers est le dernier à scanner `WeezeventTransaction` brute (le commit
perf `8bd792a` a déplacé la timeline sur la pré-agrégat). Le KPI de tête dépend donc de la requête
la plus lourde de la page — acceptable sur un événement, à surveiller en multi-events.

## Risque de régression / à surveiller

- **Recalcul de l'historique obligatoire** — voir fiche api BUG-135-01 : migration SQL
  `20260824120000_fix_transactions_count`, appliquée à la main (ADR-0002). Tant qu'elle n'a pas
  tourné, `Event.transactionCount`, le RPC `get_space_shop_details` et le panier moyen restent faux.
  **Elle ne répare que 282 250 des 547 954 lignes** ; les 109 événements restants demandent une
  re-agrégation complète. Le rollup `Event.transactionCount` est volontairement **restreint aux
  événements entièrement rattachables** (196 sur 305) : un événement partiellement réparé donnerait
  une somme hybride, fausse et indétectable.
- **Deux définitions du panier moyen coexistent** : le rollup `Event.avgSpendPerTx` vient de
  `SpaceRevenueMinuteAgg.revenueHt` (remise déduite, pas de filtre `status`), la page le calcule
  depuis le CA paniers (remise non déduite, `status = 'V'` filtré). Écart de 0,53 € sur l'événement
  de test ; il grandira partout où il y a des promos. À trancher si l'un des deux devient la
  référence affichée.
- Vérification : `api/scripts/verify-event-analytics.ts --event=<Event.id>` sépare explicitement
  **lignes / unités / tickets**, MESURE la couverture de réparation de l'événement, et dit lequel des
  deux gestes il lui faut : appliquer la migration, ou re-agréger.

## Références

- Fiche miroir api : **BUG-135-01** (`api/docs/bugs/135_01_transactions_count_compte_des_lignes.md`).
- Fiches liées : [BUG-353-01](353_01_analyse_depend_du_spacemenu.md),
  [BUG-355-01](355_01_paniers_vides_espace_multi_integrations.md) — dont le correctif est un
  **prérequis** : sans lui, la source paniers est vide sur les espaces multi-intégrations.
- [BUG-350-01](350_01_ca_variable_home_analyse_bascule_source.md) — règle « aucune valeur
  provisoire », cap `MAX_EVENTS`, troncature signalée.

---

*JLH*
