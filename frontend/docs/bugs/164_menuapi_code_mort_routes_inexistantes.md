# BUG-164 — `menu.api.js` : code mort pointant vers des routes backend inexistantes (`/categories`, `/types`)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/api/endpoints/menu.api.js:663` (`getProductTypes`), `:672` (`createProductType`), `:685` (`getProductCategories`), `:696` (`createProductCategory`), `:708` (`getAllCategories` → `/categories`), `:718` (`createCategory` → `/categories`), `:726` (`getAllCategoryAggregations` → `/categories/aggregations`), `:738` (`getAllTypes` → `/types`), `:747` (`createType` → `/types`)

## Symptôme

`menu.api.js` contient un cluster de fonctions dupliquant `product.api.js` (`getProductTypes`,
`createProductType`, `getProductCategories`, `createProductCategory` — confirmé sans appelant réel
dans `frontend/src`) ainsi que 5 fonctions supplémentaires (`getAllCategories`, `createCategory`,
`getAllCategoryAggregations`, `getAllTypes`, `createType`) ciblant des routes backend `/categories`
et `/types` qui **n'existent pas du tout** — confirmé par grep de tous les `@Controller()` du
backend, aucun ne répond sur ces chemins. Ces fonctions ne sont pas seulement mortes : si jamais
un futur développeur les réutilise par erreur, l'appel échouera en 404.

Précision par rapport au mapping initial de cet audit : `menu.api.js:663` `getProductTypes()` et
`:685` `getProductCategories()` **ne sont pas mortes** — elles sont activement utilisées par
`src/composables/useSpaceData.js:15,165-166`. Le cluster réellement mort et pointant vers des
routes fantômes se limite à `createProductType`/`createProductCategory` et aux 5 fonctions
`*Categories`/`*Types` génériques.

## Cause racine

Reliquat de refactor : `product.api.js` a été introduit comme client dédié pour ProductType/Category
sans que l'ancien code de `menu.api.js` soit nettoyé, et `getAllCategories`/`getAllTypes`/etc.
semblent être un essai d'API générique jamais concrétisé côté backend.

## Correction

Corrigé le 2026-07-19 : `createProductType`, `createProductCategory`, `getAllCategories`,
`createCategory`, `getAllCategoryAggregations`, `getAllTypes`, `createType` supprimés de
`menu.api.js`, ainsi que `getAllTypeAggregations` (`/types/aggregations`), trouvée dans le même
cluster mort lors de la vérification finale des appelants (même famille — aucune référence en
dehors de `menu.api.js` lui-même ; les seuls appelants réels de `getAllCategories`/`getAllTypes`/
`getAllCategoryAggregations`/`getAllTypeAggregations`/`createCategory`/`createType` sont
`MenuItemsLibraryPanel.vue`/`TypeCategorySelector.vue`, qui importent depuis `utils/api.js`, pas
`menu.api.js`). `getProductTypes`/`getProductCategories` conservées telles quelles (utilisées par
`useSpaceData.js`), non migrées vers `product.api.js` dans ce passage pour limiter le risque —
migration possible dans un futur nettoyage séparé.

## Risque de régression / à surveiller

Suppression confirmée sans impact : grep final de `frontend/src` avant suppression, zéro appelant
des 8 fonctions retirées en dehors de leur propre définition. Non reproduit en navigateur (pas de
`pnpm dev` dans cette session) — à valider manuellement que les écrans consommant `menu.api.js`
(MenuComponent, Suppliers, Packaging, MarketPrices) continuent de fonctionner normalement.

## Références

- [`frontend/docs/modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md), section "Code mort de ce domaine".
