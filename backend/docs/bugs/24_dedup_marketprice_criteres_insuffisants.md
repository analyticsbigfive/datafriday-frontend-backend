# BUG-024 — Dédup MarketPrice ignore prix/unité/quantité

- **Statut** : 🔴 Ouvert
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

## Correction

Aucune à ce jour — resserrer la clé de dédup ou documenter explicitement pourquoi ces champs sont
exclus si c'est voulu.

## Risque de régression / à surveiller

Auditer les fusions déjà effectuées pour repérer une éventuelle perte de données de prix distincts.

## Références

- `datafriday-web/docs/modules/04_MENU_CATALOGUE.md` §"Récapitulatif — bugs actifs de ce domaine" #5
