# BUG-044 — Import CSV Market Prices : `pricePerUnit` mappé depuis "Cost Per Recipe Unit" (double application de la conversion)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:446-474,607` (avant fix)

## Symptôme

Un import CSV mappant à la fois "Purchase Unit Conversion" (≠ 1) et "Cost Per Recipe Unit (EUR)"
(comme le suggérait le template téléchargeable lui-même) produit un `costPerRecipeUnit` faux sur
l'Ingredient/Packaging auto-créé lié — la conversion est appliquée une seconde fois en aval.

## Cause racine

Dans toute l'application, `pricePerUnit` est **toujours une valeur dérivée**, jamais saisie
directement : `price / unitsPerPurchase`, calculée par `recomputePricePerUnit()` dans
`MarketPriceCreateDrawer.vue:1029-1034` et `MarketPriceEditSupplierDrawer.vue:963-967` (jamais un
champ d'entrée dans ces deux drawers). Le backend fait ensuite confiance à cette valeur telle
quelle (`create()`/`bulkCreate()` stockent `dto.pricePerUnit` sans recalcul serveur), puis
`computeRecipeCosts()` (`market-prices.service.ts:419-434`) dérive
`costPerRecipeUnit = pricePerUnit × purchaseUnitConversion`.

L'import CSV (avant fix) contournait cette règle : l'alias `pricePerUnit` (lignes 458-461)
mappait la colonne "Cost Per Recipe Unit (EUR)" — qui représente déjà `pricePerUnit ×
purchaseUnitConversion` — directement dans le champ `pricePerUnit` envoyé au backend. Résultat :
`purchaseUnitConversion` était appliqué une deuxième fois lors du calcul du coût recette de
l'Ingredient/Packaging.

## Correction

- `pricePerUnit` retiré de la liste des champs mappables (`priceFields`) : il n'est plus possible
  de le faire pointer sur une colonne CSV, exactement comme il n'est saisissable dans aucun des
  drawers manuels de l'app.
- L'alias `pricePerUnit` (`costperrecipeuniteur`, etc.) supprimé d'`autoMap()`.
- `doImport()` calcule désormais `pricePerUnit = unitsPerPurchase > 0 ? price / unitsPerPurchase :
  price`, exactement la même formule que `recomputePricePerUnit()`.
- Colonne "Cost Per Recipe Unit (EUR)" retirée du template téléchargeable (`downloadTemplate()`) :
  c'est une valeur dérivée de second niveau sans champ d'entrée correspondant côté API, la garder
  dans le template inviterait à la remplir pour rien.

## Risque de régression / à surveiller

- Vérifier qu'un import avec "Purchase Unit Conversion" ≠ 1 donne désormais un `costPerRecipeUnit`
  cohérent sur l'Ingredient/Packaging auto-créé (comparer avec une création manuelle équivalente
  via `MarketPriceCreateDrawer.vue`).
- L'export CSV (`MarketPriceListView.vue exportToCSV`) continue d'exporter une colonne "Cost Per
  Recipe Unit (EUR)" à titre informatif (lecture seule) — volontairement non touché, puisque le
  bug ne concernait que la ré-importation de cette colonne comme entrée, pas son export.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] — même composant, même analyse.
