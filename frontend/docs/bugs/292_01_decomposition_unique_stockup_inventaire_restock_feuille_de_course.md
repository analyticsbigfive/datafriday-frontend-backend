# BUG-292-01 — Cinq écrans, cinq règles de décomposition : une seule règle, et l'éclatement déplacé dans la feuille de course

- **Statut** : 🟡 Corrigé non déployé (2026-08-04) — phases 1 **et** 2 livrées
- **Sévérité** : 🔴 Critique (le chargement, le comptage et le réarmement d'un même PDV ne parlent pas du même stock)
- **Domaine** : Stock (Stock-up / Inventaire pré-post / Réarmement / Feuille de course)
- **Repo(s) concerné(s)** : `datafriday-web` (100 % front)
- **Découvert le** : 2026-08-04 (brief owner : les 4 règles métier)
- **Fichiers** :
  - `frontend/src/utils/menuItemExpansion.js` (**nouveau** — la règle, écrite une fois)
  - `frontend/src/utils/componentCatalog.js` (**nouveau** — hydratation de la recette des composants)
  - `frontend/src/utils/bomPlanning.js:120-175` (éclatement composant → ingrédients)
  - `frontend/src/utils/inventoryUtils.js:70-79` (`flattenComponentDef`, champs additifs)
  - `frontend/src/composables/useSpaceData.js:327-339` (hydratation déportée sur le util partagé)
  - `frontend/src/views/SpaceRestockView.vue` (`hydratedComponents`, `ensureRecipesLoaded`, `shoppingIngredientGroups`)
  - ⏳ phase 2 : `stockPlanning.js:212`/`:234`, `EventPredictStockUpSection.vue:583-731`/`:660`, `inventoryUtils.buildConsolidatedInventory`

## En clair

Cinq écrans répondent à la même question — « qu'est-ce qu'on met dans le camion ? » — et donnaient
cinq réponses différentes. Pas un bug isolé : **cinq bouts de code séparés**, écrits à des moments
différents, appliquant chacun leur propre idée de « jusqu'où on découpe une recette ».

La règle métier tient en une phrase : **on découpe d'un seul cran, jamais deux.** La sauce pickle
arrive prête de la cuisine centrale — on la stocke, on la compte, on la réarme telle quelle. On ne va
pas chercher l'ail qui est dedans. Sauf à un seul endroit : la feuille de course, parce qu'on n'achète
pas « de la sauce pickle » à un fournisseur, on achète du vinaigre et de l'ail.

Ce lot écrit cette règle **une seule fois**, dans un fichier que les écrans consomment au lieu de la
réimplémenter, et déplace l'éclatement jusqu'aux ingrédients là où il doit être — la feuille de
course, qui ne le faisait **pas du tout**.

## Symptôme

| # | Constat |
|---|---|
| S2 | Réarmement : des ingrédients **internes aux composants** apparaissent (l'ail de la sauce) |
| — | Feuille de course : commande « Sauce burger 25/26 (Aux) » — un article qu'aucun fournisseur ne vend |
| — | Le nombre de sauces pickle du stock-up, celui de l'inventaire et celui du réarmement ne se joignent pas |

## Cause racine

Cinq implémentations vivantes de la même règle, relevées le 2026-08-04 :

| # | Implémentation | Critère de récursion | Éclate un composant ? | Identité de ligne |
|---|---|---|---|---|
| 1 | `EventPredictStockUpSection.expandMenuItem` | `isCombo \|\| enfant.comboItem` ✅ | Non ✅ | `component.id` ❌ |
| 2 | `stockPlanning.expandMenuItemStock` | `enfant.readyForSale === 'No'` ❌ | Oui ❌ | `componentIngredientId` ✅ |
| 3 | `inventoryUtils.buildConsolidatedInventory` | `enfant.comboItem === 'Yes'` ⚠️ | Non ✅ | `component.id` ❌ |
| 4 | `bomPlanning.buildIngredientRequirements` | `line.refMenuItemId` | **Non** ❌ | `key\|\|\|unit` |
| 5 | `inventoryUtils.expandInventoryItems` (builder) | `comboItem && readyForSale==='No'` ❌ | Non | `component.id` |

Deux constats décident du plan :

### A — La feuille de course ne décomposait rien

`bomPlanning.js:136` ne récursait que sur `line.refMenuItemId`, c'est-à-dire vers un sous-**menu
item**. Or `MenuComponent` (`backend/prisma/schema.prisma`) ne porte **ni** `menuItemId` **ni**
`sourceMenuItemId` : `refMenuItemId` est donc toujours `undefined` pour un vrai composant, et
`resolveComponentDef`/`flattenComponentDef` n'étaient appelés nulle part dans ce fichier.

⚠️ **BUG-290-01 (ligne 152) affirmait l'inverse** — « `buildIngredientRequirements:120` fait déjà la
décomposition récursive correcte pour la feuille de course ». C'est faux, et c'est ce qui aurait rendu
le lot dangereux : supprimer l'éclatement du réarmement en s'appuyant sur cette phrase aurait fait
disparaître la décomposition ingrédient **de toute l'application**.

### B — L'éclatement du réarmement est bien actif (piste corrigée en cours de lot)

**Première lecture, fausse** : `SpaceRestockView.components` lit `store.state.analyse.components`,
alimenté par la **liste** `/menu-components` (`utils/api.js:505`), qui ne renvoie pas
`subComponents` → `resolveComponentDef` rendrait une def vide et `stockPlanning.js:233` ne se
déclencherait jamais.

**Vérification** : `analyse.js:1889-1895` délègue à `useSpaceData.fetchSpaceData`, dont la vague 2b
**hydrate** les `subComponents` (fan-out `/menu-components/:id`) et les réémet via
`onEnrichment({ components: full.components })` (`useSpaceData.js:393-396`) → `SET_COMPONENTS`
(`analyse.js:1912`). Le catalogue du réarmement porte donc bien les recettes, et
`stockPlanning.js:233` **s'exécute en production**. La liste brute ne concerne que le chemin legacy
`utils/api.js` (`analyse.js:1945`).

Conséquences réelles :

- le symptôme S2 (« l'ail de la sauce remonte ») a **deux** sources possibles, `:212` **et** `:233` ;
- retirer `:233` en phase 2 n'est **pas** neutre : c'est un changement de comportement visible à
  l'écran — c'est précisément l'objet du lot, mais il doit être annoncé et vérifié, pas glissé ;
- la feuille de course, elle, avait bien besoin d'une hydratation propre : elle est le seul chemin
  qui n'en bénéficiait pas systématiquement (chemin legacy).

## Correction — phase 1 (livrée)

### 1. `menuItemExpansion.js` (nouveau) — la règle, écrite une fois

Fonction pure `expandMenuItem({...})`, reprise de l'implémentation de référence
(`EventPredictStockUpSection`, corrigée au lot BUG-290-01), avec les dépendances écran injectées
(`resolveMenuItemUnitCost`, `recipeCatalogLoaded`) au lieu d'être lues sur `this`.

```
1. combo               → on OUVRE le panier, chaque constituant retraité normalement
2. readyForSale='Yes'  → 1 ligne, l'article, en pcs — packaging NON séparé
3. readyForSale='No'   → 1 ligne par ligne de recette, JAMAIS de descente dans un composant
4. 'No' + catalogue recette pas chargé → AUCUNE ligne          (garde S4)
5. 'No' + recette réellement vide      → l'article lui-même      (filet)
```

Les points 4 et 5 sont deux situations différentes qui se ressemblent — « je ne sais pas encore » et
« il n'y a rien à savoir ». Les confondre est le bug S4 de BUG-290-01. Le filet (5) est explicite et
désactivable (`fallbackWhenEmpty`) parce que les appelants divergeaient sur ce point.

Identité de ligne : `componentIngredientId()` (marketPriceId → sourceId → id), jamais la PK de la
ligne de recette — c'est la condition pour qu'un gobelet partagé fusionne et que le comptage joigne le
réarmement (BUG-288-01, ici propagé).

### 2. `componentCatalog.js` (nouveau) — l'hydratation, partagée

`indexComponentCatalog`, `mergeSubComponentsFromCatalog` (synchrone, gratuit),
`buildSubComponentsFromDetail` (pure, testable), `hydrateSubComponents` (fetch détail borné, échec
toléré, **couverture tracée**). Extrait de `useSpaceData.js`, qui le consomme désormais : une seule
implémentation au lieu d'une et demie.

### 3. `bomPlanning` — le seul écran qui éclate

`buildIngredientRequirements` accepte `components` ; dans `explode`, une ligne
`itemType === 'Component'` est résolue puis remplacée par ses feuilles à `q × leaf.qtyFactor`. Une def
absente ou sans recette **laisse la ligne visible** plutôt que de l'escamoter.

`flattenComponentDef` remonte en plus `marketPriceId` / `supplierId` / `supplierName` (champs
**additifs**, aucun consommateur existant ne les lit) : sans eux, tout ingrédient éclaté atterrissait
en « fournisseur inconnu », ce qui vide de son sens le groupement par fournisseur.

`SpaceRestockView` hydrate le catalogue une fois à l'entrée du mode ingrédients et le passe à
`buildIngredientRequirements`.

## Correction — phase 2 (livrée)

### 4. Les trois consommateurs branchés sur le module

| Fichier | Geste |
|---|---|
| `stockPlanning.expandMenuItemStock` | Corps entier remplacé par une délégation ; ne reste qu'un adaptateur de signature (3 appelants : `buildStockRequirements`, `useShoppingList`, `usePredictedNeed`). **Trois changements de comportement** : récursion pilotée par le combo au lieu du `readyForSale` de l'enfant ; plus d'éclatement composant ; un combo est ouvert. Imports `resolveComponentDef`/`flattenComponentDef`/`componentIngredientId` et `MAX_DEPTH` devenus morts → supprimés. |
| `EventPredictStockUpSection.expandMenuItem` | Délégation (import aliasé `expandMenuItemShared` — la méthode locale garde son nom et sa signature positionnelle). Seul changement : **l'identité de ligne** passe de la PK de recette à l'identité catalogue (D3). |
| `inventoryUtils.getAllComponentsAndIngredients` | Garde son propre parcours (deux exceptions documentées que le module ne modélise pas : skip packaging en récursion, packaging des RFS=Yes), mais aligné sur deux points : critère de récursion `isCombo \|\| enfant.comboItem` et **identité catalogue** sur les 3 sites d'émission. |

⚠️ `inventoryUtils` et `stockPlanning` sont partis **ensemble** : ce sont les deux côtés de l'identité
de netting. Livrer un seul des deux rouvrait exactement l'asymétrie de la Question #13.

### 5. D1 — merch : le vrai trou n'était pas où on le croyait

Le repli synthétique code `type: 'shop'` en dur — mais il n'y a **rien à filtrer dessus** : les
records de timeline ne portent aucun signal merch (`shopType` est une dim de PdV — `gppremium`… —
et `'merchshop'` est un **type d'élément**, jamais une valeur de `shopType`). Filtrer là aurait été
inventer une valeur qui n'existe pas.

Le vrai défaut : `EventPredictStockUpSection` ne recevait **pas** `configShops`, alors que
`EventPredictMenusSection` l'utilise depuis BUG-275. Or `/spaces/:id/shops` est un endpoint
**indépendant du layout** : il répond même quand `/configurations` ne renvoie pas `.data.floors`, et
ses rows portent un vrai `type`. Le stock-up tombait donc en synthétique alors qu'une source
filtrable existait. Corrigé : nouvelle prop `configShops`, cascade layout → `/shops` (merch filtré) →
synthétique. Bénéfice secondaire : tous les shops de la config s'affichent, pas seulement ceux qui
ont déjà vendu (un event futur n'a pas de timeline).

**Limite résiduelle assumée** : sur un event Weezevent sans import de shops, le dernier repli reste
sans signal merch. Il faudrait un type d'élément sur le record de timeline (backend).

### 6. D3 — cups

Réglé par la délégation : `EventPredictStockUpSection` émet désormais l'identité catalogue. L'effet
réel est la **clé d'agrégation** — un gobelet partagé par trois recettes devient une ligne au lieu de
trois, donc un seul `Math.ceil` de carton au lieu de trois.

⚠️ Ce que ce lot **ne** corrige **pas**, contrairement à ce qu'on pourrait croire : la résolution par
id de `computePackaging` (`:688-699`) cherche `i?.id === item.id` dans `ingredients`/`components`.
`componentIngredientId` renvoie `marketPriceId` en priorité — un id d'une AUTRE table. Quand la ligne
en porte un, la branche id rate toujours et l'on retombe sur le nom (comme avant). Ce n'est pas
nuisible (le repli par nom fonctionne), mais la vraie correction serait d'indexer aussi par
`marketPriceId` — hors périmètre, à noter.

**Hors périmètre assumé** : `inventoryUtils.expandInventoryItems` (`:86`) — ses consommateurs sont les
panneaux du builder, il ne porte aucune quantité, et les 4 règles ne le gouvernent pas.

## Ce qui n'était PAS la cause

- **S1** (« l'inventaire pré-event montre les composants mais pas les ingrédients ») n'appartient pas
  à ce lot : cause et correctif sont dans [BUG-291-01](291_01_reappro_recette_amputee_et_grain_menu_item.md)
  — `menuItemNormalize.buildComponents` chaînait les trois relations en **alternatives** au lieu d'une
  union. Aucune des trois pistes envisagées ici (skip packaging, enrichissement 5 étapes, `enrichForBuild`)
  n'était la bonne. Vérifié au passage : l'enrichissement métadonnées ne supprime **aucune** ligne.
- **D2** (« un article sans recette ne doit pas entrer dans Event Predict ») est traité par
  BUG-291-02 : store `shopMenuAvailability` + filtre `enabled === true && available !== false`
  (`EventPredictView.vue:4058-4060`). Critère backend faisant foi :
  `available = hasRecipe && missingIngredients.length === 0` (`space-menus.service.ts:582-585`).
  « Non disponible » ≠ « unmapped » — ce dernier signifie « vendu sur Weezevent mais non assigné ».
- **Prix de base = 0** : aucun filtre front n'exclut un article des prédictions. La chaîne réelle est
  backend — `weezevent.controller.ts:839` (`onlySold=true`) écarte tout produit `basePrice <= 0` du
  catalogue de l'assistant de mapping : jamais mappé, donc jamais prédit. Second filtre sans rapport :
  `logistics.service.ts:933` (simulateur de ventes live). BUG-290-01 disait « aucun filtre prix 0
  n'existe » — vrai côté front seulement.
- **Aucun commit récent n'a cassé la logique.** `stockPlanning.js` et `bomPlanning.js` n'ont qu'un
  commit chacun (`8bf2429`, 2026-07-15). Seule régression réelle de la période : `1b47ae2`
  (2026-08-02) a retiré les 2 filtres merchshop de `4298fd9` pour une raison procédurale.

## Résultat attendu — le Burger

`Burger 25/26 (Aux)`, `readyForSale='No'`, 100 ventes sur le 1 A. Recette : salade iceberg 0,02 kg ·
viande hachée 0,15 kg · bun 1 pcs · cheddar 0,02 kg · **pickles 0,01 kg** (Component) ·
**sauce burger 0,03 L** (Component) · serviette 1 pcs (Packaging).

| Étape | Attendu |
|---|---|
| Stock-up | 7 lignes — iceberg 2 kg, viande 15 kg, bun 100, cheddar 2 kg, **pickles 1 kg**, **sauce 3 L**, serviette 100. Ni ail, ni vinaigre |
| Inventaire pré | **Les 7 mêmes**, mêmes identités (+ packaging des RFS=Yes, exception owner) |
| Inventaire post | **Les 7 mêmes**, comptées → la réconciliation joint |
| Réarmement | 7 lignes, besoin = 100 × recette − compté |
| Feuille de course | 5 lignes directes + les 2 composants **éclatés** : sauce 3 L (rendement 5 L) → mayonnaise 1,8 L, ketchup 0,9 L, épices 0,3 kg ; pickles 1 kg (rendement 2 kg) → cornichons 0,9 kg, vinaigre 0,25 L, ail 0,025 kg. **Aucune ligne « sauce » ni « pickles »** |

## Tests

- `frontend/tests/unit/menuItemExpansion.spec.js` (**nouveau**, 22 cas) — les 5 branches, dont le cas
  qui prouve la règle : un composant résolvant vers un menu item `readyForSale='No'` reste **une
  ligne** (avant : dissous en mayonnaise + ail) ; combo ouvert ; garde S4 vs filet ; identité catalogue ;
  gobelet partagé portant la même identité dans deux recettes.
- `frontend/tests/unit/bomPlanningComponentExplosion.spec.js` (**nouveau**, 15 cas) — `bomPlanning.js`
  **n'avait aucun test** alors qu'il porte le mode par défaut de la feuille de course. Couvre les
  quantités exactes du Burger, l'absence de toute ligne « composant », le composant de composant,
  l'agrégation d'un ingrédient partagé, le groupement fournisseur, et la rétro-compat sans catalogue.
- `frontend/tests/unit/expansionParity.spec.js` (**nouveau**, 7 cas) — le **garde-fou anti-divergence**,
  la vraie valeur de long terme du lot. Contrat écrit noir sur blanc dans l'en-tête du fichier :
  on compare l'ensemble des **identités de ligne** (la propriété sur laquelle le netting joint),
  racines `readyForSale='No'`, quantités et présentation ignorées. Le cas central prouve que
  stock-up, réarmement et inventaire désignent **exactement les mêmes articles**. Les deux
  divergences voulues (packaging des RFS=Yes côté inventaire ; recette anonyme) y sont testées
  **comme divergences**, pour rester des décisions et non des dérives.
- `frontend/tests/unit/componentDecomposition.spec.js` — mis à jour : les 2 cas qui assertaient
  « le réarmement éclate en feuilles » assertent désormais l'inverse, et un cas nouveau vérifie que
  l'inventaire et le réarmement désignent le composant par la **même clé**.
- `frontend/tests/unit/eventPredictStockUpExpansion.spec.js` — 2 assertions de shape élargies au
  surensemble du module (`sourceId`, `itemType`, `sources[].menuItemId`).

`pnpm test:unit` : **819 passés** (baseline avant lot : 750). 4 échecs préexistants **inchangés**,
répartis en 3 suites — `apiOrMock.spec.js` (3 cas, mock réseau), `spaceMenusInventory.spec.js` (1 cas),
`eventDetailsEditor.spec.js` (suite qui ne démarre pas, ESM Vuetify).

> Deux notes sur ces échecs, parce qu'ils sont traités comme du bruit de fond depuis des semaines :
> 1. la mention « 4 échecs » des fiches précédentes se lisait comme 4 suites. Ce sont **4 tests dans
>    3 suites** — il n'y a jamais eu de 4ᵉ échec non identifié ;
> 2. `spaceMenusInventory.spec.js:13` **ne repassera pas au vert avec ce lot**, contrairement à ce
>    que ce plan anticipait : il asserte le repli mono-ingrédient (`readyForSale='Yes'` remontant sur
>    le nom de son Market Price) **retiré volontairement** par BUG-048 — cf. le commentaire dans
>    `inventoryUtils.js` juste avant la branche `readyForSale === 'Yes'`. C'est un test périmé, pas
>    une régression, et il est indépendant de ce lot.

## Risque de régression / à surveiller

- **Charge réseau du mode ingrédients** : `hydrateSubComponents` peut déclencher un fan-out
  `/menu-components/:id` (concurrence 5) à la première ouverture de la feuille de course. En pratique
  il ne se déclenche **pas** quand le catalogue vient de `useSpaceData` (déjà hydraté, vague 2b) ;
  il ne sert qu'au chemin legacy `utils/api.js`. À surveiller quand même sur un gros catalogue :
  BUG-291-02 documente des **429 Render** provoqués par une boucle par shop. Le log de couverture
  (`n/m avec subComponents`) dit si l'éclatement est réellement alimenté — un éclatement
  silencieusement vide se lit « rien à décomposer », ce qui serait faux.
- **Fournisseur des ingrédients éclatés** : ✅ vérifié. `resolveIngredientSupplier`
  (`SpaceRestockView.vue:3261-3267`) résout bien `line.marketPriceId` → `marketPrices` →
  `supplierId`. C'est ce que remonte désormais `flattenComponentDef` ; sans ce champ, tous les
  ingrédients éclatés seraient tombés dans `__unknown_supplier__` et le groupement par fournisseur
  aurait été vide de sens.
- **🔴 À vérifier À L'ÉCRAN avant la démo — le réarmement change vraiment.** Retirer l'éclatement
  composant n'était pas un no-op : `useSpaceData` hydrate les `subComponents` et les pousse dans
  `analyse.components`, donc le réarmement éclatait bel et bien. Sur un PDV qui utilise des
  composants, la feuille de réarmement passe des **ingrédients feuilles** (Badiane, Canelle…) au
  **composant entier** (Pickles Auxerre). C'est le comportement voulu, mais c'est le changement le
  plus visible du lot : à regarder sur un tenant réel, pas seulement en test.
- **🔴 Les 2 autres consommateurs de `buildStockRequirements` héritent du changement.** Il en a
  **trois**, et seul le réarmement était visé :
  1. `useShoppingList.js:115` → `buildShoppingList` — l'« Aperçu feuille de course » de l'écran
     Inventaire (`InventoryAggregateView`, monté par `SpaceInventoryView.vue:487` : **vivant**,
     c'est le « piège n°2 » du module Stock, deux moteurs de « reste à commander »). Ce pipeline
     n'a **aucune** décomposition propre : il recevait des feuilles par ricochet de l'éclatement
     qu'on vient de retirer. Il affiche donc désormais « sauce pickle » comme ligne à acheter —
     contraire à la règle 4. ⚠️ **Mais l'état antérieur n'était pas bon non plus** : ses lignes
     étaient au grain feuille alors que les comptages sont au grain composant, donc le netting
     `gap = théorique − compté` ne joignait **jamais** sur ces lignes. On échange un netting faux
     contre un grain d'achat faux. Correction propre = appliquer le schéma du pipeline A (netter au
     grain stock, PUIS éclater via `bomPlanning` pour la sortie achat) — **non fait ici**, ce serait
     refondre un écran non demandé la veille d'une démo.
  2. `usePredictedNeed.js:60` → colonne « besoin prédit » du Pre-event Inventory. Le grain passe des
     feuilles aux composants : c'est **désiré** (il coïncide enfin avec la liste comptée) et c'est
     même l'un des gains du lot, mais ce n'était écrit nulle part.
- **Live hérite du réarmement** (Q#22, 2026-07-23) : Live change donc sans qu'on y ait touché.
- **Backend non aligné** (Q#18) : `logistics.service.ts deriveSales` applique encore l'ancienne règle.
- **État utilisateur persisté** : la phase 2 change une 2ᵉ fois les `itemKey` (après BUG-288-01) →
  une feuille en cours de préparation perd ses % et ses confirmations.
- **Miroir `datafriday-web`** : le checkout local est **périmé** (dernier commit `f29bcd9`, 8 juillet).
  Report manuel à faire sur un checkout à jour, pas sur celui-ci.

## Références

- [BUG-290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md) — lot précédent (règle combo, prédictions du Stock-up).
- [BUG-291-01](291_01_reappro_recette_amputee_et_grain_menu_item.md) — recette amputée (cause de S1).
- [BUG-288-01](288_01_restock_composant_partage_lignes_dupliquees.md) — identité catalogue côté restock.
- `frontend/docs/QUESTIONS_A_BERTRAND.md` — Question #13 (asymétrie inventaire ⇄ restock), tranchée par ce lot ; Question #18 (combos).

---

JLH
