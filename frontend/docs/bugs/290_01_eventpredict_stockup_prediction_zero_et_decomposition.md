# BUG-290-01 — Event Predict / Stock-up : prédiction à 0 (article absent du chargement) + décomposition d'un niveau de trop

- **Statut** : 🟡 Corrigé non déployé (2026-08-04)
- **Sévérité** : 🔴 Critique (articles manquants dans le chargement d'un point de vente)
- **Domaine** : Prévision (Event Predict) / Stock (Stock-up)
- **Repo(s) concerné(s)** : `datafriday-web` (100 % front)
- **Découvert le** : 2026-08-03 (signalement client, démo mercredi)
- **Fichiers** :
  - `frontend/src/components/EventPredictStockUpSection.vue:412-424` (index de prédiction — cause racine C1)
  - `frontend/src/components/EventPredictStockUpSection.vue:625-643` (lecture SOMME → MAX)
  - `frontend/src/components/EventPredictStockUpSection.vue:737-746` (récursion pilotée par le parent — C2)
  - `frontend/src/components/EventPredictStockUpSection.vue:778-791` (repli hydratation — S4)
  - `frontend/src/components/EventPredictMenusSection.vue:1122-1128`, `:1650-1666` (implémentation de référence, déplacée)
  - `frontend/src/utils/predictedQuantityIndex.js` (**nouveau** — implémentation unique partagée)
  - `frontend/src/utils/timelineBucketing.js:174`, `:204` (référence contrat : `menuItemId` = produit de vente, `mappedMenuItemId` = catalogue)
  - `frontend/src/composables/useSpaceData.js:5-9`, `:301-306` (vagues 2a / 2b)

## En clair

L'écran Stock-up répond à « pour ce point de vente, qu'est-ce que je charge dans le camion ? ». Il
demande d'abord combien de burgers on va vendre, puis traduit ça en articles à stocker. Les deux
temps étaient cassés.

**Premier temps.** L'algorithme prédit bien 95 burgers sur le 1A. Cette prédiction est rangée dans
un classeur. L'écran Menus sait l'ouvrir de deux façons — par le numéro de l'article ou par son
nom. L'écran Stock-up ne cherchait que par numéro, et utilisait le mauvais : celui du produit côté
billetterie (Weezevent), pas celui de notre catalogue. Il ne trouvait rien, affichait 0, et comme
il ignore tout ce qui est à 0, **le burger disparaissait complètement de la liste de chargement**.
Le hot-dog s'affichait parce que, pour lui, les deux numéros coïncidaient.

Ce n'est **pas** un problème de prix à zéro : aucun filtre de ce type n'existe dans le code
(vérifié — les seules gardes portent sur la quantité, `predictiveAnalytics.js:613`).

**Deuxième temps.** On stocke la sauce pickle telle quelle, jamais l'ail qu'elle contient. L'écran
respectait déjà la règle pour les composants catalogue, mais avait une porte dérobée : si un
ingrédient de la recette était lui-même un article du menu, il continuait de le découper en
cascade. Seule exception légitime, confirmée par Bertrand : un **menu (combo)** est un panier — on
l'ouvre pour en sortir les articles, puis chacun redevient un article ordinaire. On ouvre le
panier, pas les articles qui sont dedans.

## Symptôme

| # | Constat |
|---|---|
| S5 | « Burger » à 0 prédit / 0 ajusté sur le 1A, alors que l'algo a prédit 95 et que l'écran Menus l'affiche |
| S5 (cascade) | prédiction 0 → **aucune ligne dans le stock-up** pour cet article |
| S2 | Réarmement/stock-up : des ingrédients **internes aux composants** apparaissent (l'ail de la sauce) |
| S4 | Après un hard refresh, la liste passe de « Bun Burger… » (ingrédients) à « Burger seul » (article fini) |

## Cause racine

### C1 — Index de prédiction incomplet côté Stock-up

Les deux écrans reçoivent **la même donnée** : `EventPredictView.vue:813` et `:893` passent tous
deux `:predicted-timeline-data="activeTimelineData"`. Ils l'indexaient différemment.

| | Menus (avant) | Stock-up (avant) |
|---|---|---|
| Clés shop | `shopId` **+ `normalizeStr(shopName)`** | `record.shop \|\| record.shopId` — le champ `shop` n'existe pas dans la shape préprocessée → **`shopId` seul** |
| Clés item | `menuItemId \|\| mappedMenuItemId` **+ `itemName.toLowerCase()`** | `menuItemId \|\| mappedMenuItemId` **seul** |
| Lecture | **MAX** avec `break` | **SOMME** (`q += count`) |

`timelineBucketing.js:174` (`r.productId || r.menuItemId || …`) et `:204`
(`mappedMenuItemId: r.mappedMenuItemId || rawProductId`) établissent que `menuItemId` porte l'id du
**produit de vente** et `mappedMenuItemId` l'id **catalogue**. L'ordre `menuItemId ||
mappedMenuItemId` privilégie donc l'id externe. Le Stock-up interrogeait avec l'id catalogue, sans
repli par nom → aucun match.

Cascade : index manqué → `getPredictedQuantity` = 0 → `getAdjustedQuantity` = 0 → `shopStockData`
écarte l'article (`if (adjustedQty === 0) return`) → l'article n'existe plus dans le stock-up.

**Le piège du fix** : l'index range la même quantité sous plusieurs clés. Ajouter les clés alias
sans passer la lecture de SOMME à MAX aurait fait passer le Burger de 0 à **190** au lieu de 95.
Les deux moitiés sont indissociables.

### C2 — Récursion pilotée par le mauvais critère

`EventPredictStockUpSection.vue`, condition d'origine :

```js
if (componentMenuItem && (componentMenuItem.readyForSale === 'No' || componentMenuItem.comboItem === 'Yes'))
```

La branche `readyForSale === 'No'` faisait descendre d'un niveau supplémentaire : un composant
préparé en cuisine centrale (sauce pickle, modélisée en menu item composé) était dissous en ses
propres ingrédients, alors qu'il arrive **prêt** sur le stand.

### S4 — Repli d'hydratation trompeur

`useSpaceData` charge en deux vagues (`:5-9`) : la **2a** livre les menu items, la **2b** seulement
les catalogues recette (`/ingredients`, `/menu-components`, `/packaging`) et **réémet** `menuItems`
avec les refs résolues. Entre les deux, un article `readyForSale='No'` n'a pas de `components`
exploitables, échoue la condition d'expansion et tombe dans le repli « 1 pcs de l'article
lui-même » → « Burger seul ». Une fois la 2b arrivée, il repasse en ingrédients. D'où deux listes
sur le même écran selon le moment du rendu.

⚠️ La piste initiale (`components === undefined` vs `[]`) **ne marche pas** :
`menuItemNormalize.toArray()` renvoie toujours un tableau. Le signal utilisable est la prop
`components` (catalogue recette), vide tant que la vague 2b n'est pas arrivée.

## Correction

1. **`frontend/src/utils/predictedQuantityIndex.js` (nouveau)** — implémentation unique de
   l'indexation et de la lecture, reprise telle quelle de l'écran Menus qui faisait référence :
   `buildTimelineQuantityIndex`, `shopLookupKeys`, `itemLookupKeys`, `lookupPredictedQuantity`
   (MAX, jamais somme). Les deux écrans la consomment — plus de divergence possible.
2. **Stock-up** — `timelineDataIndex` et `getPredictedQuantity` branchés dessus, avec le passage
   SOMME → MAX dans le même changement.
3. **Règle combo** (décision Bertrand 2026-08-04, qui confirme et précise la Question #18 du
   2026-07-24) : la récursion dépend de la nature du **parent**, pas du `readyForSale` de l'enfant.

   ```js
   if (componentMenuItem && (isCombo || componentMenuItem.comboItem === 'Yes'))
   ```

   | Parent | Composant résolvant vers un menu item | Comportement |
   |---|---|---|
   | combo | n'importe lequel | récursion — l'enfant est retraité comme un menu item normal |
   | `readyForSale='No'` (non combo) | n'importe lequel | **une ligne, pas de récursion** |

4. **S4** — computed `recipeCatalogLoaded` (`components`/`ingredients` non vides). Un article qui
   se déclare composé mais dont la recette n'est pas encore chargée ne produit **aucune ligne** au
   lieu d'un article fini qui n'existe pas ; il réapparaît complet au tick suivant. Après
   hydratation, le repli reprend son rôle de filet de sécurité (recette vide en base).
5. **S9 merchshop** — reprise des 2 hunks de `4298fd9`, retirés par `1b47ae2` pour une raison
   procédurale (PR séparée), cf. [BUG-275-02](275_02_merchshop_infiltre_menuassignment_predict_et_inventory.md) :
   `EventPredictMenusSection.vue` (`fbElements`) et `useInventoryData.js` (`buildConfigShopList`).
   `configShops` lui-même reste **non filtré** — le CA merch doit rester compté (BUG-274).
   `EventPredictStockUpSection.vue:352` filtrait déjà par `shop`/`hospitality`/`kitchen`.

### Ce qui n'était PAS la cause

- **Aucun filtre « prix de base = 0 »** n'exclut un article des prédictions **côté front**. Le code
  fait l'inverse : un prix 0 est traité comme absent et remplacé par revenu ÷ quantité
  (`EventPredictView.vue:2667`).

  ⚠️ **Précision du 2026-08-04** : la formulation d'origine (« aucun filtre de ce type n'existe dans
  le code ») ne vaut que pour le front — le backend n'avait pas été examiné. Il en existe **deux** :
  `weezevent.controller.ts:839` (`onlySold=true`) écarte du catalogue de l'assistant de mapping tout
  produit `basePrice <= 0` — jamais mappé, donc jamais prédit : c'est la chaîne réelle qui produit le
  symptôme rapporté ; et `logistics.service.ts:933`, sans rapport (simulateur de ventes live).
- **Aucune régression introduite par les commits d'optimisation des 2-3 août.** `stockPlanning.js`
  et `bomPlanning.js` n'ont qu'un seul commit chacun (`8bf2429`, 2026-07-15) ; les diffs non
  commités sur `EventPredictView.vue` sont 100 % cosmétiques (`<Button>` → `fb-btn`). Les
  comportements C1/C2 sont présents depuis l'import initial.

## Risque de régression / à surveiller

- L'écran **Menus** consomme désormais le code déplacé. Comportement identique par construction
  (c'était son propre code), mais c'est le chemin qui alimente les totaux de la Configuration.
- `timelineRevenueIndex` (`EventPredictMenusSection.vue`) duplique toujours la même structure pour
  le CA — **non touché** volontairement (chemin des montants, avant démo).
- **L'inventaire pré/post-event reste sur un autre chemin** (`inventoryUtils.buildConsolidatedInventory`
  via `useInventoryData.js:375`). Après ce lot, l'écart stock-up ⇄ inventaire **augmente** au lieu
  de diminuer. Règle « inventaire = même liste que le stock-up » = lot 2.
- Le **restock** (`stockPlanning.js:233-234`) continue d'éclater les composants en feuilles. Lot 2 :
  supprimer ce post-traitement — cf. [BUG-292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md).

  ⚠️ **Correction du 2026-08-04** : la phrase d'origine disait de « s'appuyer sur
  `bomPlanning.buildIngredientRequirements:120`, qui fait déjà la décomposition récursive correcte
  pour la feuille de course ». **C'est faux.** `bomPlanning.js:136` ne récurse que sur
  `line.refMenuItemId`, c'est-à-dire vers un sous-**menu item** ; `MenuComponent` ne porte ni
  `menuItemId` ni `sourceMenuItemId` (`schema.prisma`), donc ce champ est toujours `undefined` pour un
  vrai composant, et `resolveComponentDef`/`flattenComponentDef` n'étaient appelés nulle part dans ce
  fichier. Supprimer l'éclatement du restock en s'appuyant sur cette phrase aurait fait disparaître la
  décomposition ingrédient **de toute l'application**. Le lot 2 est un *déplacement* (avec ajout réel
  dans `bomPlanning`), pas une suppression.

  ⚠️ Une hypothèse intermédiaire — « cet éclatement est inerte en production, parce que la LISTE
  `/menu-components` ne renvoie pas `subComponents` » — a été **posée puis réfutée** le même jour, et
  ne doit pas être rouverte : `analyse.js:1889` délègue à `useSpaceData.fetchSpaceData`, dont la
  vague 2b hydrate les `subComponents` et les réémet dans le store (`useSpaceData.js:393` →
  `SET_COMPONENTS`, `analyse.js:1912`). La branche `:233` **s'exécute bien**. Le symptôme S2 a donc
  deux sources possibles, `:212` et `:233`.
