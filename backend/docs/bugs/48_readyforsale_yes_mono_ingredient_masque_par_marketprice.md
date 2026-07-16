# BUG-048 — Menu item `readyForSale=Yes` avec 1 seul ingrédient et son propre packaging : masqué par la Market Price de l'ingrédient sur `/logistic`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (l'article n'apparaît jamais sous son propre nom — impossible de suivre son stock)
- **Domaine** : Stock (Logistics)
- **Repo(s) concerné(s)** : les deux (`api-datafriday-staging` + `datafriday-web`)
- **Découvert le** : 2026-07-15
- **Fichiers** :
  - `api-datafriday-staging/src/features/logistics/logistics.service.ts:535-545` (`itemRefsForMenuItem`, référentiel) — corrigé
  - `api-datafriday-staging/src/features/logistics/logistics.service.ts:1179-1200` (`perUnit`, consommation ventes) — corrigé
  - `api-datafriday-staging/src/features/logistics/logistics.service.ts:646-668` (`aggregateItems`, clé = `ref.key`)
  - `datafriday-web/src/utils/inventoryUtils.js:293-400` (`buildConsolidatedInventory`) — corrigé

## Symptôme

Menu item `readyForSale = "Yes"` avec Inventory Information renseignée sur sa propre fiche
(`inventoryPackagingType`/`inventoryNumberOfUnits`/`inventoryUnit`), mais dont la recette contient
un unique ingrédient lié à une Market Price : sur `/spaces/:spaceId/logistic`, l'article n'apparaît
**jamais sous son propre nom**. Il est agrégé sous la ligne de la Market Price de son ingrédient
(`kind: 'ingredient'`), avec le nom de l'ingrédient, pas celui du menu item.

Repro observée (tenant `cmovsic1g01lvvwyndt2qqwkw`, space Auxerre) : menu item **BARRE CHOCOLATEE**
(`id = 10fd36ab-275f-4883-9769-ff6755d713ea`), `readyForSale = "Yes"`,
`inventoryPackagingType = "Carton"`, `inventoryNumberOfUnits = 3`, `inventoryUnit = "Pc"` — donc
manifestement voulu comme "produit se vend tel quel, packagé en carton de 3". Sa recette contient
un seul ingrédient : **Badiane** (`marketPrice.itemName = "Badiane"`). Résultat sur `/logistic` :
la carte affichée est "Badiane" (kind ingredient), aucune carte "BARRE CHOCOLATEE" nulle part —
filtrer par kind "Product" ne la montre pas non plus, elle est classée "Ingredient".

## Cause racine

`itemRefsForMenuItem` (`logistics.service.ts:535`) : dès que `readyForSale === 'Yes'` **et**
`item.ingredients.length === 1` **et** que cet ingrédient résout une Market Price (directe ou par
nom), la méthode retourne immédiatement une unique ref `kind: 'ingredient'` keyée sur
`mp.itemName` (ligne 538-544) — sans jamais regarder si `item.inventoryPackagingType` /
`item.inventoryNumberOfUnits` / `item.inventoryUnit` sont renseignés sur le menu item lui-même. Le
commentaire de conception (lignes 336-337 : *"readyForSale=Yes + 1 seul ingrédient → market price
(lien direct sinon résolution par NOM)"*) part du principe que ce cas ne concerne que des produits
revendus tels quels sans packaging propre (ex. FUZE TEA dans BUG-045, données de test) — mais rien
dans le code ne garantit que c'est le cas : un menu item peut très bien avoir *à la fois* un
ingrédient unique en recette *et* son propre Inventory Information rempli (BARRE CHOCOLATEE). Dans
ce cas, la branche `kind: 'product'` (lignes 546-552, qui utiliserait justement
`item.inventoryPackagingType`/`inventoryNumberOfUnits`/`inventoryUnit`) n'est **jamais atteinte** —
`return refs` ligne 544 court-circuite avant.

Ensuite, `aggregateItems` (ligne 656-660) agrège par `ref.key`, qui pour cette branche vaut
`mp.itemName.trim()` (ligne 540) — donc même le nom affiché sur `/logistic` est celui de
l'ingrédient ("Badiane"), pas celui du menu item ("BARRE CHOCOLATEE"). L'article disparaît
littéralement, fondu dans une ligne de stock qui porte un autre nom.

Distinct de [BUG-045](45_unit_null_codee_en_dur_readyforsale_yes.md) (unité `null` en dur dans
cette même branche — corrigé) et [BUG-046](46_inventoryunit_jamais_persiste_menuitem.md)
(`inventoryUnit` jamais persisté — corrigé) : les deux bugs précédents supposaient qu'on était
dans la bonne branche (`kind: 'product'`) et corrigeaient la donnée qui y était lue. Ici le
problème est en amont : on n'entre **jamais** dans la branche `product` pour ce cas, quelle que
soit la qualité des données `inventoryUnit`/`inventoryPackagingType`/`inventoryNumberOfUnits`.

## Correction

Règle métier clarifiée par l'équipe le 2026-07-15 : `readyForSale=Yes` prime **sans exception**,
y compris pour le cas mono-ingrédient — plus de bascule vers la Market Price de l'ingrédient,
quel que soit le nombre d'ingrédients en recette, **sur toute la chaîne** (référentiel affiché
ET consommation stock à la vente). Ceci annule/remplace le cas volontaire décrit dans
[BUG-045](45_unit_null_codee_en_dur_readyforsale_yes.md) (FUZE TEA) : ce type d'item est
désormais compté comme son propre produit partout.

