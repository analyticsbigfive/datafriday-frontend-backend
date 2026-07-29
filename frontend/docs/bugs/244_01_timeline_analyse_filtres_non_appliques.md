# BUG-244-01 — Timeline Analyse : 5 filtres sur 6 ne l'atteignaient pas, et 2 des 3 props passées étaient inertes

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (la timeline affichait un périmètre différent du reste de la page, sans
  aucun signal)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-29 · **Corrigé le** : 2026-07-29 (JLH)
- **Fichiers** : [`src/components/analyse/AnalyseView.vue`](../../src/components/analyse/AnalyseView.vue),
  [`src/components/analyse/charts/EventTimelineChart.vue`](../../src/components/analyse/charts/EventTimelineChart.vue),
  [`src/utils/analyseDimensions.js`](../../src/utils/analyseDimensions.js),
  [`src/composables/useReconciliationContext.js`](../../src/composables/useReconciliationContext.js)

## Symptôme

Signalé par l'utilisateur : **cliquer une ligne d'« Item performance » ne changeait rien à la
timeline**. Le clic posait pourtant bien le filtre (un chip apparaissait, les tables articles se
restreignaient) — seule la timeline restait sur l'intégralité des ventes.

Généralisé, sur les 6 dimensions de filtrage item-level :

| Filtre | Atteignait la timeline ? |
|---|---|
| `selectedShopIds` (PdV) | ✅ seul filtre opérant |
| `selectedShopTypes` (type de PdV) | ❌ prop passée mais **inerte** |
| `selectedShopAreas` (zone) | ❌ prop passée mais **inerte** |
| `selectedMenuItemIds` (article) | ❌ jamais passée |
| `selectedMenuItemTypes` | ❌ jamais passée |
| `selectedMenuItemCategories` | ❌ jamais passée |

La timeline montrait donc un périmètre différent de tous les autres widgets de la page, en silence —
le pire cas pour un outil d'analyse, puisque rien n'indique que les deux chiffres ne portent pas sur
le même ensemble.

## Cause racine

**Deux causes superposées.**

**1. La timeline ne traverse aucun filtre.** `useAnalyseTimeline` fait son **propre** appel réseau
(`getSpaceEventTimelineBatch`) et expose `eventTimelineData`, qui était passé tel quel au graphique.
Ces données ne passent ni par le getter store `filteredShopGranularData`, ni par le prédicat
item-level `buildItemFilterPredicate` que consomment les donuts et les tables. C'est un instantané
figé au moment du chargement.

**2. Le filtrage interne au graphique était à moitié mort.** `EventTimelineChart` possède bien une
fonction `passesFilters`, mais :

- les branches `selectedShopTypes` et `selectedShopAreas` sont gardées par
  `&& props.elementIdToTypesMap` / `&& props.elementIdToAreaMap` — deux maps qui valent `null` par
  défaut et qu'`AnalyseView` **ne passait pas**. La garde court-circuitait donc avant toute
  comparaison : les props étaient transmises, le filtre ne s'appliquait jamais ;
- les props `selectedMenuItems` / `selectedTypes` / `selectedCategories` existent sur le composant
  mais n'étaient pas passées du tout (`:menu-items="[]"` était même explicite).

## Correction

**Principe retenu : pré-filtrer dans le parent, ne pas passer les maps manquantes.**

Compléter les props aurait « marché » mais recréé le bug dans un second dialecte. Les donuts groupent
sur des champs **réconciliés** (`reconcileRecord` écrit `menuItemType`/`menuItemCategory`, avec repli
sur la sentinelle `UNATTACHED_ITEM_KEY`), alors que les lignes brutes de la timeline ne le sont pas :
filtrer sur la valeur backend brute aurait fait que cliquer la part grise « Non rattachés » — qui
émet la sentinelle — ne matche **aucune** ligne. C'est la règle d'or déjà écrite dans
`analyseDimensions.js` : un graphique qui groupe via `resolveX` exige que le filtre utilise le même
`resolveX`.

1. **`buildItemFilterPredicate` extraite** d'`AnalyseView.vue` vers
   [`analyseDimensions.js`](../../src/utils/analyseDimensions.js). Elle a désormais trois
   consommateurs (item-level réel, records article des scénarios Predict, timeline) et devient
   testable unitairement.
2. **Contexte de réconciliation unifié** — nouveau composable
   [`useReconciliationContext.js`](../../src/composables/useReconciliationContext.js). Il en existait
   **deux constructions séparées** (`AnalyseView.vue` et `useAnalyseItemRecords.js`), vérifiées
   identiques champ pour champ au moment du correctif. Les fusionner ferme le risque qu'une même
   ligne reçoive deux catégories différentes selon le consommateur — auquel cas cliquer une part de
   donut filtrerait la timeline à zéro, exactement ce qu'on corrige ici.
