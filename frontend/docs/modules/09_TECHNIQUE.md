# Technique — Orchestrator, Health/Metrics, Audit, Webhooks (core), Worker

> Domaine cartographie : **Technique**. Pas d'owner produit dédié (infrastructure transverse,
> maintenue par Ulrich comme le reste du backend). Écrans frontend : **aucun** (`—` dans
> `CARTOGRAPHIE_MODULES.md`), vérifié ci-dessous par recherche exhaustive, pas supposé.
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma (`AuditLog`, `Webhook`, `WebhookLog`),
> chaque contrôleur (`OrchestratorController`, `HealthController`, `MetricsController`), chaque
> service (`OrchestratorService`, `AuditService`, `WebhooksService`, `QueueService`, `RedisService`),
> les deux points d'entrée du process (`src/main.ts` API web, `src/worker.ts` worker BullMQ), les 5
> queues BullMQ et leurs processors, les 2 fonctions Supabase Edge appelées par l'orchestrateur, et
> `render.yaml` (déploiement réel) ont été lus directement, avec vérification systématique des
> appelants (`grep` sur chaque service/méthode dans tout `src/`) plutôt qu'une supposition sur leur
> usage. **Ce domaine n'avait aucun brouillon antérieur** — `docs/utiles/modules/00_INDEX.md`
> le liste explicitement comme "non couvert par cette première passe" : ce document part de zéro,
> pas d'un état des lieux à corriger.
>
> **Constat central, à retenir avant de lire le détail** : ce domaine contient deux sous-systèmes
> **entièrement fonctionnels et utilisés** (le worker BullMQ pour la synchro Weezevent/agrégation,
> le monitoring santé/métriques) et deux sous-systèmes **complets dans le code mais jamais
> raccordés au reste de l'application** (Audit trail, Webhooks sortants) — voir Piège n°2. Ne pas
> supposer qu'une fonctionnalité "existe" ici juste parce que le modèle Prisma et le service sont
> présents : la vérification d'appelants réels est la seule preuve qui compte, exactement comme
> pour `04_MENU_CATALOGUE.md`/`03_BUILDER_ESPACES.md`.

---

## Vue d'ensemble — deux processus Node, un seul repo

```
                              api-datafriday-staging/  (UN SEUL repo, DEUX process déployés)
                              ────────────────────────────────────────────────────────────

┌─────────────────────────────── Process "API web" (src/main.ts) ───────────────────────────────┐
│  Render service "datafriday-api" (web) — render.yaml                                            │
│  Fastify + tous les modules métier (Spaces, MenuItems, Weezevent, ...) + guards globaux :        │
│  TenantThrottler → JwtDatabase → Tenant → Roles → Permissions → SpaceAccess                      │
│                                                                                                    │
│  Controllers de CE domaine :                                                                     │
│    GET  /health, /health/detailed, /health/protected, /health/admin   (HealthController)         │
│    GET  /metrics(+/cache,/queues,/database)                            (MetricsController)        │
│    GET  /orchestrator/health, POST /invalidate-cache, GET /strategy    (OrchestratorController)   │
│                                                                                                    │
│  Services @Global (injectables PARTOUT dans ce process) :                                        │
│    AuditService   (log/findByEntity/findByTenant)   ─── 0 appelant hors de lui-même ───┐         │
│    WebhooksService (dispatch/CRUD)                  ─── 0 appelant, 0 contrôleur ───────┤ MORTS   │
│    OrchestratorService.processSync/processAnalytics/getDashboardData ─ 0 appelant ──────┘ (v.pièges)│
│                                                                                                    │
│  QueueService.queueXxx() ──> pousse des jobs dans BullMQ (Redis) ────────────┐                   │
└────────────────────────────────────────────────────────────────────────────┼────────────────────┘
                                                                                │ (jobs Redis, partagés)
┌─────────────────────────────── Process "Worker" (src/worker.ts) ─────────────┼────────────────────┐
│  Render service "datafriday-worker" (background, PAS de serveur HTTP)        ▼                    │
│  NestFactory.createApplicationContext(WorkerModule) — aucun guard, aucune route                    │
│                                                                                                     │
│  WorkerModule importe : ConfigModule, ScheduleModule (@Cron), PrismaModule, EncryptionModule,      │
│  AuditModule, QueueModule (→ 3 processors + RedisModule + WeezeventModule)                         │
│                                                                                                     │
│  5 queues BullMQ déclarées, 2 VIVANTES (trafic réel), 3 MORTES/orphelines :                        │
│    DATA_SYNC    ✅ DataSyncProcessor    — alimentée par weezevent.controller.ts + aggregation      │
│    AGGREGATION  ✅ AggregationProcessor — alimentée par aggregation.service.ts (→ 02_ANALYSE.md)   │
│    ANALYTICS    💀 AnalyticsProcessor   — processor tourne, jamais nourri (placeholder à 0)        │
│    NOTIFICATIONS 💀 NotificationProcessor — processor tourne, jamais nourri (100% placeholder)     │
│    EXPORTS      💀 aucun processor du tout — un job qui y arriverait resterait bloqué à jamais     │
│                                                                                                     │
│  WeezeventCronService (@Cron) — 4 tâches planifiées (détail → 05_INTEGRATIONS_VENTES.md) :         │
│    toutes les 10 min : sync transactions incrémentale                                              │
│    tous les jours 3h : sync events+products incrémentale                                           │
│    tous les dimanches 2h : sync historique complète                                                │
│    tous les jours 6h : contrôle d'intégrité Data Integration (mappings orphelins)                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

Modèles Prisma propres à ce domaine (3, tous "OUTBOUND WEBHOOKS"/"AUDIT TRAIL" — schema.prisma) :
  Tenant ──< AuditLog        (userId: string libre, PAS de FK vers User — polymorphe par design)
  Tenant ──< Webhook ──< WebhookLog
```

