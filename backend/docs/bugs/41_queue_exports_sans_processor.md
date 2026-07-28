# BUG-041 — Queue EXPORTS enregistrée dans BullMQ sans aucun processor

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Latent (corrigé) — aucun appelant de `queueExport()` à ce jour ; le processor est
  désormais en place pour que ce ne soit plus un piège si un appelant apparaît
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `queue.module.ts:41-47` (registerQueue), `:51-57` (providers — `ExportProcessor`
  ajouté), `processors/export.processor.ts` (nouveau)

## Symptôme

Aucun aujourd'hui — mais un job poussé dans la queue `EXPORTS` resterait bloqué indéfiniment
(`waiting` permanent), sans erreur visible.

## Cause racine

La queue `EXPORTS` est enregistrée côté BullMQ (`registerQueue`) mais aucun processor n'est
déclaré dans les `providers` pour la consommer.

## Correction

### Correction appliquée (2026-07-24)

Ajout d'un `ExportProcessor` (`src/core/queue/processors/export.processor.ts`), enregistré dans
les `providers` de `queue.module.ts` aux côtés de `DataSyncProcessor`/`AnalyticsProcessor`/
`NotificationProcessor`. Il consomme la queue `EXPORTS` en suivant exactement le pattern déjà en
place pour `NotificationProcessor`/`AnalyticsProcessor` : switch sur `job.data.type`
(`csv`/`excel`/`pdf`), log, et renvoi d'un objet de statut placeholder (`status: 'generated'`) —
pas de génération réelle de fichier (comme `NotificationProcessor` n'envoie pas de vrai email
aujourd'hui). Un job poussé dans `EXPORTS` ne reste donc plus bloqué en `waiting` indéfiniment.

Choix : ajout du processor plutôt que suppression de la queue, car la forme des jobs d'export est
déjà bien définie (`ExportJobData` : `type: csv|excel|pdf`, `tenantId`, `userId`, `reportType`,
`params`) et un pattern identique existait déjà pour `NOTIFICATIONS` (queue elle aussi sans appelant
réel mais dotée d'un processor placeholder). Génération réelle des fichiers (CSV/Excel/PDF) toujours
à implémenter avant tout usage en production de `queueExport()`.

Tests : `src/core/queue/processors/export.processor.spec.ts` (nouveau, calqué sur
`notification.processor.spec.ts`) + `queue.service.spec.ts` (existant, couvre déjà `queueExport`).

## Risque de régression / à surveiller

Le processor ajouté est un placeholder (aucune génération réelle de CSV/Excel/PDF, cf.
`export.processor.ts`). Avant de brancher un appelant réel de `queueExport()` (UI export, endpoint,
etc.), implémenter la logique métier réelle dans `ExportProcessor.processCsv/processExcel/processPdf`
(stockage du fichier, notification à l'utilisateur, etc.) — sinon les jobs seront marqués `completed`
sans qu'aucun fichier n'ait été produit.

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #3
