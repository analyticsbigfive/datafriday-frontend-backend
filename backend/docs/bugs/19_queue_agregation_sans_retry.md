# BUG-019 — Aucun retry BullMQ sur la queue d'agrégation

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `queue.service.ts:274` vs `queue.module.ts:29-37`

## Symptôme

Provoquer un timeout DB transitoire pendant un `synchronize` : le job échoue définitivement, aucune
notification de relance automatique.

## Cause racine

La queue d'agrégation est configurée avec `attempts:1`, ce qui écrase explicitement le défaut
global `attempts:3` + backoff défini par ailleurs.

## Correction

Aucune à ce jour — retirer l'écrasement local ou le justifier explicitement en commentaire si
volontaire.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #6
