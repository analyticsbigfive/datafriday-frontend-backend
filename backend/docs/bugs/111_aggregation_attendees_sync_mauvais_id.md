# BUG-111 — Auto-sync attendees post-agrégation envoie le mauvais id à l'API Weezevent (404 systématique)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (aucune donnée corrompue, mais échec garanti + bruit de logs/retries)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-27 (via les logs dev pendant le test du widget Live "simuler une vente")
- **Fichiers** : `src/features/aggregation/aggregation.service.ts:404-428`

## Symptôme

Après **chaque** exécution réussie de `AggregationService.executeProcessEvents` (déclenchement
manuel via le wizard, `POST /aggregation/process-events`, webhook réel via
`WebhookEventHandler.triggerLiveAggregation`, cron de secours `WeezeventCronService.
triggerLiveAggregationSafetyNet` toutes les 5 min pour un event live, ou déclenchement QA via
`LogisticsService.simulateSale`), le job auto-déclenché "attendees sync" échoue
systématiquement :

```
GET https://api.weezevent.com/pay/v1/organizations/:orgId/events/:eventId/attendees
→ 404 "Resource not found"
```

BullMQ retente 3 fois (backoff exponentiel, cf. BUG-19), échoue les 3 fois, puis abandonne — et
recommence au prochain run d'agrégation (toutes les 5 min pendant la fenêtre live d'un event,
cf. BUG-109).

## Cause racine

`aggregation.service.ts:411-424` résout les `SalesEvent` (`WeezeventEvent`) du jour par plage de
date, puis appelle :
```ts
select: { id: true }               // ← cuid interne DataFriday
...
{ eventId: we.id }                 // ← passé tel quel dans l'URL Weezevent
```
`we.id` est le cuid interne (`SalesEvent.id`, `@default(cuid())`), pas l'id Weezevent réel
(`SalesEvent.externalId`, `@map("weezeventId")`). L'API Weezevent ne reconnaît évidemment pas un
id interne DataFriday dans l'URL `/events/:eventId/attendees` → 404 garanti à 100%, pour
**n'importe quel** event (réel ou simulé), peu importe son statut/existence côté Weezevent — le
bug se produit avant même que la distinction "l'event a-t-il des attendees" puisse jouer un rôle.

Confirmé par grep : `externalId` n'apparaît nulle part dans ce chemin d'appel
(`aggregation.service.ts` → `QueueService.queueWeezeventSyncType` → `WeezeventQueuedEntitySyncService.
syncAttendees` → `WeezeventClientService.getAttendees` → URL). Le chemin manuel
(`POST /weezevent/sync {type:'attendees', eventId}`) n'est pas affecté : son `eventId` vient du
DTO, présumé renseigné correctement par le front à partir de `externalId`.

## Correction

`aggregation.service.ts:411-426` : `select: { id: true, externalId: true }`, et
`{ eventId: we.externalId }` (au lieu de `we.id`) dans l'appel à `queueWeezeventSyncType`.

Découvert et corrigé pendant la mise en place du widget QA "simuler une vente" du module Live
— la simulation a exposé un bug de production déjà présent (le chemin d'agrégation auto-déclenché
depuis un vrai webhook ou le cron de secours 5 min y était tout autant exposé), pas un défaut
propre à la simulation.

## Risque de régression / à surveiller

- Vérifier que la sync attendees réussit désormais pour un event réel actuellement live
  (`ticketsScanned`/`perCapita` se mettent à jour sans erreur 404 dans les logs).
- Ce même bloc résout le `SalesEvent` du jour par simple correspondance de date (`startDate`),
  le même anti-pattern déjà corrigé ailleurs par BUG-21 (`Event.weezeventEventId`) — non traité
  dans ce fix (élimine déjà 100% du symptôme 404 observé ; l'ambiguïté de jointure par date est un
  risque distinct — mauvais event choisi en cas d'homonymie de date le même jour — plus rare, à
  traiter séparément si ça se manifeste).

## Références

- BUG-19 (retry BullMQ), BUG-21 (jointure Event↔WeezeventEvent par date seule), BUG-109
  (agrégation auto toutes les 5 min pour un event live — explique la récurrence du symptôme).
- Fiche 102 (`simulatesale_pollution_reset_race`) — comportements connus/acceptés de l'outil QA
  `simulateSale`, dont la simulation a servi de révélateur pour ce bug-ci.