- **Conflit git à prévoir** : `origin/fix/bug-275-merchshop-predict-inventory` porte le même diff
  merchshop (17 lignes identiques). À signaler à Ulrich avant son merge.

## Tests

- `frontend/tests/unit/predictedQuantityIndex.spec.js` (**nouveau**, 7 cas) — dont le cas qui
  prouve C1 : un record `{ menuItemId: 'ext-weez-123', mappedMenuItemId: 'mi-burger' }` interrogé
  par `mi-burger` renvoie **95** (avant : 0) et **pas 190** (garde anti-double-comptage).
- `frontend/tests/unit/eventPredictStockUpExpansion.spec.js` — 3 cas ajoutés : combo → constituant
  `readyForSale='No'` (ses composants, pas les sous-éléments) ; pas de récursion hors combo ;
  hydratation (aucune ligne tant que le catalogue recette n'est pas là).

`pnpm test:unit` : **722 passés**. 4 échecs préexistants, vérifiés identiques sur un worktree à HEAD
sans aucune de ces modifications — `apiOrMock.spec.js` (mock réseau), `eventDetailsEditor.spec.js`
(ESM Vuetify), `spaceMenusInventory.spec.js` (consolidation `inventoryUtils`, cf. BUG-288-01).
Aucun n'importe un fichier touché ici.

## Références

- `frontend/docs/modules/01_EVENT_PREDICT_ALGORITHME.md` — domaine Prévision.
- [BUG-275-02](275_02_merchshop_infiltre_menuassignment_predict_et_inventory.md) — merchshop (repris ici).
- [BUG-288-01](288_01_restock_composant_partage_lignes_dupliquees.md) — identité catalogue côté restock.
- `frontend/docs/QUESTIONS_A_BERTRAND.md` — décision combo du 2026-08-04 (Question #18 confirmée et précisée).

---

JLH
