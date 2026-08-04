# BUG-298-01 — Analyse : le graphe « Coût par event » affiche 0 pour tous les events (source shop-level sans article)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse (graphe by-event ouvert au clic KPI + export dataset)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-04
- **Fichiers** : `src/components/analyse/charts/GenericByEventChart.vue`,
  `src/store/modules/analyse.js:1539-1578`, `src/utils/analyseAggregations.js`,
  `src/composables/useAnalyseDataset.js`

## Symptôme

Sur Analyse, cliquer le KPI **COST** du bandeau ouvre le graphe « Cost per event » :
toutes les barres sont absentes, l'axe Y va de « €0 » à « €1 » (échelle 0→1 par
défaut de Chart.js quand toutes les valeurs valent 0), alors que le KPI COST juste
au-dessus affiche un montant réel.

Reproduit sur l'espace Auxerre dans les deux cas :

- 1 event sélectionné (« France vs Pays-Bas Féminine ») — KPI COST 6 229,79 €,
  graphe vide ;
- aucun event sélectionné, période « All history » — 31 barres étiquetées, KPI
  COST 186 252,93 €, graphe à plat.

Le même graphe ouvert depuis le KPI **REVENUE** (ou Transactions, Spectateurs…)
affiche bien ses barres : seule la métrique coût est plate.

## Cause racine

Le coût n'existe que sur le grain **article** : il se résout par
`costMap[menuItemId] × quantité`, aucun record ne porte de champ `cost`.

Or le graphe est alimenté par `analyse/filteredEventAggregates`
(`store/modules/analyse.js:1539`), qui agrège `filteredShopGranularData` — les
lignes de l'API `shop-details`, **shop-level** : elles ne portent aucun
`menuItemId` (constat déjà écrit dans le code : `store/modules/analyse.js:974`
« shopGranularData (shop-details) est shop-level » et le docblock de
`composables/useAnalyseItemRecords.js`). Le calcul de la ligne 1564
(`event.cost += (costMap[r.menuItemId] || 0) * quantity`) lit donc
`costMap[undefined]` → 0 pour chaque record, donc **0 pour chaque event**.

Le KPI du bandeau, lui, ne passe pas par ce getter : il agrège `kpiRecords`
(`components/analyse/AnalyseView.vue:802`), c'est-à-dire `itemLevelRecords`
(`event-timeline`, grain article, avec `menuItemId`) via
`composables/useMetricsCalculator.js:53` — même formule, source correcte. D'où
l'écart KPI ≠ graphe.

`GenericByEventChart` possède pourtant un chemin de calcul correct depuis
`props.records` (item-level, lignes 132-153 avant fix) — il n'est **jamais
atteint** : `eventRows` court-circuite dès que `props.eventAggregates` est non
vide, ce qui est toujours le cas depuis AnalyseView.

## Correction

Branche `fix/bug-290-01-eventpredict-config-stockup` (pas de commit dédié à
l'heure de la fiche).

1. **`src/utils/analyseAggregations.js`** — nouvel export
   `itemLevelTotalsByEvent(records, costMap)` : `Map<eventId, { cost, revenue }>`
   bâtie depuis les records qui portent un `menuItemId`, avec la formule
   **verbatim** du KPI (`coût unitaire × quantité`). Volontairement **pas**
   `r.totalCost` : cette valeur est figée au pré-traitement
   (`preprocessTimelineRecords`) avec la costMap du moment, qui peut encore être
   vide en phase 1 (`composables/useSpaceData.js`) — la somme des barres doit
   égaler le KPI, pas un instantané périmé. Le CA est cumulé dans la même passe
   pour que toute marge dérivée reste d'un **seul grain**. Retourne une Map
   **vide** quand aucun record item-level n'est disponible.
2. **`GenericByEventChart.vue`** — `eventRows` superpose ce coût sur les lignes
   d'agrégats (et **seulement** `cost` : `margin` n'est pas une métrique de ce
   graphe, la dériver croiserait CA shop-level et coût item-level). Garde-fou : si
   la Map est vide, les agrégats sont renvoyés **intacts** — l'item-level se charge
   en asynchrone, un 0 transitoire serait un faux chiffre affiché.
