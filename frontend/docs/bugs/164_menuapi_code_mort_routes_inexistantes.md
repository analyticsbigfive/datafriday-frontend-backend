# BUG-164 — `menu.api.js` : code mort pointant vers des routes backend inexistantes (`/categories`, `/types`)

- **Statut** : 🔴 Ouvert
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

Reste à faire : supprimer `createProductType`, `createProductCategory`, `getAllCategories`,
`createCategory`, `getAllCategoryAggregations`, `getAllTypes`, `createType` de `menu.api.js`.
Conserver `getProductTypes`/`getProductCategories` (utilisées par `useSpaceData.js`) ou les migrer
vers `product.api.js` pour cohérence avec le reste du domaine (voir aussi la note de
`frontend/docs/modules/04_MENU_CATALOGUE.md:439-441` sur ce même fichier).

## Risque de régression / à surveiller

Avant suppression, re-grep `frontend/src` pour confirmer zéro appelant (déjà fait dans cette
session, mais à revérifier au moment du fix si du code a changé entre-temps).

## Références

- [`frontend/docs/modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md), section "Code mort de ce domaine".
