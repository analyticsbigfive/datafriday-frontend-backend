# BUG-016 — SpaceProductRevenueDailyAgg et SpaceRevenueMinuteAgg divergent en périmètre

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `aggregation.service.ts:284-285` (exclut), `:303-329` (inclut)

## Symptôme

Sommer les deux tables pour le même event/tenant sur un espace avec des ventes non mappées à un
MenuItem donne deux totaux différents.

## Cause racine

`SpaceProductRevenueDailyAgg` inclut les ventes de produits non mappés à un `MenuItem`,
`SpaceRevenueMinuteAgg` les exclut (INNER JOIN) — deux tables censées décrire le même historique
divergent en périmètre sans que ce soit documenté ni intentionnel.

## Correction

Aucune à ce jour — décider quel périmètre est la cible (probablement inclure partout, avec un flag
"non mappé" plutôt qu'une exclusion silencieuse).

## Risque de régression / à surveiller

Tout écran qui croise ces deux tables (dashboards, exports) doit être audité une fois la règle
tranchée.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #3
