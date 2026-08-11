# BUG-311-02 — Estimation 0 : sliders % inopérants (base 0) et coûts invisibles

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business (suite immédiate de la démo FC Nantes, retour JLH 2026-08-11)
- **Domaine** : Event Predict (+ Réappro pour la double application)
- **Repo(s) concerné(s)** : `datafriday-frontend-backend/frontend` (aucun changement backend)
- **Découvert le** : 2026-08-11 (test manuel du mode Estimation 0, fiche 311_01)
- **Fichiers** : `src/components/EventPredictMenusSection.vue`, `src/components/EventPredictView.vue`,
  `src/utils/estimationMode.js`, `src/utils/stockPlanning.js`, `src/views/SpaceRestockView.vue`,
  `src/i18n/translations.js`

## Symptômes (3, constatés à l'écran en mode Estimation 0)

1. **Sliders shop/article inopérants** : « les ajustements partent de 100 % = 0, quand je monte le
   slider le pourcentage augmente mais les quantités ajustées restent à 0 ». Attendu (JLH) :
   partir de 0 et monter les QUANTITÉS de 0 à 1000, avec un champ pour étendre le max du curseur.
2. **Coûts invisibles** : aucune ligne n'affiche « Coût … » ni « Marge … » ; la sidebar affiche
   Coût ajusté `0,00 €` et Marge ajustée `100,00 %`.
3. (Découvert en creusant, pas encore visible en démo) **Double application du %** dans le pont
   Réappro/besoin pour les lignes manuelles.

## Causes racines

### 1. Sliders % sur une base 0

Les fan-out shop (`handleShopAdjustment`) et article (`handleItemAdjustment`) écrivaient un **%**
dans `quantityAdjustments`, appliqué partout en `round(base × %/100)`. La mécanique était juste
(4 chemins l'appliquaient déjà à la quantité manuelle : grille `getAdjustedQuantity`, sidebar
`manualQuantityRecords`, Stock up, `stockPlanning`), mais en Estimation 0 la base prédite est 0
partout et les quantités manuelles partent de 0 → `0 × % = 0`. Un % ne peut pas créer de quantité.

### 2. Coûts : la seule source du mode estimation était vide

- Lignes de grille : les objets d'assignation Space Menu sont **slim**
  (`{id,name,basePrice,category,picture,available,hasRecipe,missingIngredients}` —
  `EventPredictView.loadShopMenuAssignment`, endpoint `/space-menu/shop/:id/items` qui ne porte
  AUCUN champ de coût). `itemUnitCost` ne testait que `item.unitCost` / `item.totalCost` /
  `menuItemCostMap[id]` → tout manquait → spans coût/marge cachés (`v-if != null`).
- Sidebar : `manualQuantityRecords` (SEUL contributeur de coût quand la timeline est vide) lisait
  `this.menuItemCostMap` — le **snapshot local figé au `loadAll`** (hazard documenté sur
  `effectiveMenuItemCostMap`) — et n'avait **aucun repli** là où le prix en a trois.
- Fond structurel : `menuItemCostMap` est construit depuis `mi.cost ?? mi.costPerUnit ?? mi.unitCost`
  (`useSpaceData.js`), champs que `/menu-items` **ne renvoie pas** (il renvoie `totalCost` +
  `costPerPiece`) → map `{}` en pratique. Hors estimation, le coût sidebar passait par
  `weezeventProductCostMap` (lui construit sur `mi.totalCost`) via la timeline — chemin mort quand
  la timeline est vide. → question #53 QUESTIONS_A_BERTRAND (`totalCost` batch vs `costPerPiece`).

### 3. Double application du % (réappro/besoin)

`manualQuantityRecords` émet des lignes `isManual: true` **déjà ajustées** (`raw × %`), embarquées
dans `buildPredictedRecords()` → version. Mais `buildStockRequirements` / `buildMenuItemDemand`
(via `usePredictedNeed`, `SpaceRestockView`) ré-appliquaient `version.quantityAdjustments` sur ces
quantités → 150 % devenait 225 %. Et `withManualRecords` (SpaceRestockView) injectait au contraire
du **brut** sous le même flag `isManual` — deux sémantiques contradictoires ; son commentaire
(« aucun % pour ces items → 100 % ») était faux depuis que le fan-out shop écrit des % sur les
couples manuels.

