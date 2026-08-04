# BUG-287-01 — Analyse : txn/min des PdV ignore la plage horaire de la timeline

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (métrique affichée sur un périmètre différent des CA/unités voisins, sans aucun signal)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-03 · **Corrigé le** : 2026-08-03 (JLH)
- **Fichiers** : [`src/composables/useShopPerformance.js`](../../src/composables/useShopPerformance.js),
  [`src/utils/shopPerformanceCompute.js`](../../src/utils/shopPerformanceCompute.js) (nouveau),
  [`src/components/analyse/AnalyseView.vue`](../../src/components/analyse/AnalyseView.vue)

## Symptôme

Page Analyse, panneau droit « Performance des PdV » (SummaryPanel). En posant une plage horaire
via le curseur de la Chronologie (ex. 21:50 → 22:10 sur AJA-Marseille), le CA et les unités de
chaque PdV se recalculent bien (6 A : 11 571,82 € → 1 621,61 €), mais la chip « txn/min » reste
identique (5.88 / 5.56 / 3.27…) : elle est toujours calculée sur l'évènement entier. Même
comportement sur le KPI header « tx/min » et le panneau cartes « Performance des shops par taux
de transaction ».

Repro : Analyse → sélectionner 1 event → ouvrir la Chronologie → réduire la plage horaire →
comparer les chips txn/min avant/après.

## Cause racine

Deux causes superposées dans `useShopPerformance.js` (état pré-fix) :

1. **Le calcul ne lisait jamais `filters.selectedTimeRange`.** `computeRatesFromTimeline`
   agrégait TOUTES les minutes de la timeline (`getSpaceEventTimelineBatch`), fetch brut qui ne
   traverse ni le getter store ni `buildItemFilterPredicate` — même famille de cause que
   BUG-244-01 (timeline non filtrée), ici côté métriques de débit.
2. **Aucune réactivité.** `shops` était un `ref` rempli une seule fois par `enrich()`,
   idempotent par clé d'eventIds : changer la plage horaire ne déclenchait aucun recalcul.

Cause secondaire pour les agrégats de base (CA/transactions du panneau cartes) :
`aggregateBaseShops` lit `shopGranularData` (shop-details, shop-level) qui n'a **pas de colonne
minute** — le filtre horaire y est structurellement un no-op (cf. le parse `new Date(r.minute)`
inopérant du getter `filteredShopGranularData`, `store/modules/analyse.js`).

## Correction

Branche `fix/bug-287-01-txn-min-plage-horaire`. 100 % front, aucun changement backend/SQL.

Décisions produit (tranchées par l'owner le 2026-08-03) :

1. **Fenêtrés** : `transactionRate`, `operatingMinutes`, et — fenêtre active — les agrégats de
   base du panneau cartes (`totalRevenue`/`totalTransactions`/`totalQuantity`/`eventCount`)
   recalculés depuis la timeline fenêtrée (« tout corriger maintenant »).
2. **PAS fenêtrés** : `first60MinTransactionRate` et `peakTransactionRate` restent plein
   évènement — un pic glissant de 15 min dans une fenêtre plus courte n'a pas de sens, et la
   1re heure post-doors sort le plus souvent de la fenêtre.
3. KPI header (`totalTransactionRate`) et export xlsx suivent automatiquement.

Implémentation :

- **`src/utils/shopPerformanceCompute.js` (nouveau)** : extraction en fonctions pures
  (testables Jest) de `aggregateBaseShops(records, events)` et
  `computeRatesFromTimeline(baseShops, events, timeline, { timeRange })` (+ accumulateurs
  fenêtrés `windowTxns`/`windowFirst`/`windowLast` par shop×event), et ajout de
  `aggregateShopsFromTimeline(timeline, events, timeRange)` — agrégats de base fenêtrés, même
  forme de sortie que `aggregateBaseShops`, `eventCount` = events avec ≥ 1 record dans la
  fenêtre (sinon « CA moyen / event » sous-estimé). Réutilise `isMinuteInRange`/`hasActiveRange`
  (`timelineBucketing.js`).
- **`useShopPerformance.js`** : `shops` passe de `ref` à `computed` dérivé de
  (`timelineData` shallowRef, `timelineEvents`, `timeRange`, `shopGranularData`). `enrich()`
  ne gate plus que le FETCH (`lastKey`) — le drag du curseur recalcule instantanément, zéro
  refetch. Micro-fix au passage : un échec de fetch remettait `lastKey` non vide → retry
  impossible ; désormais `lastKey = ''` en catch.
- **`AnalyseView.vue`** : injection
  `timeRange: computed(() => filters.value?.selectedTimeRange || null)` (le composable
  n'importe pas le store, pattern existant).

Tests : `tests/unit/shopPerformanceCompute.spec.js` (13 cas — régression sans range, fenêtrage
inclusif, bornes uniques, fenêtre vide sans NaN, alias shopId/shopName, first60/peak invariants
avec/sans range, agrégats fenêtrés + fallback `revenue`). Les 3 suites en échec au moment du fix
(`apiOrMock`, `spaceMenusInventory`, `eventDetailsEditor`) échouent aussi sans le fix —
préexistant sur develop, non lié.

## Risque de régression / à surveiller

- **Effet de bord assumé (correction de cohérence)** : `shops` étant désormais un computed sur
  `shopGranularData`, les agrégats de base réagissent aussi aux filtres PdV/type/zone quand la
  sélection d'events ne change pas — l'ancien `ref` restait figé jusqu'au prochain `enrich()`.
- **Écart connu, non corrigé ici** : sur le panneau cartes, quand la fenêtre s'efface on revient
  aux agrégats `shopGranularData` (shop-level) — un léger saut de CA est possible si les deux
  sources SQL divergent à la marge.
- **Predict + fenêtre** : la base fenêtrée vient de la timeline (passé seul) → les records
  prédictifs d'events futurs sortent du panneau cartes tant qu'une plage est posée. Scénario
  improbable (la plage est posée depuis la timeline Analyse) — pas de garde ajoutée.
- **Plage traversant minuit** (start > end) : ensemble vide — limitation préexistante de toute
  la timeline (`isMinuteInRange`), inchangée.
- Vérif manuelle : poser/effacer la plage panneau tx/min ouvert (recalcul instantané, aucun
  nouvel appel `/event-timeline` dans Network) ; « 1ère heure » et « Pic » identiques avec/sans
  plage ; export xlsx onglet « Performance des shops » fenêtré ; sans plage, valeurs strictement
  identiques au pré-fix.

## Références

- [`244_01_timeline_analyse_filtres_non_appliques.md`](244_01_timeline_analyse_filtres_non_appliques.md) — même famille (timeline = fetch brut hors filtres).
- [`../modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) — panneau « Performance des PdV ».
- `docs/STATISTIQUES_REFERENCE.md` §6.3 — double clé shopId/shopName des records timeline.
