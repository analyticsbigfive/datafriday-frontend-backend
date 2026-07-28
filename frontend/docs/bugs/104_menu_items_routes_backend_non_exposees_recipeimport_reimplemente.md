# BUG-104 — `menu-item.api.js` : 3 routes backend utiles non exposées, RecipeImportDrawer réimplémente en boucle

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/api/endpoints/menu-item.api.js`, `src/components/menu-fb/views/menu-items/drawers/RecipeImportDrawer.vue:220-246`

## Symptôme

`POST /menu-items/recipes` (import/lecture batch de recettes), `GET /menu-items/:id/recipe`
(recette unitaire résolue), `POST /menu-items/backfill-weezevent-prices` (backfill de masse des
prix) sont des routes backend actives (`menu-items.controller.ts`) sans aucune fonction
correspondante dans le client API. Conséquence concrète : `RecipeImportDrawer.vue` (`apply()`)
réimplémente l'import de recette manuellement en boucle séquentielle (N appels `updateMenuItem` +
N appels `replaceMenuItemIngredients` au lieu d'un seul appel batch), avec en plus un `catch` muet
sur la partie `updateMenuItem` de la boucle (voir [[94_menu_items_recipeimportdrawer_readyforsale_echecs_invisibles]]).

## Cause racine

Ces 3 routes backend n'ont jamais été câblées côté client au moment de leur ajout — lecture
directe de `menu-items.controller.ts` confirmée contre les 195 lignes de `menu-item.api.js`.

## Correction

Ajout de `getMenuItemRecipe(id)` → `GET /menu-items/:id/recipe`, `getMenuItemRecipes(ids)` →
`POST /menu-items/recipes`, `backfillWeezeventPrices(opts)` → `POST
/menu-items/backfill-weezevent-prices` dans `menu-item.api.js`. `RecipeImportDrawer.vue` continue
d'utiliser la boucle `updateMenuItem`/`replaceMenuItemIngredients` pour l'instant (la migration
complète vers l'appel batch `POST /menu-items/recipes` nécessite de vérifier que son contrat
d'entrée correspond exactement au format CSV du drawer — non fait dans ce lot pour éviter de
changer le comportement fonctionnel de l'import en même temps que son error-handling, déjà corrigé
séparément).

## Risque de régression / à surveiller

La migration de `RecipeImportDrawer.vue` vers l'appel batch reste à faire (gain de perf potentiel
sur un import de recette volumineux) — vérifier le contrat exact de `POST /menu-items/recipes`
avant de la tenter.

## Références

- [[94_menu_items_recipeimportdrawer_readyforsale_echecs_invisibles]]