## Correction

### Sliders fan-out ABSOLUS en mode estimation

- **`estimationMode.js`** (utils purs, testés) : `uniformValue(values)` (valeur commune ou null =
  « Mixed »), `applyFanoutQuantity(current, keys, units)` (pose l'entier ≥ 0 sur chaque couple,
  immutable), `estimationSliderMax(scaleMax, current, fallback=1000)`.
- **`EventPredictMenusSection.vue`** : quand `estimationActive`, les sliders shop et article
  basculent en **unités absolues** (0 → échelle max, pas de %) et écrivent `manualQuantities` sur
  les mêmes ensembles de couples que leurs pendants % (items/PDV **cochés** — parité stricte) ;
  affichage `N u` ou « Mixed » ; reset = 0 (au lieu de 100 %). Champ « Échelle des curseurs (max) »
  dans le bandeau du mode (data `estimationScaleMax`, défaut 1000, plancher 10, UI seulement — les
  quantités posées, elles, partent dans le brouillon/version via le flux 311_01 inchangé).
  Hors mode estimation : sliders % strictement inchangés (v-if/v-else).

### Coûts

- **`itemUnitCost`** (MenusSection) : résolution **catalogue par id puis nom** (même démarche que
  `htUnitPrice`) avant le repli `menuItemCostMap` — les lignes slim retrouvent `totalCost`.
- **`manualQuantityRecords`** (View) : lit `effectiveMenuItemCostMap` (store-merged) + repli
  catalogue `mi.totalCost` (même convention que `StockUp.miUnitCost` et `weezeventProductCostMap`).
- Les 3 autres lecteurs internes du snapshot figé (`timelineRevenueTotals`, `totalPredictedCost`,
  `totalAdjustedCost`) basculés sur `effectiveMenuItemCostMap` (l'intention documentée du computed).

### Double application

- **`stockPlanning.js`** : nouveau `isManualOnlyForElement(records, element, menuItemId)` ;
  `buildStockRequirements` et `buildMenuItemDemand` neutralisent le % (100) quand le couple est
  alimenté **exclusivement** par des lignes `isManual` (déjà ajustées à la construction). Le chemin
  Live (`manualQuantities` en paramètre, base brute × %) est inchangé.
- **`withManualRecords`** (SpaceRestockView) : applique désormais `version.quantityAdjustments` à
  l'injection (sémantique unifiée : **une ligne `isManual` porte sa quantité finale**).

## Risque de régression / à surveiller

- Tests : `estimationMode.spec.js` 23 cas (dont fan-out, Mixed, échelle, clamp) ;
  `stockPlanningManualQuantities.spec.js` +3 cas double application (manuel 60 reste 60, non-manuel
  40×150 % → 60 inchangé, parité `buildMenuItemDemand`). Suite complète : 990 verts, 4 échecs
  PRÉEXISTANTS hors périmètre (`apiOrMock`, `spaceMenusInventory`, `eventDetailsEditor` — présents
  sur le HEAD avant modifs, issus du merge develop digifood).
- Hors mode estimation, aucun chemin modifié n'est atteint par les sliders (v-else) ; la
  neutralisation `isManualOnlyForElement` ne mord que sur des records `isManual: true`, qui
  n'existent que via `manualQuantityRecords`/`withManualRecords`.
- Le coût affiché reste `mi.totalCost` (coût du batch) tant que la question #53 (batch vs
  `costPerPiece`) n'est pas tranchée — le badge « coût aberrant » existant continue de signaler les
  valeurs suspectes.
- À retester manuellement (staging) : mode estimation → slider shop pose N unités sur tous les
  items cochés → champ échelle étend le curseur au-delà de 1000 → coût/marge visibles sur les
  lignes et dans la sidebar → « Enregistrer sous » → Réappro : quantités NON doublées (150 % ≠
  225 %).

## Références

- Fiche 311_01 (mode Estimation 0 — le socle, inchangé).
- Fiche 290-01 (index quantités partagé ; règle « ajusté = 0 → ligne supprimée » toujours vraie :
  un slider absolu à 0 sort la ligne de la feuille de charge, comportement connu).
- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` § Estimation 0 (mis à jour).
- QUESTIONS_A_BERTRAND #53 (coût unitaire canonique : `totalCost` vs `costPerPiece`).

JLH
