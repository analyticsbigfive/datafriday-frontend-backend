# BUG-161 — Good/Component Categories : dérivées de l'endpoint Types au lieu de leur propre endpoint dédié

- **Statut** : 🔴 Ouvert
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

Reste à faire — arbitrage à faire avant de corriger : soit aligner Good/Component Categories sur le
pattern de Menu Item Categories (appeler leur propre endpoint dédié), soit assumer le pattern
dérivé-des-Types partout et supprimer le code mort `getMarketPriceCategories()`/
`getComponentCategories()` côté API et le contrôleur `GET /market-price-categories`/
`/component-categories` côté backend si jugé définitivement inutile.

## Risque de régression / à surveiller

Si on bascule vers l'endpoint dédié : vérifier que le filtre `?typeId=` (jamais exploité
aujourd'hui) n'était pas silencieusement nécessaire à un comportement front implicite.

## Références

- [BUG-163](163_good_component_cross_invalidation_absente.md) — conséquence directe côté invalidation de cache.
