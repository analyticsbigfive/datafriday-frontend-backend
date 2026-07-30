# BUG-114-02 — `events.module.ts` : `EventsService`/`PredictVersionsService` exportés sans consommateur externe

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 (audit ciblé du module backend Events)
- **Fichiers** : `src/features/events/events.module.ts:20-21`

## Symptôme

`EventsModule` exportait `EventsService`, `EventWeezeventLinkService` et `PredictVersionsService`.
Grep sur tout `backend/src` (hors `features/events/`) : aucun autre module n'injecte
`EventsService` ni `PredictVersionsService` — seul `EventWeezeventLinkService` est réellement
consommé en externe (`features/weezevent/services/sync/catalog-sync.service.ts`, via
`WeezeventModule` qui importe `EventsModule` précisément pour ce service).

## Cause racine

Export "par défaut" élargi à tous les providers du module au moment de sa création, jamais
resserré depuis.

## Correction

`exports: [EventsService, EventWeezeventLinkService, PredictVersionsService]` réduit à
`exports: [EventWeezeventLinkService]`. Les deux services restent des `providers` du module
(toujours injectables par les contrôleurs internes `EventsController`/`EventTypesController`/etc.
et `PredictVersionsController`/`PredictVersionsStandaloneController`) — seule leur visibilité
externe change.

## Risque de régression / à surveiller

- Reconfirmé par grep juste avant l'édition (aucun import externe apparu entre-temps).
- `npx tsc --noEmit` propre, suite `jest src/features/events` (67 tests) verte après ce
  changement — si un autre module importait `EventsService`/`PredictVersionsService` via
  `EventsModule` sans que le grep l'ait capté, la compilation NestJS (résolution DI) échouerait au
  démarrage de l'app, pas seulement à la compilation TS ; à surveiller au premier démarrage du
  serveur après déploiement.

## Références

- Aucune.
