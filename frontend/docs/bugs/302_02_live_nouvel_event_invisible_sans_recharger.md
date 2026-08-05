# BUG-302-02 — Live : un nouvel event (ex. run QA) restait invisible sans recharger la page

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Live events
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur : « ça marche pas, rien ne s'affiche en temps réel » alors qu'un run QA d'auto-simulation était en cours)
- **Fichiers** : `src/composables/useSpaceData.js` (`fetchLiveShopSnapshot`), `src/store/modules/analyse.js` (`refreshLiveShopSnapshot`, `filteredEvents`, `analysableEvents`), `src/components/analyse/AnalyseView.vue` (`applyLiveScope`)

## Symptôme

Écran Live vide (CA/KPI à 0, aucun graphique) alors qu'un event live réel existait avec des ventes
en cours (confirmé côté backend : `getLiveStatus` recalculé à la main renvoyait `isLive:true`,
données saines en base). Le comportement disparaissait après un rechargement complet de la page.

## Cause racine

Régression introduite par BUG-301-02 : `refreshLiveShopSnapshot` (tick 15s) ne rafraîchissait plus
`state.analyse.events`. `applyLiveScope()` (`AnalyseView.vue`) résout pourtant bien un `eventId`
frais à chaque tick via `GET /live-status` (appel direct, indépendant du store) et pose
`filters.selectedEventIds = [eventId]` — mais `filteredEvents` (`analyse.js:829-846`) part de
`state.events` filtré par `selectedEventIds` : un event créé APRÈS le premier chargement de la page
(ex. `ensureTodaySalesEvent`, déclenché par le run QA) n'existait pas dans `state.events`, donc
`filteredEvents` retombait à `[]` — écran vide malgré un vrai signal live détecté.

## Correction

`fetchLiveShopSnapshot` ajoute un 3e appel léger, `getEvents({ spaceId, limit: 200,
excludeSimulated: false })` — une seule requête liste, pas le catalogue (pas de réintroduction de
BUG-301-02). `excludeSimulated:false` : ce chemin ne tourne qu'en mode Live, où voir son propre
trafic de test (QA) est le but recherché. `refreshLiveShopSnapshot` commit `SET_EVENTS` seulement
si le fetch a réussi (sentinelle `events: null` sur échec réseau, pour ne jamais écraser
`state.events` par `[]` sur une erreur transitoire).

## Risque de régression / à surveiller

Vérifier que tout futur ajout de champ « allégé » au poll Live continue de couvrir `state.events` —
c'est la donnée dont dépend `filteredEvents`, donc tout l'écran. Tests : `useSpaceDataWaves.spec.js`
(2 tests, dont le cas d'échec réseau).

## Références

- `docs/modules/11_LIVE.md` §14 (addendum).
- BUG-301-02 (régression introduite par ce fix de perf).