**Ce que ce schéma montre déjà** : le worker et l'API web tournent dans deux process Node
séparés, déployés séparément (deux services Render distincts), qui ne partagent que Postgres et
Redis — pas de mémoire, pas d'appel direct. Un provider ajouté dans un module qui n'est PAS
importé par `WorkerModule` (ex. un nouveau controller HTTP) n'existera tout simplement pas côté
worker, et réciproquement un service ajouté à `WorkerModule` sans être exporté par un module
importé par `AppModule` n'existera pas côté API.

---

## Piège n°1 — deux runtimes pour un seul code source, pas le même graphe de dépendances

`src/main.ts` (API) et `src/worker.ts` (worker) bootstrapent chacun un module Nest **différent**
(`AppModule` vs `WorkerModule`, `src/worker.module.ts:21-34`) :

| | API web (`AppModule`) | Worker (`WorkerModule`) |
|---|---|---|
| Bootstrap | `NestFactory.create(..., FastifyAdapter)` | `NestFactory.createApplicationContext(...)` — **aucun serveur HTTP** |
| Guards globaux | 6 guards (Throttler/Jwt/Tenant/Roles/Permissions/SpaceAccess) | **aucun** — pas de requête HTTP à garder |
| Modules importés | ~35 modules métier + infra | `ConfigModule`, `ScheduleModule`, `PrismaModule`, `EncryptionModule`, `AuditModule`, `QueueModule` seulement |
| Processors BullMQ actifs | Aucun (`QueueModule` y est importé pour `QueueService.queueXxx()`, mais les 3 `providers` du module — `DataSyncProcessor`/`AnalyticsProcessor`/`NotificationProcessor` — tournent quand même dans CE process aussi, car `QueueModule` les déclare comme `providers`, pas conditionnellement au process) | Idem — mêmes processors, car `QueueModule` est le même module importé des deux côtés |
| `@Cron` (`ScheduleModule`) | `ScheduleModule.forRoot()` importé dans `AppModule` **aussi** | Importé aussi dans `WorkerModule` |

**Conséquence concrète et vérifiée** : `ScheduleModule` (donc `WeezeventCronService.@Cron`) et les
3 processors BullMQ sont en réalité déclarés dans des modules importés **des deux côtés**
(`AppModule` importe `QueueModule` directement ; `WorkerModule` aussi). Si les deux process
tournent simultanément en production (c'est le cas — deux services Render actifs), **les cron jobs
Weezevent et les 3 processors tournent en double**, une fois dans chaque process. Pour les
processors BullMQ ce n'est pas un bug (BullMQ garantit qu'un seul worker traite un job donné via un
verrou Redis — avoir 2 workers qui écoutent la même queue est un pattern de scaling volontaire,
pas une erreur). Pour `WeezeventCronService.@Cron`, en revanche, **rien n'empêche les deux process
de déclencher le même cron au même instant** — la seule protection contre la double exécution est
applicative (`syncTracker.getRunningSyncs()` vérifié en mémoire LOCALE du process, donc invisible
d'un process à l'autre) : si l'API web et le worker démarrent tous les deux avec succès, le cron
"toutes les 10 min" peut se déclencher deux fois en parallèle sur deux process différents sans que
l'un sache que l'autre tourne déjà. **Non vérifié si l'API web importe encore `ScheduleModule`
avec un cron actif en prod aujourd'hui** (le code le permettrait) — voir Zones grises.

---

## Piège n°2 — infrastructure complète mais jamais raccordée : Audit trail et Webhooks sortants

