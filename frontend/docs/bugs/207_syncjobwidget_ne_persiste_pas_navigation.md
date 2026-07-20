# BUG-207 — Le widget flottant de sync ne survit pas à la navigation, contrairement à sa promesse

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/router/index.js:392` (`meta.keepAlive: true`), `src/App.vue:4`
  (`<router-view/>` sans `<keep-alive>`), `src/views/DataIntegrationView.vue:608`
  (`<SyncJobFloatingWidget>` monté comme enfant de la vue, pas à la racine de l'app)

## Symptôme

`App.vue` rend `<router-view/>` **sans** wrapper `<keep-alive>` (seul `DashboardView.vue:290` a un
`<keep-alive>` local pour ses propres onglets internes, sans rapport avec cette route). Donc
`meta.keepAlive: true` sur la route `/data-integration/fb` n'a aucun effet au niveau racine :
naviguer vers n'importe quelle autre route démonte complètement `DataIntegrationView.vue`, et avec
elle son enfant `SyncJobFloatingWidget` (monté en ligne à la ligne 608, pas globalement dans
`App.vue`). Conséquence : contrairement à l'objectif documenté du widget ("reste visible en
arrière-plan pendant que l'utilisateur navigue ailleurs"), il **disparaît entièrement** dès que
l'utilisateur quitte la page — il ne flotte pas au-dessus des autres routes.

Point positif : `beforeUnmount()` du widget nettoie correctement `_pollTimer`/`_hideTimer` (pas de
fuite d'intervalle), et comme `dismiss()` n'est pas appelé lors de ce démontage involontaire, la clé
`localStorage` `weezevent_active_job_id` survit — revenir sur `/data-integration/fb` plus tard
remonte correctement le widget et reprend le polling. Les *données* survivent, mais le comportement
*flottant/visible* qui donne son nom au composant ne survit pas à la navigation comme prévu.

## Cause racine

Architectural : le widget devrait être monté une seule fois dans `App.vue` (ou un autre shell
toujours monté) pour être un vrai overlay persistant inter-routes ; tel qu'écrit, il est scopé au
cycle de vie d'une seule vue.

## Correction

`<SyncJobFloatingWidget ref="syncJobWidget" />` déplacé de `DataIntegrationView.vue` vers `App.vue`
(monté sans `ref`, à côté de `RouteTransitionLoader`/`GlobalConfirmDialog`/`Toaster`). Comme le
widget n'est plus un enfant de `DataIntegrationView.vue`, `this.$refs.syncJobWidget.activate(jobId)`
ne fonctionnait plus : `onJobMinimized(jobId)` dans `DataIntegrationView.vue` fait maintenant
`window.dispatchEvent(new CustomEvent('weezevent-job-minimized', { detail: { jobId } }))` — même
convention que `locale-changed`/`theme-changed` déjà utilisée dans ce composant.
`SyncJobFloatingWidget.vue` ajoute un listener `window.addEventListener('weezevent-job-minimized',
...)` dans `mounted()` (appelle `this.activate(jobId)`) et le retire dans `beforeUnmount()`. Le
comportement d'auto-activation via `localStorage` au montage est inchangé. Le widget survit donc
désormais réellement à la navigation inter-routes puisqu'il est monté à la racine, toujours montée.

## Risque de régression / à surveiller

Vérifier que le widget déplacé au niveau racine ne s'affiche pas sur des routes où il n'a pas de
sens (ex. écran de login) — probablement déjà protégé par le check `localStorage` au montage, à
confirmer.

## Références

- BUG-205 (double-polling au minimize — la promesse de persistance du widget est directement liée).
