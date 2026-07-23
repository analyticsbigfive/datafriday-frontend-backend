# BUG-027 — Garde anti-double-run du cron Weezevent inopérante

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🟡 Faible (aucun cas observé documenté, risque théorique)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `weezevent-cron.service.ts` (`syncRecentTransactions`), `sync-tracker.service.ts`

## Symptôme

Deux exécutions du cron Weezevent peuvent théoriquement se chevaucher sans être bloquées.

## Cause racine

`SyncTrackerService` (censé porter la garde anti-double-run) n'était jamais alimenté — le seul
appelant, `syncRecentTransactions`, lisait `getRunningSyncs()` (toujours `[]`, jamais peuplé) sans
jamais appeler `startSync`/`completeSync`/`failSync`.

## Correction

- `startSync`/`completeSync`/`failSync` câblés autour de chaque sync d'intégration dans
  `syncRecentTransactions`.
- `SyncTrackerService` étendu pour scoper par `integrationId` en plus de `tenantId`
  (`startSync`/`getRunningSyncs`/`isRunning` acceptent maintenant un `integrationId` optionnel) —
  sans ce scope, un lock tenant-only aurait bloqué à tort la sync d'une 2ᵉ intégration Weezevent
  pendant que la 1ère tourne, un cas réel depuis le fix BUG-025 (2 tenants avec 3-4 intégrations
  actives). Rétrocompatible : appels existants sans `integrationId` gardent leur comportement
  tenant-wide.
- Les deux autres crons (`syncReferenceData` quotidien, `fullHistoricalSync` hebdomadaire) n'avaient
  **aucune** garde à l'origine (pas seulement inopérante) — hors périmètre de ce ticket, qui ne
  documentait que `syncRecentTransactions:49`. Non ajoutée ici pour rester strictement scopé au bug
  documenté ; le risque de chevauchement y est plus faible (fréquence beaucoup plus basse).

## Risque de régression / à surveiller

- `SyncTrackerService` reste une Map en mémoire **process-local** — ne protège pas contre un
  double-run multi-instance si le backend est un jour scalé horizontalement (un verrou DB/Redis
  serait alors nécessaire). Suffisant pour un déploiement mono-instance.
- Tests mis à jour (`weezevent-cron.service.spec.ts`) : la garde bloque bien un run déjà en cours
  (scopé par intégration), un run réussi appelle `completeSync`, un run en échec appelle `failSync`
  sans propager l'exception.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #3
