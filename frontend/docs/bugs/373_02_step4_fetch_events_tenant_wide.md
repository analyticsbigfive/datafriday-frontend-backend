# BUG-373-02 — Step 4 du wizard rapatriait TOUS les events du tenant au lieu de ceux du space

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (performance, pas de corruption de données)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : frontend
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en observant dans l'onglet réseau du
  navigateur 4 appels `GET /events?page=1..4&limit=200` (611 events, tout le tenant) à chaque
  ouverture du step 4, alors que le space concerné n'en a qu'une poignée.
- **Fichiers** : `frontend/src/composables/useTimelineProcessing.js`

## Contexte

`loadTimeline` (appelée à chaque ouverture du wizard et après chaque action) chargeait les events
CRUD via `store.dispatch('events/fetchEvents')` — un module Vuex **tenant-wide** (`store/modules/
events.js`), pensé pour la page globale "Events" : il boucle sur toutes les pages du backend pour
construire une liste complète de TOUS les events du tenant, mise en cache 15 min. `loadTimeline`
filtrait ensuite côté client sur `spaceId`. Sur un tenant à plusieurs centaines d'events (611
constatés), ça déclenchait 3-4 requêtes réseau inutiles à chaque ouverture du wizard, pour au
final n'en garder qu'une poignée.

## Fix

`GET /events` accepte déjà `spaceId` en query param côté backend
(`events.controller.ts::findAll`) — jamais exploité par ce composable. Nouvelle fonction
`fetchSpaceEvents(spaceId)` dans `useTimelineProcessing.js`, qui boucle la pagination
directement scopée par `spaceId`, en parallèle de `getStep4Context` (les deux étant
indépendants). Le cache Vuex tenant-wide (`events/fetchEvents`) n'est plus sollicité par ce
composable — les autres consommateurs (page "Events") ne sont pas affectés.

## Risque de régression / à surveiller

- Les actions du wizard qui dispatchent `events/addEvent`/`events/updateEvent` (création,
  relink, changement d'intégration) continuent de le faire — le cache tenant-wide reste à jour
  pour la page "Events", ce composable ne fait plus que s'appuyer dessus en LECTURE au chargement.
