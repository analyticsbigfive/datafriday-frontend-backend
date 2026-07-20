# BUG-161 — Good/Component Categories : dérivées de l'endpoint Types au lieu de leur propre endpoint dédié

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels / Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/store/modules/marketPriceCategories.js:1,44-65` (`fetchMarketPriceCategories` appelle `getMarketPriceTypes()`, jamais `getMarketPriceCategories()`)
  - `src/store/modules/componentCategories.js:1,48-69` (même pattern, appelle `getComponentTypes()`)
  - `src/api/endpoints/market.price.api.js:88` (`getMarketPriceCategories()`, zéro appelant)
  - `src/api/endpoints/menu.api.js:156-158` (`getComponentCategories()`, zéro appelant, y compris le filtre serveur `?typeId=` jamais exploité)

## Symptôme

Sur 2 des 3 paires Type/Category de Configurations (Good, Component), la page Categories ne lit
**pas** via son propre endpoint `GET /market-price-categories`/`GET /component-categories` —
pourtant pleinement implémenté côté backend, filtre `?typeId=` inclus. Le store `fetchXCategories`
appelle en réalité `getXTypes()` et dérive les catégories côté client en aplatissant (`flatMap`) le
`categories[]` imbriqué de chaque type. `Menu Item Categories` (`ProductCategoryList`), elle,
appelle bien son propre `getProductCategory()` — les 3 paires ne sont donc pas implémentées de
façon uniforme.

Conséquence directe : `getMarketPriceCategories()`/`getComponentCategories()` sont du code mort côté
front malgré leur implémentation backend complète, et chaque chargement de la page Categories paie
le coût du payload plus lourd de l'endpoint Types (voir aussi [BUG-163](163_good_component_cross_invalidation_absente.md)
pour l'incohérence d'invalidation de cache que ce pattern entraîne).

## Cause racine

Choix d'implémentation divergent entre la taxonomie ProductType/Category (implémentée en premier,
selon toute vraisemblance) et les deux suivantes (Component, MarketPrice), qui ont réutilisé le
payload déjà chargé par la page Types plutôt que d'appeler leur propre endpoint.

## Correction

Alignement sur le pattern de Menu Item Categories (`productCategories.js`) : les deux modules
appellent désormais leur propre endpoint dédié au lieu de dériver depuis Types.

- `src/store/modules/marketPriceCategories.js:1` — import remplacé par
  `getMarketPriceCategories` (`@/api/endpoints/market.price.api`).
- `src/store/modules/marketPriceCategories.js:43-82` (`fetchMarketPriceCategories`) — appelle
  `getMarketPriceCategories()` au lieu de `getMarketPriceTypes()` ; `state.list` est maintenant
  construit par un `.map()` direct sur la réponse plate de l'endpoint (au lieu du `.flatMap()` sur
  `type.categories[]`) ; `typeId`/`typeName` sont résolus depuis le payload de la catégorie
  elle-même (`c.typeId`/`c.type`/`c.marketPriceTypeId`) avec fallback sur le cache
  `rootGetters['marketPriceTypes/marketPriceTypes']` si le nom du type n'est pas déjà inclus.
- `src/store/modules/componentCategories.js:1` — import remplacé par `getComponentCategories`
  (`@/api/endpoints/menu.api`).
- `src/store/modules/componentCategories.js:43-82` (`fetchComponentCategories`) — même
  transformation, avec `rootGetters['componentTypes/componentTypes']` comme fallback de nom de type.

État `{list, cachedAt, fetching}`, getters (`marketPriceCategories`/`componentCategories`,
`isCacheValid`) et contrat TTL (15 min) inchangés — seule la source de données change.

Voir aussi [BUG-163](163_good_component_cross_invalidation_absente.md) pour le câblage
d'invalidation croisée ajouté dans les actions `add`/`update`/`removeMarketPriceCategory` et
`add`/`update`/`removeComponentCategory` du même changement.

## Risque de régression / à surveiller

Corrigé sur revue de code uniquement (pas de `pnpm dev` cette session) — nécessite une validation
manuelle. En particulier : aucun appelant recensé de `fetchMarketPriceCategories`/
`fetchComponentCategories` ne passe de `typeId` (le filtre `?typeId=` de
`getMarketPriceCategories()`/`getComponentCategories()` n'est toujours pas exploité côté front,
comme avant ce correctif) — donc pas de régression sur ce point, mais si un futur consommateur a
besoin de filtrer par type, il faudra étendre la signature des fonctions API (actuellement sans
paramètre) sur le modèle de `getProductCategories(typeId)`.

## Références

- [BUG-163](163_good_component_cross_invalidation_absente.md) — conséquence directe côté invalidation de cache.
