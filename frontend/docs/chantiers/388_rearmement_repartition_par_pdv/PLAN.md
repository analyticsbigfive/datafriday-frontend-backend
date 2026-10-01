# Plan : Réarmement, répartition manuelle du besoin par PDV (étape 1)

Demande reçue le 2026-10-01 (Skype). Implémenté le 2026-10-01 sur `feat/388-rearmement-repartition-par-pdv` (non commité) : `utils/restockShopPercent.js`, `restock/drawers/RestockItemShopsDrawer.vue`, branchement dans SpaceRestockView. Décision d'implémentation à valider : sur un plan chargé, la garde de modification se déclenche à l'ouverture du drawer. Base : `production` (`f047ec89`).

## Demande (verbatim)

> Lorsqu'on augmente ou diminue les quantités sur le slider, les changements sont répartis sur l'ensemble
> des PDVs à l'étape suivante (Restock), peut-être de façon aléatoire ou par ordre alphabétique (à vérifier).
> Serait-il possible de donner la possibilité à l'étape 1 de faire une répartition manuelle par PDV pour chaque
> Menu Item (un peu comme dans Event Predict) ? Si c'est possible, utiliser la même méthode pour l'interface que
> sur Event Predict avec un bouton qui ouvre un drawer à gauche pour faire les changements manuellement par PDV.

Captures jointes : cartes de l'étape 1 « Items to stock » (Beurre doux motte, Bun - Burger) et drawer PDV
d'Event Predict (« Bloc 22bis »).

## Fonctionnement actuel (vérifié dans le code le 2026-10-01)

La répartition n'est ni aléatoire ni alphabétique : elle est proportionnelle, puis rendue non linéaire par le
calcul par PDV.

1. Le curseur est stocké par article de stock : `stockAdjustments[itemKey]`, avec
   `itemKey = id|||unit` (`stockItemKey`, `utils/stockPlanning.js:158`).
2. `adjustedQuantity()` (`SpaceRestockView.vue:4934`) applique ce même % au besoin prévu de chaque ligne
   PDV × article (`stockRowsRaw`, `SpaceRestockView.vue:2550`).
3. Par PDV, `liveRestockRowsAll` (`SpaceRestockView.vue:2749`) calcule : cible ajustée, moins le restant du PDV
   (Logistic, sinon Inventory), puis arrondi au colis entier supérieur.
4. Résultat : un PDV qui a du restant absorbe la hausse et ne bouge pas à l'étape 2, un petit PDV saute d'un
   colis entier. La liste de l'étape 2 est triée par PDV puis article (`SpaceRestockView.vue:2614`), d'où
   l'impression d'un ordre alphabétique.

À noter : les lignes de l'étape 1 sont des **articles de stock** (ingrédients, composants), pas des Menu Items.
Le réglage par Menu Item et par PDV existe déjà dans Event Predict (`quantityAdjustments`,
clé `elementId-menuItemId`) et il est repris par le réarmement via la version active
(`SpaceRestockView.vue:4456`). La demande porte donc sur le réglage par PDV des articles de stock, dans le
réarmement.

## Règles retenues

Tirées de la demande (« même méthode que sur Event Predict ») et du comportement d'Event Predict
(`EventPredictMenusSection.vue`), confirmées à Bertrand le 2026-10-01 :

