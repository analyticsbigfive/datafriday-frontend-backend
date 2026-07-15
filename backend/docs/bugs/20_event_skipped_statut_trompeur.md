# BUG-020 — Un event "skipped" après traitement réussi garde un statut trompeur

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `aggregation.service.ts:51-70` (`getEventsTimelineStatus`)

## Symptôme

Traiter un event avec succès, puis appeler `skip-event` dessus, puis relire `events-timeline` : le
comptage `dataPoints` et le statut affiché ne sont pas garantis cohérents.

## Cause racine

`getEventsTimelineStatus` ne distingue pas "jamais traité" de "traité puis marqué skip a
posteriori" — les données déjà agrégées restent en base mais le statut affiché ne le reflète pas
fidèlement.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #7
