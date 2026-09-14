# BUG-379-02 : Live : agrégation jamais déclenchée pendant le match, polling aveugle 10 min, webhook Weezevent jamais mis en service

- **Statut** : 🟡 Corrigé non déployé (branche `fix/live-realtime-379`, 2026-09-14 ; reste l'enregistrement du webhook chez Weezevent et les décisions Render)
- **Sévérité** : 🔴 Bloquant/impact business (le client doit cliquer "re-run" à la main toutes les 10 min pendant un match)
- **Domaine** : Live / Intégrations & ventes / Analyse & agrégation
- **Repo(s) concerné(s)** : les deux (backend pour l'essentiel, frontend pour le bloc webhook Weezevent de Data Integration)
- **Découvert le** : 2026-09-12 (remontée Bertrand, events live AJA-Nice et PFC-Lyon), diagnostiqué le 2026-09-14
- **Fichiers** :
  - `src/features/weezevent/services/weezevent-cron.service.ts:42-114` (sync 10 min), `:124-211` (filet de sécurité 5 min, fenêtre live fausse `:143-147`)
  - `src/shared/utils/event-window.util.ts:120` (`resolveEventTransactionWindow`, la bonne fenêtre, non utilisée par le cron)
  - `src/features/weezevent/webhook.controller.ts`, `src/features/weezevent/dto/webhook-payload.dto.ts`, `src/features/weezevent/services/webhook-signature.service.ts`, `src/features/weezevent/services/webhook-event.handler.ts` (récepteur webhook, incompatible avec le vrai format Weezevent)
  - `src/features/aggregation/aggregation.service.ts:832-845` (écrase `metadata.trigger`, rend le filet de sécurité invisible dans les logs)
  - `render.yaml` (racine) vs `backend/render.yaml` (deux blueprints incohérents)
  - `datafriday-web/src/views/DataIntegrationView.vue:91-118` (bloc webhook Digifood, aucun équivalent Weezevent)

## Symptôme

Remontée Bertrand du 2026-09-12, deux events live en cours (Auxerre `cms81a2dc001dkgsmpv7a654z`, PFC / Stade Jean Bouin `cmsufah9p0c08gpkz2wsg5pzo`) :

1. Les données du Live ne se mettent pas à jour si on ne clique pas sur "re-run" dans Data Integration.
2. Même en cliquant, on ne voit du nouveau qu'environ toutes les 10 minutes.
3. Pas de temps réel alors que le code "annonce" un webhook Weezevent.

## Constat factuel en base de prod (2026-09-14, lecture seule)

Events du jour : `PFC-Lyon` (`f0a0b3e2`, integration PFC `cms82c09u8tdhkgsmovyrzzlk`, `eventEndTime` 23:50) et `AJA-Nice` (`490fc919`, sans `integrationId` ni `weezeventEventId`, `eventEndTime` 23:50). Les deux ont `eventDate = eventEndDate = 2026-09-12 00:00:00` (minuit, sans heure : c'est le modèle, l'heure est dans `eventEndTime`).

**Étape 1, récupération des ventes (cron `syncRecentTransactions`, 10 min) : fonctionne.**
Transactions PFC arrivées en base par paquets à 16:30, 16:40, 16:50, 17:00 ... 21:10, sans trou (`WeezeventTransaction.syncedAt` groupé par minute). Le worker `datafriday-worker` est donc bien vivant.

**Étape 2, agrégation pour l'écran Live (cron `triggerLiveAggregationSafetyNet`, 5 min) : n'a jamais tourné pendant le match.**
`AggregationJobLog` du 12/09 pour ces deux spaces :

| Plage | Jobs | Origine |
|---|---|---|
| 00:00 à 02:55 | 24/h, aux minutes :00 :05 ... :55, ms ~.3 | cron filet de sécurité (inutile, personne ne vend à 2h du matin) |
| 03:00 à 16:51 | 0 | rien |
| 16:52 à 20:28 | 38, horaires irréguliers | clics manuels "re-run" |
| 20:29 à 23:59 | 0 | rien |

Même schéma le 13/09 (00:00 à 02:55 sur un autre space, puis rien).

**Étape 0, webhook Weezevent (temps réel) : jamais mis en service, nulle part.**
Sur les 24 tenants de la base : `Tenant.weezeventWebhookEnabled = false` partout, aucun `WeezeventIntegrationConfig.webhookSecret`, aucun `webhookEnabled`, et **0 ligne dans `WeezeventWebhookEvent` depuis la création de la table**, tous tenants confondus.

Donc aujourd'hui, pour tout le monde : les ventes arrivent par polling à 10 min, et le calcul Live ne se lance pas tout seul pendant le match. Le re-run manuel ne fait que relancer l'étape 2 sur les ventes déjà en base, d'où "rien de nouveau avant 10 min".

## Cause racine

### CR1 : la fenêtre "live" du filet de sécurité se termine à 3h du matin

`weezevent-cron.service.ts:143-147` :

```ts
const windowEnd = e.eventEndDate ?? e.eventDate;   // 12/09 00:00:00 (minuit, l'heure n'est pas dedans)
const graceEnd = windowEnd + LIVE_AGGREGATION_GRACE_HOURS (3h);   // 12/09 03:00:00
return now <= graceEnd;
```

`eventEndDate` est ancré à minuit, l'heure réelle est dans `eventEndTime` ("23:50"), ignorée ici. Un match du 12/09 est donc considéré "en direct" de 00:00 à 03:00 UTC et jamais pendant le match. L'utilitaire partagé `resolveEventTransactionWindow(event, space.timezone)` (`event-window.util.ts:120`, règle Bertrand 147-01 : minuit local → `eventEndTime`, repli minuit suivant) existe et est utilisé par l'agrégation elle-même, mais pas par le cron.

Le filet de sécurité de BUG-109 n'a donc jamais rattrapé un seul match depuis sa mise en place (2026-07-23). Ça a été invisible parce que le webhook (le chemin principal de BUG-109) n'a jamais existé non plus : il n'y avait rien à "rattraper" visiblement, et personne n'a regardé les horaires des jobs cron.

### CR2 : polling fixe et aveugle, sans enchaînement

- `syncRecentTransactions` tourne toutes les 10 min, 24h/24, pour toutes les intégrations, qu'un event soit en cours ou non. Hors match c'est du vide (et de la charge API Weezevent inutile) ; pendant le match c'est trop lent.
- Après une sync qui a créé des transactions, rien ne déclenche l'agrégation : on attend le passage suivant du filet de sécurité (qui, cf. CR1, ne vient jamais). Les deux crons s'ignorent.
- L'agrégation `process-events` refait l'event entier (delete-then-insert, BUG-019) : 22 à 45 s par run sur les logs du 12/09. Ça borne la cadence possible du calcul Live à ~1 run/minute par space, quelle que soit la cadence de sync.

### CR3 : webhook Weezevent jamais branché, et récepteur incompatible avec le vrai format

Documentation Weezevent (WeezPay, `docapi.weezevent.com/openapi.html?weezpay#tag/Webhooks`, transmise par Ulrich le 14/09) :

- Types : `top-up`, `transaction` (vente), `transfer`, `wallet update`.
- **Configuration uniquement par le contact Weezevent** (pas d'API ni d'admin pour l'instant) : on leur fournit une URL https + un secret optionnel, ils ajoutent un header de signature.
- **Aucun retry** : si on ne répond pas 2XX, le message est perdu (rejeu manuel possible sur demande).
- Body : `{ type, method, origin, organization_id, id, values }` avec `type ∈ transaction|wallet|refill|scan|transfer`, `method ∈ create|update|delete`, `origin ∈ gill|butter|pyvar`.

Écart avec notre code :

| Point | Weezevent | Notre code | Conséquence |
|---|---|---|---|
| Body | `id`, `values`, `origin`, `organization_id` à la racine | DTO `{ type, method, data (obligatoire), timestamp? }` (`webhook-payload.dto.ts`) | `ValidationPipe` global `forbidNonWhitelisted: true` (`main.ts:84-90`) → **400** sur tout vrai payload Weezevent |
| Id transaction | `payload.id` | `payload.data?.id` (`webhook-event.handler.ts`) | même sans le 400, "no transactionId" → no-op |
| Signature | header + algo non documentés dans l'extrait, secret optionnel | `x-weezevent-signature`, `HMAC-SHA256(secret, JSON.stringify(body parsé))` hex (`webhook-signature.service.ts`) | signature calculée sur un body re-sérialisé et filtré par Nest, pas sur les octets reçus : ordre des clés / espaces → mismatch quasi certain |
| Activation | par contact Weezevent | flag tenant / intégration + secret via `PATCH .../weezevent/instances/:id/webhook` | aucune UI : le bloc "URL de webhook / secret / dernier webhook reçu" n'existe que pour Digifood (`DataIntegrationView.vue:91-118`) |
| Disponibilité | pas de retry côté Weezevent | `datafriday-api` en plan Render `free` (endormi après 15 min, réveil 30 à 60 s) | webhooks perdus pendant chaque réveil |

Le récepteur a été écrit sur un format supposé et jamais testé contre Weezevent (aucune trace de test réel dans le repo).

### CR4 (aggravant, observabilité) : `metadata.trigger` écrasé

`aggregation.service.ts:832-845` (BUG-375-02) réécrit `metadata: { eventIds, errorCount }` en fin de job et perd `trigger: 'live-safety-net' | 'webhook-live'`. Depuis le 2026-08-22, impossible de distinguer dans `AggregationJobLog` un job cron d'un clic manuel autrement que par l'horaire. C'est ce qui a masqué CR1.

### CR5 (aggravant, déploiement) : deux `render.yaml` incohérents

- `render.yaml` (racine, `rootDir: backend`) : `WEEZEVENT_CRON_ENABLED=false` sur le web (BUG-144-01) + `prisma migrate deploy` au démarrage.
- `backend/render.yaml` : ni l'un ni l'autre, et contredit l'ADR-0002 (migrations manuelles).
- `backend/docs/getting-started/DEPLOYMENT.md` §6.1 décrit un troisième état sans worker.

À confirmer dans le dashboard Render lequel est le blueprint réel, supprimer l'autre.

## Correction : plan en trois lots

### Lot A : polling adaptatif + agrégation enchaînée (règle le problème de samedi, webhook ou pas)

**A1. Une seule notion de "fenêtre live" pour tout le worker.**
Nouveau service (ex. `LiveEventWindowService`) qui, à un instant `now`, renvoie la liste des `(tenantId, spaceId, integrationId | null, eventIds)` en direct, calculée avec `resolveEventTransactionWindow(event, space.timezone)` + marge après la fin (garder 3h). Requête bornée à `eventDate ∈ [now - 2j, now]` puis filtre en mémoire. Un event sans `weezeventEventId` (cas AJA-Nice) reste éligible avec `integrationId = null` (comportement BUG-365-02 inchangé). `triggerLiveAggregationSafetyNet` et la sync utilisent ce service : plus de calcul de fenêtre local dans le cron.

**A2. Cadence de sync pilotée par la fenêtre live, pas par un `@Cron` fixe.**
Remplacer `@Cron(EVERY_10_MINUTES)` par une boucle par intégration :

| Situation | Cadence de sync | Justification |
|---|---|---|
| Aucun event en direct pour l'intégration | 1 passage / 30 min | rattrapage des ventes hors match (hospitalité, billetterie), zéro charge inutile |
| Event en direct, webhook Weezevent absent ou muet | **10 s** (cible demandée par Ulrich), repli 30 s si Weezevent renvoie 429 | sync incrémentale (`fromDate = lastSyncedAt - 5 min`, dédup par id en mémoire) : quelques dizaines de lignes par appel, coût faible |
| Event en direct, webhook sain (dernier `WeezeventWebhookEvent` < 2 min) | 2 min | le webhook porte le temps réel, la sync ne sert plus que de filet |

Implémentation : un `@Interval(10_000)` unique (ou `setTimeout` réarmé) qui, à chaque tick, demande au service A1 les intégrations en direct et ne lance la sync que pour celles dont le `nextRunAt` est échu ; les autres cadences sont de simples `nextRunAt` différents. Garde anti-chevauchement déjà en place (`SyncTrackerService.isRunning` + `WeezeventSyncJob COLLECTING`) : un tick sur une sync encore en cours est ignoré, pas empilé. Le circuit breaker / retry 429 de `WeezeventApiService` (`:199-252`) reste la protection côté API.

**Point à valider avec Weezevent avant de fixer 10 s** : quota d'appels sur `GET /pay/v1/.../transactions` (10 s = 360 appels/h/intégration, 720/h les soirs à deux clubs à Jean Bouin). En attendant leur réponse, démarrer à 30 s.

**A3. Agrégation incrémentale par minute, enchaînée après la sync.**
Aujourd'hui `executeProcessEvents` (`aggregation.service.ts:536-537` puis `:616`, `:672`, `:718`) supprime toutes les lignes de l'event et recalcule l'event entier depuis les transactions brutes à chaque appel : 22 à 45 s par run sur les logs du 12/09, pour quelques dizaines de ventes nouvelles. Choix d'idempotence (BUG-019) pensé pour le wizard manuel, inadapté au live (remarque Ulrich 14/09 : "pourquoi refaire un réagrément complet alors qu'on n'ajoute que quelques transactions").

Les tables Live sont au grain minute et chaque minute est indépendante : on ne recalcule que les minutes touchées.

1. La sync connaît les transactions qu'elle vient d'insérer → ensemble des `date_trunc('minute', transactionDate)` distinctes. Partir des dates réelles, jamais de l'horloge : un TPE hors ligne qui se resynchronise envoie des ventes datées d'une heure avant.
2. Nouveau job `process-event-minutes` `{ tenantId, spaceId, integrationId, eventId, minutes[] }` : `deleteMany` sur `SpaceRevenueMinuteAgg` / `SpaceRevenueMinuteItemAgg` scopé `weezeventEventId + minute IN (...)` (+ `integrationId` selon le mode, même règle que la purge actuelle), puis les mêmes `INSERT ... SELECT` qu'aujourd'hui avec un filtre supplémentaire `date_trunc('minute', t."transactionDate") IN (...)`. Réutiliser `resolveEventWindow` / `matchClause` tels quels (le filtre minute s'ajoute à la fenêtre, il ne la remplace pas).
3. `SpaceProductRevenueDailyAgg` (grain jour × produit, somme de la journée) n'est pas rafraîchie par ce job : elle ne sert pas au Live minute par minute, elle est recalculée par le rebuild complet (wizard, filet de sécurité).
4. Coût attendu : quelques dizaines de lignes lues/écrites, < 1 s. Compatible avec une sync à 10 s.
5. Coalescence : si un job `process-event-minutes` est déjà `pending` pour la même clé, fusionner les minutes dedans plutôt qu'empiler ; et ne jamais lancer un job minute pendant qu'un rebuild complet `running` porte sur le même event (le rebuild écraserait ou dupliquerait), le laisser finir et rejouer les minutes après.

Le rebuild complet (`process-events`) reste pour le wizard manuel et pour le filet de sécurité, qui passe à 1 exécution en fin de fenêtre live (fin déclarée + marge) au lieu de toutes les 5 min : il sert à réconcilier (annulations vues par la sync, ventes arrivées hors ordre) et à rafraîchir la table jour.

Résultat attendu : fraîcheur Live ≈ cadence de sync + 1 s, soit 10 à 15 s au lieu de "jamais sans clic".

**A5. Conserver `trigger` dans `metadata`** (`aggregation.service.ts:832-845`) : fusionner `{ ...existing.metadata, errorCount }` au lieu d'écraser. Sans ça on ne pourra pas vérifier que A2/A3 tournent.

**A6. Un seul `render.yaml`** (CR5) après vérification du dashboard Render.

### Lot B : webhook Weezevent réel (temps réel à la seconde)

**Côté Bertrand / Ulrich, avec le contact Weezevent (bloquant pour B2) :**
1. Nom exact du header de signature, algorithme (HMAC-SHA256 ?), encodage (hex / base64), et ce qui est signé (raw body ?). Demander un exemple de requête réelle.
2. Quota d'appels API (pour le lot A2).
3. Faire enregistrer, par intégration, l'URL `https://<api-prod>/api/v1/webhooks/weezevent/<tenantId>/<integrationId>` + secret, **type `transaction` uniquement** (`refill`/`transfer`/`wallet` inutiles au Live et ils polluent `WeezeventWebhookEvent`).
   - Eat Is Family = `cmrpf3ukw0001bdu2h6rz0vbz` ; PFC = `cms82c09u8tdhkgsmovyrzzlk` ; AJ Auxerre = `cms81pp5o0023kgsmro7tg0oa` ; SFP = `cms9h9tfy00blqdroy0ahs1rd` ; Le Mans FC Weez = `cmt01vzza007dqw011q4js95x`.

**Côté code :**

B1. **DTO au format documenté** : `{ type, method, origin?, organization_id?, id, values }`, `data`/`timestamp` retirés. Vérifier `organization_id` contre `WeezeventIntegrationConfig.organizationId` (défense en profondeur : un webhook d'une autre organisation Weezevent posté sur notre URL est rejeté même avec une bonne signature).

B2. **Signature sur le raw body** : activer `rawBody` sur Fastify pour cette route, vérifier `HMAC(secret, rawBody)` avec le header/algo confirmés en (1), comparaison `timingSafeEqual` conservée. Tant que Weezevent n'a pas répondu, garder l'algo actuel mais sur le raw body (le plus probable). Dédup : remplacer la clé "signature" par `${type}:${method}:${id}` (stable, lisible) puisque `id` existe maintenant.

B3. **Handler** : `payload.id` au lieu de `payload.data?.id` ; `values` stocké tel quel dans `payload`. Le reste (`syncTransactionById` → `triggerLiveAggregation`) est déjà en place (BUG-109) mais doit passer par la coalescence A3.

B4. **UI Data Integration, bloc Weezevent** identique au bloc Digifood (`DataIntegrationView.vue:91-118`, `aggregation.api.js:435`) : URL à copier, champ secret (→ `PATCH .../weezevent/instances/:id/webhook`), état "dernier webhook reçu : date, type, traité / erreur". Nouvel endpoint backend `GET .../weezevent/instances/:id/webhook/status` (dernier `WeezeventWebhookEvent`, compteur 24h, dernière erreur), sur le modèle de `testDigifoodInstance` (`integrations.controller.ts:416`).

B5. **Bascule automatique de cadence** (lien avec A2) : "webhook sain" = dernier `WeezeventWebhookEvent` traité sans erreur il y a moins de 2 min pour cette intégration. Sinon retour à 10 s. Un webhook enregistré chez Weezevent mais cassé (secret changé, API endormie) ne doit jamais dégrader le Live en dessous de ce que fait le polling.

B6. **Plan Render payant pour `datafriday-api`** (pas seulement le worker) : sans retry côté Weezevent, un endpoint endormi 15 min après le dernier appel perd des ventes à chaque réveil. Décision Bertrand.

B7. **Test unitaire** avec un payload strictement conforme à la doc et une signature calculée sur le raw body. Puis test réel : demander à Weezevent un envoi de test avant le premier match.

### Lot C : observabilité (pour que ça ne redevienne pas invisible)

C1. Heartbeat en base ou Redis : `lastRunAt` par job (`sync`, `safety-net`) et par intégration, mis à jour à chaque tick, exposé dans `GET /health/detailed` du web (lecture seule) et dans Data Integration.
C2. Alerte (Slack/mail) si, pour une intégration avec un event en direct, aucune sync réussie depuis > 2 min ou aucune agrégation `completed` depuis > 5 min.
C3. `process.on('uncaughtException' | 'unhandledRejection')` dans `worker.ts` → log + `process.exit(1)` pour que Render redémarre un worker zombie au lieu de le laisser tourner à vide.
C4. Plan Render payant pour `datafriday-worker` (512 Mo free = risque OOM connu, BUG-144-01).

## Implémentation (2026-09-14, branche `fix/live-realtime-379`)

Décision Ulrich : le webhook est le chemin principal, le polling 10 s n'est activé qu'en repli
quand le webhook n'est pas sain.

**Backend, worker (`src/features/weezevent/services/live/`)**
- `LiveEventWindowService` : fenêtre live unique (`resolveEventTransactionWindow` + fuseau du space + 3 h de marge), groupes (space, intégration), intégrations en direct (A1).
- `LiveSyncSchedulerService` : `@Interval(10 s)`, cadence par intégration via `live-sync-cadence.ts` (10 s live sans webhook / 120 s webhook sain / 30 s après 429 / 1800 s hors match), une sync en vol max par intégration, agrégation minute enqueuée dès qu'une sync a écrit des ventes, état par intégration en Redis, alerte si event en direct sans sync réussie > 3 min (A2, B5, C2). Remplace `@Cron(EVERY_10_MINUTES) syncRecentTransactions`.
- `LiveSyncRunnerService` : une sync incrémentale avec les gardes historiques (SyncTracker, job manuel COLLECTING).
- `LiveReconciliationCronService` : rebuild complet toutes les 30 min pendant la fenêtre, puis une fois 10 min après la fin déclarée. Remplace `triggerLiveAggregationSafetyNet`.
- `LiveAggregationTriggerService` : enqueue coalescé du job minute (flag Redis `live:agg:pending`, levé au démarrage du job), rebuild complet, `metadata.trigger` (`live-sync`, `webhook-live`, `live-reconciliation`, `live-final`).
- `WebhookHealthService` : webhook sain = traité sans erreur < 2 min. `LiveHeartbeatService` : heartbeats, état de sync, alertes (Slack via `ALERT_WEBHOOK_URL`, throttle 15 min) (C1, C2).
- `worker.ts` : `uncaughtException` / `unhandledRejection` → exit 1, Render redémarre (C3).

**Backend, agrégation (`src/features/aggregation/`)**
- `event-aggregation-sql.ts` : requêtes INSERT partagées (rebuild et minute) avec `buildMinuteClause`. `event-window-resolver.service.ts`, `event-rollup.service.ts` : extraits de `AggregationService` (utilisés par les deux chemins).
- `LiveMinuteAggregationService` (job `process-event-minutes`) : minutes touchées = transactions `updatedAt > watermark - 60 s` (watermark Redis par event, repli `Event.calculatedAt`), delete + insert scopés `minute IN (...)`, rollup Event, purge des caches timeline, SSE Live publié comme pour `process-events` (A3). La table jour par produit n'est rafraîchie que par le rebuild.
- `AggregationService.executeProcessEvents` : `metadata.trigger` / `integrationId` préservés (A5), watermark remis à "maintenant" après un rebuild.

**Backend, webhook (`src/features/weezevent/`)**
- `webhook-payload.parser.ts` : format WeezPay `{ type, method, origin, organization_id, id, values }`, champs inconnus tolérés, ancien format `{ data }` accepté (B1).
- `webhook.controller.ts` : `@Body() unknown` (plus de DTO whitelisté), signature vérifiée sur `req.rawBody` (`rawBody: true` dans `main.ts`), headers acceptés `x-weezevent-signature` / `x-signature` / `x-hub-signature-256` / `signature`, hex ou base64, préfixe `sha256=` toléré, contrôle `organization_id`, dédup par hash du corps brut (B2).
- `webhook-event.handler.ts` : id à la racine, `delete` scopé tenant + intégration, agrégation via le job minute coalescé, `WebhookHealthService.markProcessed` (B3, B5).
- `GET .../weezevent/instances/:id/webhook/status` (`WeezeventWebhookStatusService`) + `webhookUrl` sur les instances Weezevent ; `GET /health/detailed` expose `liveWorker` (heartbeats) (B4, C1).

**Frontend**
- `components/integration/WeezeventWebhookPanel.vue` monté dans la carte Weezevent de Data Integration : URL à copier, secret (activation / rotation via `PATCH .../webhook`), "Vérifier la réception" (dernier webhook, compteurs 24 h, santé, mode et cadence de polling). Clés i18n `diWz*` (B4).

**Config** : `.env.example` documente `API_PUBLIC_URL`, `WEEZEVENT_CRON_ENABLED`, `LIVE_SYNC_INTERVAL_SEC`, `LIVE_SYNC_INTERVAL_WEBHOOK_SEC`, `LIVE_SYNC_INTERVAL_RATE_LIMITED_SEC`, `IDLE_SYNC_INTERVAL_SEC`, `ALERT_WEBHOOK_URL`.

**Tests** : `live-event-window`, `live-sync-cadence`, `live-sync-scheduler`, `live-reconciliation-cron`, `live-aggregation-trigger`, `live-minute-aggregation`, `webhook-payload.parser`, `webhook-signature` (raw body), `webhook.controller` (format WeezPay, organisation, headers), `webhook-event.handler`, `aggregation.service` (metadata.trigger préservé). Les suites `transaction-sync`, `weezevent-incremental-sync`, `weezevent.controller`, `spaces.service` échouaient déjà sur `production` avant cette branche (mocks manquants, `SalesPriceAggService`, `getRevenueSummaries`), non touchées.

**Reste à faire (hors code)**
1. Contact Weezevent : header et algorithme de signature (le code accepte hex/base64, `sha256=` optionnel, sur le corps brut ; à resserrer une fois confirmé), quota API pour la cadence 10 s, enregistrement des URL pour PFC / AJA / SFP / Le Mans, type `transaction` uniquement.
2. Saisir le secret dans Data Integration (bloc Weezevent) pour chaque intégration.
3. Render : vérifier quel `render.yaml` est le blueprint réel et supprimer l'autre (A6, non fait : impossible à trancher sans le dashboard) ; poser `API_PUBLIC_URL` et éventuellement `ALERT_WEBHOOK_URL` ; décider les plans payants API + worker (B6, C4). Note : les jobs d'agrégation (queue `AGGREGATION`) sont traités par le process **web** (`AggregationModule` n'est pas dans `WorkerModule`) : un web endormi (plan free) retarde aussi le calcul Live.
4. Premier match après déploiement : vérifier `AggregationJobLog` (`trigger` = `live-sync` / `webhook-live` toutes les 10 à 15 s, `pending` à 0 en fin de match), `GET /health/detailed` → `liveWorker.status = healthy`, et l'écart au centime entre le rebuild final et les jobs minute.

## Ordre proposé

1. Lot A (A1 → A5, puis A6). Livrable seul, testable sur le prochain match, indépendant de Weezevent.
2. Lot C (C1 à C3) dans le même train, c'est ce qui permet de vérifier A.
3. Lot B dès que Weezevent a répondu aux points (1) et (2). B1/B3/B4 peuvent être codés avant, seule B2 dépend de la réponse.
4. Décisions Bertrand : plans Render (B6, C4), types de webhook à demander.

## Risque de régression / à surveiller

- **Charge API Weezevent** à 10 s : surveiller les 429 dans les logs du worker les premiers matchs ; repli 30 s automatique à prévoir dans A2.
- **Empilement BullMQ** : sans la coalescence A3, une sync à 10 s peut produire plus de jobs que le worker n'en traite. Vérifier `AggregationJobLog` `pending` après un match : doit rester à 0.
- **Cohérence incrémental vs rebuild** : après un match, comparer `SpaceRevenueMinuteAgg` produite par les jobs minute avec le rebuild complet du filet de fin de fenêtre (même CA au centime). Un écart signale une minute oubliée (transaction hors ordre, annulation) ; le rebuild est la référence.
- **Ligne d'article sans `productId`** ou vente non mappée : même comportement qu'aujourd'hui (LEFT JOIN, `spaceElementId` NULL), le filtre minute ne change pas le périmètre.
- **Deux clubs le même soir au même stade** (Jean Bouin : PFC + SFP) : A1 doit produire deux groupes `(space, integration)` distincts, jamais un groupe sans `integrationId` pour un event lié (BUG-365-02).
- **Event sans `integrationId`/`weezeventEventId`** (AJA-Nice) : A2 ne sait pas quelle intégration syncer à 10 s pour lui. Règle : résoudre l'intégration via `Space` → intégrations Weezevent du tenant ayant des transactions sur ce space, sinon toutes les intégrations Weezevent du tenant passent en cadence live. Documenter et, mieux, lier l'event (backfill 146-01).
- **Fuseau** : `Space.timezone` (`Europe/Paris` par défaut) ; un space mal renseigné décale la fenêtre d'une ou deux heures. Marge 3h après la fin déjà prévue ; ajouter aussi 1h avant minuit local ? Non : la fenêtre démarre à minuit local, une vente à 23h la veille n'appartient pas à l'event (règle 147-01).
- **Webhook `update`/`delete`** : la sync par polling ne voit pas les annulations. Avec B, `method: delete` doit passer par `markTransactionAsDeleted` (BUG-028) et re-déclencher l'agrégation.
- Ne pas retirer le polling quand le webhook sera en place : pas de retry chez Weezevent, le polling reste le filet.

## Références

- BUG-109 (agrégation jamais déclenchée automatiquement) : le filet de sécurité livré n'a jamais couvert un match (CR1).
- BUG-144-01 (OOM Render, cron déplacé dans le worker), BUG-365-02 (groupement par intégration), BUG-375-02 (metadata écrasé, CR4), BUG-147-01 (règle de fenêtre minuit local → `eventEndTime`).
- ADR-0002 (migrations manuelles) contredit par `render.yaml` racine (CR5).
- `datafriday-web/docs/modules/11_LIVE.md` §82-97, §121-148 (le front ne déclenche jamais l'agrégation, tout repose sur webhook + cron).
- Doc Weezevent WeezPay Webhooks : `https://docapi.weezevent.com/openapi.html?weezpay#tag/Webhooks`.
- Requêtes de diagnostic (lecture seule, à rejouer après le fix) :
  - jobs par origine : `select metadata->>'trigger', "jobType", status, count(*), max("startedAt") from "AggregationJobLog" where "startedAt" >= <jour du match> group by 1,2,3;`
  - cadence de sync : `select date_trunc('minute',"syncedAt"), count(*) from "WeezeventTransaction" where "tenantId"=... and "integrationId"=... and "transactionDate" >= <jour> group by 1 order by 1;`
  - webhooks reçus : `select "integrationId", count(*), max("createdAt") from "WeezeventWebhookEvent" group by 1;`