| Règle | Source |
|---|---|
| Réglage par PDV en **%** (curseur 0 à 200, pas de 5, comme le curseur de l'étape 1) | Event Predict : % par `elementId-menuItemId` |
| Le curseur global de l'article **remet tous ses PDV au même %** (écrase les réglages par PDV) | `handleItemAdjustment`, `EventPredictMenusSection.vue:2289` |
| Si les PDV d'un article ont des % différents, le curseur global l'indique (« Mixte ») | `isItemAdjustmentMixed`, `EventPredictMenusSection.vue:2282` |
| Bouton sur la carte qui ouvre un drawer **à gauche** | Demande + `EventDrawerShell` (`side="left"`) |
| Les raccourcis 80 / 100 / 120 % et Reset écrasent aussi les réglages par PDV | Cohérence avec la règle du curseur global |

## Conception

### État

- Nouveau : `stockShopPercents: { 'shopId|||itemKey': percent }`. Ne contient que les PDV réglés à la main.
- % effectif d'une ligne PDV × article : `stockShopPercents[shopId|||itemKey] ?? stockAdjustments[itemKey] ?? 100`.
- `setStockAdjustment(itemKey, v)` (`SpaceRestockView.vue:4730`) : pose le % de l'article **et** supprime toutes
  les clés `*|||itemKey` de `stockShopPercents`.
- `applyStockAdjustmentToAll` (`SpaceRestockView.vue:4738`) : vide `stockShopPercents`.
- Logique pure dans un util à part, `utils/restockShopPercent.js` (sur le modèle de
  `effectiveStoragePercent`, `utils/storageRestock.js:45`) :
  - `shopPercentKey(shopId, itemKey)`
  - `effectiveShopPercent({ shopPercents, itemPercents, shopId, itemKey })`
  - `clearItemShopPercents(shopPercents, itemKey)`
  - `isItemPercentMixed(shopPercents, itemPercent, shopIds, itemKey)`

### Calcul

`adjustedQuantity(quantity, unit, itemKey)` devient `adjustedQuantity(quantity, unit, itemKey, shopId)`.
Trois appels, tous avec `row.shopId` disponible :

- `SpaceRestockView.vue:2751` (`liveRestockRowsAll`, cible par PDV)
- `SpaceRestockView.vue:5716` (`buildSourceBreakdown`, parts par plat)
- (le template n'appelle que `stockAdjustment(itemKey)` pour l'affichage du curseur)

Les agrégats de l'étape 1 (`stockOutcomeByItem`, `liveStockOrderByItem`) sont calculés depuis
`liveRestockRowsAll` : ils suivent sans modification.

### Persistance (aucun changement backend)

Même chemin que `storagePercents` (fiche 314-01) :

- Brouillon : `restockPersistSnapshot()` (`SpaceRestockView.vue:3339`) + `extras` du PUT dans
  `api/endpoints/restock.api.js:65`. `RestockState.state` est un blob jsonb opaque.
- Restauration : à côté de `saved.stockAdjustments` (`SpaceRestockView.vue:3694`).
- Plan sauvegardé : `meta.stockShop.percents` dans `buildPlanSnapshot` (`utils/restockPlanSnapshot.js:287`),
  `meta` étant déjà dans `WRITABLE_JSON` (`restock-plans.service.ts:39`).
- Chargement d'un plan : à côté de `meta.storage` (`SpaceRestockView.vue:3811`). Plans antérieurs sans ce
  bloc : `{}`.

### Interface

- Nouveau composant `restock/drawers/RestockItemShopsDrawer.vue` (ne pas grossir `SpaceRestockView.vue`,
  déjà 9 158 lignes). Coquille : `EventDrawerShell` avec `side="left"`.
- Bouton sur la carte article, à côté du curseur (icône identique au bouton PDV d'Event Predict). Masqué si
  l'article est exclu (`stockExcluded`) ou s'il n'a qu'un PDV.
- En-tête du drawer : nom de l'article, nombre de PDV, total requis et « À commander ».
- Une ligne par PDV (source : `liveRestockRowsAll` filtré sur `itemKey`) :
  nom du PDV, Prévu, Restant, Requis, À déposer (en colis), curseur %, bouton de réinitialisation
  (revient au % de l'article).
- Curseur de la carte : affiche « Mixte » quand les PDV diffèrent.
- Plan chargé (photo figée) : chaque modification passe par `guardPlanEdit()`, comme le curseur actuel, puis
  `resetGeneratedOutputs()`.
- Libellés i18n FR et EN (`src/i18n/translations.js`, préfixe `sr`). Pas de tiret cadratin dans les libellés.

## Lots

1. Util `restockShopPercent.js` + tests unitaires (`tests/unit/restockShopPercent.spec.js`).
2. Branchement du calcul (`adjustedQuantity` avec `shopId`, règles d'écrasement du curseur global et des
   raccourcis).
3. Persistance brouillon + plan (aller-retour sauvegarde, rechargement, plan ancien sans bloc).
4. Drawer + bouton + affichage « Mixte » + i18n.
5. Recette manuelle (ci-dessous).

## Recette

- Article à 3 PDV, PDV A à 150 % dans le drawer : seul A change à l'étape 2 ; la carte affiche « Mixte » ;
  « À commander » de la carte = somme des colis par PDV.
- Curseur de la carte à 110 % : les 3 PDV passent à 110 %, « Mixte » disparaît.
- Boutons 80 / 100 / 120 / Reset : réglages par PDV effacés.
- Recharger la page : réglages par PDV conservés (brouillon).
- Sauvegarder un plan, le recharger : réglages restaurés ; un plan antérieur s'ouvre sans erreur.
- Plan chargé : modifier un PDV déclenche la garde de modification du plan.
- Multi-events : le % s'applique au besoin cumulé du PDV.
- Mode objectif « Ventes » : même comportement.
- Non-régression : sans réglage par PDV, quantités identiques à avant (tests `restockOutcome`,
  `restockPlanSnapshot`, `restockDepositPacks` verts).

## Hors périmètre, à vérifier séparément

- Sur la capture, « Bun - Burger » apparaît deux fois (« Packs of 4 » et « Sacs of 4 »). Probablement deux
  fiches catalogue homonymes. Non vérifié.