- `itemRefsForMenuItem` (`logistics.service.ts:535-552`, référentiel `/logistic`) : suppression
  de la résolution `ing`/`mp` → Market Price ; la branche `readyForSale=Yes` retourne toujours
  `kind: 'product'` avec les champs propres du menu item
  (`inventoryUnit`/`inventoryNumberOfUnits`/`inventoryPackagingType`).
- `perUnit` dans `explodeSalesToConsumption` (`logistics.service.ts:~1179-1197`, consommation
  ventes) : même suppression — la branche `readyForSale=Yes` clé désormais toujours sur
  `item.name`. Nettoyage du calcul `unresolvedIngredientNames`/`mpByItemName` (devenu mort, sa
  seule consommatrice était cette branche) et de la sélection `ingredient.marketPrice` désormais
  inutilisée dans le `recipeSelect` local de cette fonction (le `componentSelect` voisin, lui,
  garde `marketPrice` — toujours utilisé par `perUnitForComponent` pour le cas Component
  `readyForSale=No`, hors scope de ce bug).
- `buildConsolidatedInventory` (`datafriday-web/src/utils/inventoryUtils.js:293-400`) : suppression
  du bloc spécial-cas mono-ingrédient équivalent côté front — un item `readyForSale=Yes` retombe
  systématiquement sur le traitement normal juste en dessous (déjà correct, gère déjà le
  packaging).
- Commentaires de conception mis à jour aux trois endroits pour refléter la nouvelle règle unifiée
  (plus de mention de désync référentiel/ventes — les deux chemins sont de nouveau alignés).
- Code buildé et déployé.

## Risque de régression / à surveiller

- **BUG-045 inversé à dessein** : un item mono-ingrédient `readyForSale=Yes` *sans* son propre
  Inventory Information (ex. FUZE TEA, données de test) apparaîtra désormais comme son propre
  produit (nom du menu item, packaging vide) au lieu d'être fondu dans son ingrédient — changement
  de comportement voulu, mais à vérifier sur le catalogue réel : tout item mono-ingrédient
  `readyForSale=Yes` sans Inventory Information propre affichera un packaging vide/générique sur
  `/logistic` là où il affichait avant l'unité de l'ingrédient.
- **Stock existant** : le stock déjà comptabilisé sous le nom de la Market Price (ex. "Badiane")
  pour ces items ne migre pas automatiquement vers le nom du menu item (ex. "BARRE CHOCOLATEE") —
  à vérifier avec l'équipe si un ajustement d'inventaire manuel est nécessaire au déploiement pour
  les items concernés du catalogue réel, sous peine de stock affiché à 0 sur la nouvelle ligne.
- Test unitaire existant `logistics.service.spec.ts` (« Gap 1 ») à jour avec la nouvelle règle
  (le seul cas mono-ingrédient testé avait déjà 0 ingrédient, non affecté) — mais la suite a un
  problème préexistant sans lien avec ce fix : `emptyCtx()` dans le test ne fournit pas
  `itemRefsCache`/`componentRefsCache` (7/8 tests échouent avant et après ce changement, même
  échec). À corriger séparément si besoin de couverture fiable sur ce fichier.
- Aucun test front existant pour `buildConsolidatedInventory` — vérification manuelle nécessaire.
- À contrôler sur `/spaces/cmovsjbiz01lzvwyn30wweqpf/logistic` que BARRE CHOCOLATEE (et tout item
  similaire) apparaît sous son propre nom, kind `product`, avec `Carton`/`3`/`Pc`, **et** qu'une
  vente décrémente désormais son propre niveau de stock (plus celui de "Badiane").

## Références

- [BUG-045](45_unit_null_codee_en_dur_readyforsale_yes.md) — même branche de code, cause voisine
  mais distincte (unité null vs branche jamais atteinte).
- [BUG-046](46_inventoryunit_jamais_persiste_menuitem.md) — même écran, champ dont ce bug empêche
  l'affichage même une fois correctement persisté.
- [BUG-044](44_stock_payload_lent_et_volumineux.md) — même écran, code adjacent.
