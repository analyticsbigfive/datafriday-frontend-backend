# BUG-86 — Suppression `Industrial` sans garde ni avertissement d'usage

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Configurations — Industrials)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/industrials/industrials.service.ts:52-57` (`remove`), `prisma/schema.prisma:838` (`MarketPrice.industrial`, `onDelete: SetNull`)

## Symptôme

Même mécanisme que [BUG-85](85_suppression_brand_displayname_sans_garde_usage.md) : supprimer un
`Industrial` référencé par des `MarketPrice` réussit silencieusement (`SetNull`, pas de crash) mais
détache `industrialId` de toutes les lignes concernées sans décompte ni avertissement.
`IndustrialDeleteDialog.vue:21-28` affiche uniquement le nom, jamais un "utilisé par N market
prices".

## Cause racine

`remove()` ne compte pas les `MarketPrice` référençant l'`Industrial` avant suppression.

## Correction

Reste à faire — même arbitrage que BUG-85 (avertissement avec décompte, ou blocage strict).

## Risque de régression / à surveiller

Voir BUG-85.

## Références

- [BUG-85](85_suppression_brand_displayname_sans_garde_usage.md) — même famille sur `Brand`/`DisplayName`.
