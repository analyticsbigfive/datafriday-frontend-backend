# 08b. Page Logistique, backend (backend/src/features/logistics)

Statut: FINALISÉ (arrêt anticipé sur consigne du coordinateur, voir section 7 pour ce qui n'est pas lu). Complète 08_logistique.md (front). Lecture seule, aucune mesure: les durées citées viennent des commentaires du code.

## Réponse courte à la question prioritaire

La consommation NE DÉPEND PAS de configId. `StockLevelService.getLevelsAndConsumption(spaceId, tenantId)` ne reçoit ni configId ni eventId (backend/src/features/logistics/services/stock-level.service.ts:37), et `getStock` l'appelle une seule fois par requête (l.214) avant de résoudre la config (l.222-229). Le front qui appelle /stock une fois par config en parallèle fait donc recalculer N fois à l'identique : lectures StockLevel de tout l'espace, ancre, ids d'éléments de tout l'espace, requête de ventes depuis l'ancre, explosion de recettes. Seul `getSpaceElementsWithItems` (référentiel, l.234) dépend de configId. Aucun cache Redis dans stock-level.service.ts (aucun import de cache, l.1-12).

## 1. Fiche de la page (périmètre backend)

Contrôleur: backend/src/features/logistics/logistics.controller.ts (485 l.), `@Controller('logistics')`, guard `JwtDatabaseGuard`, permission de classe `front.fb.logistic` (l.38-40). `GET :spaceId/stock` accepte aussi `front.fb.restock` et `front.fb.restockBoard` (l.62).

## 2. Arbre des composants (services backend)

| Service | Fichier | Lignes | Rôle | Appelé par |
|---|---|---|---|---|
| LogisticsController | logistics/logistics.controller.ts | 485 | routes HTTP, aucun cache, aucune logique | front |
| StockLevelService | logistics/services/stock-level.service.ts | 525 | `getStock` (l.200), `getLevelsAndConsumption` (l.37, privé), `getExpectedStockIndex` (l.139), `getLiveInventory` (l.302), `deriveEventConsumption` (l.379) | contrôleur l.77; reset (stock-reconciliation.service.ts:52); POS (pos-stock-snapshot.service.ts:56); Analyse (stock-valuation.service.ts:71); Live (space-shops.service.ts:267); inventaire (inventory-baseline.service.ts) |
| RecipeExplosionService | logistics/services/recipe-explosion.service.ts | 607 | chargement des recettes (`recipeSelect` l.38, `loadRecipeContext` l.228), ventes brutes (`deriveSalesRaw` l.426), explosion en consommation (`explodeSalesToConsumption` l.458) | StockLevelService, StockReferentialService |
| StockReferentialService | logistics/services/stock-referential.service.ts | 374 | `getSpaceElementsWithItems` (l.22), `getElementItems` (l.260, appelle l'agrégé toutes configs), `getMarketPricesForItem` (l.325) | StockLevelService, VentilationDepositsService |
| LogisticsElementScopeService | logistics/services/logistics-element-scope.service.ts | 135 | `getSpaceElementIds` (l.56), scope SQL des éléments | tous |
| VentilationEventsService / DepositsService / ChecksService | logistics/ventilation-*.service.ts | 101 / 199 / 101 | matchs ouverts, dépôts, validations | contrôleur l.80-162 |
| `salesByElementSince` | logistics/logistics.queries.ts | 121 | SQL brut des ventes depuis l'ancre (l.6-29) | RecipeExplosionService.deriveSalesRaw (l.429) |

Cache: aucun import de cache dans ces fichiers. Les seules occurrences de "cache" dans features/logistics sont des Map par requête (`itemRefsCache`, `componentRefsCache`, `perUnitCache`, recipe-explosion.service.ts:230, 525-543) et des mentions dans logistics.types.ts et logistics.service.spec.ts (non lus). Aucune clé Redis, aucun TTL.

## 3. Appels API, endpoint par endpoint

### 3.1 GET /logistics/:spaceId/stock?configId=&eventId= (le chemin critique)

Contrôleur: logistics.controller.ts:54-78. Permissions OU: `front.fb.logistic`, `front.fb.restock`, `front.fb.restockBoard` (l.62). Service: `StockLevelService.getStock` (stock-level.service.ts:200-290).

Séquence exacte des requêtes (une requête HTTP, aucune mise en cache):

| Étape | Code | Requête / table | Parallèle ? |
|---|---|---|---|
| S1 | l.201 | `space.findFirst` (id, tenantId) | séquentiel, bloque tout |
| S2a | l.206 | `config.findMany` where spaceId | parallèle (Promise.all l.204) |
| S2b | l.207 | `event.findFirst` si eventId | parallèle |
| S2c | l.178-198, 213 | `findNextEventBeforeDoorsOpen`: `space.findFirst` (timezone, 2e fois) + `event.findMany` take 10 depuis J-2 | parallèle |
| S2d | l.214, 37-85 | `getLevelsAndConsumption(spaceId, tenantId)`: voir ci-dessous. SANS configId | parallèle (c'est la branche la plus longue) |
| S3 | l.234, stock-referential.service.ts:22-257 | `getSpaceElementsWithItems`: voir ci-dessous. DÉPEND de configId | séquentiel, démarre APRÈS S2 car il a besoin de `levels` (stockElementIds, l.231-233) |
| S4 | l.252 | `marketPrice.findMany` par ids orphelins, seulement s'il y a des orphelins | séquentiel |

`getLevelsAndConsumption` (stock-level.service.ts:37-85):
- Round 1, 4 requêtes parallèles (l.38-55): `stockLevel.findMany({tenantId, spaceId})` SANS select ni limite, donc toutes les lignes de niveau de l'espace avec toutes leurs colonnes (l.39); `stockReconciliation.findFirst` kind null, tri createdAt desc (l.40-48); `stockMovement.findFirst` tri createdAt asc, c'est-à-dire le plus ancien mouvement de l'espace, utilisé comme ancre de repli (l.49-53); `getSpaceElementIds` (logistics-element-scope.service.ts:56-69), `spaceElement.findMany` avec un OR de 4 relations imbriquées (floor.config.space, forecourt.config.space, externalMerch.config.space, zone.space).
- Round 2 (l.62-67): si ancre ET éléments: `deriveSalesRaw` puis `explodeSalesToConsumption`, séquentiels.
- Round 3 (l.82): `canonicalizeLevelItemKeys`, jusqu'à 5 `findMany` parallèles par id (marketPrice, ingredient, packaging, menuComponent, menuItem), seulement pour les niveaux qui ont (itemKind, itemRefId) (l.87-130).

Requête de ventes (logistics.queries.ts:6-29): `WeezeventTransactionItem ti` JOIN `WeezeventTransaction t` (ti.transactionId) JOIN `WeezeventLocation wl` (t.locationId) JOIN `WeezeventLocationShopMapping m` (tenantId + `m.weezeventLocationId = wl.id OR m.weezeventLocationId = wl.weezeventId`) JOIN `WeezeventProductMapping pm` (tenantId + `pm.weezeventProductId = ti.productId`), 5 tables. Filtre: `t.tenantId`, `t.status='V'`, `t.deletedAt IS NULL`, `m.spaceElementId IN (...)`, et `t.transactionDate > anchorAt` (recipe-explosion.service.ts:428). `GROUP BY 1,2,3` (élément, menu item, event) avec SUM(quantity), MAX(eventName), MAX(transactionDate). Aucun filtre sur la configuration ni sur l'espace autre que via `m.spaceElementId IN`. Aucun filtre `integrationId` (contrairement à `eventSalesByElement`, logistics.queries.ts:59-63 qui borne la fenêtre ET l'intégration).

Explosion (recipe-explosion.service.ts:458-606): `menuItem.findMany` des menu items vendus avec recettes (l.495), puis `expandCombosByName` (jusqu'à 4 `menuItem.findMany` séquentiels, l.124-145, l.500), puis `expandComponentsById` (jusqu'à 4 `menuComponent.findMany` séquentiels, l.185-220, l.502). Calcul en mémoire ensuite (Map).

`getSpaceElementsWithItems` (stock-referential.service.ts:22-257):
1. `spaceElement.findMany` avec OR de 4 relations + sous-sélections `floor/forecourt/externalMerch` et `menuAssignments` (toutes configs, toutes lignes) et `configurationElements` (l.30-43).
2. `menuItem.findMany` des menu items activés avec `recipeSelect()` (ingrédients + market price de chaque ingrédient + composants avec leurs ingrédients et enfants + packagings + comboChildren, l.38-77, l.89-92). Inclut `picture: true` (recipe-explosion.service.ts:42).
3. `loadRecipeContext` (l.97 → recipe-explosion.service.ts:228-270): `expandCombosByName` (≤4 requêtes séquentielles), `expandComboChildrenById` (≤4), `resolveMarketPricesByName` (1), `expandComponentsById` (≤4), tous séquentiels (l.233, 234, 263, 267).
4. `elementInventory.findMany` des PDV et stockages (l.106-109), puis si au moins une ligne: `marketPrice.findMany` de TOUT le catalogue actif du tenant, sans filtre d'id, 8 colonnes, tri createdAt, id (l.118-122), puis éventuellement un 2e findMany des ids manquants (l.132).
5. `getProviderByShopElementId` (l.166, logistics-element-scope.service.ts:111-134): `locationShopMapping.findMany` puis `salesLocation.findMany`, 2 requêtes séquentielles.
6. Assemblage en mémoire, tri `localeCompare('fr')` des items par élément (l.197, 250, stock-level.service.ts:275-277).

Dépendance à configId (réponse détaillée): `configId` n'entre que dans l'étape 3 (`aggregateAllConfigs ? undefined : resolvedConfigId`, stock-level.service.ts:234-239), où il choisit quelles `menuAssignments` sont retenues par PDV (stock-referential.service.ts:56-81) et quelles lignes d'ElementInventory sont retenues (l.144-147, 237-240). Les lectures SQL, elles, sont presque identiques d'une config à l'autre (même `spaceElement.findMany`, mêmes `elementInventory`, même catalogue MarketPrice; seul le jeu d'ids de menu items change donc la requête `menuItem.findMany` et la profondeur des expansions). La consommation n'en dépend pas du tout.

Payload (estimation par lecture du code, non mesurée): objet `{spaceId, space, configurations, resolvedConfigId, nextEventId, anchor, elements, levels, consumption}` (stock-level.service.ts:279-289). `elements`: pour chaque PDV et chaque stockage, la liste complète de ses articles avec `usedIn` (liste des menu items qui l'utilisent) et `picture` (champ menu item, nature de la valeur non vérifiée: URL ou data-URI). Les stockages fusionnent les articles de tous leurs PDV liés (l.214-231), donc un article apparaît une fois par élément. `levels`: toutes les lignes StockLevel de l'espace, objets Prisma complets. `consumption`: une ligne par (élément, article) vendu depuis l'ancre. Le front ne garde de ce payload, côté Réarmement, que `elements[].items[].name/unit/unitsPerPack`, `levels` et `consumption` (useLogisticRemaining.js:51-75).

### 3.2 GET /logistics/:spaceId/ventilation-events

logistics.controller.ts:80-89 → `VentilationEventsService.listOpenEvents` (ventilation-events.service.ts:53-81): `space.findFirst` (timezone) puis `event.findMany` where spaceId, tenantId, isSimulated false, eventDate >= now moins `EVENT_OVER_LOOKBACK_MS`, tri eventDate asc, `take: 120` (MAX_EVENTS*2, l.67), `select` de 10 colonnes dont `sessions` (JSON). Filtre `isEventOver` en mémoire, plafond 60. 2 requêtes séquentielles, pas de cache. Payload: au plus 60 objets de 7 champs. Coût: faible (index Event non vérifié, voir 7).

### 3.3 GET ventilation-storages / ventilation-deposits / ventilation-movements / ventilation-checks

| Route | Service | Requêtes | Observations |
|---|---|---|---|
| GET ventilation-storages?eventIds= (controller l.91-107) | `orderedEvents` (ventilation-events.service.ts:88-100) puis `storagesOfConfigs` (ventilation-deposits.service.ts:170-198) | `space.findFirst`, `event.findMany` in ids, puis `spaceElement.findMany` avec 2 OR imbriqués (4 relations x 4 relations) | 3 requêtes séquentielles; `orderedEvents` refait un `space.findFirst` pour la timezone |
| GET ventilation-deposits (l.109-125) | `sumByEvents` (ventilation-deposits.service.ts:40-54) | `stockMovement.groupBy(elementId, itemKey)` where tenantId, spaceId, eventId in, reason=VENTILATION, SUM(packedDelta, looseDelta) | 1 requête; cumule aussi les annulations (deltas négatifs) |
| GET ventilation-movements (l.127-139) | `listByEvents` (l.61-100) | `stockMovement.findMany` take 500, tri createdAt desc, puis en parallèle `stockMovement.findMany` des annulations (`reversesMovementId in ids`, sans filtre spaceId) et `spaceElement.findMany` | 2 rounds; jusqu'à 500 lignes |
| GET ventilation-checks (l.141-151) | `VentilationChecksService.list` | non lu | voir 7 |

Ces trois lectures (deposits, movements, checks) sont rappelées toutes les 10 s par onglet Ventilation ouvert (08_logistique.md 3.2). Les deux `stockMovement` s'appuient sur `@@index([tenantId, spaceId, eventId])` (schema.prisma, modèle StockMovement; migration 20260706120000 l.63); `reason` et `reversesMovementId: null` sont filtrés hors index (voir 5, point 14).

### 3.4 Écritures staff: mouvement de dépôt, annulation, coche

| Route | Service | Ce qui est lu | Ce qui n'est PAS lu |
|---|---|---|---|
| POST /logistics/movements (controller l.195-207) | `StockMovementService.createMovement` | dto transmis tel quel | corps du service (stock-movement.service.ts, 494 l.) non lu: coût d'un mouvement, transaction, verrous, mise à jour de StockLevel non vérifiés |
| POST /logistics/movements/:id/cancel-ventilation (l.164-171) | `VentilationDepositsService.cancel` (ventilation-deposits.service.ts:107-121) | 1 `stockMovement.findFirst` (id, tenantId) puis `writeReversal` | `writeReversal` non lu. Index unique sur `reversesMovementId` (migration 20261009120000, schema StockMovement) |
| PUT /logistics/:spaceId/ventilation-checks (l.153-162) | `VentilationChecksService.upsert` (ventilation-checks.service.ts:49-90) | 1 transaction: `upsert` sur la clé unique (tenantId, spaceId, eventKey, itemKey, elementId) + `updateMany` si une coche de ligne passe à false (l.81-86) | rien d'autre; 1 à 2 requêtes, indexé (schema VentilationDepositCheck: `@@unique` + `@@index([spaceId, eventKey])`) |
| GET ventilation-checks | `list` (l.38-43) | 1 `findMany` where tenantId, spaceId, eventKey, sans limite | indexé par le préfixe de l'unique |

Le front écrit un mouvement par ligne cochée et par match, séquentiellement (08_logistique.md 3.3): le coût serveur d'une coche de carte de N lignes = N appels `createMovement`, non mesuré.

### 3.5 Phase ventilation du guest-pin (accès logisticien par PIN)

Contrôleur: guest-pin-access/guest-pin-auth.controller.ts:78-125 (routes `ventilation`, `ventilation/checks`, `ventilation/deposits`, `ventilation/deposits/:movementId/cancel`). Service: guest-pin-access/ventilation-access.service.ts (534 l., lu en entier). Le guard JWT invité (core/auth/strategies/jwt-guest-pin.strategy.ts) n'est pas lu.

| Route | Requêtes (ventilation-access.service.ts) | Remarques |
|---|---|---|
| GET /guest-pin/ventilation (`getSheet`, l.234-269) | `sessionContext` (l.330-351): `inventoryWindow.findFirst`, puis `orderedEvents` (`space.findFirst` + `event.findMany`), puis `restockPlan.findMany` where `selectedEventIds hasSome`, tri updatedAt desc, SANS `take`, select des colonnes JSON `restockLines`, `lineOverrides`, `restockedRows`. Puis `Promise.all` (l.238-242): `sumByEvents` (groupBy), `listByEvents` (500 + 2 requêtes), `storagesOf` (`spaceElement.findMany` à OR imbriqués). Puis, SÉQUENTIEL (l.255), `packSizes` (ventilation-deposits.service.ts:143-163): `stockLevel.findMany` de tous les niveaux des éléments ET `getElementItems` (stock-referential.service.ts:260-266) qui appelle `getSpaceElementsWithItems(..., {aggregateAllConfigs: true})`, donc tout le référentiel de recettes de l'espace, toutes configs (voir 3.1, étape S3) | Le front invité rappelle cette route toutes les 30 s par appareil (08_logistique.md 3.5). Chaque tick refait donc le chargement complet du référentiel de stock, sans la consommation. 4 rounds séquentiels de base + ceux du référentiel |
| GET /guest-pin/ventilation/checks (`listChecks`, l.303-307) | `sessionContext` complet (mêmes 4 requêtes, avec les JSON `restockLines`) puis `checks.list` | `sessionContext` ne sert ici qu'à obtenir `order` (liste d'ids de matchs) mais charge aussi les feuilles de réarmement, jetées ensuite. Appelé toutes les 30 s par appareil |
| PUT checks (`saveCheck`, l.309-313) | `sessionContext` complet + transaction d'upsert | même gaspillage |
| POST deposits (`deposit`, l.277-300) | `sessionContext` complet; `lineTarget` en mémoire, ou `storageTarget` (`storagesOf` + mémoire); `resolveElementItemKey` (ventilation-deposits.service.ts:128-136): `stockLevel.findMany` de tous les niveaux de l'élément, puis SI aucun niveau ne porte le nom, `getElementItems` (référentiel complet toutes configs); puis `createMovement` (non lu) | Un dépôt sur un article jamais approvisionné déclenche le chargement du référentiel entier. Le front envoie un POST par part, séquentiel |
| POST cancel (l.316-321) | `stockMovement.findFirst` + `writeReversal` | léger, sans `sessionContext` |
| POST login (l.189-224) | `findWindowByPin` (service non lu), `guestPinAccess.upsert`, jeton | non lu: anti brute force, hachage du PIN |

Phase ventilation côté staff, ouverture PIN: `ensure` (l.97-129) fait `space.findFirst` (l.100), `orderedEvents` (autre `space.findFirst` + `event.findMany`), `ensureSpaceSlug` (3e `space.findFirst`, l.469), `inventoryWindow.upsert`, `ensureWindowPin`, `findWindowById`. Environ 7 requêtes séquentielles, appelées au changement d'onglet ou de sélection, pas en boucle.

## 4. Cascade au premier affichage (côté serveur)

Les durées ne sont pas mesurées. Les compteurs sont des BORNES HAUTES lues dans les limites de boucle du code (`depth < 4`), pas des mesures: une boucle s'arrête dès qu'un niveau est vide.

- t0: le front lance en parallèle `/stock`, `/ventilation-events`, puis (hors chemin critique) les routes de ventilation (08_logistique.md 3.1). Chaque requête passe d'abord par `JwtDatabaseGuard` (core/auth/guards/jwt-db.guard.ts, non lu) et la vérification de permission.
- t1: `/stock`, S1 `space.findFirst` (1 aller-retour).
- t2: S2 en parallèle. Branche la plus longue = `getLevelsAndConsumption`: round 1 (4 requêtes parallèles) + 1 requête de ventes (5 tables) + explosion (1 `menuItem.findMany` + jusqu'à 4 combos + jusqu'à 4 composants) + `canonicalizeLevelItemKeys` (5 requêtes parallèles) = jusqu'à 12 allers-retours séquentiels. Les autres branches (config, event, prochain event) sont plus courtes.
- t3: S3 `getSpaceElementsWithItems`, démarre seulement quand S2 est fini: 1 `spaceElement.findMany` + 1 `menuItem.findMany` + `loadRecipeContext` (jusqu'à 4 + 4 + 1 + 4) + `elementInventory` + `marketPrice` catalogue complet + éventuellement un 2e `marketPrice` + 2 requêtes de fournisseur = jusqu'à 22 allers-retours séquentiels.
- t4: S4 orphelins (0 ou 1 requête), tri en mémoire, sérialisation JSON.
- Total borne haute pour UNE requête `/stock`: environ 36 allers-retours dont ~34 séquentiels (S1 1, S2 12, S3 22, S4 1). Le chemin critique est la SOMME des deux grosses branches (consommation puis référentiel), pas leur maximum.
- Fan-out Réarmement (front, useLogisticRemaining.js:44-50): N requêtes `/stock` identiques sauf `configId`, toutes en parallèle sur le même pool Prisma, donc N x (cette cascade), chacune recalculant la même consommation.
- Page Logistique: même cascade à chaque tick de 10 s par onglet ouvert (08_logistique.md 3.2).
- Invité: `GET /guest-pin/ventilation` toutes les 30 s par appareil = `sessionContext` (4) + 3 lectures parallèles + `packSizes` (1 + cascade du référentiel S3).

## 5. Problèmes de performance

1. Consommation recalculée à l'identique pour chaque configId. `getLevelsAndConsumption(spaceId, tenantId)` n'a pas de paramètre de config (stock-level.service.ts:37), `getStock` l'appelle avant de résoudre la config (l.214 puis l.222-229), et la consommation renvoyée est la même pour toutes les configs. Avec le fan-out du Réarmement, la requête de ventes à 5 tables et l'explosion de recettes sont exécutées N fois. Impact haut. Pages: Réarmement (Commandes), et toute page qui appelle `/stock` plusieurs fois (aussi Live, via `getLiveInventory` l.302-303, inventaire et valorisation Analyse via `getExpectedStockIndex`).
2. Aucun cache ni coalescence sur ce calcul. Aucune occurrence de cache Redis dans features/logistics (Maps par requête seulement, recipe-explosion.service.ts:230, 525-543). Impact haut, car la route est aussi appelée toutes les 10 s par onglet Logistique ouvert.
3. Chemin critique séquentiel inutile: le référentiel (S3) attend la fin de la consommation (S2d) alors qu'il n'a besoin que de `levels` pour `stockElementIds` (stock-level.service.ts:231-239, utilisé uniquement dans le filtre `configuredShops`, stock-referential.service.ts:158-160). Les niveaux sont 1 requête simple; la consommation est la partie lente. Impact moyen à haut.
4. Requête de ventes sans borne haute et sans filtre d'espace en tête de prédicat (logistics.queries.ts:6-29): `t.transactionDate > ancre`, `t.tenantId`, `status='V'`, `deletedAt IS NULL`, avec le filtre d'espace porté seulement par `m.spaceElementId IN (...)`. Le volume lu croît avec le temps écoulé depuis la dernière réconciliation (kind null). Le planner peut démarrer par les transactions du tenant (index `[tenantId, status, transactionDate]`, schema.prisma:1580) et rejeter ensuite les ventes des autres espaces: non vérifié, EXPLAIN requis. La jointure mapping utilise `OR` (id interne OU weezeventId, l.18-19), qui empêche un seul accès par index. Les index côté lignes existent: `WeezeventTransactionItem_tx_basket_cover_idx` couvre (transactionId, productId, quantity), donc lecture index-only possible; `ProductMapping` unique sur `salesProductId`; `LocationShopMapping` unique (tenantId, salesLocationId) et index (tenantId, spaceElementId). Impact: coût réel inconnu (non mesuré); les commentaires du schéma citent des requêtes voisines sur ces tables à 4 à 22 s (schema.prisma:1597-1600) et 3,1 M de lignes d'items sur un tenant réel (schema.prisma:3174), à titre d'ordre de grandeur uniquement.
5. Recettes chargées deux fois par requête: `explodeSalesToConsumption` charge les menu items vendus avec sa sélection (recipe-explosion.service.ts:477-502), puis `getSpaceElementsWithItems` recharge les menu items activés avec `recipeSelect()` plus `loadRecipeContext` (stock-referential.service.ts:89-97). Les deux font leurs propres parcours combos et composants. Impact moyen.
6. Catalogue MarketPrice complet du tenant lu à chaque appel dès qu'un PDV ou stockage a une ligne ElementInventory (stock-referential.service.ts:106-122), 8 colonnes, tri createdAt/id. Servi à résoudre les lignes stockées par nom normalisé (`mpByNormalizedName`). Impact moyen, croît avec le catalogue.
7. Boucles de chargement de recettes niveau par niveau, une requête par niveau (`expandCombosByName`, `expandComboChildrenById`, `expandComponentsById`, recipe-explosion.service.ts:124-220), exécutées 2 fois par requête (point 5). Impact moyen (latence additive, ≤ 4 niveaux chacune).
8. `stockLevel.findMany` sans `select` (stock-level.service.ts:39) et renvoyé tel quel dans le payload (`levels`, l.287), avec toutes les colonnes des objets Prisma. Impact bas à moyen, taille non mesurée.
9. Payload `elements`: les articles sont répétés par élément (chaque stockage fusionne les articles de ses PDV, stock-referential.service.ts:214-231), avec `usedIn` et `picture` par article. Le Réarmement n'utilise que `name`, `unit`, `unitsPerPack` (useLogisticRemaining.js:51-62). La nature de `picture` (URL ou data-URI) n'est pas vérifiée. Impact moyen, non mesuré.
10. Invité, `getSheet` appelle `packSizes` (ventilation-access.service.ts:255) qui charge tout le référentiel agrégé toutes configs (ventilation-deposits.service.ts:150, stock-referential.service.ts:260-262), à chaque tick de 30 s par appareil. Plusieurs logisticiens = plusieurs charges identiques. Impact haut le jour de match.
11. Invité, `sessionContext` rechargé à chaque appel (checks, saveCheck, deposit, sheet) avec les colonnes JSON des feuilles de réarmement même quand seul `order` sert (ventilation-access.service.ts:303-313, 330-351). `restockPlan.findMany` sans `take`. Impact moyen.
12. Invité, `resolveElementItemKey` par dépôt: tous les niveaux de l'élément, et repli sur le référentiel complet si le nom n'existe pas encore (ventilation-deposits.service.ts:128-136); le front envoie un dépôt par part en séquence. Impact moyen.
13. `space.findFirst` répété dans la même requête: getStock l.201 et l.181; `orderedEvents` l.91 et `listOpenEvents` l.54; `ensure` l.100 et l.469. Impact bas.
14. Staff Ventilation toutes les 10 s: `groupBy` + 500 mouvements + 2 requêtes + checks (3.3). Les index existent (`StockMovement [tenantId, spaceId, eventId]`, schema.prisma StockMovement l.37; `reversesMovementId` unique), donc coût probablement faible; `reason` est filtré hors index. Impact bas.

## 6. Recommandations

Réponse à la question de cache: la consommation dépend de (tenantId, spaceId, ancre, état des ventes, état des recettes), jamais de configId. Clé proposée: `logistics:consumption:{tenantId}:{spaceId}:{anchorKey}` avec `anchorKey = lastRecoId ?? firstMovementAt` (l.60). Contenu: `{ anchorAt, consumption }` uniquement; JAMAIS `levels` (changent à chaque mouvement). Invalidation: (a) le changement d'ancre change la clé (reset, `stock-reconciliation.service.ts:52` lit déjà getStock; le reset doit lire sans cache); (b) les nouvelles ventes: TTL court, ou delete de clé à l'ingestion; (c) les éditions de recettes: TTL court (pas de crochet sur toutes les écritures de catalogue). Le TTL est une décision de fraîcheur à faire valider (le front poll déjà à 10 s); aucune valeur n'est imposée par le code.

| # | Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|---|
| B1 | Coalescer les appels simultanés: Map de promesses en vol par `(tenantId, spaceId)` autour de `getLevelsAndConsumption` (vit le temps du calcul, 0 donnée périmée). Les N appels du fan-out partagent UN calcul de consommation | Divise par N le coût de la consommation pour le fan-out Réarmement, sans changer le front ni la fraîcheur | Faible: attention à ne pas partager le tableau `levels` muté par `canonicalizeLevelItemKeys` (l.82, `level.itemKey` est réécrit en place): cloner ou faire la canonicalisation par appel | S | stock-level.service.ts |
| B2 | Micro-cache Redis de `{anchorAt, consumption}` avec la clé ci-dessus et un TTL court (valeur à valider) | Évite aussi les ticks de 10 s répétés de plusieurs onglets/utilisateurs et les autres appelants (POS, Analyse, Live, inventaire via `getExpectedStockIndex`) | Moyen: fraîcheur de la consommation (donc de l'attendu affiché) bornée par le TTL; décision métier à valider; retirer le cache dans le chemin du reset | M | stock-level.service.ts (+ service de cache du core, non lu) |
| B3 | Paralléliser consommation et référentiel: lire `levels` d'abord (ou en parallèle des ids d'éléments), lancer `getSpaceElementsWithItems` en même temps que `deriveSalesRaw` + `explodeSalesToConsumption` | Chemin critique = max au lieu de somme des deux branches (jusqu'à environ la moitié des allers-retours séquentiels) | Faible: dépendance de données unique `stockElementIds` | S à M | stock-level.service.ts:37-85, 200-239 |
| B4 | Nouveau paramètre `configIds=a,b,c` (ou réponse multi-config) sur `/stock`: consommation et niveaux calculés une fois, référentiel par config | Un aller-retour HTTP au lieu de N, une seule consommation | Moyen: contrat d'API et front à adapter; à garder en plus de `configId` | M | logistics.controller.ts, logistics.query.dto.ts, stock-level.service.ts, useLogisticRemaining.js |
| B5 | Invité: sortir `packSizes`/storages de `getSheet` du tick de 30 s (partie statique chargée une fois ou cache court par `windowId`), garder dépôts/mouvements/checks dans le tick | Supprime le chargement du référentiel complet à chaque tick et par appareil | Moyen: contrat de la route `GET /guest-pin/ventilation` et front invité | M | ventilation-access.service.ts:234-269, ventilation-deposits.service.ts:143-163, useGuestVentilation.js |
| B6 | `sessionContext`: ne pas sélectionner `restockLines`/`lineOverrides`/`restockedRows` quand seul `order` est utile (checks), et mettre `take` sur `restockPlan.findMany` | Moins de JSON lu et transféré sur chaque tick de checks et saveCheck | Faible | S | ventilation-access.service.ts:330-351 |
| B7 | `resolveElementItemKey`: limiter la requête de niveaux à l'élément ET au nom (ou itemRefId), éviter le repli sur `getElementItems` quand il existe un cache | Dépôt invité plus court | Faible à moyen: règle de correspondance par nom normalisé (l.129-135) à préserver | S à M | ventilation-deposits.service.ts:128-136 |
| B8 | Restreindre le catalogue MarketPrice lu à ce qui est nécessaire: ids connus de `invRows` + noms normalisés recherchés, ou cacher la liste tenant avec invalidation sur écriture MarketPrice | Supprime une lecture proportionnelle au catalogue | Moyen: la correspondance accent/casse (`normalizeItemName`) n'est pas faisable en SQL simple; le cache est plus sûr | M | stock-referential.service.ts:106-136 |
| B9 | Fusionner les `space.findFirst` redondants (getStock, listOpenEvents/orderedEvents, ensure) en passant le `timezone` en paramètre | Quelques aller-retours en moins | Faible | S | stock-level.service.ts:181, 201; ventilation-events.service.ts; ventilation-access.service.ts |
| B10 | SQL (après EXPLAIN uniquement): ajouter `AND t."integrationId" IN (...)` issu de `LocationSpaceMapping`, comme `deriveEventConsumption` (stock-level.service.ts:408-428), pour que le planner utilise `[tenantId, integrationId, status, transactionDate]`; ou réécrire l'OR de jointure du mapping en `UNION`/mapping pré-résolu | Réduit le volume scanné si le planner démarre aujourd'hui par tout le tenant | Moyen à élevé: peut changer les résultats pour des espaces multi-intégrations (BUG-378-02) ou sans mapping; ne rien faire sans EXPLAIN (règle du projet pour les tables transactions) | M | logistics.queries.ts, recipe-explosion.service.ts:426-431 |
| B11 | Delta incrémental: mémoriser un agrégat jusqu'à un instant T et n'ajouter que les ventes après T (même schéma que le delta SalesPriceAgg déjà en production) | Coût borné indépendamment de l'ancienneté de l'ancre | Élevé: nouvelle structure, invalidation à la réconciliation et à la suppression de transactions | L | logistics.queries.ts, stock-level.service.ts |

Ordre conseillé: B1 (et B3) d'abord, ils règlent le fan-out sans question de fraîcheur; B5/B6 pour l'invité; B2 seulement si la mesure montre que la requête de ventes domine; B10/B11 après EXPLAIN.

## 7. Points non vérifiés

- Durée réelle de `salesByElementSince` et plan d'exécution (EXPLAIN ANALYZE, BUFFERS en `begin read only`, jamais de SET de session sur le pooleur): non fait. Le choix du point d'entrée du planner (transactions du tenant ou mapping), l'usage réel de l'index cover et de l'OR de jointure sont inconnus. Nombre de lignes depuis l'ancre sur un espace réel: inconnu.
- Taille réelle de la réponse `/stock` (elements, levels, consumption), nature de `picture` (URL ou data-URI).
- Nombre réel de configurations par espace (donc N du fan-out) et fréquence de reset (donc ancienneté de l'ancre).
- stock-movement.service.ts (createMovement, writeReversal, getHistory, confirmTransfer), stock-reconciliation.service.ts (reset), stock-loss.service.ts, sales-simulation.service.ts, stock-item-identity.service.ts (`resolveMarketPricesByName`, appelé par `loadRecipeContext`), storage-stored-items.ts, orphan-stock-levels.ts: non lus.
- Guards: `JwtDatabaseGuard` (coût d'une requête DB par appel ?), stratégie `jwt-guest-pin`, `GuestPinWindowService.findWindowByPin`, `SpaceAccessService.assertSpaceAccessible`: non lus.
- Existence d'un service de cache Redis réutilisable dans core (non cherché), et la mention de "cache" dans logistics.types.ts et logistics.service.spec.ts (non lues).
- Index des tables Event, RestockPlan, InventoryWindow, SpaceElement, MenuItem, MarketPrice, ElementInventory (schema: seulement `elementId`, `configId`, `name`, `marketPriceId` pour ElementInventory) non vérifiés dans les migrations, sauf ceux cités ci-dessus (StockLevel, StockMovement, StockReconciliation, VentilationDepositCheck, Weezevent*).
- Comportement sous charge du pool Prisma/pg avec N requêtes `/stock` parallèles (la mémoire projet signale un incident de saturation du pooleur le 09/10, non revérifié dans le code).
