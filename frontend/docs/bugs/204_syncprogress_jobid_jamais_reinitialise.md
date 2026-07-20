# BUG-204 — `syncJobId` n'est jamais réinitialisé : le mode legacy devient inutilisable après un premier sync par job

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:919,1365-1407,1614-1622,1671-1676` (état),
  `src/components/integration/SyncProgressDialog.vue:54,124,397-403` (consommation)

## Symptôme

`syncJobId` (`data()` ligne 919) n'est mis à `null` qu'une seule fois, au tout début de
`handleSyncJob` (ligne 1626), puis réassigné à un vrai id juste après (ligne 1637). Il n'est
**jamais** remis à `null` dans `closeSyncProgress()` (1614-1616), `onSyncProgressDone()`
(1671-1676), `onJobMinimized()` (1618-1622), ni nulle part dans la branche legacy de `handleSync()`
(1377-1407).

Repro : l'utilisateur lance une seule sync par job (dates renseignées) à un moment quelconque de la
session — même une seule fois, même pour une autre intégration. Ensuite, toute sync legacy
(`handleSync` sans dates) lie quand même `:job-id="syncJobId"` (dialog ligne 599) à l'ancien id
non-nul. Le template de `SyncProgressDialog` bascule uniquement sur `v-if="jobId"` (test de
vérité) — pas sur le statut du job — donc le dialog affiche silencieusement l'UI figée du mode job
(anciennes `jobData`) au lieu des `syncSteps` legacy que le parent met pourtant à jour activement.
L'utilisateur voit un écran de progression gelé/faux ; la vraie sync legacy tourne de façon
invisible.

## Cause racine

`syncJobId` est un scalaire unique partagé entre les deux modes de sync, sans remise à zéro au
changement de mode ; le sélecteur de mode du dialog (`v-if="jobId"`) se fie à la simple présence de
la prop plutôt qu'à une prop `mode` explicite.

## Correction

Rien à ce jour. Réinitialiser `syncJobId = null` dans `closeSyncProgress`, `onSyncProgressDone`, et
au début de la branche legacy de `handleSync`. À terme, envisager une prop `mode` explicite
(`'legacy' | 'job'`) plutôt qu'un test de vérité sur `jobId`.

## Risque de régression / à surveiller

Corréler avec BUG-205 (double-polling au minimize) et BUG-196 (sync job sans `syncingMap`) — les
trois bugs touchent la même zone d'état partagé entre les deux mécanismes de sync côté UI.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (Piège n°2, 3 mécanismes de synchronisation).