3. **Deux computeds dans `AnalyseView`**, calqués sur le découpage
   `reconciledShopGranularData` / `filteredShopGranularData` du store :
   `reconciledTimelineData` (ne dépend pas des filtres → Vue la garde en cache d'un clic à l'autre,
   c'est la moitié coûteuse) puis `filteredTimelineData`.
4. **Template** : `:timeline-data="filteredTimelineData"`, et les 3 props de filtre **retirées** —
   les garder ferait tourner deux implémentations de filtrage sur le même tableau.
5. **`skipMinute: true` sur le prédicat de la timeline**, obligatoire et non cosmétique : la timeline
   **écrit** `selectedTimeRange`. L'appliquer à sa propre entrée rétrécit ses labels, ce qui redéfinit
   à quoi correspond un même pourcentage de curseur, que le drag suivant réémet → rétrécissement
   monotone jusqu'au vide.
6. **Nouvelle prop additive `filterSignature` sur `EventTimelineChart`** + watcher appelant le
   `resetRange()` existant. Sans elle on livrait une régression : `rangePct` est local au composant,
   donc après un changement de filtre les mêmes pourcentages désigneraient d'autres heures sans
   réémission — le `selectedTimeRange` du store divergerait silencieusement du curseur affiché.
   Défaut `''` → le watcher ne se déclenche jamais pour `EventPredictView`, seul autre consommateur
   du graphique. Volontairement **pas** ajoutée au `:key` : remonter le canvas en cours d'update est
   le crash Chart.js `ownerDocument` contre lequel trois commentaires existants mettent en garde.
7. **Watcher de refetch en mode moyenne uniquement** : un filtre qui change l'*ensemble* des events
   (dates, type d'event, curseurs billetterie) doit relancer le fetch, aucun filtrage client ne
   pouvant inventer un event absent du snapshot. Restreint à `eventId === 'average'` pour ne pas
   entrer en conflit avec le watcher `selectedEventIds`, et comparé par **contenu** car
   `filteredEvents` produit un tableau neuf à chaque évaluation.

`useAnalyseTimeline.js` n'est **pas** modifié, délibérément : la réconciliation doit vivre dans un
computed et non dans le `load()` async, sinon elle fige l'état du catalogue à l'instant du fetch
alors que celui-ci arrive à son propre rythme.

**Tests** : nouveau [`tests/unit/analyseTimelineFilters.spec.js`](../../tests/unit/analyseTimelineFilters.spec.js),
12 cas — les 6 dimensions, la combinaison en ET, l'insensibilité à la casse, les deux comportements de
`skipMinute`, et surtout **le cas « Non rattachés »** qui verrouille l'invariant de réconciliation.

## Risque de régression / à surveiller

- **Non vérifié en navigateur** (pas de `pnpm dev` dans cette session). À valider :
  - clic sur une ligne d'« Item performance », sur une part de donut (article / type / catégorie /
    type de PdV / zone), sur une ligne PdV du panneau de droite **et sur une ligne du tableau
    « performance par PdV »** → la timeline suit dans les quatre cas ;
  - le curseur horaire revient à pleine largeur après tout changement de filtre ;
  - l'identique sur `/live` ; et surtout qu'ouvrir Event Predict laisse ses deux timelines (passée
    réelle et prédite) inchangées.
- Suite unitaire : 502 tests verts. 3 suites restent en échec
  (`apiOrMock`, `spaceMenusInventory`, `eventDetailsEditor`) — **pré-existantes**, vérifiées
  identiques avant et après par comparaison sur base propre : erreurs de chargement de module
  (`axios` en ESM sous Jest), sans rapport avec ce correctif.

### Défauts rendus VISIBLES par ce correctif, volontairement non corrigés ici

Chacun change l'agrégation Analyse pour tout tenant dont la couverture de mapping est imparfaite —
donc fiche et PR séparées :

1. **Un produit non mappé n'a aucun nom** dans `event-timeline` : le SQL sélectionne `mi.name` mais
   jamais `ti."productName"`, qui existe pourtant sur `SalesTransactionItem`. Ces lignes sortent de
   `reconcileRecord` par son **retour anticipé** (`mapStatus: 'noitem'`, catégorie vide) — un
   troisième bucket, distinct de `UNATTACHED_ITEM_KEY`. Conséquence directe : **la ligne `—`
   d'« Item performance » est inclicquable**. Avant, le clic ne faisait rien nulle part ; maintenant
   il vide la timeline. Correctif = un `COALESCE`, impact large.
2. **Les produits non mappés fusionnent entre eux** : la clé de groupe d'`aggregateTimeline` n'a
   aucun identifiant disponible pour eux, donc tous ceux d'un même (minute × PdV) se confondent.
3. **`resolveSeriesKey` écarte les lignes non mappées** de la ventilation par article → total
   timeline ≠ total KPI dès que la couverture est < 100 %.
### Fausse piste écartée — `ShopPerformanceByTransactionRate` émet bien un nom

À noter pour ne pas refaire le diagnostic : le retrait du repli `record.shopId` (l'ancien
`passesFilters` matchait `shopId` **OU** `shopName`) laissait craindre que le clic sur une ligne du
tableau « performance par PdV » vide la timeline, puisque
[`ShopPerformanceByTransactionRate.vue:57`](../../src/components/analyse/charts/ShopPerformanceByTransactionRate.vue)
fait `$emit('shop-click', shop.elementId)` là où les donuts émettent `r.shopName`.

**C'est faux** : dans [`useShopPerformance.js:53-59`](../../src/composables/useShopPerformance.js),
les trois champs sont initialisés à la même valeur —

```js
const id = r.shopName || '—'
s = { elementId: id, elementName: id, shopName: id, … }
```

et `elementId` n'est jamais réaffecté ailleurs (une seule occurrence de `elementId:` dans tout le
fichier ; `enrich()` ne fait qu'ajouter des métriques). `shop.elementId` **contient donc le nom du
PdV**. Le nom du champ est trompeur — hérité du modèle `SpaceElement` — mais la valeur est la bonne,
et le clic filtre correctement. Aucun correctif requis.

## Références

- [`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) § « Timeline event et item-level — indépendants
  de `shopGranularData` ».
- Correctif issu du même lot de travail que le graphique « catégories de produits par transaction »
  (lot B, non livré ici).

---

JLH
