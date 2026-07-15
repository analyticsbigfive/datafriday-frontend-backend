# BUG-027 — Garde anti-double-run du cron Weezevent inopérante

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Faible (aucun cas observé documenté, risque théorique)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `weezevent-cron.service.ts:49`, `SyncTrackerService` (0 appelant `startSync`/`completeSync`)

## Symptôme

Deux exécutions du cron Weezevent peuvent théoriquement se chevaucher sans être bloquées.

## Cause racine

`SyncTrackerService` (censé porter la garde anti-double-run) n'est jamais alimenté — aucun code
n'appelle `startSync`/`completeSync`.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #3
