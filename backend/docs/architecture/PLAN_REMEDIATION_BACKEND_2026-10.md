# Plan de remédiation backend (octobre 2026)

> Objectif : un backend solide, une base de données performante, **zéro code mort et zéro duplication inutile**.
> Chaque point donne le constat (avec preuves), la solution retenue, les étapes, et le **critère de fin** qui permet de dire qu'il est traité à 100 %.
> Analyse réalisée le 2026-10-02 sur `production` (89240a5d).
> **Révision 2 (même jour) : diagnostic re-vérifié en profondeur.** Graphe de modules Nest calculé, test d'injection de dépendances du worker exécuté hors ligne, chacune des 77 requêtes SQL brutes relue, catalogue Postgres de production interrogé en lecture seule (`pg_index`, `pg_stat_user_indexes`, `pg_constraint`, aucune table métier lue). Les corrections par rapport à la version 1 sont listées dans la section suivante.

## Corrections apportées par la vérification

| Point | Version 1 | Constat vérifié |
|---|---|---|
| P0 (nouveau) | non détecté | **Le worker ne peut pas démarrer** : erreur d'injection `ClsService` (voir P0) |
| P1 | « 77 requêtes SQL brutes non filtrées », gravité critique | Les 77 requêtes sont **toutes** correctement filtrées par tenant aujourd'hui (directement, via `event-aggregation-sql.ts`, ou via des ids déjà scopés), sauf les compteurs de monitoring, globaux par conception. **Aucune fuite constatée.** Le risque est structurel (repose sur la discipline). Gravité ramenée à Élevé |
| P1 | « `runWithoutTenantScope` : 2 usages » | 0 usage en production, utilisée seulement dans un test |
| P2 | « `AggregationProcessor` et `SimulationRunProcessor` uniquement dans l'API » | Faux : le worker les charge aussi, par imports transitifs (`QueueModule` → `WeezeventModule` → `EventsModule` → … → `SpacesModule`, `AggregationModule`, `LogisticsModule`). **Tous les processors sont chargés dans les deux process** |
| P6 | 46 chaînes fournisseur | 41 |
| P7 | 518 exceptions HTTP | 586 |
| P9 | 17 `process.env`, 26 `ConfigService` | 23 `process.env` hors `config/`, `main.ts`, `worker.ts` ; 12 `ConfigService.get` |
| P11 | « supprimer les contrôles d'accès espace en double, le guard suffit » | Inexact : la plupart des contrôles en service déduisent l'espace de l'entité (`reco.spaceId`, liens d'un article), ce que le guard ne voit pas. Il faut **centraliser l'algorithme**, pas supprimer les contrôles |
| D1 | 79 index redondants (schéma) | **78 en base réelle, 422 Mo.** Certains sont très utilisés et plus compacts que l'index qui les couvre : suppression au cas par cas, pas en bloc |
| D2 | 10 FK sans index (schéma) | Confirmé en base : mêmes 10 |
| D3 | ~120 requêtes en boucle | Heuristique avec faux positifs ; cas confirmés listés en D3 |
| D4 | double stockage supposé | Confirmé par le code lui-même (commentaires de `getConfiguration` décrivant les désynchronisations JSON / tables) |

## Sommaire

