# 07b. Inventaire, backend (module inventory, guest-pin-access, POST /inventory-counts)

Rapport en lecture seule. Chemins relatifs à la racine du dépôt. Complète `07_inventaire.md` (frontend). Les durées citées viennent des commentaires du code, jamais d'une mesure. Ce qui n'est pas lu est marqué "non vérifié". Couverture PARTIELLE (arrêt demandé par le coordinateur au-delà de 130k tokens). Numérotation adaptée au backend: 1 fiche, 2 endpoints, 3 index, 4 chaîne "compté", 5 guest-pin, 6 reset, crons, Redis, 7 problèmes, 8 recommandations, 9 non vérifié.

## 1. Fiche du périmètre backend

| Contrôleur | Route | Fichier:ligne | Garde |
|---|---|---|---|
| InventoryController | `GET/POST /inventory/...` | `backend/src/features/inventory/inventory.controller.ts` (506 l.) | `JwtDatabaseGuard`, permission de classe `front.fb.spaceInventory` (l.487 pour le 2e contrôleur, même schéma) |
| InventoryCountsController | `POST /inventory-counts` | `inventory.controller.ts:484-506` | idem |
| Guest PIN (login, session, catalog, counts) | `/guest-pin/...` | `backend/src/features/guest-pin-access/guest-pin-auth.controller.ts` (178 l.) | stratégie JWT invité (non lue) |

Fichiers lus (lignes): `inventory.controller.ts` 506, `services/inventory-count.service.ts` 336, `services/inventory-reconciliation.service.ts` 503, `prisma/schema.prisma` blocs `InventorySnapshot` (3290), `InventoryCount` (3312), `InventoryWindow` (3351), `GuestPinAccess` (3399), `StockReconciliation` (3567), `KvStore` (3711).

## 2. Endpoints, SQL/Prisma, relations, payload, cache

### 2.1 GET /inventory/:spaceId/reconciliations

- Contrôleur `inventory.controller.ts:84-97` puis `inventory-reconciliation.service.ts:172-184`.
- Prisma: `assertSpaceInTenant` (1 requête, non lue) puis `stockReconciliation.findMany({ where: { tenantId, spaceId, kind: { in: ['post-event','pre-event'] } }, orderBy: { createdAt: 'desc' } })` (l.174-181). AUCUN `select`, AUCUN `take`, AUCUN `skip`. Le commentaire l.177-180 justifie l'absence de `select` par la colonne `meta` et la génération Prisma.
- Colonnes lues: `lines` (Json, une entrée par PdV x article du match) et `meta` (Json), pour TOUS les matchs de l'espace. Commentaire l.166-169: "un space compte quelques documents, pas des milliers". Une seule feuille par match est conservée (post-event `deleteMany` l.122-124), donc la taille croît d'un document par match de la saison, mais jamais plus.
- Ensuite `withLivePostEventDraft` (l.188-202): `loadPostEventDraftStates` (non lu, 1+ requêtes) seulement s'il y a un brouillon post-event.
- Puis, si l'appelant n'a pas `preInventoryExpected`, `redactPreEventDoc` copie toutes les lignes (l.224-247, CPU linéaire).
- Cache Redis: aucun. Le tick staff 20 s (voir 07) appelle cet endpoint.

### 2.2 GET /inventory/:spaceId/:eventId?phase=

- Contrôleur `inventory.controller.ts:448-472` puis `inventory-count.service.ts:31-96`.
- 3 requêtes en parallèle (l.39-54): `inventorySnapshot.findFirst({ where:{tenantId,spaceId,eventId}, orderBy:{createdAt:'desc'} })` SANS `select` (ramène le blob Json `inventoryCounts`), `inventoryCount.findMany({ where:{tenantId,spaceId,eventId} })` SANS `select` (toutes les colonnes dont `discardedReason`, `createdAt`, `logisticPushedAt`, inutilisées par `buildInventoryCounts` l.292-316), et en post-event `inventorySnapshot.findFirst(... select:{createdAt:true})`.
- Le blob du snapshot n'est utilisé que dans la branche de repli (l.78-83) et pour `id/createdAt/updatedAt/createdBy` dans la branche principale (l.64-73). Dès que les comptages adressables existent (cas normal), le blob est lu pour rien.
- Pas d'`assertSpaceInTenant` sur cette route: le filtre `tenantId` dans le `where` suffit à l'isolation (constat, pas un défaut).
- Réponse: objet `{ shopId: { itemId: {...7 champs} } }`; taille = lignes InventoryCount du match (PdV x articles).
- Cache Redis: aucun.

