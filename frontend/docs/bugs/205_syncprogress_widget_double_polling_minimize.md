# BUG-205 — Double polling confirmé entre le dialog et le widget flottant après minimisation d'un job

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/SyncProgressDialog.vue:279-284,443-478,479-485`
  (`minimizeJob`), `src/components/SyncJobFloatingWidget.vue:154-181`

## Symptôme

`minimizeJob()` (dialog, lignes 479-485) se contente de `localStorage.setItem(...)`, `$emit
('job-minimized', ...)`, `$emit('done')` — il n'appelle jamais `_stopJobPoll()`. `$emit('done')`
ne fait que passer `syncProgressOpen = false` côté parent (`onSyncProgressDone`), ce qui masque
visuellement le `v-dialog` sans détruire son contenu (Vuetify garde le slot monté après une
première ouverture, sans `eager`). Comme la valeur de la prop `jobId` ne change pas au minimize, le
watcher sur `jobId` (lignes 397-403) ne se redéclenche pas, donc `_pollTimer` (intervalle **3000
ms**) continue de tourner en arrière-plan pour toute la durée restante du job. En parallèle,
`onJobMinimized` (parent, 1618-1622) appelle `this.$refs.syncJobWidget.activate(jobId)`, qui
démarre son **propre** polling indépendant à **5000 ms** (`POLL_INTERVAL`, widget ligne 79).
Résultat : chaque minimisation fait tourner deux composants qui interrogent
`getWeezeventJobStatus(jobId)` en parallèle à des cadences différentes — charge réseau doublée,
deux copies divergentes de `jobData`.

## Cause racine

Le dialog n'a pas de `watch` sur la prop `open`, et `minimizeJob()` n'appelle pas `_stopJobPoll()`
— le dialog a été écrit en supposant qu'il reste "le" poller, mais le relais vers le widget ne
transfère pas réellement la responsabilité.

## Correction

Rien à ce jour. Appeler `_stopJobPoll()` dans `minimizeJob()` avant d'émettre `job-minimized`.

## Risque de régression / à surveiller

Le poll du dialog s'arrête de lui-même une fois que *son propre* job stale atteint un état terminal
(`_stopJobPoll()` appelé dans `poll()`), donc ce n'est pas une boucle infinie — mais elle tourne
pendant toute la durée du job, avec `syncJobId` non réinitialisé pendant cette fenêtre (voir
BUG-204).

## Références

- BUG-204 (`syncJobId` jamais réinitialisé — cause adjacente).
- BUG-207 (le widget ne survit pas réellement à la navigation).
