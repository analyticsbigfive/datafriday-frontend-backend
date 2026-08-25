# BUG-359-01 — Analyse : le détail timeline affiche le match de l'espace précédent après un changement d'espace

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (frontend)
- **Découvert le** : 2026-08-24 (signalement JLH, navigation inter-espaces)
- **Fichiers** : `src/components/analyse/AnalyseView.vue` (watcher auto-open `selectedEventIds`,
  watcher `route.params.spaceId`), `src/composables/useAnalyseTimeline.js:134-144` (contexte),
  `src/store/modules/analyse.js` (contexte, fix conjoint BUG-360-01)

## En clair

En passant d'un espace à l'autre, le panneau de détail minute-par-minute (celui qui s'ouvre en
cliquant une barre de la timeline) restait titré avec le match sélectionné dans l'espace
précédent. La vue se souvenait de la sélection de l'ancien espace et rouvrait le détail avec ce
match-là, tout en allant chercher les données du nouvel espace — mélange incohérent.

## Symptôme

Espace A, event sélectionné (ex. La Beaujoire Nantes → Nantes-Rodez, clic barre timeline) →
changement d'espace via le sélecteur → le détail timeline affiche encore « Nantes-Rodez »
(nom/date de l'espace A) alors que la page charge l'espace B.

## Cause racine

Le watcher d'auto-ouverture de la timeline (`AnalyseView.vue`, watch sur
`filters.selectedEventIds`, `{ immediate: true, flush: 'post' }`) tire au remontage de la vue
(clé `route.path`) AVANT que `ensureAuthAndLoad` → `loadSpace` n'ait chargé le nouvel espace. À
cet instant :

1. `store.state.analyse.events` contient encore les events de l'ANCIEN espace ;
2. `filters.selectedEventIds` (Vuex, jamais purgé au changement d'espace — cf. BUG-360-01)
   pointe encore le match de l'ancien espace ;
3. le watcher résout donc l'event dans le pool périmé et appelle `loadTimelineForEvents(evs)` :
   `selectedEventForTimeline` prend nom/date/id de l'ancien match
   (`useAnalyseTimeline.js:134-144`) pendant que le fetch part avec le NOUVEAU
   `route.params.spaceId` (`useAnalyseTimeline.js:173`).

Sur la route Live (`keepAlive`, clé `route.name`, instance survivante), rien n'appelait
`closeTimeline()` au changement d'espace : le détail ouvert survivait tel quel.

## Correction

2026-08-24, branche `fix/event-predict-deeplink-event-passe` :

- **Garde d'alignement store/route** dans le watcher d'auto-ouverture : retour anticipé tant que
  `store.state.analyse.spaceId !== route.params.spaceId` — le watcher ne peut plus consommer les
  events/sélection d'un autre espace. Le reset des filtres au changement d'espace
  (`CLEAR_SPACE_KEYED_CACHES`, BUG-360-01) refait passer le watcher ensuite avec un état
  cohérent (sélection vide → pas d'ouverture).
- **`closeTimeline()` au changement d'espace** dans le watcher `route.params.spaceId` (branche
  `prevId && prevId !== id`, instance survivante — route Live) : le détail de l'ancien espace ne
  survit plus.

Fix conjoint indissociable : BUG-360-01 (reset des filtres au changement d'espace, côté store).

## Risque de régression / à surveiller

- Deep-link `?event=` / retour d'EventPredict : la garde ne bloque que tant que le store n'est
  pas aligné sur la route — une fois `loadSpace` passé, comportement inchangé.
- Route Live : `closeTimeline()` ne s'exécute que sur changement d'espace réel (garde
  `prevId !== id`), pas au simple re-poll.
- Vérifier : espace A → clic barre → espace B → aucun détail ouvert, KPIs de B ; retour A idem.

— JLH
