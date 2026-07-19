# BUG-163 — Good/Component Types↔Categories : pas d'invalidation croisée de cache, actions `invalidate` mortes

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels / Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/store/modules/marketPriceTypes.js:52-54`, `marketPriceCategories.js:57-59` (`invalidate`, jamais dispatché)
  - `src/store/modules/componentTypes.js:68-70`, `componentCategories.js:77-79` (idem)
  - `src/components/menu-fb/views/component-library/views/ComponentTypeList.vue:199` (mount sans `forceRefresh`)
  - `src/components/menu-fb/views/component-library/views/ComponentCategoryList.vue` (mount avec `forceRefresh`)
  - `src/components/menu-fb/views/component-library/drawers/ComponentTypeCategoriesDrawer.vue` (lit `componentType.categoryList`, source potentiellement périmée)

## Symptôme

Conséquence directe de [BUG-161](161_good_component_categories_derivees_endpoint_types.md) : la
page Categories (Good ou Component) mute uniquement l'état de son propre module Vuex
(`componentCategories`/`marketPriceCategories`) après create/update/delete — jamais celui du module
`Types`, qui contient pourtant sa propre copie indépendamment cachée du `categories[]` imbriqué par
type. Résultat : après avoir ajouté/renommé/supprimé une catégorie depuis la page Categories, le
chip de comptage de catégories et le contenu de `ComponentTypeCategoriesDrawer.vue` sur la page
Types peuvent rester périmés jusqu'à 15 minutes (TTL), dans la même session.

Par ailleurs, l'action `invalidate` existe dans les 4 modules concernés (`marketPriceTypes`,
`marketPriceCategories`, `componentTypes`, `componentCategories`) mais n'est **jamais dispatchée**
nulle part dans le code — le pattern de cache-invalidation documenté comme convention standard dans
`CLAUDE.md` est mort pour ces 4 modules ; en pratique, chaque page force un refetch complet
(`forceRefresh: true`) au montage à la place, sauf `ComponentTypeList.vue` qui ne le fait pas
(incohérence supplémentaire, page Types plus susceptible d'afficher des données périmées que la
page Categories correspondante).

## Cause racine

`invalidate` jamais câblé aux actions de mutation croisées (créer/éditer/supprimer une Category
devrait dispatcher `Types/invalidate`, et vice-versa au besoin) ; `ComponentTypeList.vue` mount sans
`forceRefresh` alors que sa page sœur `ComponentCategoryList.vue` en a un.

## Correction

Reste à faire : soit câbler `invalidate` sur le module croisé après chaque mutation Category/Type,
soit — option plus simple étant donné BUG-161 — une fois la dérivation Types→Categories supprimée,
ce problème disparaît de lui-même puisque Categories lirait alors sa propre source de vérité.
Corriger dans tous les cas l'incohérence `forceRefresh` de `ComponentTypeList.vue` vs
`ComponentCategoryList.vue`.

## Risque de régression / à surveiller

Auto-corrigé par TTL (15 min) ou rechargement — aucune corruption de données, juste un staleness
d'affichage.

## Références

- [BUG-161](161_good_component_categories_derivees_endpoint_types.md) — cause racine partagée.