| # | Sujet | Gravité | Effort |
|---|---|---|---|
| P0 | Le worker ne démarre pas | Critique | S |
| P1 | Isolation tenant : structure fragile (SQL brut manuel, jobs hors contexte, `$use` déprécié) | Élevé | M |
| P2 | Séparation API / worker, crons et queues | Critique | M |
| P3 | Classes géantes | Élevé | L |
| P4 | Typage faible (`any`, tsconfig non strict) | Élevé | L (progressif) |
| P5 | Accès aux données dans les contrôleurs, métier mêlé à Prisma | Élevé | M |
| P6 | Fournisseurs de ventes codés en dur | Moyen | M |
| P7 | Stratégie d'erreurs | Moyen | S |
| P8 | Entrées non validées | Moyen | S |
| P9 | Configuration et variables d'environnement | Moyen | S |
| P10 | Code mort | Moyen | S |
| P11 | Code dupliqué | Moyen | M |
| P12 | Organisation des dossiers | Faible | S (au fil de l'eau) |
| D1 | Index redondants (78 en base, 422 Mo) | Élevé (perf écriture) | S |
| D2 | Clés étrangères sans index (10) | Moyen | S |
| D3 | Lectures non bornées et requêtes en boucle (N+1) | Élevé | M |
| D4 | Double stockage des configurations (JSON + tables) | Moyen | M |
| D5 | Observabilité base | Moyen | S |
| T1 | Suite de tests lente, qui ne se termine pas | Élevé | S |

Ordre d'exécution recommandé en fin de document.

---

## Règles transverses (s'appliquent à chaque PR de ce plan)

1. **Pas de façade ni d'alias de compatibilité laissés en place.** Quand on déplace du code, on met à jour tous les appelants dans la même PR et on supprime l'ancien emplacement. Pas de `export { X } from './nouveau'` "pour compatibilité".
2. **Une seule implémentation par règle métier.** Avant d'écrire un helper, chercher s'il existe (`grep`). S'il existe deux versions, la PR qui touche l'une fusionne les deux.
3. **Base de données** : migrations manuelles (ADR 0002), `EXPLAIN (ANALYZE, BUFFERS)` obligatoire avant toute requête nouvelle ou modifiée sur `SalesTransaction`, `SalesTransactionItem` et les tables d'agrégats. `backend/.env` pointe la production : lecture seule.
4. **Garde-fous automatiques** : chaque point ci-dessous se termine par une règle CI (lint, knip, jscpd, test) qui empêche la régression. Un point sans garde-fou n'est pas terminé.

---

## P0. Le worker ne démarre pas

### Constat (vérifié par exécution)
- `PrismaService` injecte `ClsService` ([prisma.service.ts:65](../../src/core/database/prisma.service.ts)). `ClsModule.forRoot` n'est enregistré que dans `AppModule` ([app.module.ts:145](../../src/app.module.ts)) ; `WorkerModule` ne l'importe pas.
- Test d'injection hors ligne (`Test.createTestingModule({ imports: [WorkerModule] }).compile()`, sans base ni Redis) :
  `Nest can't resolve dependencies of the PrismaService (?). Please make sure that the argument ClsService at index [0] is available in the PrismaModule context.`
- Le défaut existe depuis l'initialisation du dépôt (8bf24296, 2026-07-15). `node dist/worker` (service `datafriday-worker` de `render.yaml`) échoue donc au démarrage, et Render le relance en boucle.
- Rien n'a semblé cassé parce que **l'API charge elle aussi tous les processors et tous les crons** (P2) : c'est le process web qui fait en réalité tout le travail de fond.

### Solution retenue
1. Extraire l'enregistrement de `ClsModule.forRoot({ global: true })` dans `TenantModule` (core) et importer `TenantModule` dans `AppModule` **et** `WorkerModule`. Côté API, garder `middleware: { mount: true }` ; côté worker, le contexte est ouvert par `runForTenant` (P1).
2. Ajouter un test `worker.module.spec.ts` qui compile `WorkerModule` (injection seule, sans `init()`) et un équivalent pour `AppModule`. Ce test aurait détecté le défaut.
3. Vérifier dans le dashboard Render l'état réel du service worker (logs de crash) et ses variables d'environnement.

### Critère de fin
`worker.module.spec.ts` vert en CI ; le worker démarre et logue `BullMQ worker started` ; P2 appliqué pour que l'API cesse de consommer les jobs.

---

## P1. Isolation tenant

### Constat
- L'isolation automatique repose sur un middleware `$use` ([prisma.service.ts:123-140](../../src/core/database/prisma.service.ts)). `$use` est **déprécié depuis Prisma 4.16 et retiré dans la branche 6**. Version actuelle : 5.22.0.
- Le middleware **ne s'applique pas** :
  - aux **77 requêtes `$queryRaw` / `$executeRaw`** (25 fichiers). **Vérification faite une par une : toutes sont aujourd'hui correctement filtrées** (`WHERE "tenantId" = ${tenantId}` direct, conditions construites dans `conds` / `filters`, helpers de `event-aggregation-sql.ts`, ou `UPDATE ... WHERE id IN (...)` sur des ids déjà lus dans le bon tenant). Les 5 requêtes de `weezevent-cron.service.ts` (`monitorDataIntegrationIntegrity`) sont des compteurs globaux en lecture, volontairement multi-tenant. Le problème n'est donc pas une fuite actuelle, mais l'absence de garde-fou : la prochaine requête brute peut oublier le filtre sans que rien ne le détecte ;
  - hors contexte HTTP (crons, processors BullMQ, webhooks) : `bypass = true` quand le CLS n'est pas actif (ligne 128). Ces chemins passent `tenantId` à la main partout ;
  - aux 13 modèles où `tenantId` est optionnel et aux modèles enfants sans `tenantId` ;
  - aux `include` / écritures imbriquées (seul le modèle racine est filtré).
- `runWithoutTenantScope` n'est utilisée nulle part en production (seulement dans un test).
- **Pas de filet côté base** : RLS activé sur 5 tables sur 126, et l'application se connecte en `postgres` avec `rolbypassrls = true` : le RLS ne la concerne pas.
- `src/shared/db/query-with-work-mem.ts` utilise `$executeRawUnsafe` avec une interpolation `'${workMem}'` (valeur fournie par le code, pas par l'utilisateur, mais non validée).

### Solution retenue
1. **Remplacer `$use` par une extension `$extends`** (API officielle, conservée en Prisma 6), en réutilisant les fonctions pures existantes de `tenant-scope.util.ts` (pas de réécriture de la logique, adaptation de la signature `params` vers `{ operation, args }`).

   ```ts
   // core/database/tenant-scope.extension.ts
   export function tenantScopeExtension(cls: ClsService, scoped: Set<string>) {
     return Prisma.defineExtension({
       name: 'tenant-scope',
       query: {
         $allModels: {
           async $allOperations({ model, operation, args, query }) {
             const tenantId = currentTenantId(cls); // undefined si bypass explicite
             if (!tenantId || !scoped.has(model)) return query(args);
             return query(applyTenantScope(operation, args, tenantId));
           },
         },
       },
     });
   }
   ```
   `PrismaService` expose le client étendu via un provider (`PRISMA` token) ; les transactions interactives `tx` héritent de l'extension.

2. **Rendre le contexte tenant obligatoire hors HTTP** au lieu de le désactiver :
   - ajouter `TenantContextService.runForTenant(tenantId, fn)` (ouvre un `cls.run` et pose `TENANT_ID_KEY`) ;
   - chaque processor BullMQ exécute `job.data.tenantId` dans `runForTenant` (le `tenantId` devient obligatoire dans le type de payload de chaque job) ;
   - chaque cron multi-tenant itère sur les tenants et appelle `runForTenant` par tenant ;
   - les webhooks résolvent le tenant depuis l'intégration puis passent par `runForTenant` ;
   - le seul contournement autorisé reste `runWithoutTenantScope` (aucun usage aujourd'hui ; chaque futur usage est justifié en commentaire, par exemple le cron de monitoring global).
   - **En dehors de ces deux cas, une requête sur un modèle tenant-scopé sans contexte lève une erreur** (fail closed) au lieu de passer sans filtre.

3. **SQL brut : un seul point d'entrée.**
   - Toutes les requêtes brutes vivent dans des fichiers `*.queries.ts` (le modèle existe déjà : `spaces/*.sql.ts`, `shared/sales/distinct-merchant-ids.query.ts`) ;
   - chaque fonction prend `tenantId: string` en **premier paramètre obligatoire** et l'utilise dans le `WHERE` via `Prisma.sql` (jamais `Prisma.raw` sur une valeur) ;
   - ESLint `no-restricted-syntax` interdit `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe` en dehors de `*.queries.ts` et de `core/database`.
4. **`query-with-work-mem.ts`** : valider `workMem` avec `/^\d{1,4}(kB|MB)$/` avant interpolation (une commande `SET` ne peut pas être paramétrée), sinon lever une erreur.
5. **Test d'isolation exhaustif** : étendre `tenant-isolation.integration.spec.ts` pour qu'il parcoure la liste des modèles tenant-scopés (DMMF) et vérifie, pour chacun, qu'une lecture avec le tenant B ne renvoie rien du tenant A. Ajouter un test par fichier `*.queries.ts`.

### Critère de fin
- `grep -rn '\$use(' src` ne renvoie rien.
- `grep -rnE '\$(query|execute)Raw' src | grep -v '\.queries\.ts' | grep -v core/database` ne renvoie rien (règle ESLint active).
- Aucun processor ni cron n'accède à Prisma sans `runForTenant` ou `runWithoutTenantScope` (une requête sans contexte lève une erreur, couverte par un test).
- Test d'isolation vert sur tous les modèles tenant-scopés.

---

## P2. Séparation API / worker

### Constat (graphe de modules calculé)

| Composant | API (`AppModule`, 58 modules) | Worker (`WorkerModule`, 14 modules) |
|---|---|---|
| `DataSync`, `Analytics`, `Notification`, `Export` processors | chargés | chargés |
| `AggregationProcessor`, `SimulationRunProcessor` | chargés | chargés (imports transitifs) |
| `WeezeventCronService`, `LiveSyncSchedulerService`, `LiveReconciliationCronService` | chargés | chargés |
| `InventoryLiveInitCronService`, `InventoryWindowLifecycleCronService` | chargés | absents |

- **Chaque processor consomme les jobs dans les deux process.** `AggregationProcessor` documente « concurrency 1, les jobs d'un même space sont séquentiels » ([aggregation.processor.ts:16](../../src/features/aggregation/aggregation.processor.ts)) : avec deux consommateurs, cette hypothèse est fausse dès que le worker tourne.
- Le worker « minimal » charge en fait 14 modules (Events, Spaces, Mappings, Aggregation, Logistics, Onboarding, Pricing…) par imports transitifs depuis `QueueModule` → `WeezeventModule`.
- `QueueModule` (dans `core`) importe `WeezeventModule` (feature) via `forwardRef` : dépendance inversée core vers feature, cause de cette cascade.
- 7 crons/intervals ; 5 sont activés **par défaut** (`process.env.X_CRON_ENABLED !== 'false'`). `render.yaml` ne déclare pas `WEEZEVENT_CRON_ENABLED=false` pour le service web : si la variable n'est pas posée à la main dans le dashboard Render, les crons Weezevent tournent dans l'API (et dans le worker quand il démarre). Aucun verrou distribué. `inventory-window-lifecycle.cron.ts` a un verrou `running` en mémoire, valable pour une seule instance.
- `worker.module.ts` charge `envFiles/.env.development` en dur, sans le schéma de validation Joi de l'API.
- Voir aussi P0 : le worker ne démarre pas actuellement.

### Solution retenue
1. **Deux modules distincts, sans chevauchement** :
   - `QueueProducerModule` (core) : `BullModule.forRootAsync` + `registerQueue` + `QueueService`. Aucun processor. Importé par l'API **et** le worker.
   - Les processors vivent **dans leur feature** (`features/weezevent/jobs/data-sync.processor.ts`, `features/aggregation/jobs/aggregation.processor.ts`, etc.) et sont regroupés dans des modules `XxxJobsModule` importés **uniquement par `WorkerModule`**.
   - Résultat : `core` ne dépend plus d'aucune feature, les `forwardRef` liés disparaissent.
2. **Crons : une seule mécanique, exécution unique garantie.** Remplacer les `@Cron` / `@Interval` par des **job schedulers BullMQ** (`queue.upsertJobScheduler(id, { pattern })`). Redis garantit qu'un tick n'est traité qu'une fois, quel que soit le nombre de workers. Les variables `*_CRON_ENABLED` sont supprimées (le cron n'existe que dans le worker). `ScheduleModule` est retiré de l'API.
   - Exception éventuelle : le `live-sync-scheduler` (tick court et cadence adaptative). S'il reste un `@Interval`, il est protégé par un verrou Redis `SET key NX PX ttl` via **un seul** helper `withDistributedLock(name, ttlMs, fn)` dans `core/redis`.
3. **Une seule configuration** : extraire `config/env.validation.ts` (schéma Joi actuel de `app.module.ts:77-109`) et `config/config.module.ts` utilisés par l'API et le worker. Le chemin du fichier `.env` vient de `NODE_ENV`, jamais codé en dur.
4. **Le worker est le seul consommateur.** L'API ne fait que produire des jobs. Vérification au démarrage : log de la liste des processors chargés par process.

### Critère de fin
- `AppModule` n'importe aucun module contenant un `@Processor` ni `ScheduleModule`.
- `grep -rn "features/" src/core` ne renvoie rien (hors commentaires).
- `grep -rn "CRON_ENABLED" src` ne renvoie rien.
- Démarrer deux workers en local : chaque cron s'exécute une seule fois par tick (vérifié dans les logs).

---

## P3. Classes géantes

### Constat

| Fichier | Lignes | Méthodes publiques / privées (approx.) | `any` |
|---|---|---|---|
| `spaces/spaces.service.ts` | 4739 | 38 / 26 à 54 selon le comptage | 192 |
| `logistics/logistics.service.ts` | 3263 | 30 / 30 | 37 |
| `menu-items/menu-items.service.ts` | 2286 | 28 / 24 | 68 |
| `weezevent/weezevent.controller.ts` | 1755 | 26 routes, 84 appels Prisma | 80 |
| `inventory/inventory.service.ts` | 1582 | 16 / 14 | |
| `space-menus/space-menus.service.ts` | 1440 | 9 / 8 | 38 |
| `spaces/spaces.controller.ts` | 1396 | | 33 |

18 fichiers dépassent 800 lignes.

### Solution retenue
Découpage par responsabilité, un service par PR, **sans façade** (règle transverse 1) :

- **spaces.service.ts** devient :
  - `SpaceCrudService` (CRUD, image, métadonnées)
  - `SpaceAccessGrantService` (droits, épingles)
  - `SpaceConfigurationService` (`saveConfiguration`, `getConfiguration`, voir D4)
  - `SpaceElementService` (éléments, étages, `quickCreateElement`, `deleteIfUnreferenced`). Supprime aussi la dépendance `mappings → spaces`.
  - `SpaceEventTimelineService` (timeline, paniers)
  - `SpaceWeezeventEventService` (métadonnées et participants Weezevent)
- **logistics.service.ts** devient : `StockMovementService`, `LossService`, `ReconciliationService`, `LogisticsExportService`, et un module **`simulation`** séparé (il écrit des `SalesTransaction`, ce n'est pas de la logistique).
- **weezevent.controller.ts** devient : `WeezeventSyncController`, `WeezeventDataController`, `WeezeventAdminController`, sans aucune dépendance à Prisma. Les requêtes partent dans `WeezeventDataQueryService` + `weezevent-data.queries.ts`.
- **menu-items, inventory, space-menus** : même méthode, plan détaillé rédigé au moment de l'attaquer.

Méthode pour chaque extraction :
1. Écrire ou compléter le test du comportement existant (spec du service cible).
2. Déplacer les méthodes et leurs helpers privés, mettre à jour contrôleurs et appelants.
3. Supprimer les méthodes de l'ancien service dans la même PR.

### Critère de fin
- Aucun fichier de `src` au-dessus de 600 lignes. Règle ESLint `max-lines: [error, 600]` et `max-lines-per-function: [warn, 80]`.
- Aucun service avec plus de 15 méthodes publiques.

---

## P4. Typage

### Constat
- `tsconfig.json` : `strictNullChecks: false`, `noImplicitAny: false`, `strictBindCallApply: false`.
- ~1160 `any` hors tests, concentrés dans les classes géantes (voir P3).
- `.eslintrc.js` : `@typescript-eslint/no-explicit-any: 'off'`.

### Solution retenue
Migration progressive mais **à sens unique** (le compteur ne peut que baisser) :
1. Activer `@typescript-eslint/no-explicit-any: 'warn'` et figer le nombre actuel en CI (`eslint --max-warnings <N>`). Chaque PR qui touche un fichier y retire ses `any`. On baisse `N` à chaque merge.
2. Créer `tsconfig.strict.json` (étend `tsconfig.json`, `strict: true`) avec un `include` limité aux dossiers déjà migrés. La CI lance `tsc -p tsconfig.strict.json --noEmit`. On ajoute un dossier à chaque fois qu'un module est assaini (commencer par `core/`, `shared/`, puis chaque service extrait en P3).
3. Typer les retours Prisma avec `Prisma.XGetPayload<{ select: ... }>` et `satisfies Prisma.XSelect`, au lieu de `as any`.
4. Quand tous les dossiers sont dans `tsconfig.strict.json`, passer `strict: true` dans `tsconfig.json` et supprimer `tsconfig.strict.json`.

### Critère de fin
- `tsconfig.json` en `strict: true`, `no-explicit-any: 'error'`, 0 `any` hors cas justifiés par commentaire `// any: raison`.

---

## P5. Couche d'accès aux données

### Constat
- 7 contrôleurs injectent `PrismaService` : `weezevent.controller.ts` (84 appels), `weezevent-analytics.controller.ts`, `webhook.controller.ts`, `digifood-webhook.controller.ts`, `me.controller.ts`, `metrics.controller.ts`, `health.controller.ts`.
- Calculs métier (prix, conversions d'unités) imbriqués dans les requêtes Prisma, donc testables seulement avec une base.

### Solution retenue
Pas de repository générique pour tout (ce serait une duplication de l'API Prisma). On sépare seulement ce qui doit l'être :
- **Contrôleurs** : routage, DTO, décorateurs. **Jamais Prisma.** Seule exception : `health.controller.ts` (ping). ESLint `no-restricted-imports` de `PrismaService` dans `*.controller.ts`.
- **Requêtes complexes et SQL brut** : `*.queries.ts` (voir P1).
- **Règles métier pures** : fonctions sans I/O dans `*.rules.ts` ou `*.calc.ts`, testées unitairement sans mock. Exemples existants à généraliser : `staffing-calculator.service.ts`, `sales-price-agg-delta.ts`, `live-sync-cadence.ts`, `event-window.util.ts`.
- **Services** : orchestration (lecture, appel aux règles pures, écriture).

### Critère de fin
- Règle ESLint active, 0 contrôleur (hors health) qui importe `PrismaService`.
- Les calculs de prix et de conversion d'unités sont dans des fonctions pures avec tests unitaires.

---

## P6. Fournisseurs de ventes (Weezevent, Digifood)

### Constat
41 chaînes `'WEEZEVENT'` / `'DIGIFOOD'` codées en dur, surtout dans `integrations/services`. Pas d'interface commune.

### Solution retenue
```ts
// features/integrations/sales-provider.adapter.ts
export interface SalesProviderAdapter {
  readonly provider: IntegrationProvider;
  validateCredentials(input: unknown): Promise<void>;
  sync(ctx: SyncContext): Promise<SyncResult>;
  handleWebhook(payload: unknown, headers: Record<string, string>): Promise<void>;
}
export const SALES_PROVIDERS = Symbol('SALES_PROVIDERS');
```
- Chaque module fournisseur enregistre son adapter dans le token `SALES_PROVIDERS`.
- `IntegrationsService` résout l'adapter par `provider` via un registre (`Map`). Plus aucun `if (provider === ...)` hors des adapters.
- La normalisation vers `SalesTransaction` reste dans chaque adapter (le normaliseur Digifood existant est le modèle).

### Critère de fin
`grep -rnE "'(WEEZEVENT|DIGIFOOD)'" src/features --include='*.ts' | grep -v adapter | grep -v spec` ne renvoie que les définitions d'enum et de seed.

---

## P7. Stratégie d'erreurs

### Constat
- `core/exceptions/domain.exception.ts` n'est utilisé nulle part et redéfinit des classes aux mêmes noms que Nest (`NotFoundException`, `ConflictException`).
- 586 exceptions HTTP Nest levées dans le code, 51 `throw new Error(...)` hors tests (renvoyés en 500 sans message exploitable).

### Solution retenue (décision pragmatique)
- **Garder les exceptions Nest** comme standard unique : elles sont déjà utilisées partout (586 occurrences) et le filtre global les traite. Pas de deuxième hiérarchie.
- **Supprimer `domain.exception.ts`** (voir P10).
- Remplacer les 51 `throw new Error` par l'exception Nest adaptée (`BadRequestException`, `NotFoundException`, `ConflictException`, `InternalServerErrorException` avec un message métier).
- Dans les processors et crons, les erreurs sont loguées avec le `jobId`, le `tenantId` et la stack, puis relancées pour que BullMQ applique ses retries.
- `AllExceptionsFilter` : pour toute 500, log complet côté serveur, message générique côté client.
- **Uniformiser 403 / 404** : une ressource d'un autre tenant renvoie **404** (on ne révèle pas son existence). Aujourd'hui les helpers dupliqués renvoient tantôt 403, tantôt 404 (voir P11).

### Critère de fin
- `grep -rn "throw new Error(" src --include='*.ts' | grep -v spec` = 0 (règle ESLint `no-restricted-syntax`).
- `domain.exception.ts` supprimé.

---

## P8. Entrées non validées

### Constat
- Le `ValidationPipe` global est bien configuré (`whitelist`, `forbidNonWhitelisted`, `transform`, [main.ts:85-91](../../src/main.ts)).
- Mais il ne filtre rien quand le corps est typé `Record<string, unknown>` ou en objet littéral : `spaces.controller.ts:918`, `spaces.controller.ts:1391`, `restock-plans.controller.ts:76`, `restock-state.controller.ts:59` (les 2 webhooks sont légitimes : signature vérifiée sur le corps brut).
- 212 paramètres `@Query('x')` lus un par un, sans DTO (pas de validation de type ni de bornes).

### Solution retenue
- Un DTO `class-validator` pour chacun des 4 corps.
- Un DTO de query par route qui lit plus d'un paramètre. Réutiliser `shared/dto/pagination.dto.ts` (et le compléter avec `take` max 200) pour toutes les listes.
- Règle ESLint `no-restricted-syntax` sur `@Body()` dont le type est `any`, `object`, `Record` ou `unknown`, hors fichiers de webhook.

### Critère de fin
0 `@Body()` non typé hors webhooks, 0 `@Query('x')` isolé sur les routes de liste.

---

## P9. Configuration

### Constat
- `process.env` lu directement à 23 endroits hors `src/config/`, `main.ts` et `worker.ts`, contre seulement 12 lectures via `ConfigService.get`.
- `config/app.config.ts` n'est utilisé nulle part.
- Le worker ne valide pas sa configuration (P2).

### Solution retenue
- Source unique : `config/env.validation.ts` (schéma Joi) + `config/config.module.ts` partagé par l'API et le worker.
- Accès typé : un `AppConfigService` fin qui expose des getters typés (`get databaseUrl(): string`) au-dessus de `ConfigService`. Pas d'autre façon de lire la configuration.
- ESLint `no-process-env` (ou `no-restricted-properties` sur `process.env`) partout sauf dans `src/config/` et `main.ts` / `worker.ts`.

### Critère de fin
`grep -rn "process\.env" src --include='*.ts' | grep -v spec | grep -v "src/config/" | grep -vE "src/(main|worker)\.ts"` = 0.

---

## P10. Code mort

### Constat (vérifié par analyse des imports)
Fichiers jamais importés par du code de production :

| Fichier | Statut |
|---|---|
| `src/config/app.config.ts`, `src/config/index.ts` | mort |
| `src/core/database/tenant.interceptor.ts` | mort, doublon de `core/tenant/tenant-context.interceptor.ts` |
| `src/core/exceptions/domain.exception.ts` | mort (P7) |
| `src/core/pipes/validation.pipe.ts` | mort : seulement importé par 3 specs ; `main.ts` utilise le `ValidationPipe` de Nest. Supprimer le fichier, son spec, et faire pointer `all-exceptions.filter.spec.ts` et `events.validation.spec.ts` sur `@nestjs/common` |
| `src/core/constants/pagination.constants.ts` | mort |
| `src/features/weezevent/dto/update-webhook-config.dto.ts` | mort |
| Barrels `index.ts` jamais importés : `core/index.ts`, `core/auth/index.ts`, `core/database/index.ts`, `core/exceptions/index.ts`, `core/queue/index.ts`, `core/redis/index.ts`, `features/index.ts`, `features/{integrations,me,onboarding,orchestrator,organizations,spaces,tenants,users,weezevent}/index.ts`, `features/spaces/services/index.ts`, `features/{integrations,onboarding,organizations}/dto/index.ts`, `shared/index.ts`, `shared/{decorators,dto,interfaces}/index.ts` | morts. Les fichiers qu'ils réexportent sont importés directement ; les barrels ajoutent seulement des chemins d'import concurrents |
| `src/features/departments/legacy-departments.seed.ts` | utilisé uniquement par `scripts/backfill-departments.ts` : à déplacer dans `scripts/` si le backfill est encore utile, sinon supprimer les deux |
| Specs de code mort : `core/database/tenant.interceptor.spec.ts`, `core/exceptions/domain.exception.spec.ts`, `core/pipes/validation.pipe.spec.ts` | testent du code inutilisé : supprimés avec lui |
| Script npm `test:e2e` (`jest --config ./test/jest-e2e.json`) | le dossier `test/` n'existe pas : script mort |
| `TenantContextService.runWithoutTenantScope` | aucun usage en production ; conservée uniquement si P1 l'utilise (cron de monitoring global), sinon supprimée |

Hors `src` :
- `scripts/` : 46 scripts, majoritairement des backfills et migrations ponctuels déjà appliqués (`backfill-*`, `migrate-*`, `fix-all-weezevent-secrets.js`, `enable-weezevent*.sql`, `test-*.sh`). Les scripts déjà joués en production sont supprimés (l'historique git les conserve) ; ceux qui restent sont listés dans `scripts/README.md` avec leur usage.
- `prisma/backfill-*.ts`, `prisma/migrate-images-to-storage.ts` : même règle.
- `docs/old/`, `docs/scratch/`, et les audits antérieurs (`AUDIT_BACKEND_SCALABILITY_2026.md`, `AUDIT_IMPLEMENTATION_2026.md`) : archiver ou supprimer, ce document les remplace.
- Fichiers locaux non versionnés (`ts_errors.log` obsolète, `tmp-e2e/`, `backups/`, `logs/`) : vérifier qu'ils sont dans `.gitignore`.

### Solution retenue
1. Supprimer la liste ci-dessus en une PR (aucun changement de comportement, `tsc` + tests ciblés).
2. Ajouter **knip** en devDependency avec `knip.json` (points d'entrée `src/main.ts`, `src/worker.ts`, `prisma/seed.ts`, `scripts/*.ts`), et le lancer en CI : il détecte fichiers, exports et dépendances npm inutilisés.
3. Activer `@typescript-eslint/no-unused-vars: error` et `noUnusedLocals` / `noUnusedParameters` dans `tsconfig.strict.json`.
4. Retirer les dépendances npm non utilisées. Déjà confirmé : `compression` et `helmet` ne sont importés nulle part dans `src` (l'API utilise `@fastify/compress` et `@fastify/helmet`). Les autres seront listées par knip.

### Critère de fin
`npx knip` en CI : 0 fichier, 0 export, 0 dépendance inutilisés.

---

## P11. Code dupliqué

### Constat
- **Contrôle d'accès à un espace recopié 17 fois dans 16 features** (`assertSpaceAccess`, `assertSpaceOwnership`, `assertSpace`) : `builder-v2`, `events`, `guest-pin-access`, `history-aliases`, `inventory`, `logistic-tasks`, `logistics`, `mappings`, `market-prices`, `menu-items`, `restock-plans`, `restock-state`, `space-menus`, `spaces`, `staffing`, `suppliers`. Implémentations divergentes : certaines renvoient 404, d'autres 403, certaines prennent un `spaceId`, d'autres une liste.
  `SpaceAccessGuard` global vérifie `spaceId` en params, query et body, mais **la plupart de ces contrôles déduisent l'espace de l'entité chargée** (par exemple `reco.spaceId` dans `logistics.service.ts:2672`, les `spaceLinks` d'un article dans `menu-items.service.ts:913`) : le guard ne peut pas les remplacer. Ce qui est dupliqué, c'est l'algorithme (`hasFullAccess` puis `getAccessibleSpaceIds` puis `includes`), pas le besoin.
- `assertNoCaseInsensitiveDuplicate` recopié dans 4 services de référentiel : brands, industrials, display-names, promotion-types.
- `invalidateCache` / `cacheKey` réimplémentés dans 7 fichiers : menu-items, menu-components, ingredients, space-dashboard (service et `dashboard.controller.ts`), orchestrator (service et contrôleur).
- Les services de référentiels simples (brands, industrials, display-names, packing-types, storage-types, promotion-types…) ont la même structure CRUD.

### Solution retenue
1. **Accès espace** : deux méthodes uniques dans `SpaceAccessService` (`core/auth/space-access.service.ts`), et suppression de toutes les copies privées :
   - `assertCanAccessAny(user, spaceIds: string[])` : l'algorithme actuel (accès complet, sinon intersection avec les espaces accessibles), 403 si refus ;
   - `assertSpaceInTenant(spaceId)` : 404 si l'espace n'existe pas dans le tenant courant.
   - Un contrôle en service n'est retiré que s'il vérifie exactement le même `spaceId` que le guard sur la même route (cas à repérer un par un, pas en bloc).
2. **Unicité insensible à la casse** : un helper unique `assertUniqueName(delegate, { tenantId, name, excludeId })` dans `shared/db/`, ou mieux, un index unique `lower(name)` en base qui rend le contrôle applicatif inutile (P2002 traduit en 409 par le filtre global).
3. **Cache** : un `CacheService.wrap(key, ttl, fn)` et `invalidatePrefix(prefix)` dans `core/cache`. Les clés sont construites par une fonction unique par domaine.
4. **Référentiels CRUD** : un `TenantReferenceCrudService<T>` générique (find, create, update, softDelete, unicité) que les services de référentiels étendent ; seules les différences restent dans chaque service.
5. **Détection automatique** : ajouter **jscpd** en CI (`--min-lines 15 --threshold 3`) sur `src`.

### Critère de fin
- `grep -rn "private async assertSpace" src` = 0.
- jscpd sous le seuil, en CI.

---

## P12. Organisation des dossiers

### Constat
Structure variable selon les features : `services/` dans certaines (spaces, weezevent, digifood, integrations, events) et pas dans d'autres ; `*.sql.ts` à la racine de `spaces` ; crons nommés `*.cron.ts` ou `*-cron.service.ts` ; `shared/pricing` contient du métier (`menu-item-pricing.service.ts`, `sales-price-agg.service.ts`).

### Solution retenue
Convention unique, appliquée à chaque feature quand on y touche (pas de grand déplacement isolé) :
```
features/<feature>/
  <feature>.module.ts
  controllers/    *.controller.ts
  services/       *.service.ts (orchestration)
  rules/          *.rules.ts (pur, sans I/O)
  queries/        *.queries.ts (SQL brut, requêtes complexes)
  jobs/           *.processor.ts, *.scheduler.ts (chargés par le worker uniquement)
  dto/
```
- `shared/pricing` devient `features/pricing`. `shared` ne contient que de l'utilitaire sans métier.
- `builder-v2` : renommer `builder` si la v1 n'existe plus.

### Critère de fin
Toutes les features suivent la convention (vérifiable par un script de lint de structure).

---

## D1. Index redondants

### Constat (vérifié en base de production, lecture seule, statistiques depuis le 2025-11-11)
**78 index non uniques sont couverts par un autre index ou une contrainte unique qui commence par les mêmes colonnes, pour 422 Mo.** Un index redondant ralentit chaque `INSERT` / `UPDATE` et occupe disque et cache. Contexte : `WeezeventTransaction` (≈ 2,07 M lignes, 5,2 Go dont 2,2 Go d'index) et `WeezeventTransactionItem` (≈ 3,74 M lignes, 4,0 Go dont 1,2 Go d'index) reçoivent toutes les écritures de la synchro.

Les plus lourds :

| Index redondant | Couvert par | Taille | Lectures |
|---|---|---|---|
| `WeezeventTransaction_tenantId_integrationId_status_transactionD` | `WeezeventTransaction_basket_cover_idx` | 164,7 Mo | 48 857 |
| `WeezeventTransactionItem_transactionId_idx` | `WeezeventTransactionItem_tx_basket_cover_idx` | 127,0 Mo | **1,5 milliard** |
| `SpaceRevenueMinuteAgg_tenantId_spaceId_minute_idx` | unique `(tenantId, spaceId, minute, …)` | 33,0 Mo | 1 960 |
| `WeezeventTransactionItem_productId_idx` | `(productId, transactionId)` | 30,9 Mo | 69 235 |
| `WeezeventTransaction_tenantId_idx` | `(tenantId, status, transactionDate)` | 22,2 Mo | 2 155 |
| `WeezeventTransaction_eventId_idx` | `(eventId, transactionDate)` | 20,2 Mo | 14 360 |
| `WeezeventTransaction_tenantId_locationId_status_idx` | `(tenantId, locationId, status, eventId)` | 18,1 Mo | 19 670 |

**Nuance importante** : un index redondant reste parfois utile parce qu'il est plus petit que celui qui le couvre. `WeezeventTransactionItem_transactionId_idx` (1,5 milliard de lectures, jointures transaction vers lignes) est couvert par un index à 6 colonnes bien plus volumineux : le supprimer ferait lire davantage de pages à chaque jointure. On ne supprime donc pas en bloc.

### Solution retenue
1. **Classer chaque index** (requête de l'étape 0 ci-dessous, relancée juste avant l'action) :
   - **A, supprimer** : lectures faibles, ou index couvrant de taille comparable. Concerne les lignes 3 à 7 du tableau ci-dessus et la quasi-totalité des petits index (tables de référentiel, couverts par une contrainte unique).
   - **B, mesurer d'abord** : `WeezeventTransaction_tenantId_integrationId_status_transactionD`. `EXPLAIN (ANALYZE, BUFFERS)` des requêtes qui l'utilisent, sur une copie ou en dev avec un volume comparable, après avoir testé sans lui.
   - **C, garder** : `WeezeventTransactionItem_transactionId_idx`. On le documente comme volontaire (commentaire dans `schema.prisma`) et on l'exclut du garde-fou CI.
2. Étape 0, lecture seule :
   ```sql
   SELECT relname AS table, indexrelname AS index, idx_scan,
          pg_size_pretty(pg_relation_size(indexrelid)) AS taille
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   ORDER BY pg_relation_size(indexrelid) DESC;
   ```
3. **Supprimer** les index de classe A via migration manuelle (ADR 0002), en `DROP INDEX CONCURRENTLY` (hors transaction, fichier SQL dédié), puis retirer la ligne `@@index` correspondante du schéma Prisma.
4. Mesurer le temps d'insertion de la synchro Weezevent avant et après.
5. **Garde-fou** : un script `scripts/check-redundant-indexes.mjs` analyse `schema.prisma` en CI, avec une liste d'exceptions explicites (classe C).

### Critère de fin
0 index redondant hors exceptions documentées, garde-fou CI actif, gain d'écriture mesuré sur la synchro.

---

## D2. Clés étrangères sans index

### Constat
Confirmé en base de production (`pg_constraint` / `pg_index`) : 10 relations n'ont aucun index commençant par la colonne de clé étrangère : chaque suppression ou mise à jour du parent force un parcours complet de la table enfant (contrôle d'intégrité), et les jointures sur ces colonnes ne peuvent pas utiliser d'index.

`UserPinnedSpace.spaceId`, `HrPerson.roleId`, `EventStaffLine.supplierId`, `EventStaffLine.personId`, `ElementMenuItemSalesInput.configId`, `WeezeventUser.walletId`, `DigifoodCsvImportRun.integrationId`, `Ingredient.marketPriceId`, `Packaging.marketPriceId`, `LocationShopMapping.spaceElementId`.

`LocationShopMapping.spaceElementId` est utilisé dans `saveConfiguration` (`where: { spaceElementId: { in: ... } }`) : c'est le plus utile.

### Solution retenue
Ajouter `@@index([colonne])` pour chacune, migration manuelle en `CREATE INDEX CONCURRENTLY`. Ajouter la détection au script CI de D1.

### Critère de fin
0 clé étrangère sans index (garde-fou CI).

---

## D3. Lectures non bornées et requêtes en boucle (N+1)

### Constat
- 360 `findMany`, dont ~300 sans `take`. Toutes ne sont pas un problème (lecture par liste d'ids), mais les endpoints de liste doivent être paginés.
- ~120 `await prisma.*` détectés à l'intérieur de boucles, dans 32 fichiers. Les plus touchés : `spaces.service.ts` (22), `logistics.service.ts` (14), `core/rbac/permission-catalog.ts` (9), `menu-items.service.ts`, `space-aggregation.service.ts`, `weezevent/services/sync/queued-entity-sync.service.ts` (6 chacun), `hr.service.ts`, `mappings.service.ts`, `market-prices.service.ts` (5 chacun).
- Détection heuristique, vérifiée par échantillon : une partie sont des faux positifs (requête unique hors boucle, boucle bornée de 4 itérations dans `logistics.service.ts:1015`, boucle sur quelques étages dans `saveConfiguration`). **Cas confirmés**, tous sur les chemins de synchronisation, qui traitent des pages de 100 lignes :
  - `queued-entity-sync.service.ts:147-151` : `findUnique` **puis** `upsert` par commande, soit 2 allers-retours par ligne, et le `findUnique` est inutile ;
  - `spaces.service.ts:2335` : un `upsert` par participant Weezevent ;
  - même motif à vérifier dans `transaction-sync.service.ts` et `weezevent-insert-worker.service.ts`.
  Chaque aller-retour vers le pooler coûte 200 ms à 1 s (mesure documentée dans `builder-v2.service.ts:190`).

### Solution retenue
1. **Listes** : toutes les routes de liste passent par `PaginationDto` (`take` borné à 200, `cursor` sur les grosses tables). `select` explicite au lieu de `include` complet.
2. **N+1** : remplacer chaque boucle par un traitement en lot :
   - lecture : une requête `where: { id: { in: ids } }` puis `Map` en mémoire ;
   - création : `createMany` ;
   - mise à jour hétérogène : un `UPDATE ... FROM (VALUES ...)` dans un `*.queries.ts` ;
   - si une boucle est inévitable (ordre métier), regrouper dans une seule `$transaction` et limiter la concurrence avec `shared/utils/semaphore.ts` (déjà présent).
3. Traiter fichier par fichier dans l'ordre de la liste, en même temps que les extractions de P3.
4. **Garde-fou** : règle ESLint `no-await-in-loop` en `warn`, avec un seuil CI dégressif, comme pour `any`.

### Critère de fin
`no-await-in-loop` en `error` (exceptions annotées et justifiées), aucune route de liste sans pagination.

---

## D4. Double stockage des configurations d'espace

### Constat
`saveConfiguration` ([spaces.service.ts](../../src/features/spaces/spaces.service.ts), environ 460 lignes à partir de la ligne 2492) stocke la configuration à la fois en JSON (`Config.data`) et en tables (`Floor`, `Forecourt`, `SpaceElement`, `MenuAssignment`), puis réconcilie les deux : recherche des éléments existants, ré-injection dans le JSON des éléments mappés absents du payload, suppressions et recréations dans une transaction. Deux sources de vérité, un code de réconciliation long et fragile, des écritures lourdes à chaque sauvegarde.

Confirmé par le code lui-même : `getConfiguration` (ligne 3001) relit le JSON **et** les tables, puis fusionne les étages par `level`. Ses commentaires décrivent la désynchronisation : « a floor's id diverges between `config.data` (JSON) and the relational `Floor` row ». `Config` porte un champ `version` de verrou optimiste uniquement pour protéger le JSON.

### Solution retenue
1. Rédiger un ADR « source de vérité de la configuration d'espace » : **tables relationnelles comme source unique**, le JSON n'étant plus qu'une projection construite à la lecture (ou supprimé si le front peut consommer la forme relationnelle).
2. Remplacer la reconstruction par une **synchronisation différentielle** : calcul pur (`configuration-diff.rules.ts`, testé unitairement) des éléments à créer, modifier et supprimer, puis application en lot (D3).
3. Migration de données pour aligner les configurations existantes, vérifiée en dev puis rejouée en production.

### Critère de fin
`Config.data` n'est plus écrit (ou plus lu comme source), `saveConfiguration` fait moins de 80 lignes et délègue au calcul de diff testé.

---

## D5. Observabilité base

### Solution retenue
- Activer `pg_stat_statements` (disponible sur Supabase) et suivre chaque semaine les 20 requêtes au temps cumulé le plus élevé.
- Garder le log des requêtes lentes Prisma (`PRISMA_SLOW_QUERY_MS`, déjà en place) et y ajouter le `tenantId` et la route.
- Endpoint `metrics` : nombre de connexions du pool `pg`, attente du pool, durée des jobs BullMQ par queue.

### Critère de fin
Tableau des requêtes lentes revu à chaque sprint, aucune requête au-delà de 500 ms en p95 sur les routes d'usage courant.

---

## T1. Tests

### Constat
108 fichiers de tests. La suite complète n'a pas fini en 15 minutes en local et monopolise la machine (ts-jest avec vérification de types sur chaque fichier, handles probablement laissés ouverts : Redis, BullMQ, timers).

### Solution retenue
1. `ts-jest` en `isolatedModules: true` (la vérification de types est déjà faite par `tsc --noEmit`), ou passage à `@swc/jest`.
2. `maxWorkers: '50%'` dans `jest.config.js` pour laisser la machine utilisable.
3. Identifier les fichiers qui bloquent : `npx jest <dossier> --detectOpenHandles`, dossier par dossier. Corriger avec des `afterAll` qui ferment Redis, les queues et les timers (`jest.useFakeTimers()` pour les `setInterval`).
4. Séparer les tests d'intégration (`*.integration.spec.ts`, base requise) des tests unitaires : deux configurations jest, deux jobs CI.
5. Chaque extraction de P3 et chaque fonction pure de P5 arrive avec ses tests.

### Critère de fin
Suite unitaire complète en moins de 2 minutes, sans `--forceExit`, lancée en CI à chaque PR.

---

## CI : pipeline cible

Chaque PR doit passer :
1. `tsc --noEmit` et `tsc -p tsconfig.strict.json --noEmit`
2. `eslint` (règles ajoutées par ce plan, seuils dégressifs)
3. `knip` (P10)
4. `jscpd` (P11)
5. contrôle du schéma Prisma : index redondants et FK sans index (D1, D2)
6. tests unitaires (T1) ; tests d'intégration sur une base de test dédiée, **jamais** la base de production

---

## Ordre d'exécution recommandé

| Phase | Contenu | Pourquoi d'abord |
|---|---|---|
| 0 | P0 (démarrage du worker) **avec** P2 (l'API cesse de consommer les jobs) | À livrer ensemble : réparer P0 seul ferait tourner chaque processor et chaque cron dans deux process |
| 1 | P10 (code mort), T1 (tests rapides), CI de base | Nettoie le terrain et donne le filet de sécurité pour la suite |
| 2 | P9 (configuration) | Une seule configuration validée pour l'API et le worker |
| 3 | P1 (isolation tenant) | Sécurité des données clients, et préalable à la montée vers Prisma 6 |
| 4 | D1, D2 (index) | Gain immédiat sur les écritures, faible risque |
| 5 | P11 (duplication), P7, P8 | Réduit la surface avant le découpage |
| 6 | P3 + D3 + P5 (découpage, N+1, couche données), module par module : spaces, logistics, weezevent.controller, menu-items, inventory, space-menus | Le plus gros chantier, rendu sûr par les phases précédentes |
| 7 | D4 (configuration d'espace), P6 (adapters fournisseurs) | Demandent un ADR et une migration de données |
| En continu | P4 (typage), P12 (dossiers), D5 (observabilité) | Avancent à chaque PR grâce aux seuils CI |

---

## Annexe A. Index redondants détectés dans `schema.prisma`

Format : `Modèle : [index redondant] couvert par [index ou unique plus large]`. Liste issue de `schema.prisma` (79 entrées) ; la base de production en compte 78 (voir D1 pour les tailles et lectures réelles).

- Integration: [tenantId] couvert par index [tenantId,enabled]
- User: [email] couvert par unique [email,tenantId]
- UserTenant: [userId] couvert par unique [userId,tenantId]
- UserPinnedSpace: [userId] couvert par unique [userId,spaceId]
- UserSpaceAccess: [userId] couvert par unique [userId,spaceId]
- Permission: [tenantId] couvert par unique [tenantId,code]
- Role: [tenantId] couvert par unique [tenantId,name]
- HrGoalSpace: [goalId] couvert par unique [goalId,spaceId]
- HrStaffRatioSpace: [ratioId] couvert par unique [ratioId,spaceId]
- SeasonSpace: [seasonId] couvert par unique [seasonId,spaceId]
- HrSupplier: [tenantId] couvert par unique [tenantId,name]
- HrRole: [tenantId] couvert par unique [tenantId,name]
- HrRoleSupplier: [roleId] couvert par unique [roleId,supplierId]
- HrSinkingRule: [tenantId] couvert par unique [tenantId,roleId,fnbCategory,conditionAttribute]
- Zone: [spaceId] couvert par unique [spaceId,kind,level]
- SpaceElement: [floorId] couvert par index [floorId,type]
- SpaceElement: [forecourtId] couvert par index [forecourtId,type]
- SpaceElement: [zoneId] couvert par index [zoneId,type]
- ElementPerformance: [elementId] couvert par unique [elementId,configId]
- ElementMenuItemSalesInput: [elementId,configId] couvert par unique [elementId,configId,menuItemId]
- SalesEvent: [tenantId] couvert par unique [tenantId,integrationId,externalId]
- WeezeventMerchant: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- SalesLocation: [tenantId] couvert par unique [tenantId,integrationId,externalId]
- SalesProduct: [tenantId] couvert par index [tenantId,provider]
- WeezeventUser: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- WeezeventWallet: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- SalesTransaction: [tenantId] couvert par index [tenantId,status,transactionDate]
- SalesTransaction: [eventId] couvert par index [eventId,transactionDate]
- SalesTransaction: [tenantId,integrationId,status,transactionDate] couvert par index [tenantId,integrationId,status,transactionDate,deletedAt,eventId,locationId,locationName,id]
- SalesTransaction: [tenantId,locationId,status] couvert par index [tenantId,locationId,status,eventId]
- WeezeventSyncState: [tenantId] couvert par unique [tenantId,integrationId,syncType]
- IntegrationWebhookEvent: [integrationId] couvert par unique [integrationId,externalDeliveryId]
- SalesTransactionItem: [transactionId] couvert par index [transactionId,productId,productName,quantity,unitPrice,vat]
- SalesTransactionItem: [productId] couvert par index [productId,transactionId]
- SalesProductVariant: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- SalesProductComponent: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- WeezeventOrder: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- WeezeventPrice: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- WeezeventAttendee: [tenantId] couvert par unique [tenantId,integrationId,weezeventId]
- Ingredient: [tenantId] couvert par index [tenantId,deletedAt]
- Packaging: [tenantId] couvert par index [tenantId,deletedAt]
- ComponentType: [tenantId] couvert par unique [tenantId,name]
- ComponentCategory: [tenantId] couvert par unique [tenantId,typeId,name]
- ComponentIngredient: [componentId] couvert par unique [componentId,ingredientId]
- ComponentComponent: [parentId] couvert par unique [parentId,childId]
- ProductType: [tenantId] couvert par unique [tenantId,name]
- ProductCategory: [tenantId] couvert par unique [tenantId,typeId,name]
- MarketPriceType: [tenantId] couvert par unique [tenantId,name]
- MarketPriceCategory: [tenantId] couvert par unique [tenantId,typeId,name]
- Brand: [tenantId] couvert par unique [tenantId,name]
- DisplayName: [tenantId] couvert par unique [tenantId,name]
- Industrial: [tenantId] couvert par unique [tenantId,name]
- PackingType: [tenantId] couvert par unique [tenantId,name]
- StorageType: [tenantId] couvert par unique [tenantId,name]
- Subtype: [departmentId] couvert par unique [departmentId,name]
- MenuItem: [tenantId] couvert par index [tenantId,deletedAt]
- PromotionType: [tenantId] couvert par unique [tenantId,name]
- MenuItemCombo: [parentId] couvert par unique [parentId,childId]
- MenuItemComponent: [menuItemId] couvert par unique [menuItemId,componentId]
- MenuItemIngredient: [menuItemId] couvert par unique [menuItemId,ingredientId]
- MenuItemPackaging: [menuItemId] couvert par unique [menuItemId,packagingId]
- MenuAssignment: [stationId] couvert par unique [stationId,menuItemId]
- MenuAssignment: [elementId] couvert par index [elementId,enabled]
- EventType: [tenantId] couvert par unique [tenantId,name]
- EventCategory: [tenantId] couvert par unique [tenantId,eventTypeId,name]
- EventSubcategory: [tenantId] couvert par unique [tenantId,eventCategoryId,name]
- Team: [tenantId] couvert par unique [tenantId,eventCategoryId,eventSubcategoryId,name]
- Event: [spaceId] couvert par index [spaceId,integrationId]
- Menu: [spaceId] couvert par unique [spaceId,configId,name]
- TenantVatConfig: [tenantId] couvert par unique [tenantId,effectiveFrom]
- SpaceRevenueMinuteAgg: [tenantId,spaceId,minute] couvert par unique [tenantId,spaceId,minute,weezeventEventId,weezeventLocationId,weezeventMerchantId,spaceElementId]
- SpaceProductRevenueDailyAgg: [tenantId,spaceId,day] couvert par unique [tenantId,spaceId,day,weezeventProductId]
- SalesPriceAgg: [tenantId,locationId,productId] couvert par unique [tenantId,locationId,productId,itemWeezeventId,productNameNorm,unitPrice,vat]
- InventoryCount: [tenantId] couvert par index [tenantId,spaceId,updatedAt]
- KvStore: [tenantId] couvert par unique [tenantId,key]
- EventPredictVersion: [tenantId] couvert par index [tenantId,eventId]
- MenuItemHistoryAlias: [tenantId,spaceId] couvert par unique [tenantId,spaceId,sourceName]
- RestockState: [tenantId] couvert par unique [tenantId,spaceId]
- UnmappedDataMetrics: [tenantId,entityType] couvert par unique [tenantId,entityType,entityId]
