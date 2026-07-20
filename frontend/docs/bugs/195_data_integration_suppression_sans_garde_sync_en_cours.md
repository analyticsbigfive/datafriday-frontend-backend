# BUG-195 — Aucune protection contre la suppression d'une intégration en cours de synchronisation

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:66-70` (bouton non désactivé), `:1318-1357`
  (`handleRemoveIntegration`/`confirmRemoveIntegration`)

## Symptôme

Repro : démarrer une synchronisation sur une carte d'intégration (`syncingMap[id]=true`), puis
cliquer immédiatement sur l'icône de suppression de la même carte et confirmer. L'intégration est
supprimée en plein milieu du sync ; la boucle `handleSync` en cours continue d'appeler
`getWeezeventSyncStatus`/`syncWeezeventData` contre un id qui n'existe plus côté backend, générant
des erreurs fatales génériques dans le dialog de sync. Même risque côté sync par job
(`WeezeventSyncJob` à l'état `COLLECTING`).

## Cause racine

Ni le binding du bouton de suppression, ni `handleRemoveIntegration`/`confirmRemoveIntegration` ne
vérifient `syncingMap[id]` ou l'état d'un job en cours (`syncJobsMap[id]`) avant d'autoriser la
suppression.

## Correction

Rien à ce jour. Désactiver le bouton de suppression (ou avertir explicitement dans le dialog de
confirmation) tant qu'un sync est en cours pour cette intégration.

## Risque de régression / à surveiller

À tester manuellement : suppression pendant sync legacy ET pendant sync par job (bissection).

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (Piège n°2, 3 mécanismes de sync).
