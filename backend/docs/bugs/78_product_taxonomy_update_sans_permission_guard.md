# BUG-78 — `PATCH /product-types/:id` et `/product-categories/:id` sans `@RequirePermissions` (contrôle d'accès contourné)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/menu-items/menu-items.controller.ts:410-422` (`ProductTypesController.update`), `:467-483` (`ProductCategoriesController.update`)

## Symptôme

`PATCH /product-types/:id` et `PATCH /product-categories/:id` n'ont aucune métadonnée
`@RequirePermissions(...)`, contrairement à `create`/`remove` sur ces mêmes contrôleurs, qui sont
bien protégés. `src/core/auth/guards/permissions.guard.ts:11` documente explicitement que
l'absence de métadonnée `@RequirePermissions` équivaut à un accès autorisé pour tout utilisateur
authentifié. Concrètement : **n'importe quel utilisateur authentifié du tenant, quel que soit son
rôle, peut renommer un Menu Item Type ou une Menu Item Category**, alors que la création et la
suppression de ces mêmes objets sont correctement réservées aux rôles habilités.

## Cause racine

Oubli isolé sur ces deux méthodes `update` uniquement. Comparaison avec 3 contrôleurs sœurs qui
gardent correctement leur `update()` : `MenuItemsController.update` (même fichier, ligne 363-364),
`component-taxonomy.controller.ts:50-51` (`ComponentTypesController`/`ComponentCategoriesController`),
`market-price-taxonomy.controller.ts:50-51` (`MarketPriceTypesController`/`...CategoriesController`).
Ce n'est donc pas une convention du projet mais un oubli localisé aux deux contrôleurs de
`menu-items.controller.ts`.

## Correction

Ajouté `@RequirePermissions('menu.fb.menuItems')` (la permission exacte déjà utilisée par
`create`/`remove` sur ces deux contrôleurs, pas `menu.config.manage` qui n'existe pas dans ce
fichier) sur les deux méthodes `update` :
- `src/features/menu-items/menu-items.controller.ts:410` (`ProductTypesController.update`, juste
  avant `@Patch(':id')`)
- `src/features/menu-items/menu-items.controller.ts:468` (`ProductCategoriesController.update`,
  juste avant `@Patch(':id')`)

## Risque de régression / à surveiller

Non testé en navigateur/via `pnpm dev` (indisponible dans cette session) — revue de code
uniquement, validation manuelle requise. Vérifier après le fix qu'un utilisateur sans la permission
`menu.fb.menuItems` reçoit bien un 403 sur `PATCH /product-types/:id` et
`PATCH /product-categories/:id`, et qu'un utilisateur habilité continue de pouvoir éditer
normalement depuis `/product-types`/`/product-categories`. Pas de migration de données nécessaire
(bug d'autorisation, pas de corruption de données).

## Références

- [`frontend/docs/modules/04_MENU_CATALOGUE.md`](../../../frontend/docs/modules/04_MENU_CATALOGUE.md), section "Les 3 taxonomies parallèles".
- Audit complet section Configurations, 2026-07-19 (BUG-78 à 88 côté backend, BUG-159 à 169 côté frontend).