### 2.3 POST /inventory-counts (une frappe = un appel)

- `inventory.controller.ts:494-505` puis `PreEventInventoryFlowService.saveCount` (non relu ici, voir 07) puis `inventory-count.service.ts:192-230`.
- Prisma dans `saveInventoryCounts`: `inventoryCount.findFirst({ where: key })` puis `update({ where:{id}})` ou `create`, soit 2 allers-retours DB minimum, le `findFirst` ramène toutes les colonnes (l.205). Rattrapage P2002 (l.222-229): 3 requêtes de plus dans le cas de course.
- Index: l'unique `uniq_inventory_count (tenantId, spaceId, eventId, shopId, itemId)` (schema.prisma:3335) sert le `findFirst` (clé complète). La migration `prisma/sql/2026-07-18_inventorycount_unique_nulls_not_distinct.sql` le recrée NULLS NOT DISTINCT (cité l.188-189 du service, fichier non relu).

### 2.4 Autres routes du contrôleur (lecture partielle)

- `GET /inventory/:s/latest` (`inventory-count.service.ts:102-158`): `inventoryCount.findFirst` + `inventorySnapshot.findFirst` sans `select` (blob lu), puis `findMany` de tous les comptages de l'event, puis `event.findFirst` select name. Index dédié `(tenantId, spaceId, updatedAt desc)` (schema.prisma:3342). Le blob du snapshot est lu même si `latestCount` gagne (l.111-114).
- `POST /inventory` (`upsertInventory` l.162-177): `inventorySnapshot.create` avec le blob complet, append-only (une ligne par appel). Appelé par `freezePostEventSnapshot` (l.237-243), qui relit d'abord `getBySpaceAndEvent` (donc le blob du snapshot en plus).
- `POST /inventory/:s/reconciliations` (final) `createPostEventReconciliation` (l.58-162): `assertSpaceInTenant` + `event.findFirst` + `stockReconciliation.create` (+ `lines` JSON complet envoyé par le client) + `deleteMany` des feuilles précédentes + `loadLogisticPushState` + `getBySpaceAndEvent` (lecture complète) + `pushCountToLogistic` + `closeInventoryWindows`. Séquentiel, dans la requête HTTP.
- `createPreEventReconciliation` (l.255-502): séquentiel `assertSpaceInTenant`, `event.findFirst`, `loadLogisticPushState`, `getBySpaceAndEvent`, `computeLogisticExpected` (SQL non lu), puis `spaceElement.findMany`, `resolveItemKeysByIds`, `resolveInventoryUnitsPerPack`, `stockReconciliation.create`, `pushCountToLogistic`, `stockReconciliation.update` (meta). Le `lines` complet est écrit une fois en `create`, `meta` réécrit ensuite (l.492-495).

## 3. Index (schema.prisma)

