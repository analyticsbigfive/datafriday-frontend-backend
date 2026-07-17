# BUG-092 — Aucun filtre `active=true` dans les pickers Ingredient/Packaging

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/IngredientPickerDrawer.vue`, `src/components/menu-fb/views/menu-items/drawers/PackagingPickerDrawer.vue`

## Symptôme

Un ingrédient ou packaging désactivé (`active=false`, censé être masqué des dialogs de sélection
selon `docs/modules/04_MENU_CATALOGUE.md`) reste sélectionnable dans ces deux drawers pour composer
la recette d'un MenuItem.

## Cause racine

Ni les computed `rows`/`normalizeRow` de `IngredientPickerDrawer.vue`, ni ceux de
`PackagingPickerDrawer.vue`, ni les actions Vuex correspondantes ne filtrent sur `active`.

## Correction

`.filter(r => r.active !== false)` ajouté dans les computed `rows` des deux drawers.

## Risque de régression / à surveiller

Confirmer que le filtrage n'est pas déjà fait côté backend (auquel cas ce fix front est redondant
mais inoffensif) — si le backend renvoie déjà uniquement les actifs, ce filtre reste une garde
défensive utile sans effet visible.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (champ `active` sur Ingredient/Packaging).
