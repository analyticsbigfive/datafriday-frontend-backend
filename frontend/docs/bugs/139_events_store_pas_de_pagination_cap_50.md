# BUG-139 — `events.js` store : `fetchEvents` sans pagination → `/events` plafonné à 50 lignes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web` (root cause côté contrat backend : limite par défaut)
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/store/modules/events.js` (`fetchEvents`, avant correction),
  `src/api/endpoints/event.api.js:15-19` (avant correction)

## Symptôme

`events.js` appelait `getEvents()` sans aucun paramètre. `GET /events` sans `limit` explicite
retombe sur le défaut backend `limit=50` (`events.service.ts:findAll`, confirmé en lisant le
contrôleur/service backend) — tout tenant ayant plus de 50 events voit sa liste `/events`
silencieusement tronquée aux 50 premiers (triés par `eventDate desc`), sans indicateur de troncature
ni pagination côté UI. Même cause racine que les caps silencieux déjà documentés côté Market Prices
(BUG-040/054) et Menu Items — mais jamais corrigé pour ce domaine faute d'audit dédié jusqu'ici.

## Cause racine

`event.api.js:getEvents()` n'exposait même pas de paramètre `page` (seulement `spaceId`/`limit`),
et `events.js` ne bouclait pas sur les pages — contrairement au pattern déjà établi dans
`marketPrices.js` (boucle explicite sur `meta.total` avec commentaire citant BUG-040/054 comme
précédent).

## Correction

- `event.api.js:getEvents()` accepte et transmet désormais `page`.
- `events.js:fetchEvents` boucle sur `page`/`limit=200` tant que `meta.total` n'est pas atteint,
  même pattern que `marketPrices.js`. `limit=200` choisi pour matcher le plafond serveur ajouté côté
  backend par [[71_get_events_page_limit_negatifs_sans_borne]] (`Math.min(200, ...)`).

## Risque de régression / à surveiller

Vérifier sur un tenant avec plus de 50 events (au-delà du défaut backend) que `/events` affiche
bien la liste complète après le fix, pas seulement les 50 plus récents.

## Références

- `src/store/modules/marketPrices.js` (pattern de référence)
- `../../../api-datafriday-staging/docs/bugs/71_get_events_page_limit_negatifs_sans_borne.md`
