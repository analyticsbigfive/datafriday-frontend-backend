# BUG-109 — `queueAggregationJob()` n'est jamais déclenché automatiquement

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation / Live events
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-20 (conception module Live), confirmé en code le 2026-07-23
- **Fichiers** : `src/features/aggregation/aggregation.controller.ts:26-117`,
  `src/features/weezevent/services/webhook-event.handler.ts`,
  `src/features/weezevent/services/weezevent-cron.service.ts`

## Symptôme

`SpaceRevenueMinuteAgg` (et par extension tout ce qui en dépend — RPC `get_space_shop_details`,
KPI par shop, POS Performance) ne se met jamais à jour toute seule : elle reste figée à sa dernière
exécution manuelle du wizard d'intégration, même si des ventes fraîches arrivent en continu via le
webhook Weezevent ou les crons de sync.

## Cause racine

`AggregationService.queueAggregationJob` n'a que deux appelants dans toute la codebase :
`processEvents` et `synchronize` (`aggregation.service.ts:194,449`), eux-mêmes exposés
uniquement par `AggregationController` sur `POST /aggregation/process-events` et
`POST /aggregation/synchronize` (`aggregation.controller.ts:83-117`), gardés par
`@RequirePermissions('menu.integration.fb')` — déclenchement **manuel uniquement**, via le wizard
d'intégration front.

Vérifié qu'aucun autre appelant n'existe :
- `WebhookEventHandler.processEvent()` (`webhook-event.handler.ts:26-85`) route vers
  `handleTransactionEvent`/`handleOrderEvent`/`handleProductEvent`, qui appellent uniquement les
  méthodes de sync de `WeezeventSyncService` — jamais l'agrégation.
- `WeezeventCronService` (4 jobs `@Cron`, `weezevent-cron.service.ts`) appelle uniquement les
  services de sync — jamais l'agrégation non plus.

## Correction

À faire — deux options non exclusives (déjà esquissées dans `LIVE_API_GUIDE.md` §3) :

1. Appeler `queueAggregationJob({ type: 'process-events', eventIds: [eventId] })` (limité à
   l'event concerné, pas un `synchronize` complet) juste après le resync réussi d'une transaction
   dans `WebhookEventHandler.syncTransactionById` (`webhook-event.handler.ts:120-141`) — nécessite
   de résoudre `spaceId`/`tenantId` depuis la transaction synchronisée (voir
   `locationSpaceMapping` déjà utilisé ailleurs dans `spaces.service.ts` pour ce même mapping).
2. Cron dédié courte fréquence (ex. `EVERY_5_MINUTES`, à ajouter dans `WeezeventCronService` ou un
   nouveau service à côté) en filet de sécurité si (1) échoue silencieusement ou est absent pour un
   tenant.

Recommandé : les deux — (1) pour la fraîcheur en usage normal, (2) comme garde-fou (le pattern
existe déjà pour les crons de sync, `weezevent-cron.service.ts:20-36`, `isEnabled` via
`WEEZEVENT_CRON_ENABLED`).

## Risque de régression / à surveiller

- Le volume d'appels à `queueAggregationJob` va significativement augmenter (un par transaction
  webhook au lieu d'un par action manuelle) — vérifier que la queue BullMQ (`AGGREGATION`,
  `attempts: 3` depuis BUG-019) absorbe la charge, et que `executeProcessEvents` reste bien
  idempotent sous cette fréquence (delete-then-insert par event, déjà vérifié pour BUG-019).
- Scoper l'agrégation post-webhook au(x) seul(s) event(s) concerné(s) par la transaction
  (`eventIds: [...]`) — ne pas déclencher un `synchronize` complet par vente, qui recalculerait
  tout l'historique de l'espace à chaque transaction.

## Références

- [`LIVE_API_GUIDE.md`](../api/LIVE_API_GUIDE.md) §3 — prérequis bloquant pour le v1 du module Live
- `datafriday-web/docs/modules/11_LIVE.md` §5 — conception initiale ayant révélé le gap
- BUG-019 (`docs/bugs/19_queue_agregation_sans_retry.md`) — retry déjà corrigé, ce ticket ne
  concerne que l'absence de déclenchement automatique