3. **`composables/useAnalyseDataset.js`** — la table d'export « by event » ne
   portait ni coût ni marge (colonnes : event, date, CA, transactions,
   spectateurs, panier) ; **deux colonnes ajoutées**, **Coût** + **% Marge**,
   calculées par le même helper depuis `itemLevelRecords`. La marge divise le CA
   **item-level** par lui-même, jamais la colonne `revenue` (shop-level) : croiser
   les grains sortirait des marges négatives ou > 100 % dès qu'ils divergent.
   Colonnes ajoutées seulement si l'item-level est chargé (pas de colonne « 0 € »
   qui se lirait comme un chiffre) ; un event non couvert donne des cellules
   **vides**, jamais 0. La taille de `menuItemCostMap` entre dans la `signature`
   du dataset : sans ça, un dataset construit avant l'enrichissement phase 2
   resterait « valide » avec ses colonnes coût vides.
4. **Tests** — `tests/unit/analyseAggregations.spec.js` (4 cas sur le helper :
   somme, Map vide sur shop-level, article hors costMap, entrées absentes) et
   `tests/unit/analyseDataset.spec.js` (3 cas sur la table by-event : sans
   item-level → colonnes inchangées ; avec → coût 33,2 € et marge 76,29 % ; event
   non couvert → cellules nulles).

**Hors périmètre, décision JLH du 2026-08-04** (même cause racine, non corrigé
ici) :

- `currentPeriodTotals.cost`, `previousPeriodTotals.cost`,
  `yearOverYearTotals.cost` du store valent 0 (même formule sur du shop-level,
  `store/modules/analyse.js:86`), et le `margin` par event des agrégats vaut donc
  100 %. Non consommés par le bandeau : les KPI **et** leurs badges de variation
  lisent `itemSummary`, item-level (`AnalyseView.vue:1244`). Limite déjà
  documentée côté assistant (`utils/analyseAssistant.js:245-249`).
- **Métrique `transactions` du même graphe** : divergence de même nature, non
  corrigée. Le getter store compte `r.transactionCount` au grain minute × PdV,
  le KPI au grain minute × PdV × **produit** (limite déjà écrite dans
  `utils/analyseAssistant.js:105-110`) → les barres Transactions ne somment pas
  exactement au KPI TRANSAC. non plus. Antérieur à ce bug, hors périmètre choisi —
  ne pas le re-diagnostiquer comme BUG-298-01.
- Le cap `MAX_EVENTS = 50` de `useAnalyseItemRecords` (instance principale
  `AnalyseView.vue:677`, valeur par défaut) borne l'item-level : au-delà de 50
  events dans la période, les events non fetchés restent à coût 0 dans le graphe,
  **sans signalement à l'écran** — décision JLH de ne rien afficher pour l'instant.
  Le KPI COST du bandeau est tronqué de la même façon (il lit la même source), donc
  graphe et KPI restent cohérents entre eux.

## Risque de régression / à surveiller

- **Contrôle visuel requis** (aucun build ni navigateur dans la session) : ouvrir
  Analyse → clic KPI COST. La somme des barres doit égaler le KPI COST affiché
  au-dessus, sur 1 event sélectionné comme sur « All history ».
- Vérifier qu'aucune barre n'apparaît **pendant** le chargement item-level puis ne
  saute : tant que la Map est vide, les agrégats passent tels quels (barres à 0),
  puis les vraies valeurs arrivent en une fois.
- Espace avec > 50 events sur la période : barres à 0 attendues au-delà du cap
  (limite assumée, cf. ci-dessus) — ne pas la re-diagnostiquer comme ce bug.
- Export XLSX/CSV : la feuille « by event » a deux colonnes de plus. Cellules
  vides possibles en Coût / % Marge (events hors cap) — c'est voulu.
- Les autres métriques du graphe (CA, transactions, spectateurs, panier, per cap,
  transfo) ne sont pas touchées : seul `cost` (et `margin`, non affiché par ce
  graphe) est réécrit sur les lignes.

## Références

- `docs/modules/` — Analyse (graphes by-event, sources shop-level vs item-level).
- Sources divergentes shop-level / item-level : `utils/analyseAssistant.js:99-110`
  (repli getter documenté), `composables/useAnalyseItemRecords.js` (docblock).

---

JLH
