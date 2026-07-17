# BUG-089 — Pickers Ingredient/Packaging : cap silencieux de pagination (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/store/modules/marketPriceIngredients.js:34-55`, `src/store/modules/packaging.js:34-51`

## Symptôme

Si un tenant a plus d'ingrédients/packagings que la limite par défaut du backend, les lignes
au-delà sont silencieusement absentes de `IngredientPickerDrawer.vue`/`PackagingPickerDrawer.vue`
(utilisés depuis `/menu-items` pour composer la recette d'un article) : pas d'erreur, pas
d'indicateur "liste tronquée".

## Cause racine

`marketPriceIngredients.js` (`getMarketPricesWithIngredients()`) et `packaging.js`
(`getPackaging()`) font un **unique** appel sans `page`/`limit`, alors que `menu.api.js` supporte
déjà ces paramètres (`{ page, limit, search, category, goodType }`) — le pattern de fix existe
déjà dans le repo (`menuComponents.js`, BUG-054) mais n'avait jamais été appliqué à ces deux
modules.

## Correction

Les deux modules bouclent désormais explicitement sur `page`/`limit` jusqu'à `meta.total`, sur le
même modèle que `menuComponents.js`.

## Risque de régression / à surveiller

Vérifier le temps de chargement des deux pickers sur un tenant avec un grand nombre
d'ingrédients/packagings — la boucle de pagination ajoute des allers-retours réseau
supplémentaires par rapport à l'appel unique précédent (tronqué).

## Références

- [[54_menu_components_get_plafond_silencieux_100_lignes_mirror]]
- [[40_market_prices_cap_silencieux_200_lignes_mirror]]