| Table | Index déclarés | Requête principale | Couverture |
|---|---|---|---|
| `StockReconciliation` (3567) | `(tenantId, spaceId, createdAt)` seulement (l.3586) | `where tenantId,spaceId,kind in (...) order by createdAt desc` | préfixe + tri couverts, `kind` filtré sur le tas (les resets logistiques `kind null` partagent la table et sont lus puis rejetés, non mesuré) |
| `InventorySnapshot` (3290) | `(tenantId)`, `(spaceId, eventId)`, `(spaceId, createdAt)` | `where tenantId,spaceId,eventId order by createdAt desc limit 1` | `(spaceId,eventId)` puis tri mémoire sur peu de lignes; le `kind` n'est pas dans l'index |
| `InventoryCount` (3312) | unique `(tenantId,spaceId,eventId,shopId,itemId)`, `(spaceId,eventId)`, `(shopId)`, `(itemId)`, `(tenantId,spaceId,updatedAt desc)` | `findMany where tenantId,spaceId,eventId` | couvert par le préfixe de l'unique |
| `GuestPinAccess` (3399) | unique `(windowId,elementId)`, `(tenantId,status)`, `(spaceId,elementId)` | `findUnique({ id })` à chaque requête invité (`jwt-guest-pin.strategy.ts:64`) | clé primaire, aucun souci |
| `InventoryWindow` (3351) | unique `(tenantId,spaceId,eventId,phase,selectionKey)`, `(tenantId,spaceId,status)`, `pinLookupHash` unique | chargée par la relation `window` du `include` ci-dessus (clé primaire) | clé primaire, aucun souci |
| `KvStore` (3711) | unique `(tenantId, key)` | marqueurs: `findUnique` par clé complète (OK); `findMany key startsWith` SANS tenant (`flow.service:530-534`) | non couvert: `key` n'est pas en tête d'index |

## 4. Chaîne "compté" et envoi Logistic (flow service, push, throttle)

Fichiers lus: `backend/src/features/inventory/pre-event-inventory-flow.service.ts` (l.120-599), `services/inventory-logistic-push.service.ts` (l.100-291, début non relu), `logistic-flush-throttle.ts` (42 l.).

### 4.1 Coût d'un POST /inventory-counts avec `isCounted: true`

Séquence dans la requête HTTP (`pre-event-inventory-flow.service.ts:166-200`):
1. Pre-event seulement: `findEvent` (l.581-598): `event.findFirst` avec jointure `space` et colonne JSON `sessions`, à CHAQUE frappe (pas de cache, l.182). Hors pre-event (post-event), pas de `findEvent` (l.179-181).
2. `saveInventoryCounts`: `findFirst` + `update` (2 allers-retours, voir 2.3).
3. Pre-event après les portes: `markDirty` = `kvStore.upsert` (l.465-473, l.196-198).
4. Si `isCounted === true` (l.171-174): `markLogisticDirty` = un second `kvStore.upsert` (l.508-521) PUIS `logisticFlush.schedule` (throttle mémoire). Le POST attend ces écritures avant de répondre.

Soit, pour une frappe simple post-event: 2 requêtes DB; pour un clic "compté" pre-event après les portes: 1 (event) + 2 (count) + 2 (KvStore x2) = 5 requêtes DB séquentielles, dont les deux `upsert` KvStore sur une ligne chaude (même clé par match, écrasement de `value` à chaque clic).

### 4.2 Ce que fait un envoi (flush) pre-event (`flushLogisticMarker` l.543-577 puis `regenerate` l.213-244, `regenerateNow` l.246-320)

