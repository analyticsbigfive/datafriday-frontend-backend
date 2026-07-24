# BUG-109 — `queueAggregationJob()` n'est jamais déclenché automatiquement

- **Statut** : 🟢 Corrigé (2026-07-23)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation / Live events
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-20 (conception module Live), confirmé en code et corrigé le 2026-07-23
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

Les deux options envisagées ont été implémentées, non exclusives :

1. **Déclenchement post-webhook** : `WebhookEventHandler.triggerLiveAggregation()`
   (`webhook-event.handler.ts`), appelée en best-effort juste après un `syncTransactionById`
   réussi. Résout le `SalesTransaction.eventId` synchronisé → `Event.weezeventEventId`
   (DataFriday) → `spaceId`, crée l'`AggregationJobLog` et appelle `queueAggregationJob({ type:
   'process-events', eventIds: [eventId] })` (scope limité à l'event concerné, jamais un
   `synchronize` complet). No-op silencieux si la transaction n'a pas d'event, ou si l'event n'a
   pas encore de match DataFriday non-ambigu (BUG-021). Une erreur ici est catchée et loguée en
   warning — ne fait jamais échouer le webhook (le sync, lui, a déjà réussi).
   - **Note d'implémentation** : appelle `QueueService` directement (déjà `@Global()`, comme le
     fait `AggregationService` lui-même) plutôt que d'injecter `AggregationService` — importer
     `AggregationModule` dans `WeezeventModule` aurait fermé un cycle de modules
     (`WeezeventModule → AggregationModule → MappingsModule → SpacesModule → WeezeventModule`,
     `SpacesModule` important déjà `WeezeventModule`). La logique de création du job log + enqueue
     est donc dupliquée en miroir de `AggregationService.processEvents` (~15 lignes), commentée en
     conséquence.
2. **Filet de sécurité** : `WeezeventCronService.triggerLiveAggregationSafetyNet()`
   (`@Cron(EVERY_5_MINUTES)`) — pour chaque tenant Weezevent-enabled, retrouve les events dont la
   fenêtre `[eventDate, eventEndDate ?? eventDate] + 3h de marge` couvre l'instant présent, groupe
   par space et rejoue `process-events` pour chacun. Rattrape un échec silencieux ou un event non
   résolu au moment du (1). Idempotent (`executeProcessEvents` fait un delete-then-insert par
   event, cf. BUG-019) — un appel redondant toutes les 5 min ne duplique rien.

Tests ajoutés : `webhook-event.handler.spec.ts` (déclenchement, no-op sans event résolu, résilience
si le lookup échoue) et `weezevent-cron.service.spec.ts` (fenêtre de grâce, regroupement par space,
résilience best-effort).

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