C'est le piège le plus important de ce domaine : **le code donne l'illusion que ces deux
fonctionnalités marchent** (modèle Prisma propre, service avec méthodes CRUD complètes, module
`@Global()` donc injectable n'importe où) — mais aucune n'est jamais atteinte en pratique.
Vérifié par `grep` exhaustif de chaque service/méthode dans tout `src/` (pas une supposition) :

| Service | Méthodes publiques | Appelants trouvés (hors son propre fichier/module) |
|---|---|---|
| `AuditService` (`src/core/audit/audit.service.ts`) | `log()`, `findByEntity()`, `findByTenant()` | **Zéro.** Aucun service métier (MenuItems, Spaces, Users...) n'appelle `auditService.log()` lors d'un CREATE/UPDATE/DELETE. Aucun contrôleur n'expose `findByEntity`/`findByTenant`. |
| `WebhooksService` (`src/core/webhooks/webhooks.service.ts`) | `dispatch()`, `findAll()`, `create()`, `update()`, `remove()`, `getLogs()` | **Zéro.** Aucun événement métier (`menu_item.created`, l'exemple cité dans le commentaire du schéma `Webhook.events`, `schema.prisma:2044`) n'appelle `webhooksService.dispatch()`. **Aucun contrôleur** n'existe pour ce service — `grep '@Controller('webhooks'` ne trouve QUE `webhooks/weezevent` et `webhooks/digifood` (les receveurs entrants de `05_INTEGRATIONS_VENTES.md`, un domaine totalement différent). Un tenant ne peut donc **littéralement pas créer un `Webhook`** via l'API aujourd'hui — la route n'existe pas. |

**Pourquoi c'est un piège et pas juste "du code mort ordinaire"** : contrairement à un composant
Vue orphelin qu'on repère en cherchant ses importeurs, ces deux services sont `@Global()`
(`audit.module.ts:4`, `webhooks.module.ts:6`) et **exportés** — donc syntaxiquement disponibles à
l'injection dans n'importe quel service du process API, sans import explicite du module. Un dev qui
lit `AuditService.log()` et pense "je vais juste appeler ça dans mon service" ne verra AUCUNE
erreur de compilation ni d'injection — le code marche, il n'est simplement jamais déclenché
aujourd'hui. **Conséquence pratique** : la table `AuditLog` en base est vide dans TOUS les
environnements (personne n'y écrit) ; la table `Webhook` ne peut contenir aucune ligne (aucune
route de création) donc `WebhookLog` sera toujours vide aussi. Si tu dois activer l'audit trail
pour de vrai, il faut ajouter les appels `auditService.log()` dans chaque service métier
concerné (MenuItems, MenuComponents, Spaces...) — rien de cela n'existe aujourd'hui malgré les
apparences.

---

## Piège n°3 — 5 queues BullMQ déclarées, seulement 2 ont un flux réel

`QueueModule` (`src/core/queue/queue.module.ts:41-47`) enregistre 5 queues BullMQ
(`QUEUES.DATA_SYNC/ANALYTICS/NOTIFICATIONS/EXPORTS/AGGREGATION`, `queue.constants.ts:3-9`), avec 3
processors seulement dans ses `providers` (`DataSyncProcessor`, `AnalyticsProcessor`,
`NotificationProcessor` — ligne 51-56) + `AggregationProcessor` enregistré séparément dans
`AggregationModule` (`aggregation.module.ts:17`). Vérifié appelant par appelant (`grep` de chaque
méthode `queueXxx()` de `QueueService`) :

| Queue | Processor | Alimentée en prod ? | Preuve |
|---|---|---|---|
| `DATA_SYNC` | `DataSyncProcessor` — vrai code (sync Weezevent) | ✅ Oui | `weezevent.controller.ts:238,245,253` (3 endpoints), `aggregation.service.ts:373` appellent `queueWeezeventSyncType()` |
| `AGGREGATION` | `AggregationProcessor` — vrai code (agrégation événements) | ✅ Oui | `aggregation.service.ts:192,423` appellent `queueAggregationJob()` — détail métier dans `02_ANALYSE.md` |
| `ANALYTICS` | `AnalyticsProcessor` — **100% placeholder** (`processDashboard` retourne des métriques à zéro en dur, commentaire `// Placeholder for actual dashboard computation... In production: inject PrismaService`) | 💀 Non | Seul appelant de `queueAnalytics()` = `OrchestratorService.processAnalytics()` (`orchestrator.service.ts:188`), lui-même sans appelant (voir tableau ci-dessous) |
| `NOTIFICATIONS` | `NotificationProcessor` — **100% placeholder** (email/webhook/push : chacun juste un `logger.log` + objet de retour statique, commentaires `// Placeholder for X sending logic... In production: integrate with SendGrid/Firebase/...`) | 💀 Non | `queueNotification()` et `queueWebhook()` (`queue.service.ts:215-241`) : **zéro appelant** dans tout `src/`, y compris depuis du code mort |
| `EXPORTS` | **Aucun** — pas dans les `providers` de `QueueModule`, aucun autre fichier ne déclare `@Processor(QUEUES.EXPORTS)` | 💀 Non (et cassé si jamais utilisée) | `queueExport()` (`queue.service.ts:248`) : zéro appelant. Si un jour un appelant est ajouté, le job serait accepté par Redis/BullMQ mais **ne serait jamais traité** — aucun worker n'écoute cette queue |

**Conséquence pratique pour un correctif** : si tu ajoutes un besoin d'export CSV/Excel/PDF
asynchrone, `queueExport()` existe déjà avec le bon typage (`ExportJobData`) mais **il faut créer
le processor `EXPORTS` avant que ça fonctionne** — l'infrastructure de queue seule ne suffit pas.
Idem pour notifications réelles (email/push) : remplacer les 3 méthodes placeholder de
`NotificationProcessor` par une vraie intégration (SendGrid, Firebase...) avant tout usage prod.

---

## Modules et modèles — détail

### Orchestrator (« HEOS ») — routage intelligent... en grande partie non branché

**Qu'est-ce que c'est** : un service conçu pour arbitrer entre 3 stratégies de traitement
(synchrone / file BullMQ / Supabase Edge Function) selon le volume de données estimé — l'en-tête
du fichier l'appelle "HEOS - Hybrid Event-driven Orchestrated System" (`orchestrator.service.ts:6-19`).
Seuils codés en dur : `SYNC_THRESHOLD=1000`, `QUEUE_THRESHOLD=50000` items
(`orchestrator.service.ts:51-52`).

**Où vit le code** :
- Contrôleur : `api-datafriday-staging/src/features/orchestrator/orchestrator.controller.ts`
- Service : `orchestrator.service.ts` (aucun modèle Prisma dédié — s'appuie sur `RedisService`
  et `QueueService`)
- DTOs : `dto/invalidate-cache.dto.ts`, `dto/get-strategy-query.dto.ts`

**Toutes les routes backend** (`OrchestratorController`, préfixe `/orchestrator`) :

| Route | Guard explicite | Rôle | Utilisée en pratique ? |
|---|---|---|---|
| `GET /orchestrator/health` | Aucun (mais protégée quand même — voir note ci-dessous) | Ping Redis + stats des queues + ping de la fonction Edge `health` | Appelable, mais **zéro appelant identifié** côté frontend ou backend (pas de front pour ce domaine, cf. header) |
| `POST /orchestrator/invalidate-cache` | `JwtDatabaseGuard` explicite (redondant avec le guard global) | Supprime toutes les clés Redis matchant `*:{tenantId}[:{spaceId}]*` | Zéro appelant automatique trouvé — endpoint manuel (ops/debug) uniquement |
| `GET /orchestrator/strategy` | `JwtDatabaseGuard` explicite (redondant) | Retourne une recommandation `{strategy, reason, estimatedDuration}` sans rien exécuter | Zéro appelant trouvé (ni front ni back) |

**⚠️ Piège de lecture sur `/orchestrator/health`** : contrairement à `GET /health` (racine, marqué
`@Public()` explicitement, `health.controller.ts:32`), cette route n'a **aucune** annotation de
garde sur la méthode. Elle n'est pourtant PAS publique : les 6 guards globaux
(`app.module.ts:181-191`) s'appliquent quand même par défaut, et `TenantGuard` en particulier
**fail-closed** si l'utilisateur n'a pas de tenant résolu (`tenant.guard.ts:44-51` — sauf
`@Public()`/`@AllowNoTenant()`, absents ici). Un dev qui lirait vite ce contrôleur pourrait croire
cette route ouverte comme le vrai `/health` — elle exige en réalité une authentification JWT valide
+ un tenant.

**🔴 Bug actif confirmé — `tenantId` non vérifié contre l'utilisateur authentifié** :
`invalidateCache` et `getStrategy` lisent `tenantId` depuis le **body/query fourni par le
client** (`invalidate-cache.dto.ts:6-7`, `get-strategy-query.dto.ts:19-21`) et l'utilisent
directement, sans jamais le comparer au tenant réel de l'utilisateur (le décorateur
`@CurrentTenant()`, utilisé ailleurs — ex. `health.controller.ts:143` — n'est PAS utilisé ici).
Concrètement : un utilisateur authentifié du tenant A peut appeler
`POST /orchestrator/invalidate-cache` avec `{tenantId: "tenant-B"}` et forcer la purge du cache
Redis d'un tenant qu'il ne devrait pas pouvoir toucher, ou `GET /orchestrator/strategy?tenantId=tenant-B&...`
pour obtenir une recommandation de routage "au nom" d'un autre tenant. **Impact réel limité** (la
réponse de `/strategy` ne contient aucune donnée du tenant B, juste une heuristique générique ; la
purge de cache force au pire un tenant B à recalculer son cache, pas de fuite de données) mais
c'est un vrai défaut d'autorisation — le bon pattern (`@CurrentTenant()`) existe déjà ailleurs dans
le même fichier de guards, il suffit de l'utiliser ici aussi. **Statut : documenté, non corrigé.**

**Ce qui est mort dans `OrchestratorService`** (voir Code mort) : `processSync()`,
`processAnalytics()`, `getDashboardData()`, et leurs méthodes privées associées
(`processViaQueue`, `processViaEdgeFunction`, `processSynchronously`) — écrites, jamais appelées
par le contrôleur ni par aucun autre service du repo.

**Pourquoi ce design (probable, non confirmé)** : la présence de seuils précis, de deux fonctions
Supabase Edge dédiées (`health`, `heavy-processing`, voir plus bas) et d'une doc Swagger soignée
suggère un chantier d'architecture engagé sérieusement puis mis en pause avant d'être branché aux
vrais points d'entrée métier (aucun service métier n'appelle `orchestratorService.processSync(...)`
autour d'une opération lourde réelle). Voir Zones grises.

---

### Health & Metrics — monitoring, le seul sous-système de ce domaine réellement consommé en prod

**Qu'est-ce que c'est** : deux contrôleurs distincts dans le même module (`HealthModule`,
`src/health/health.module.ts`) — l'un pour un ping applicatif basique + diagnostics, l'autre pour
des métriques plateforme réservées au super-admin.

**Où vit le code** :
- `src/health/health.controller.ts` (`HealthController`)
- `src/health/metrics.controller.ts` (`MetricsController`)
- `src/health/health.module.ts`

**Toutes les routes** (`HealthController`, préfixe `/health`) :

| Route | Garde | Rôle |
|---|---|---|
| `GET /health` | `@Public()` explicite + `@SkipThrottle()` classe entière | Ping minimal `{status:'ok', timestamp}` — **c'est la route interrogée automatiquement par Render** (voir ci-dessous) |
| `GET /health/detailed` | Aucune (mais 6 guards globaux s'appliquent — même remarque que `/orchestrator/health`) | Vérifie Postgres (`SELECT 1`), Redis (`ping`), queues BullMQ — retourne `status: healthy\|degraded` |
| `GET /health/protected` | `JwtDatabaseGuard` explicite | Test manuel d'authentification JWT (retourne l'utilisateur courant) |
| `GET /health/admin` | `JwtDatabaseGuard` + `RolesGuard` + `@Roles(ADMIN)` | Test manuel de RBAC rôle ADMIN |

**🔍 Fait vérifié, pas supposé — qui appelle vraiment `GET /health`** : `render.yaml`
(racine `api-datafriday-staging/`) déclare `healthCheckPath: /api/v1/health` sur le service web
`datafriday-api` — c'est **Render lui-même** qui interroge périodiquement cette route pour décider
si le service est sain (redémarrage automatique sinon). C'est le **seul appelant confirmé** de
cette route en production. Côté frontend, la seule référence trouvée est
`src/utils/api.js:229-236` (fonction `healthCheck()` du monolithe legacy), elle-même appelée
uniquement par `src/components/appCopy.vue:956` — **`appCopy.vue` n'est routé nulle part**
(zéro occurrence dans `router/index.js` ni ailleurs, vérifié par recherche exhaustive), donc ce
chemin frontend est mort. Le frontend en production ne ping donc jamais `/health` lui-même.

**Toutes les routes** (`MetricsController`, préfixe `/metrics`, `@AllowNoTenant()` +
`SuperAdminGuard` sur toute la classe) :

| Route | Rôle |
|---|---|
| `GET /metrics` | Vue globale : Redis (hit rate, mémoire), queues (stats agrégées), DB (compteurs tenant/user/menuItem/transaction), + un objet `optimizations` figé en dur listant les optimisations P0/P1/P2 déjà appliquées |
| `GET /metrics/cache` | Métriques Redis seules (hit rate, clients connectés, uptime) |
| `GET /metrics/queues` | Stats des 5 queues (`waiting`/`active`/`completed`/`failed` par queue) |
| `GET /metrics/database` | Compteurs bruts (`tenant.count()`, `user.count()`, `menuItem.count({deletedAt:null})`, `salesTransaction.count()`) |

**Champs clés et leur sens métier** : `SuperAdminGuard` (`super-admin.guard.ts:22-35`) est
**distinct** du rôle `ADMIN` RBAC classique — il vérifie `request.user.isSuperAdmin`, un flag
d'administration **plateforme** (cross-tenant), pas un rôle d'organisation. Un utilisateur
`ADMIN` d'un tenant normal (même via `RolesGuard`/`@Roles(ADMIN)`) n'a **pas** accès à
`/metrics` — il lui faut le flag `isSuperAdmin` résolu au lookup JWT-DB. C'est pourquoi la classe
porte aussi `@AllowNoTenant()` : un super-admin plateforme n'a pas forcément de tenant courant, et
sans cette annotation le `TenantGuard` global le bloquerait avant d'atteindre `SuperAdminGuard`.

**Pourquoi ce design** : séparer `/health` (public, minimal, conçu pour un check d'infra externe
comme Render) de `/metrics` (sensible — expose des compteurs bruts multi-tenant — donc réservé
super-admin) et de `/health/detailed` (entre les deux : pas public, mais pas super-admin non plus,
accessible à tout utilisateur authentifié d'un tenant) reflète 3 niveaux de sensibilité différents
pour 3 audiences différentes (infra externe / n'importe quel utilisateur connecté / opérateur
plateforme).

**Ce qui en dépend** : rien côté métier — ces routes sont des points d'observation, aucune autre
route/service du repo ne dépend de leur contenu.

---

### Audit — `AuditLog`, le modèle et son service complet, jamais alimenté

**Qu'est-ce que c'est** : une table d'audit trail générique (qui a fait quoi, sur quelle entité,
quand) — conçue pour tracer CREATE/UPDATE/DELETE/RESTORE sur n'importe quelle entité métier.

**Où vit le code** :
- Modèle : `api-datafriday-staging/prisma/schema.prisma:2233-2249` (section `// ==================== AUDIT TRAIL ====================`)
- Service : `src/core/audit/audit.service.ts`
- Module : `src/core/audit/audit.module.ts` (`@Global()`)

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `action` | Enum applicatif (`'CREATE'\|'UPDATE'\|'DELETE'\|'RESTORE'`, typé côté TypeScript dans `AuditLogEntry` mais stocké comme `String` libre en base — pas un enum Prisma). |
| `entity`/`entityId` | **Polymorphe volontaire** — pas de FK, deux strings libres (`entity="MenuItem"`, `entityId=<id>`) pour pouvoir tracer n'importe quel modèle sans relation Prisma dédiée par entité. |
| `userId` | **String libre, PAS de FK vers `User`** (contraste avec `tenantId` qui a bien une relation `@relation` vers `Tenant`). Un `userId` supprimé ne casserait pas une contrainte FK — cohérent avec un besoin d'audit qui doit survivre à la suppression de l'utilisateur qui a agi. |
| `changes` (Json?) | Convention `{before, after}` prévue dans le type TypeScript (`AuditLogEntry.changes`) mais jamais peuplée en pratique (voir plus bas). |
| `metadata` (Json?) | Contexte libre (IP, user-agent...) — même statut : jamais peuplé. |

**Toutes les "routes"** : **aucune.** Il n'existe aucun contrôleur pour ce module — `AuditService`
n'est accessible que par injection directe depuis un autre service du process API ou du worker
(les deux importent `AuditModule`).

**Pourquoi ce design** : le pattern (entité/entityId en strings libres + Json avant/après) est un
choix classique d'audit trail générique réutilisable sans migration à chaque nouvelle entité
tracée — cohérent et bien pensé. Le problème n'est pas la conception, c'est le raccordement (voir
Piège n°2).

**Ce qui en dépend** : rien aujourd'hui — table vide dans tous les environnements, aucun écran
(il n'y en a pas) ni aucun job ne la lit. **Impact si tu la modifies** : nul en pratique tant que
personne n'écrit dedans ; si tu es celui qui la branche (ajout d'appels `auditService.log()` dans
les services métier), attention à ne pas bloquer une opération métier si l'écriture d'audit échoue
— `AuditService.log()` catch déjà ses propres erreurs et logue seulement (`audit.service.ts:33-35`),
donc un appelant qui suivrait ce pattern est safe par construction.

---

### Webhooks (core, sortants) — `Webhook` / `WebhookLog`, infrastructure de livraison complète, inatteignable

**⚠️ À ne pas confondre avec** les webhooks **entrants** Weezevent/Digifood
(`IntegrationWebhookEvent`, contrôleurs `webhooks/weezevent` et `webhooks/digifood`) — domaine
totalement différent, documenté dans `05_INTEGRATIONS_VENTES.md`. Ici il s'agit de webhooks
**sortants** : DataFriday notifierait un système tiers d'un événement métier (ex.
`menu_item.created`).

**Qu'est-ce que c'est** : un système de souscription webhook par tenant (URL cible + liste
d'événements + secret HMAC) avec livraison signée, retry applicatif absent (fire-and-forget) et
journalisation de chaque tentative.

**Où vit le code** :
- Modèles : `schema.prisma:2039-2054` (`Webhook`, section `// ==================== OUTBOUND WEBHOOKS ====================`), `2056-2072` (`WebhookLog`)
- Service : `src/core/webhooks/webhooks.service.ts`
- Module : `src/core/webhooks/webhooks.module.ts` (`@Global()`)

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `Webhook.events` (String[]) | Liste des types d'événements souscrits (ex. `["menu_item.created", "menu_item.updated"]`, exemple du commentaire du schéma) — comparé par `.has(event)` dans `dispatch()` (`webhooks.service.ts:35`). |
| `Webhook.secret` | Optionnel. Si présent, signe chaque livraison en HMAC-SHA256 sur `${timestamp}.${body}` (anti-rejeu façon Stripe), envoyé dans le header `X-Webhook-Signature: t=...,v1=...` (`webhooks.service.ts:85-91`). Sans secret, la livraison part non signée. |
| `Webhook.active` | Soft-toggle — `dispatch()` ne considère que les webhooks `active: true`. |
| `WebhookLog.status`/`success`/`duration`/`response` | Une ligne par tentative de livraison, y compris en échec réseau (`status=0`, `response=message d'erreur tronqué à 500 caractères`) — jamais de retry automatique, un seul essai par événement (`Promise.allSettled`, pas de backoff, `webhooks.service.ts:44-54`). |

**Toutes les "routes"** : **aucune**, exactement comme Audit. `WebhooksService` expose pourtant un
CRUD complet et fonctionnel (`findAll`, `create`, `update`, `remove`, `getLogs`,
`webhooks.service.ts:142-177`) — mais sans contrôleur, ces méthodes ne sont atteignables que par
un autre service backend qui les appellerait directement, ce qu'aucun ne fait aujourd'hui.

**Pourquoi ce design** : la sécurité de livraison (nonce anti-rejeu, signature HMAC sur
`timestamp.body`, timeout 10s, troncature des réponses loguées à 500 caractères) est soignée et
correspond aux bonnes pratiques du marché (modèle Stripe webhooks) — ce n'est pas un prototype
bâclé, c'est une fonctionnalité construite jusqu'au bout côté livraison, juste jamais raccordée en
amont (rien ne déclenche `dispatch()`) ni en aval côté gestion (pas de route pour qu'un tenant crée
un `Webhook`).

**Ce qui en dépend** : rien aujourd'hui. **Si tu dois l'activer** : il faut (1) écrire un
contrôleur CRUD pour `WebhooksService` (n'existe pas), et (2) ajouter des appels
`webhooksService.dispatch({event, tenantId, data})` dans les services métier aux points
d'événement voulus (ex. `menu-items.service.ts` après une création) — les deux chantiers sont
indépendants et aucun n'est commencé.

---

### Worker & Queues — le sous-système réellement vivant de ce domaine

**Qu'est-ce que c'est** : un process Node séparé (`node dist/worker`, service Render
`datafriday-worker`, `render.yaml`) qui héberge les 3 processors BullMQ "génériques"
(`DataSyncProcessor`, `AnalyticsProcessor`, `NotificationProcessor` — via `QueueModule`), le
processor d'agrégation (`AggregationProcessor`, via `AggregationModule`, importé indirectement) et
les cron jobs Weezevent (`WeezeventCronService`, activé par `ScheduleModule.forRoot()`).

**Où vit le code** :
- Bootstrap : `src/worker.ts`, `src/worker.module.ts`
- Queues (config globale, config des 5 files) : `src/core/queue/queue.module.ts`, `queue.constants.ts`
- Service d'enqueue : `src/core/queue/queue.service.ts` (`QueueService`)
- Processors génériques : `src/core/queue/processors/{data-sync,analytics,notification}.processor.ts`
- Processor d'agrégation : `src/features/aggregation/aggregation.processor.ts`
- Cron Weezevent : `src/features/weezevent/services/weezevent-cron.service.ts`

**Politique de retry** (`queue.module.ts:29-37`, appliquée à toutes les queues sauf override
explicite) : `attempts: 3`, backoff exponentiel démarrant à 2000ms, `removeOnComplete: 20` /
`removeOnFail: 20` (les jobs terminés/échoués anciens sont purgés de Redis, seuls les 20 derniers
de chaque catégorie restent consultables). `AggregationJob` override ce défaut à `attempts: 1` —
volontaire, commenté explicitement : *"l'opération est déjà idempotente (upsert)"*
(`queue.service.ts:274`).

**Ce qui en dépend** : `weezevent.controller.ts` (3 endpoints de sync manuelle) et
`aggregation.service.ts` dépendent de `DATA_SYNC` et `AGGREGATION` pour fonctionner — si le
process worker est down, ces jobs restent `waiting` en Redis jusqu'au redémarrage du worker (pas
de traitement synchrone de fallback). **Impact si tu modifies `queue.constants.ts`** (renommer une
queue) : il faut renommer partout à la fois côté `QueueModule.registerQueue` ET côté
`@Processor(QUEUES.XXX)` des 4 processors — un nom qui diverge entre les deux silencieusement
créerait une queue enregistrée sans processor (exactement le cas actuel d'`EXPORTS`, voir Piège
n°3).

---

## Section routes frontend + permissions

**Aucune** — vérifié par recherche exhaustive, pas supposé à partir du seul `—` de
`CARTOGRAPHIE_MODULES.md` :
- `src/router/index.js` : zéro route dont le nom, le chemin ou le composant évoque
  orchestrator/health/metrics/audit/webhook (core).
- `src/api/endpoints/` : aucun fichier `orchestrator.api.js`, `health.api.js`, `audit.api.js` ou
  équivalent.
- Seule occurrence de code frontend touchant `/health` : `src/utils/api.js:229-236`
  (`healthCheck()`), et son unique appelant `src/components/appCopy.vue:956` — **`appCopy.vue`
  n'est monté par aucune route** (`grep -n "appCopy" src/router/index.js` : zéro résultat ; zéro
  référence ailleurs dans `src/` en dehors du fichier lui-même). Chemin mort de bout en bout.
- Les seules occurrences front du mot "webhook" concernent exclusivement l'intégration Digifood
  (`DataIntegrationView.vue`, `aggregation.api.js`, wizard `components/integration/wizard/`) — un
  domaine différent (webhooks **entrants** Digifood, `05_INTEGRATIONS_VENTES.md`), pas le `Webhook`
  core documenté ici.

**Conséquence** : ce domaine est purement backend/infra aujourd'hui. Un agent qui chercherait un
écran "Paramètres > Webhooks" ou "Logs d'audit" côté produit ne trouvera rien à corriger côté
frontend — le travail, s'il y en a, est entièrement backend (raccordement des services existants).

---

## Client API — qui appelle quoi

Sans écran frontend, il n'y a pas de client API dédié à ce domaine. Seule trace frontend :
`src/utils/api.js` (monolithe legacy, déjà documenté comme partiellement vivant dans les autres
domaines) expose `healthCheck()`, dont l'unique appelant (`appCopy.vue`) est mort — voir ci-dessus.
Aucun fichier `src/api/endpoints/*.js` ne cible `/orchestrator`, `/health`, `/metrics`, ou le
`Webhook` core.

---

## Tableau récapitulatif — bugs/gaps actifs confirmés (2026-07-15, non corrigés)

| # | Problème | Sévérité | Fichier(s):ligne(s) |
|---|---|---|---|
| 1 | `Audit`/`Webhooks` (core) : infrastructure complète (modèle + service) mais **zéro appelant** — les tables `AuditLog`/`Webhook`/`WebhookLog` sont vides et non atteignables en pratique | 🟠 Fonctionnalité annoncée par le code mais absente en réalité | `src/core/audit/audit.service.ts`, `src/core/webhooks/webhooks.service.ts` (aucun appelant trouvé dans tout `src/`) |
| 2 | `POST /orchestrator/invalidate-cache` et `GET /orchestrator/strategy` font confiance à un `tenantId` fourni par le client au lieu de `@CurrentTenant()` — un utilisateur peut cibler un tenant qui n'est pas le sien | 🟡 Défaut d'autorisation, impact limité (pas de fuite de données) | `orchestrator.controller.ts:26-48`, `dto/invalidate-cache.dto.ts:6-7`, `dto/get-strategy-query.dto.ts:19-21` |
| 3 | Queue `EXPORTS` enregistrée dans BullMQ sans aucun processor — un job qui y serait poussé resterait bloqué indéfiniment (`waiting` permanent) | 🟡 Latent (aucun appelant de `queueExport()` aujourd'hui, mais piège prêt à se déclencher) | `queue.module.ts:41-47` (registerQueue) vs `providers:[...]` (ligne 51-56, `EXPORTS` absent) |
| 4 | Queues `ANALYTICS`/`NOTIFICATIONS` : processors actifs mais 100% placeholder (données à zéro / `logger.log` sans action réelle) et jamais alimentées en prod | 🟢 Sans impact actuel, à savoir avant d'en dépendre | `processors/analytics.processor.ts:31-62`, `processors/notification.processor.ts:31-79` |
| 5 | Fonction Supabase Edge `heavy-processing` (appelée par `OrchestratorService.processViaEdgeFunction`, lui-même mort) interroge une table `fnb_sales`/colonnes `snake_case` qui n'existent pas dans le schéma Prisma actuel (92 modèles `PascalCase`, ex. `SalesTransaction`) — cassée si jamais réactivée telle quelle | 🟢 Latent, code legacy jamais mis à jour avec le schéma actuel | `supabase/functions/heavy-processing/index.ts:130-141` (`.from('fnb_sales')`, `.eq('tenant_id', ...)`) |
| 6 | `render.yaml` fait exécuter `npx prisma migrate deploy` au démarrage des deux services (API + worker), donnant l'impression d'un déploiement de migration automatique — en réalité `prisma/migrations/*` est gitignoré (seul `.gitkeep` versionné), donc la commande s'exécute mais ne trouve **aucune migration à appliquer** dans le code buildé par Render : c'est un no-op silencieux, pas une désactivation | 🟡 Piège de compréhension, pas un bug fonctionnel (cohérent avec la procédure manuelle déjà en vigueur) | `render.yaml` (`startCommand` des 2 services), `.gitignore:47-48` (`prisma/migrations/*` + `!prisma/migrations/.gitkeep`) |

---

## Code mort de ce domaine (à ne PAS prendre comme référence)

- **`AuditService.log()`/`findByEntity()`/`findByTenant()`** — zéro appelant externe (vérifié par
  `grep` sur tout `src/`, hors `audit.service.ts`/`audit.module.ts` eux-mêmes).
- **`WebhooksService.dispatch()`/`findAll()`/`create()`/`update()`/`remove()`/`getLogs()`** — zéro
  appelant externe, zéro contrôleur exposant ces méthodes.
- **`OrchestratorService.processSync()`, `.processAnalytics()`, `.getDashboardData()`** et leurs
  méthodes privées associées (`processViaQueue`, `processViaEdgeFunction`, `processSynchronously`,
  `buildCacheKey` — utilisée uniquement par ces méthodes mortes) : le contrôleur n'appelle QUE
  `healthCheck()`, `invalidateCache()` et `decideStrategy()` (`orchestrator.controller.ts:17-47`) —
  les 3 méthodes "d'exécution" du routage HEOS ne sont jamais déclenchées par rien.
- **Queue `NOTIFICATIONS`** (+ `NotificationProcessor` en entier) et **queue `ANALYTICS`** (+
  `AnalyticsProcessor` en entier) — processors enregistrés et actifs (ils tournent, consomment un
  slot worker) mais jamais alimentés en jobs réels, uniquement atteignables via le chemin mort
  ci-dessus (`OrchestratorService.processAnalytics`) ou des méthodes `QueueService` (`queueNotification`,
  `queueWebhook`, `queueAnalytics` en dehors du chemin mort, `queueDashboardRefresh`) qui n'ont
  elles-mêmes aucun appelant.
- **Queue `EXPORTS`** — enregistrée dans BullMQ (`registerQueue`), aucun processor, aucun appelant
  de `queueExport()`.
- **`src/utils/api.js:healthCheck()`** — mort par transitivité : son seul appelant
  (`appCopy.vue:956`) est lui-même une vue jamais routée (déjà listée dans le "code mort" global de
  `CARTOGRAPHIE_MODULES.md` §4, reconfirmé ici par une recherche indépendante sur `router/index.js`).

---

## Zones grises restantes (pas des angles morts — des points réellement non tranchés)

- **Intention produit derrière Audit/Webhooks** : le code est trop soigné (sécurité HMAC anti-rejeu,
  pattern `{before,after}` générique pour l'audit) pour être un simple brouillon abandonné, mais
  rien dans `docs/utiles/` ne documente une intention produit explicite (pas de ticket, pas de plan
  retrouvé mentionnant "audit trail RGPD" ou "webhooks développeur"). Impossible de trancher entre
  "chantier prévu pour une prochaine itération" et "code écrit puis le produit a changé de
  priorité" sans interroger l'équipe — les deux hypothèses sont compatibles avec ce qui est observable
  dans le code.
- **Double exécution potentielle des cron Weezevent** (Piège n°1) : j'ai vérifié que
  `ScheduleModule.forRoot()` est importé à la fois par `AppModule` (`app.module.ts:121`, en tant
  que dépendance directe) et par `WorkerModule` (`worker.module.ts:27`), et que
  `WeezeventCronService` est un provider du module Weezevent — **mais je n'ai pas vérifié si
  `WeezeventModule` (qui contient `WeezeventCronService`) est importé par `AppModule` de façon à
  ce que ses `@Cron` s'enregistrent aussi côté API web**, ou si seul le worker l'importe
  effectivement en pratique malgré que les deux aient `ScheduleModule` disponible. Une vérification
  du graphe d'import complet de `WeezeventModule` dans les deux bootstraps serait nécessaire avant
  d'affirmer que la double exécution se produit réellement en prod (le risque architectural est
  réel, l'occurrence effective ne l'est pas confirmée).
- **Déploiement effectif des fonctions Supabase Edge (`health`, `heavy-processing`) en prod** : le
  code source des deux fonctions existe dans le repo (`supabase/functions/`) et `health/index.ts`
  serait fonctionnel si déployé (pas de dépendance à un schéma de données), mais je n'ai pas accès
  au dashboard Supabase pour confirmer qu'elles sont réellement déployées sur le projet de
  production — vérifiable seulement depuis l'infrastructure, pas depuis le code seul.
- **Valeurs effectives des `RATE_LIMIT_*` en production** : les défauts sont documentés dans
  `app.module.ts` (20 req/s, 300/min, 5000/h par tenant) et confirmés par les logs de démarrage
  (`main.ts:192`), mais `render.yaml` ne les surcharge pas explicitement (pas de `RATE_LIMIT_*`
  dans ses `envVars`) — donc soit les défauts s'appliquent tels quels en prod, soit ils sont
  surchargés manuellement dans le dashboard Render (comme `DATABASE_URL`/`REDIS_URL`, marqués
  `sync: false`). Non vérifiable depuis le code seul.