Lectures/écritures par envoi, toutes sérialisées par match mais dans le processus API:
- `kvStore.findMany({ where:{ key:{ startsWith: 'prefix:' } } })` SANS filtre tenant ni `select` quand le cron appelle sans `onlyKey` (l.530-534). L'unique de `KvStore` est `(tenantId, key)` (schema.prisma:3711-3719): un `LIKE 'prefix%'` sur `key` seul ne peut pas utiliser un index btree dont `tenantId` est la première colonne. Parcours de la table, taille non mesurée (table fourre-tout: marqueurs, caches). À vérifier par EXPLAIN.
- `regenerateNow`: `findEvent` (event + `sessions`), `getBySpaceAndEvent` #1 (comptages complets + blob du snapshot, l.263), `stockReconciliation.findMany` des feuilles précédentes AVEC `lines` (l.273-277), puis `createPreEventReconciliation` (voir 2.4) qui relit `loadLogisticPushState` + `getBySpaceAndEvent` #2 (blob snapshot relu), puis `computeLogisticExpected` (stock Logistic de l'espace entier, SQL non lu), résolution des noms, `stockReconciliation.create` (lines JSON), `pushCountToLogistic`, `stockReconciliation.update` (meta), puis `deleteMany` des anciennes feuilles (l.293-297).
- `pushCountToLogistic` (l.100-172): `resolveInventoryUnitsPerPack`, `deriveEventConsumption` (ventes depuis le comptage), `stockReconciliationService.reset` (recalcul du stock de l'espace, commentaire throttle l.4-6; corps non lu), `markInventoryCountsPushed` (SQL brut).
- Hors trigger `count` (`snapshot: false` seulement dans `flushLogisticMarker` l.557), chaque régénération (portes ouvertes, `pdv-complete`, `manual`, `post-doors-open-edit`) ajoute un `inventorySnapshot.create` avec le blob complet (l.299-305). `regenerateOnPdvComplete` (l.328-348) n'envoie pas `snapshot:false`, donc chaque PdV terminé ajoute une ligne snapshot. Table append-only, aucune purge vue dans les fichiers lus (non vérifié ailleurs). Ces lignes grossissent la table lue sans `select` par `GET /inventory/:s/:e`.
- Sur un envoi post-event (l.560-568): `pushPendingCountToLogistic` (même chaîne: `event.findFirst`, `loadLogisticPushState`, `getBySpaceAndEvent`, `pushCountToLogistic`) puis `postEventDraft.rebuild` (non lu).
- Lectures répétées du même jeu `InventoryCount` d'un match dans UN envoi: au moins 3 lectures complètes (une `getBySpaceAndEvent` dans `regenerateNow`, une autre dans `createPreEventReconciliation:290`, plus `loadLogisticPushState`), et 2 lectures du blob snapshot.

### 4.3 Throttle (`logistic-flush-throttle.ts`)

- `delayMs = 2_000`, `minIntervalMs = 10_000` (l.18-19), par clé (phase, espace, event). `Map` de timers en mémoire (l.13-14). Un clic pendant l'attente ne relance rien (l.24). Commentaire l.9-10: "Mémoire du processus seulement : le cron à la minute reste le filet".
- Garde-fou inter-instances: `flushLogisticMarker` retire le marqueur par `deleteMany({ id })` et ne continue que si `count > 0` (l.552-553), donc deux instances ne l'envoient pas deux fois; en revanche le throttle de 10 s n'est pas partagé: avec N instances API, un match peut déclencher jusqu'à N envois par fenêtre de 10 s (déduction, non mesuré). Les écritures `markLogisticDirty` à chaque clic restent synchrones dans la requête.
- File `regenerateQueues` (l.213-244): `Map` en mémoire par `tenant:space:event`; sérialise dans une instance seulement.

## 5. Module guest-pin-access (invité PIN)

Fichiers lus: `backend/src/features/guest-pin-access/services/guest-pin-counting.service.ts` (l.38-343), `services/guest-pin-session.service.ts` (l.255-281), `backend/src/core/auth/strategies/jwt-guest-pin.strategy.ts` (l.59-98), routes via grep de `guest-pin-auth.controller.ts` (l.128-172).

| Endpoint | Service | Prisma / appels | Cache | Remarque |
|---|---|---|---|---|
| Garde de TOUTE route `/guest-pin/*` protégée | `JwtGuestPinStrategy.validate` (l.59-98) | `guestPinAccess.findUnique({ where:{id}, include:{ window:true } })`, soit 2 requêtes par clé primaire, relues à chaque requête (voulu: clôture immédiate, commentaire l.69-71) | aucun | s'ajoute à chaque appel ci-dessous |
| `GET /guest-pin/session` (controller l.128) | `getSession` (session.service l.265-281) | `space.findUnique` + `spaceElement.findUnique` (select name) en parallèle | aucun, alors que Redis est injecté dans ce service (`redis.incr` l.256, limitation de tentatives de login) | 4 requêtes DB par poll (30 s côté front, voir 07) pour des noms qui ne changent pas; `submittedAt/validatedAt` viennent déjà de `validate` |
| `GET /guest-pin/inventory` (l.144) | `getInventory` (counting.service l.41-51) | `getBySpaceAndEvent` = comptages de TOUS les PdV du match + blob du snapshot (voir 2.2), pour ne renvoyer que `blob[elementId]` (l.49-50) | aucun | filtre `shopId` absent du SQL |
| `GET /guest-pin/catalog` (l.136) | `getCatalog` (l.129-183) | séquentiel: `event.findUnique` (l.131), `spaceElement.findUnique` (l.135), `getEnabledMenuItemIds` (l.74-102: `spaceElement.findFirst` à select imbriqué floor/forecourt/externalMerch/config + `configurationElements` + `menuAssignments` actives avec `menuItem` et `config`, + `config.findUnique` l.112 si besoin), PUIS `Promise.all` de 4 (l.148-155): `getRecipes(enabledIds)`, `getRecipes([])` (catalogue ENTIER du tenant, commentaire l.145-147), `marketPriceQueryService.findAll(tenantId, 1, 5000)`, `menuComponents.findAll(tenantId, 1, 5000)`; PUIS `elementInventory.findMany` (l.160) | AUCUN | 3 allers-retours séquentiels avant le lot parallèle, 1 après. `allMenuItemsData`, `marketPrices`, `components` sont identiques pour tous les PdV d'un tenant. `availableMenuItems` est un sous-ensemble de `allMenuItemsData`, obtenu par un 2e appel `getRecipes` (formats supposés identiques, non vérifié). Plafond 5000 lignes par catalogue, payload non mesuré. Variante stockage `getStorageCatalog` (l.196-260): `getConfigShopMenuItemsLight` + mêmes catalogues + `storageTypes.findAll(…,500)` |
| `POST /guest-pin/inventory/counts` (l.152) | `saveCount` (l.267-305) | `preEventFlow.saveCount` (même coût que 4.1) + `guestPinAccess.update` si `user.submittedAt` (l.298-302) | aucun | une requête par frappe (voir 07); la phase vient du JWT |
| `POST /guest-pin/element-complete` (l.161) | `notifyElementComplete` (l.313-323) | `regenerateOnPdvComplete` -> `regenerate`: la promesse est RENDUE (flow.service l.339-347), donc la requête HTTP attend toute la régénération (4.2) et le recalage Logistic | aucun | pas de `snapshot:false`: un snapshot de plus par appel |
| `POST /guest-pin/submit` (l.170) | `submitCount` (l.332-342) | 1 `update` | | bas |

## 6. StockReconciliationService.reset, crons, Redis

- `reset` (`backend/src/features/logistics/services/stock-reconciliation.service.ts:39-...`, lu en partie l.39-80 et 205-215): `stockLevelService.getStock(spaceId, tenantId)` (l.54, stock complet de l'espace + consommation dérivée, corps non lu), `getSpaceElementIds` (l.60), boucle de report sur TOUS les niveaux non couverts par les lignes envoyées (l.77-), puis `$transaction` avec `stockMovement.createMany` (l.157), `stockLevel.findMany` (l.210) et `createMany` (l.236). Le coût suit la taille de l'espace, pas le nombre de lignes poussées. Le reste du fichier (l.80-205, 215-286) n'est pas lu. Aux l.286 et 333 deux `stockReconciliation.findMany` d'une autre fonction (non lue) relisent des `lines` JSON.
- Crons (corps NON lus, seulement les décorateurs): `inventory/jobs/inventory-logistic-sync.cron.ts:23` toutes les minutes, `inventory/jobs/inventory-live-init.cron.ts:47` toutes les minutes, `guest-pin-access/jobs/inventory-window-lifecycle.cron.ts:39` toutes les minutes, `guest-pin-access/jobs/inventory-cycle.cron.ts:70` toutes les minutes et `:84` toutes les 10 minutes. Le cron de synchro Logistic appelle vraisemblablement `flushLogisticDirty()` sans clé (nom du fichier et commentaire du throttle, déduction non vérifiée), donc le `startsWith` de 4.2.
- Redis: la recherche `cache|redis` dans `guest-pin-access/services`, `inventory/services` et `inventory/*.ts` ne trouve que `guest-pin-session.service.ts` (limitation de login) et le helper de test. Aucun cache Redis sur les endpoints inventaire ni sur le catalogue invité (recherche par grep, non exhaustive sur `core/`).
- Index: la migration `prisma/migrations/20261009150000_fk_indexes_and_drop_redundant/migration.sql` crée `InventoryCount_tenantId_spaceId_updatedAt_idx` en CONCURRENTLY (l.19) et supprime `InventoryCount_tenantId_idx` (l.48). Aucun `CREATE INDEX` sur `StockReconciliation` ni `KvStore` n'a été trouvé dans les 3 fichiers de migration/sql greppés (recherche limitée à ces 3 fichiers, non exhaustive).

## 7. Problèmes de performance (backend)

1. `GET /inventory/:s/reconciliations` sans `select` ni `take` (`inventory-reconciliation.service.ts:174-181`); `lines` JSON de tous les matchs, rappelé par le tick staff de 20 s et après chaque régénération (voir 07). Les resets logistiques `kind null` partagent la table et sont filtrés sur le tas (index `(tenantId,spaceId,createdAt)` seul, schema.prisma:3586). Impact: moyen, croissant.
2. `getBySpaceAndEvent` lit le blob du snapshot et toutes les colonnes de `InventoryCount` à chaque appel (`inventory-count.service.ts:40-46`). Appelé par: le GET staff (tick 20 s), le GET invité (`getInventory`), 2 fois par régénération pre-event (`flow.service:263`, `reconciliation.service:290`), par le push (`push.service:285`), par `createPostEventReconciliation` (l.138) et par `freezePostEventSnapshot` (l.238). Impact: haut sur l'ensemble de la chaîne.
3. `InventorySnapshot` est append-only et reçoit un blob complet à chaque régénération non `count` (`flow.service:299-305`, y compris `pdv-complete`), sans purge vue. La lecture par `findFirst … orderBy createdAt desc` sans `select` grossit avec ces lignes (index `(spaceId,eventId)`, tri en mémoire). Impact: moyen, croissant (non mesuré).
4. Chaîne d'envoi: au moins 3 lectures complètes des comptages d'un match et 2 du blob par envoi (4.2), plus `computeLogisticExpected` et `reset` qui travaillent à l'échelle de l'espace. Impact: haut pendant les fenêtres de comptage.
5. `element-complete` (invité) et `POST /pre-event-reconciliations/regenerate` (staff) attendent la régénération complète + le recalage Logistic dans la requête HTTP (`flow.service:339-347`, controller l.269). Impact: haut sur la latence perçue, risque de timeout sur un gros espace (non mesuré).
6. POST de comptage: `findEvent` avec `sessions` JSON à chaque frappe pre-event (`flow.service:182`), `findFirst`+`update` (`count.service:205-217`), 1 à 2 `upsert` KvStore sur une ligne chaude à chaque "compté" (`flow.service:171-174, 196-198`), le tout attendu avant la réponse. Impact: haut (multiplié par l'absence de debounce front).
7. Throttle d'envoi et file de régénération en mémoire (`logistic-flush-throttle.ts:13-14`, `flow.service:213-244`), non partagés entre instances. Impact: moyen (multi-instances, non vérifié).
8. `flushLogisticDirty` sans clé: `kvStore.findMany({ key startsWith })` sans `tenantId` ni `select` (`flow.service:530-534`), non servi par l'unique `(tenantId,key)`. Impact: moyen, dépend de la taille de `KvStore` (non mesurée), exécuté à la minute si le cron l'appelle ainsi (non vérifié).
9. Catalogue invité sans cache: 3 allers-retours séquentiels, `getRecipes` appelé 2 fois, 2 catalogues tenant de 5000 lignes max, recalculés pour chaque responsable PdV (`counting.service:129-183`). Impact: haut au premier affichage invité (mobile, réseau limité).
10. Poll de session invité: 4 requêtes DB par appel dont 2 pour des libellés statiques (`session.service:266-269`, `strategy:64-67`). Impact: bas à moyen selon le nombre de PdV simultanés.
11. `getInventory` invité lit les comptages de tous les PdV pour n'en garder qu'un (`counting.service:43-50`). Impact: moyen.

## 8. Recommandations (backend et SQL)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| `getBySpaceAndEvent`: `select` explicite des 7 champs utilisés sur `inventoryCount`; lire le snapshot avec `select:{ id, createdAt, updatedAt, createdBy, kind }` et ne charger `inventoryCounts` que dans la branche de repli | moins de lignes/octets lus sur toute la chaîne (problème 2) | faible; tests `inventory.service.spec.ts`; `freezePostEventSnapshot` n'utilise que `inventoryCounts` du résultat | S | `inventory/services/inventory-count.service.ts:39-96` |
| `getBySpaceAndEvent(…, { shopId })` optionnel qui ajoute `shopId` au `where` pour l'invité | invité: un PdV au lieu de tout le match | faible | S | `inventory-count.service.ts`, `guest-pin-counting.service.ts:43` |
| `listInventoryReconciliations`: `select` sans `lines` (ajouter `lineCount` dans `meta` ou `GET …/reconciliations/:id` pour le détail) ou, a minima, `take: 30` | payload stable dans la saison | contrat front (liste et vue détail) à adapter; `redactPreEventDoc` à appliquer au détail | M | `inventory-reconciliation.service.ts:172-184`, front `SpaceInventoryView.vue:3187` |
| Debounce SERVEUR du marqueur Logistic: `Map` mémoire (TTL 10 s par clé) pour sauter `markLogisticDirty`/`markDirty` si posé depuis moins de 10 s, ou fire-and-forget avec capture d'erreur | -1 à -2 requêtes par clic "compté", sans attendre la réponse | un crash entre deux clics peut perdre un marqueur (le cron reste le filet seulement si un marqueur existe déjà); garder le `await` du premier marqueur | S | `pre-event-inventory-flow.service.ts:171-174, 465-473, 508-521` |
| Cache court de `findEvent` (Map TTL 30 à 60 s par event) pour le POST pre-event | -1 requête par frappe pre-event | heure des portes modifiée: verrou obsolète au plus un TTL; invalider à la mise à jour de l'event | S | `pre-event-inventory-flow.service.ts:178-188, 581-598` |
| Upsert en 1 requête (`INSERT … ON CONFLICT` sur l'unique NULLS NOT DISTINCT, ou `updateMany` puis `create`) | 2 allers-retours -> 1 par frappe | SQL brut: gérer `updatedAt` à la main, car `logisticPushedAt` compare à `updatedAt` | M | `inventory-count.service.ts:192-230` |
| Passer `merged` et `pushState` déjà lus de `regenerateNow` à `createPreEventReconciliation` (paramètres optionnels), et ne relire le blob qu'une fois; `snapshot:false` pour `pdv-complete` si le métier le confirme (le commentaire l.226 dit "snapshot figé à l'arrêt, D15") | -2 lectures complètes et -1 insert de blob par envoi | le snapshot pre-event sert BUG-237 (`getPreEventInventory`): confirmer avec le métier avant de le retirer | M | `pre-event-inventory-flow.service.ts:263-305`, `inventory-reconciliation.service.ts:289-290` |
| `element-complete` et `POST …/regenerate`: répondre après `markLogisticDirty` + `schedule` (202), laisser le flush faire la régénération | latence invité/staff passe de la chaîne complète à 1 à 2 requêtes | le front lit `lineCount`/`document` dans la réponse (07: refetch `reconciliations`); à adapter | M | `flow.service:328-348`, `guest-pin-counting.service.ts:313-323`, controller l.251-277 |
| Throttle partagé: `SET key NX PX 10000` Redis au lieu de la `Map` (Redis déjà injecté côté guest-pin) ; ou worker dédié | un seul envoi par match et par fenêtre, quel que soit le nombre d'instances | dépendance Redis dans le chemin d'écriture: prévoir un repli mémoire | M | `logistic-flush-throttle.ts`, `flow.service:213-244` |
| `flushLogisticDirty` du cron: itérer par tenant (`tenantId` dans le `where`) et `select` minimal; sinon index `CREATE INDEX CONCURRENTLY "KvStore_key_prefix_idx" ON "KvStore" ("key" text_pattern_ops)` | évite le parcours de `KvStore` à la minute | faible; EXPLAIN d'abord (règle du projet) | S | `flow.service:529-541`, `inventory/jobs/inventory-logistic-sync.cron.ts` |
| Catalogue invité: cache Redis par tenant (clé `guest-catalog:{tenantId}`, TTL 60 à 120 s) pour `allMenuItemsData`, `marketPrices`, `components`; `availableMenuItems` par filtre mémoire sur `allMenuItemsData` au lieu du 2e `getRecipes`; paralléliser `event`, `spaceElement`, `getEnabledMenuItemIds`; `Cache-Control: private` + ETag | premier affichage invité 1 à 2 allers-retours au lieu de 5, catalogue calculé une fois par tenant | prix ou menu modifié pendant la fenêtre: périmé au plus un TTL; vérifier que `getRecipes(ids)` et `getRecipes([])` produisent le même format | M | `guest-pin-counting.service.ts:129-260` |
| Session invité: noms `space`/`element` en cache mémoire (TTL 5 min) ou dans le JWT; `validate` avec `select` précis au lieu de `include: { window: true }`. NE PAS cacher `validate` (révocation immédiate voulue) | poll 30 s: 4 requêtes -> 2 | faible | S | `guest-pin-session.service.ts:265-281`, `jwt-guest-pin.strategy.ts:64-67` |
| SQL: EXPLAIN (ANALYZE, BUFFERS) de `stockReconciliation` (`tenantId,spaceId,kind in …`), `inventorySnapshot` (`spaceId,eventId order by createdAt`), `kvStore startsWith`. Candidats seulement si le plan le justifie: `StockReconciliation ("tenantId","spaceId","kind","createdAt" DESC)`, `InventorySnapshot ("spaceId","eventId","createdAt" DESC)`, purge des vieux snapshots `kind` pre/post d'un match une fois la feuille finale figée | confirme ou écarte les index; supprime le tri mémoire | création d'index CONCURRENTLY, nul si EXPLAIN négatif | S | `backend/prisma/schema.prisma:3290-3306, 3567-3587`, `prisma/sql/` |
| `reset`: mesurer avant de toucher (`getStock` sur un gros espace, boucle de report sur tous les niveaux) | borne le coût de chaque envoi | élevé: logique de stock sensible, tests Logistic | L | `logistics/services/stock-reconciliation.service.ts:39-260` |

## 9. Points non vérifiés

- Non lus: `inventory-baseline.service.ts` (427 l., SQL de `computeLogisticExpected`, `getPreEventBaseline`, `getPostEventBaseline`, `getEventSalesConsumption`), `post-event-draft.service.ts` (293 l., `saveContext`, `rebuild`), `post-event-draft-state.ts` (`loadPostEventDraftStates`), `inventory-unit-resolver.service.ts`, `inventory-sale-prices.service.ts`, `inventory-logistic-push.service.ts` l.1-100 (début de `pushCountToLogistic`), `sales-since-count.ts`, `StockLevelService.getStock` et `deriveEventConsumption`, `MenuItemRecipeService.getRecipes`, `MarketPriceQueryService.findAll`, `MenuComponentsService.findAll`, les 5 crons (corps), `JwtDatabaseGuard`, `SpaceAccessService.assertSpaceInTenant` (une requête par appel, coût non lu), `guest-pin-window.service.ts` et `guest-pin-phase.service.ts`.
- Le détail de `reset` au-delà des l.39-80 et 205-215, et les fonctions des l.286-366 du même fichier.
- Index: seules 3 sources SQL ont été greppées pour `CREATE INDEX`; la présence d'autres index posés par des migrations non lues n'est pas exclue. Aucun EXPLAIN exécuté (interdit).
- À mesurer: taille réelle de `GET /reconciliations` et de `GET /guest-pin/catalog` (Network), nombre de lignes de `InventorySnapshot` par match en fin de saison, taille de `KvStore`, durée d'une régénération pre-event complète (logs `Feuille pre-event régénérée`), nombre d'instances API en production (pour le throttle).
