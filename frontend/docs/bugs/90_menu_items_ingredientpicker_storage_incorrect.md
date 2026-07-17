# BUG-090 — IngredientPickerDrawer : champ storage rempli avec la catégorie d'achat au lieu du vrai type de stockage

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/IngredientPickerDrawer.vue:327,343`, `src/components/menu-fb/views/menu-items/drawers/PackagingPickerDrawer.vue:314`

## Symptôme

Le chip "Storage" affiché dans le tableau de recette (`MenuItemCreateView.vue`) attend une
valeur `Cold`/`Dry`/`Frozen`. Pour tout ingrédient dont la
catégorie d'achat n'est pas littéralement "Dry"/"Cold"/"Frozen" (ex. "Produits laitiers",
"Légumes"), le chip affiche ce texte de catégorie au lieu d'un vrai type de stockage, sans couleur
reconnue.

## Cause racine

```js
storage: r.category || 'Dry'  // IngredientPickerDrawer.vue:327
```

`r.category` provient de `marketPrice?.marketPriceCategory?.name` (`normalizeRow`, ligne 343), une
catégorie référentielle d'achat — pas un `storageType`. `ComponentPickerDrawer.vue` fait ça
correctement (`c.storageType`, un vrai champ dédié). `PackagingPickerDrawer.vue`, lui, ne tente
même pas de lire une donnée réelle et fige toujours `'Dry'` — stratégie de remplissage incohérente
entre les trois pickers.

## Correction

`IngredientPickerDrawer.vue` ne dérive plus `storage` de `category`. En l'absence de champ storage
dédié côté `Ingredient` (le modèle n'en expose pas — `docs/modules/04_MENU_CATALOGUE.md` documente
un enum `StorageType` seulement sur `Ingredient`/`Packaging`/`MenuComponent`/`MenuItem` sans détail
de mapping direct depuis `MarketPrice`), la valeur retombe simplement sur `'Dry'` par défaut, comme
`PackagingPickerDrawer.vue` — cohérence entre les trois pickers plutôt qu'une valeur trompeuse.

## Risque de régression / à surveiller

Si `Ingredient.storageType` existe réellement côté backend (à vérifier), préférer le lire
explicitement plutôt que le défaut `'Dry'` uniforme — actuellement non exposé par
`getMarketPricesWithIngredients()`, donc non exploitable depuis ce drawer sans changement API.

## Références

- Aucune.
