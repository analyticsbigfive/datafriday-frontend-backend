# BUG-015 — La formule de CA du pipeline d'agrégation vivant ne convertit jamais TTC→HT

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Bloquant (montants HT faux dans les agrégats)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `aggregation.service.ts:264-300` (vivant), `space-aggregation.service.ts:171-178` (mort, correct), `spaces.service.ts:1118-1121` (calcul live, correct)

## Symptôme

Comparer `SpaceRevenueMinuteAgg.revenueHt` d'un event à la somme calculée par
`GET /spaces/:id/event-timeline/:eventId` pour le même event : les deux divergent.

## Cause racine

`aggregation.service.ts` (le pipeline réellement exécuté) ne divise jamais par `1+vat/100` pour
passer du TTC au HT — contrairement au pipeline mort `SpaceAggregationService` et au calcul
live `getEventTimelineBatch`, qui font tous deux la conversion correctement.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

Backfill nécessaire sur les agrégats déjà écrits avec cette formule fausse.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #2
