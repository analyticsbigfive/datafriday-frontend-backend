# BUG-024 — Dédup MarketPrice ignore prix/unité/quantité

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (risque de fusion excessive)
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `market-prices.service.ts` (`deduplicate`)

## Symptôme

Deux entrées MarketPrice légitimement différentes (prix, unité ou quantité différents) peuvent être
fusionnées à tort par la déduplication.

## Cause racine

La clé de dédup ne prend pas en compte le prix, l'unité ni la quantité — seulement les champs
identitaires du produit — ce qui la rend plus permissive qu'avant (voir aussi
`docs/modules/04_MENU_CATALOGUE.md` "Dédup MarketPrice — la clé a changé").

## Correction appliquée

La clé de `deduplicate()` (`market-prices.service.ts:692-699`) inclut désormais `price`, `unit`
et `unitsPerPurchase` (quantité par lot) en plus de `itemName`/fournisseur — deux lignes ne sont
considérées comme doublons que si TOUS ces champs sont identiques (resserrement pur, ne peut que
réduire le nombre de fusions, jamais en introduire de nouvelles). `price` est un champ Prisma
`Decimal` : conformément au pattern déjà établi par BUG-57 (ne jamais comparer un `Decimal` à un
`number` JS brut), la valeur est convertie explicitement via `.toString()` avant d'entrer dans la
clé plutôt que de compter sur la coercition implicite d'un template literal — ici il ne s'agit pas
d'un `where` Prisma mais le risque de représentation incohérente est le même en substance.

Tests unitaires ajoutés dans `market-prices.service.spec.ts` (4/4 passent) : même produit/fournisseur
avec prix différent → pas doublon ; même produit/fournisseur/prix avec unité différente → pas
doublon ; même produit/fournisseur/prix/unité avec quantité (`unitsPerPurchase`) différente → pas
doublon ; lignes strictement identiques (y compris prix/unité/quantité) → toujours détectées comme
doublons (la plus récente conservée, `orderBy createdAt desc`).

## Risque de régression / à surveiller

Auditer les fusions déjà effectuées **avant ce fix** (clé permissive) pour repérer une éventuelle
perte de données de prix/conditionnements distincts fusionnés à tort — ce fix ne restaure pas les
lignes déjà supprimées par d'anciens appels à `deduplicate()`, il empêche seulement toute nouvelle
fusion incorrecte à l'avenir. Cet audit n'a pas été fait ici (hors périmètre de ce fix) et aucun
nettoyage de données n'a été tenté.

## Références

- `datafriday-web/docs/modules/04_MENU_CATALOGUE.md` §"Récapitulatif — bugs actifs de ce domaine" #5
