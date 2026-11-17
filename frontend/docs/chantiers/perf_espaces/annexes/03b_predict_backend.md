# 03b. Backend des pages Event Predict, Analyse et Commandes (endpoints partagés)

Rapport en lecture seule. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code et sont signalées comme telles. Ce qui n'est pas lu est marqué "non vérifié".

Périmètre: (1) GET /spaces/:id/shop-details?granular=1, (2) GET /spaces/:id/event-timeline, (3) GET /spaces/:id/transaction-baskets, (4) predict-versions et predict-versions/summary, (5) space-menu/shop/:id/items.

## 1. Fiche de la page

Sans objet côté backend pur (les pages Event Predict, Analyse et Commandes sont décrites dans les autres sections du rapport). Ici: fiche des 5 endpoints partagés, tous sous `@UseGuards(JwtDatabaseGuard)`, tous scopés par `user.tenantId`.

## 2. Arbre des composants

Sans objet (backend). Voir fiche des endpoints en section 3.

## 3. Appels API, endpoint par endpoint

### 3.1 GET /spaces/:id/shop-details?granular=1

**Chaîne d'appel.**
- Contrôleur: `backend/src/features/spaces/space-shops.controller.ts:101-145`. Paramètres `page` (défaut 1), `limit` (défaut 20, plafonné à 200, l.142), `granular` (`1` ou `true`, l.143). Appelle `spaceShopsService.getShopDetails(id, tenantId, page, limit, includeGranular, user)`.
- Service: `backend/src/features/spaces/services/space-shops.service.ts:106-140`. `getShopDetailsRaw` enveloppe la RPC dans `redis.getOrSet`, clé `spaces:shopdetails:{tenant}:{space}:{page}:{limit}:{0|1}`, TTL 60 s (`space-cache.service.ts:36-38`, commentaire l.32-35: la RPC est annoncée ~300 ms et sur le chemin critique du premier rendu /analyse; ce chiffre vient du commentaire, non mesuré ici). Si l'utilisateur n'a pas `stats.financial.view`, le service retire `revenue` de chaque ligne `shops` et `shopGranularData` (l.115-121), donc un `.map` de plus sur tout le payload, après le cache.
- Requête: `backend/src/features/spaces/spaces.queries.ts:133-137`, `SELECT get_space_shop_details(spaceId, tenantId, page, limit, includeGranular)` via `$queryRaw` (une seule requête, pas de transaction explicite).
- Invalidation: `invalidateSpaceCache` fait un `deletePattern` sur `spaces:shopdetails:{tenant}:{space}*` (`space-cache.service.ts:74`). Chaque modification d'espace ou fin de ré-agrégation vide donc toutes les pages/limites, et le premier utilisateur suivant repaie la RPC complète.

**RPC `get_space_shop_details`**, version la plus récente: `backend/prisma/migrations/20261102120000_shop_details_rpc_include_unmapped_locations/migration.sql` (355 lignes; l'en-tête l.1-11 indique "EXPLAIN a faire par le central avant application", donc cette version n'a pas d'EXPLAIN documenté). `SECURITY DEFINER`, plpgsql, tables temporaires `ON COMMIT DROP` (l.86, 92, 127).

| Étape (lignes) | Tables | Filtres | Index existant | Borné par la pagination ? |
|---|---|---|---|---|
| Contrôle espace (35-39) | `Space` | id + tenantId | PK | oui |
| `v_config_ids` (41-43) | `Config` | `spaceId` | non vérifié (index Config non lu) | oui |
| `v_shop_ids` (55-73) | `SpaceElement` + 3 `EXISTS` (`Floor`, `Forecourt`, `Zone`) | type IN 7 valeurs, `floorId`/`forecourtId`/`zoneId` rattachés aux configs de l'espace | non vérifié | oui (pas de date) |
| `v_location_ids` (80-83) | `WeezeventLocationShopMapping` | tenantId + spaceElementId = ANY(shops) | `@@index([tenantId, spaceElementId])` (backend/prisma/schema.prisma:3019) | oui |
| **`_gran` (92-111)** | `SpaceRevenueMinuteAgg` LEFT JOIN `WeezeventLocationShopMapping` | tenantId + spaceId + locationId NOT NULL + (location dans la liste OU non mappée). GROUP BY location, event, spaceElement | `@@index([tenantId, spaceId, weezeventLocationId, minute])` (backend/prisma/schema.prisma:3071), `[tenantId, spaceId, weezeventEventId, minute]` (3069), `[tenantId, spaceId, spaceElementId, minute]` (3070). Aucun index ne contient (location, event). | **NON**. Aucune borne de dates ni d'events: agrège toutes les minutes de tout l'historique de l'espace (275k lignes d'agrégat sur Stade Jean Bouin, chiffre cité par le commentaire `space-cache.service.ts:41`) |
| `_space_event_ids` (127-141) | `WeezeventTransaction` JOIN `WeezeventEvent` + `NOT EXISTS` sur `EventSalesSource` (index `[salesEventId]`, schema.prisma:3961) | tenantId, status = 'V', locationId = ANY(toutes les locations) | `@@index([tenantId, locationId, status, eventId])` (backend/prisma/schema.prisma:1591, index-only; son commentaire cite 185k lignes et ~11 s avant l'index) | **NON** pour le calcul (DISTINCT sur tout l'historique des locations); seule la liste d'ids est tronquée ensuite |
| `COUNT(*)` + `_shop_rev` (143-149) | tables temporaires | - | - | oui |
| Page d'ids (151-157) | `_space_event_ids` | ORDER BY startDate DESC LIMIT/OFFSET | - | c'est la pagination |
| **`shopGranularData` (159-227)** | `_gran` LEFT JOIN `SpaceElement`, `WeezeventLocation`, `Event` (x2), `WeezeventEvent` | **aucun WHERE sur `v_paginated_ids`**. Le test `v_paginated_ids IS NOT NULL` ne sert que de garde | PK / index de jointure | **NON**. La page de 20 events ne limite pas les lignes granulaires: une ligne par (PdV x event) pour TOUS les events de l'espace |
| `events` (229-267) | `WeezeventEvent`, sous-requête `WeezeventAttendee` (COUNT par event), `Event`, `EventCategory`, `EventType` | `ev.id = ANY(v_paginated_ids)`, attendees filtré tenantId + eventId = ANY(page) | `WeezeventAttendee` `@@index([eventId])` (schema.prisma, bloc 1975) | oui |
| `menuItemCostMap` (272-284) | `WeezeventProductMapping` JOIN `MenuItem` | tenantId (colonne de `WeezeventProductMapping`) et `totalCost IS NOT NULL`, GROUP BY menuItemId | `@@index([tenantId])` (backend/prisma/schema.prisma:1763) | **NON**: tout le tenant (tous espaces confondus), recalculé même quand seule la page 2 est demandée |
| `shops` (288-338) | `SpaceElement`, `Floor`, `Forecourt`, `Zone`, LATERAL `ConfigurationElement`, `Config`, `_shop_rev`, `WeezeventLocationShopMapping` | `se.id = ANY(shops)` | non vérifié | oui |

**Constats SQL.**
1. Un seul passage sur `SpaceRevenueMinuteAgg` (la migration l'indique, l.90), mais ce passage est non borné en dates et en events. Son coût croît avec l'historique complet de l'espace, pas avec la page demandée.
2. `shopGranularData` n'est pas filtré par `v_paginated_ids` (migration l.187-224). C'est l'écart entre ce que la pagination annonce (20 events) et ce qui est renvoyé (tous les events x tous les PdV). Payload estimé (à confirmer en Network): par ligne ~25 clés JSON dont 7 `NULL` explicites (menuItemId, menuItemName, menuItemPicture, menuItemType, menuItemCategory, weezpay x3, itemCost, l.172-180), soit environ 550 à 650 octets; pour 40 PdV x 100 events = 4000 lignes, environ 2,4 Mo avant gzip. Chiffre d'ordre de grandeur calculé par moi, non mesuré.
3. `_space_event_ids` : `SELECT DISTINCT` sur `WeezeventTransaction` filtré par locations. Index-only grâce à l'index `[tenantId, locationId, status, eventId]`, mais il lit une entrée d'index par transaction validée de l'espace (centaines de milliers). C'est le poste que le commentaire de schema.prisma:1589-1590 chiffre à ~11 s avant l'index.
4. `menuItemCostMap` est indépendant de l'espace (tenant entier) et n'est pas borné.
5. Le cache Redis (60 s) protège les rechargements rapprochés mais pas le premier chargement après chaque invalidation, et la clé inclut `page:limit:granular`, donc deux écrans qui demandent des paramètres différents ne partagent rien.
6. La RPC est `SECURITY DEFINER` avec `tenantId` en paramètre texte, ce qui est cohérent avec le filtre tenant dans chaque sous-requête (vérifié: `_gran`, `_space_event_ids`, `WeezeventLocation`, `Event`, `WeezeventAttendee`; `EventSalesSource` et `MenuItem` ne sont pas filtrés tenant mais joints par id).

### 3.2 GET /spaces/:id/event-timeline

**Chaîne d'appel.**
- Contrôleur: `backend/src/features/spaces/space-analytics.controller.ts:41-75`. Paramètres `eventIds` (liste CSV), `granularity` (`summary` sinon `minute`), `since` (Live). Le contrôleur ne borne pas le nombre d'ids; le service coupe à 100 (`space-event-timeline.service.ts:49`). `since` est appliqué APRÈS la lecture (`rowsSinceMinute`, l.74): le rafraîchissement incrémental du Live relit et renvoie le service en plein grain côté serveur, le filtre n'économise que le réseau (lecture du helper `rowsSinceMinute` non faite: non vérifié).
- Service: `backend/src/features/spaces/services/space-event-timeline.service.ts:33-262`.
  1. Lookup Redis par event, `Promise.all` de N `GET` (l.54-56), clé `spaces:evtimeline:{tenant}:{space}:{event}` + `:sum` si summary (l.47-48; `space-cache.service.ts:48-49`).
  2. Pour les events manquants seulement: `resolveEventSalesScope` (voir ci-dessous), puis la requête SQL sous `analyseBatchSemaphore.run(...)` et `queryWithWorkMem` (`backend/src/core/database/query-with-work-mem.ts`: transaction Prisma, `SET LOCAL work_mem = '32MB'`; la transaction garantit que le SET ne fuit pas dans le pooleur, cohérent avec la règle "pas de SET de session"; coût: BEGIN + SET LOCAL + requête + COMMIT, 4 allers-retours réseau).
  3. Écriture Redis par event (`redis.set`, TTL via `eventBatchCacheTtl`), y compris `[]`.
- TTL (`space-cache.service.ts:52-53`, `space-sales-scope.service.ts:296-304`): 6 h si la fin de fenêtre de l'event est passée, 60 s sinon (event du jour, futur, ou sans fenêtre résolue). Un event sans fenêtre (conteneur de saison, `spanDays > 2`, l.225) est saute et n'est pas dans `windows`, donc `eventBatchCacheTtl` renvoie 60 s pour `[]`: ces events sont recalculés (resolveEventSalesScope complet) toutes les 60 s.
- Invalidation: `invalidateSpaceCache` et fin de ré-agrégation (`backend/src/shared/constants/event-batch-cache.ts`: motifs `spaces:evtimeline:{tenant}:{space}:*`, `spaces:baskets:...:*`, `spaces:unmapped:...:*`, `spaces:revsum`). Une ré-agrégation vide donc le cache 6 h de TOUS les events de l'espace, y compris les matchs anciens immuables; le paquet suivant repaie le SQL complet pour chacun.

**`resolveEventSalesScope`** (`space-sales-scope.service.ts:80-272`), refait à chaque paquet de missing:
- 4 lectures en parallèle (l.114-155): `spaceCrudService.findOne` (contrôle d'appartenance, cache détail 120 s selon `space-cache.service.ts:15`, non lu en détail), bloc "statiques" caché 60 s (`spaces:salesscope:*`: `Event.findMany` de TOUS les events de l'espace avec 7 colonnes, `LocationSpaceMapping`, `Space.timezone`, puis `salesSources.listActiveByEvent` sur tous les events), `salesEvent.findMany({ id in uniqueIds })` (NON caché, une requête par paquet) et `resolveShopIdsForSpace` (3 `findMany` SpaceElement, caché 30 s, `SPACE_SHOPIDS_CACHE_TTL`, l.86).
- Les fenêtres sont calculées en mémoire par event (l.195-236) via `resolveEventTransactionWindow(df, tz, allSpaceEvents)`: chaque appel parcourt tous les events de l'espace pour trouver les voisins (BUG-339-02), donc O(N paquet x N events espace). Coût CPU non mesuré, non vérifié (`event-window.util` non lu).
- TTL de 60 s du bloc statique: au-delà d'une minute entre deux paquets, ou après chaque `invalidateSpaceCache`, la liste complète des events de l'espace est relue.
- `analyseBatchSemaphore = new Semaphore(2, 32, 60_000)` (l.29): 2 requêtes SQL en parallèle PAR PROCESSUS, 32 en file, 60 s d'attente max puis 503 (`backend/src/shared/utils/semaphore.ts`). Partagé par event-timeline, transaction-baskets (via `space-analyse-batch.service.ts`) et analyse-unmapped (selon le commentaire l.26). Les hits Redis n'y passent pas. Conséquence: si l'Analyse lance en même temps plusieurs paquets timeline + paniers (front, non lu ici), le 3e paquet attend un des 2 premiers; la latence totale est la somme des paquets / 2.

**SQL de la timeline.**
- Fichier: `backend/src/features/spaces/event-timeline-window.sql.ts:18-69`. CTE `ev` (VALUES, une ligne par event: windowStart, windowEnd, tagId, integrationId), `win AS MATERIALIZED` (jointure `SpaceRevenueMinuteItemAgg mem` sur `mem.minute >= windowStart AND < windowEnd` + `tenantId` + `spaceId`, et si `tagId` non nul `weezeventEventId IN (eventId, tagId)`), `dedup` (GROUP BY event, minute, PdV, location, merchant, produit avec MAX des 3 métriques, filtre `shopScopeClause`).
- Lecture finale grain minute (service l.180-228): `dedup` + `LATERAL` fuseau + LEFT JOIN `SpaceElement`, `WeezeventProductMapping` (filtre `wpm.tenantId`), `MenuItem`, `ProductType`, `ProductCategory`, `GROUP BY` sur 11 expressions puis `ORDER BY eventId, minuteLocal`. Grain summary (l.78-113): même chose sans la minute.
- Index sur `SpaceRevenueMinuteItemAgg` (migration `20260804160000_add_space_revenue_minute_item_agg/migration.sql:29-35`, `20260814170000_add_integrationid_space_revenue_agg`): `[tenantId, spaceId, weezeventEventId, minute]`, `[tenantId, spaceId, spaceElementId, minute]`, `[tenantId, spaceId, integrationId]`, et l'UNIQUE `[tenantId, spaceId, minute, weezeventEventId, weezeventLocationId, weezeventMerchantId, spaceElementId, weezeventProductId]` (backend/prisma/schema.prisma:3115-3145). C'est l'UNIQUE (minute en 3e position) qui sert la lecture par plage de minutes décrite dans le commentaire de `event-timeline-window.sql.ts:7-12`. Elle est donc large (8 colonnes) et non spécialisée; aucun index dédié `[tenantId, spaceId, minute]` n'est créé dans les migrations pour cette table (grep `CREATE INDEX` : seulement les 3 ci-dessus; pour `SpaceRevenueMinuteAgg`, `SpaceRevenueMinuteAgg_tenantId_spaceId_minute_idx` existe, migration `20260422000001_backfill_missing_tables/migration.sql:59`).
- Volumes cités par les commentaires du code (non mesurés par moi): ~3k lignes par event, 342 ms pour 6 events après correctif MATERIALIZED (`event-timeline-window.sql.ts:11`); 702k lignes lues et 12 à 32 s avant correctif (id.); 7 à 27 s par paquet de 15 events sur Stade Jean Bouin avant cache (`space-cache.service.ts:41-42`); grain minute ~2 Mo par event, summary 100 à 200 fois plus léger (`space-event-timeline.service.ts:38-41`).
- Payload minute: 16 champs par ligne (l.233-249) dont `revenue` doublon de `revenueHt` (l.248), `shopName`, `menuItemName`, `menuItemType`, `menuItemCategory` répétés à chaque minute. La déduplication (`dedup`) est calculée AVANT les jointures de libellés, mais les libellés sont ensuite répétés par ligne dans la réponse JSON (non normalisés).
- Redis: la valeur cachée est le tableau JSON complet de l'event (jusqu'à ~2 Mo par event au grain minute, d'après le commentaire). Un paquet de 15 events manquants écrit donc environ 30 Mo en 15 `SET` simultanés, puis les relit en 15 `GET` à chaque chargement (TTL 6 h). Taille réelle des clés: non vérifié.

**Particularité des events futurs/du jour**: TTL 60 s, mais le front Live repoll toutes les 15 s (commentaire `space-cache.service.ts:43-44`); 3 polls sur 4 sont des hits Redis qui relisent quand même le JSON entier de l'event avant de filtrer `since`.

### 3.3 GET /spaces/:id/transaction-baskets

**Chaîne d'appel.** Contrôleur `space-analytics.controller.ts:80-151` (mêmes paramètres que la timeline, `since` appliqué après lecture, l.150). Service `backend/src/features/spaces/services/space-analyse-batch.service.ts:58-245`. Cache Redis par event (`spaces:baskets:{tenant}:{space}:{event}`, mêmes TTL que la timeline: 6 h passé, 60 s sinon, `space-cache.service.ts:50-53`), lookup par `Promise.all` de N `GET` (l.82-84). Pour les manquants: `resolveEventSalesScope` (refait, voir 3.2), puis deux chemins.

**Chemin 1, pré-agrégé** (l.98-129, SQL `backend/src/features/spaces/basket-agg-read.sql.ts:19-101`). Sous `analyseBatchSemaphore` + `queryWithWorkMem`.
- CTE `agg AS MATERIALIZED`: `SpaceBasketMinuteAgg` filtré `tenantId`, `spaceId`, `weezeventEventId IN (ids du paquet)` (l.31-37). Index: `SpaceBasketMinuteAgg_tenant_space_event_minute_idx (tenantId, spaceId, weezeventEventId, minute)` (migration `20260921180000_space_basket_minute_agg/migration.sql:25`) et l'UNIQUE `SpaceBasketMinuteAgg_key` (l.24). Le filtre PdV s'applique après matérialisation.
- `compositions` (DISTINCT productKeys), `labels` (UNNEST des clés produit + jointures `WeezeventProductMapping`, `MenuItem`, `ProductType`, `ProductCategory`, `WeezeventProduct`), `resolved` (jointure `SpaceElement`), puis GROUP BY final sur 10 colonnes. Les libellés sont résolus une fois par composition distincte (commentaire l.38-41: "quelques centaines par event", non mesuré).
- Différence avec la timeline: lecture par ÉGALITÉ sur `weezeventEventId` (ids des fenêtres), pas par plage de minutes. Les deux lecteurs ne sont donc pas strictement alignés sur la même définition de périmètre (la timeline lit par fenêtre de dates pour couvrir les deux conventions d'id, `space-event-timeline.service.ts:151-160`; les paniers supposent que l'agrégat est tagué avec l'id demandé). Écart de périmètre potentiel: non vérifié.
- Payload: 14 champs par ligne dont trois tableaux de libellés (`categoryCombo`, `typeCombo`, `itemCombo`), `revenue` doublon de `revenueHt` (l.119). Volume réel: non vérifié.

**Chemin 2, repli brut sur `WeezeventTransaction`** (l.131-239).
- Déclenché pour chaque event du paquet sans ligne pré-agrégée, SAUF si `Event.transactionCount === 0` (garde l.137-146). Un rollup `null` (event futur, sans rollup, source externe) déclenche donc le scan brut.
- Requête: `ev` (VALUES) JOIN `WeezeventTransaction t` par plage de `transactionDate` + `tenantId` + `integrationId` + `status='V'` + `deletedAt IS NULL`, JOIN `WeezeventTransactionItem ti` (table citée à 3,1 M lignes dans `schema.prisma` près de `SalesPriceAgg`), puis LEFT JOIN mapping PdV, `SpaceElement`, produit, `MenuItem`, type, catégorie; `GROUP BY t.id` avec trois `ARRAY_AGG(DISTINCT ... ORDER BY ...)` par transaction, puis second GROUP BY.
- Index disponibles sur `WeezeventTransaction` (`schema.prisma:1575-1600`): `[tenantId, integrationId, status, transactionDate]` (nom tronqué, `WeezeventTransaction_tenantId_integrationId_status_transactionD`) et l'index couvrant `WeezeventTransaction_basket_cover_idx` (`[tenantId, integrationId, status, transactionDate, deletedAt, eventId, locationId, locationName, id]`, commentaire: index-only, 15 events 18,9 s a 4,3 s, créé CONCURRENTLY en prod, 396 Mo). Index sur `WeezeventTransactionItem(transactionId)`: non vérifié (modèle `SalesTransactionItem` à `schema.prisma:1679`, index non lus).
- Durées citées par le code (non mesurées par moi): 6 s par paquet de 15 events après index, 20 à 56 s avant, 502 du proxy à 30 s (`space-analyse-batch.service.ts:99-100, 134-136`).
- La garde `emptyRollups` fait un `prisma.event.findMany({ where: { id: { in } } })` sans `tenantId` (l.140-143): lecture par PK, coût négligeable, mais hors périmètre tenant (point de robustesse, pas de perf).

**Cas défavorable**: un event futur ou sans vente avec `transactionCount = null` reçoit `[]` en cache 60 s seulement (TTL live), donc rejoue le scan brut des transactions toutes les minutes tant que la page est ouverte.

### 3.4 predict-versions et predict-versions/summary

- `GET events/:eventId/predict-versions` (`backend/src/features/events/predict-versions.controller.ts:35-51`) appelle `PredictVersionsService.findAll` (`backend/src/features/events/predict-versions.service.ts:13-18`): `eventPredictVersion.findMany({ where: { eventId, tenantId }, orderBy: [isDefault desc, createdAt desc] })` SANS `select`. Elle renvoie donc toutes les colonnes, dont les JSON lourds `eventSnapshot`, `menuConfig`, `quantityAdjustments`, `manualQuantities`, `predictedRecords` et `predictedTimeline` (courbe prédite par minute, `backend/prisma/schema.prisma:3723-3750`), pour chaque version de l'event. Index: `[tenantId, eventId]` (schema.prisma, commentaire "Couvre findAll"), donc la sélection est indexée; le coût est dans la lecture TOAST et le payload. Pas de cache Redis (lecture du service: aucun `redis`). Taille d'une version: non vérifié (dépend de `predictedRecords` et `predictedTimeline`).
- `GET predict-versions/summary` (`predict-versions-summary.controller.ts:20-35`) appelle `eventIdsWithVersions` (`predict-versions.service.ts:27-41`): `findMany({ where: { tenantId, eventId in ids }, select: { eventId }, distinct: ['eventId'] })`, plafonné à 500 ids (l.21, 30). Ne lit que `eventId`, même index `[tenantId, eventId]`. Le `distinct` Prisma est dédoublonné côté moteur (comportement Prisma sans `nativeDistinct`, à confirmer par l'EXPLAIN/log SQL), mais les lignes lues sont minuscules. Coût: bas. Pas de cache Redis.
- Risque: si un écran appelle `findAll` pour chaque event d'une liste (N+1 côté front, non vérifié ici), le payload JSON multiplie; le `summary` existe précisément pour éviter cela pour la disponibilité.

### 3.5 GET space-menu/shop/:shopId/items

- Contrôleur: `backend/src/features/space-menus/space-menus.controller.ts:221-308` (`configId`, `enabledOnly`). Service: `backend/src/features/space-menus/services/space-menu-availability.service.ts:313-385`.
- Étape 1: `spaceElement.findFirst` du shop avec 5 sélections imbriquées (floor, forecourt, externalMerch, zone, `configurationElements`, `menuAssignments`) puis contrôle d'accès à l'espace (l.324-348).
- Étape 2: `getItemsWithAvailabilityForSpace` (l.54-~296): 8 requêtes Prisma en parallèle, TOUTES tenant-wide hors la première (l.66-145): `menuItem.findMany` des items associés à l'espace avec 8 relations imbriquées (`spaceLinks`, `productType`, `productCategory`, `seasonLinks`, `ingredients`, `packagings`, `components`, `comboChildren`), `ingredient.findMany({ tenantId })`, `packaging.findMany({ tenantId })`, `menuComponent.findMany({ tenantId })` avec `ingredients` et `children`, `marketPrice.findMany({ tenantId })`, `supplier.findMany({ tenantId })`, `getTenantDefaultVatRate`, et un SECOND `menuItem.findMany({ tenantId })` du catalogue complet avec 4 relations imbriquées (commentaire l.131-134: nécessaire pour résoudre les combos). Chaque relation imbriquée Prisma déclenche une requête supplémentaire: de l'ordre de 20 requêtes SQL par appel (estimation de lecture, non mesurée).
- Aucun cache Redis ni mémoïsation (grep `redis|cache` : seulement des caches locaux `componentIssuesCache` / `menuItemComboIssuesCache` à l'intérieur d'un appel, l.192, 222). Le résultat tenant-wide (disponibilité par item pour l'ESPACE) ne dépend pas du shop; seules les deux dernières clés (`enabled`, `assigned`) en dépendent (l.366-372). Chaque shop ouvert dans le drawer ou l'inspecteur recalcule donc tout le référentiel du tenant.
- Index: toutes ces tables sont filtrées par `tenantId`; les index `@@index([tenantId])` existent sur les modèles courants (non vérifiés table par table pour `Ingredient`, `Packaging`, `MenuComponent`, `MarketPrice`, `Supplier`, `MenuItem`: non lu).
- Payload: une ligne par item du catalogue de l'espace (sans recette), avec `missingIngredients` éventuels (l.258-290 du contrôleur). `enabledOnly=true` ne réduit que le premier `menuItem.findMany` (via `id in onlyIds`) et le calcul; les 7 autres lectures tenant-wide restent faites.

## 4. Cascade au premier affichage (côté serveur)

Chronologie d'un chargement d'Analyse à froid (caches Redis vides), reconstruite depuis le code serveur; l'ordre des appels côté front n'est pas vérifié ici.
- t0: `shop-details?granular=1&limit=...` (phase 1 de `useSpaceData`, chemin critique selon `space-cache.service.ts:32-35`). RPC non bornée en historique. Cache 60 s.
- t0 en parallèle: `event-timeline?granularity=summary` par paquets (commentaire "paquet de 15 events", `space-cache.service.ts:41`). Premier paquet: lookup Redis, `resolveEventSalesScope`, file du sémaphore (2 en vol), SQL ~0,3 s à froid pour 6 events d'après le commentaire `event-timeline-window.sql.ts:11`.
- t1: `transaction-baskets` par paquets, même sémaphore. Chaque paquet manquant: `resolveEventSalesScope` + lecture pré-agrégée (+ repli brut possible).
- Le sémaphore (2 slots) sérialise de fait timeline-summary, timeline-minute, paniers et unmapped d'un même navigateur et de tous les utilisateurs d'un même processus Render: chemin critique = (nombre de paquets x durée SQL) / 2.
- `space-menu/shop/:id/items` n'intervient que sur Event Predict / menu (drawers), sans sémaphore, mais en 8 requêtes parallèles prises sur le pool Prisma (limite du pool: non lue).
- À chaque `invalidateSpaceCache` ou fin de ré-agrégation: purge de `shopdetails`, `evtimeline`, `baskets`, `unmapped`, `revsum` de l'espace; le prochain visiteur repaie TOUT le premier affichage.

## 5. Problèmes de performance

1. **`shopGranularData` non borné par la pagination** (haut). Les lignes granulaires de la RPC sont lues dans `_gran` sans filtre sur `v_paginated_ids`: `backend/prisma/migrations/20261102120000_shop_details_rpc_include_unmapped_locations/migration.sql:187-224` (l.159 n'utilise `v_paginated_ids` que comme garde). Payload = PdV x events de TOUT l'historique, même pour `limit=20`. Pages: Analyse, Event Predict.
2. **`_gran` et `_space_event_ids` scannent tout l'historique de l'espace** (haut): migration l.92-111 (SpaceRevenueMinuteAgg sans borne de dates, 275k lignes citées pour Jean Bouin) et l.127-141 (DISTINCT sur `WeezeventTransaction` par locations, 185k lignes, ~11 s avant index selon `schema.prisma:1589`). Aucun cache au-delà de 60 s, invalidé à chaque ré-agrégation. Pages: Analyse, Commandes, Event Predict.
3. **`menuItemCostMap` tenant-wide** (moyen): migration l.272-284, recalculé à chaque appel, même page 2.
4. **Invalidation trop large du cache par event** (haut): `eventBatchCachePatterns` (`backend/src/shared/constants/event-batch-cache.ts`) purge `evtimeline`/`baskets`/`unmapped` de TOUS les events de l'espace à chaque ré-agrégation ou modification d'espace, alors que seuls les events récents/modifiés ont changé; le cache 6 h des matchs anciens est perdu.
5. **Sémaphore à 2 slots partagé par 3 endpoints** (moyen/haut): `space-sales-scope.service.ts:29`. Protège la mémoire (512 Mo, BUG-144-01) mais sérialise l'Analyse; au-delà de 32 en file ou 60 s d'attente: 503.
6. **Cache Redis volumineux par event** (moyen): valeur = tableau JSON complet jusqu'à ~2 Mo au grain minute (commentaire `space-event-timeline.service.ts:40`), N `GET` simultanés, aucun `MGET`, libellés répétés par ligne, `revenue` doublon de `revenueHt` (l.248). `since` du Live est appliqué après coup (`space-analytics.controller.ts:74`).
7. **`resolveEventSalesScope` refait à chaque paquet** (moyen): `salesEvent.findMany` non caché par paquet, `Event.findMany` complet de l'espace relu toutes les 60 s, `resolveEventTransactionWindow` avec voisins en O(paquet x events de l'espace) (`space-sales-scope.service.ts:114-236`), `findOne` d'espace par paquet.
8. **Repli brut des paniers pour rollup `null`** (moyen/haut): `space-analyse-batch.service.ts:137-146, 163-239`; scan `WeezeventTransaction` + `WeezeventTransactionItem` rejoué toutes les 60 s (TTL live) pour un event futur ou sans rollup.
9. **`space-menu/shop/:id/items` sans cache et tenant-wide** (haut pour Event Predict/menu): `space-menu-availability.service.ts:66-145`, ~20 requêtes SQL par shop ouvert, résultat identique d'un shop à l'autre de l'espace.
10. **`predict-versions` findAll sans `select`** (moyen): `predict-versions.service.ts:13-18` renvoie les JSON lourds, dont `predictedTimeline`.
11. **`queryWithWorkMem` = transaction explicite** (bas): 4 allers-retours (BEGIN, SET LOCAL, requête, COMMIT) sur le pooleur, utile pour le tri mais coûteux si la latence DB est élevée.
12. **Écart de périmètre timeline/paniers** (bas, correction fonctionnelle): timeline par plage de minutes, paniers par égalité `weezeventEventId` (voir 3.3). Non vérifié sur données.

## 6. Recommandations

### Backend (code)
| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Filtrer `shopGranularData` sur `v_paginated_ids` (ajouter `WHERE gr."weezeventEventId" = ANY(v_paginated_ids)` ou jointure sur l'événement DataFriday), nouvelle migration `CREATE OR REPLACE FUNCTION` | Payload et jointures divisés par (nb events / limit); gros gain sur espaces à historique long | Moyen: le front peut s'appuyer sur toutes les lignes (totaux par PdV d'Analyse); valider avec le front avant | M | nouvelle migration `prisma/migrations/<date>_shop_details_granular_paginated/migration.sql`, `spaces.queries.ts` |
| Sortir `menuItemCostMap` de la RPC vers un endpoint/cache Redis tenant (clé `menuitemcost:{tenant}`, TTL 5 min) ou ne le calculer qu'en page 1 | Retire un GROUP BY tenant-wide des pages suivantes | Bas | S | migration RPC + `space-shops.service.ts` |
| Cache Redis du résultat de `getItemsWithAvailabilityForSpace` par (tenant, space), TTL 30 s, invalidé via `invalidateSpaceCache` et écritures ingrédient/menu/fournisseur | Un shop sur N n'appelle plus 8 lectures tenant-wide; ~20 requêtes SQL évitées par appel suivant | Moyen: fraîcheur après modification d'un ingrédient ou fournisseur (il faut brancher l'invalidation) | M | `space-menu-availability.service.ts`, `space-cache.service.ts` |
| Invalidation fine des caches par event: ne purger que les events dont la fenêtre intersecte les minutes réagrégées, au lieu du motif `*` | Conserve le cache 6 h des matchs passés après chaque ré-agrégation | Moyen: il faut connaître les events touchés dans `executeProcessEvents` | M | `event-batch-cache.ts`, `space-cache.service.ts`, `aggregation.service.ts` (non lu) |
| `findAll` des versions: `select` sans `predictedRecords`/`predictedTimeline`/`eventSnapshot` pour la liste, détail par `GET :id` ou paramètre `?full=1` | Payload de liste réduit d'un ordre de grandeur | Moyen: le front doit demander le détail pour restaurer | S/M | `predict-versions.service.ts`, `predict-versions.controller.ts` |
| Remplacer les N `GET` Redis par un `MGET` (et `SET` en pipeline) | Moins d'allers-retours Redis (15 à 100 par paquet) | Bas: vérifier l'API de `RedisService` (non lue) | S | `space-event-timeline.service.ts`, `space-analyse-batch.service.ts`, `redis.service.ts` |
| Mettre `salesEvent.findMany` du scope dans le bloc statique caché, ou le mémoïser par paquet | Une requête de moins par paquet | Bas | S | `space-sales-scope.service.ts:150` |
| Garde paniers: pour `Event.transactionCount === null` ET event futur, ne pas rejouer le scan brut (renvoyer `[]` avec TTL plus long, ex. 5 min) | Supprime les scans bruts répétés des events futurs | Bas/moyen: un event qui reçoit sa première vente ne doit pas rester vide 5 min (garder 60 s si la fenêtre est ouverte) | S | `space-analyse-batch.service.ts:137-150` |
| Dédupliquer les libellés des lignes timeline (dictionnaire shop/article + indices) et retirer `revenue` doublon | Taille de réponse minute et de clés Redis réduite | Moyen: contrat front (le commentaire parle d'un repli `revenueHt` déjà ajouté pour summary) | M | `space-event-timeline.service.ts`, consommateurs front |
| Appliquer `since` en SQL (`minuteLocal >= since`) quand le Live re-poll sur un event du jour | Moins de lignes lues/renvoyées toutes les 15 s | Bas/moyen: clé cache distincte ou lecture sans cache | M | `space-analytics.controller.ts`, services timeline/paniers |
| Augmenter prudemment le sémaphore de 2 à 3 seulement si la mémoire Render le permet (instance Pro, voir mémoire "Render en offre pro") et mesurer le pic | Moins d'attente en file | Moyen: OOM (BUG-144-01) si la mémoire est sous-estimée | S | `space-sales-scope.service.ts:29` |

### SQL / index (à valider par EXPLAIN avant, `CREATE INDEX CONCURRENTLY`)
| Action | Gain attendu | Risque | Effort | Colonnes |
|---|---|---|---|---|
| Index couvrant pour `_gran`: `SpaceRevenueMinuteAgg (tenantId, spaceId, weezeventLocationId, weezeventEventId) INCLUDE (revenueHt, itemsCount, transactionsCount)` | Index-only scan et GROUP BY sans tri sur le gros volume | Moyen: coût d'écriture à chaque ré-agrégation, taille de l'index (à estimer) | M | `SpaceRevenueMinuteAgg` |
| Table de rollup `SpaceEventShopAgg (tenantId, spaceId, eventId, locationId/spaceElementId, revenueHt, itemsCount, transactionsCount)` alimentée par l'agrégation, lue par la RPC au lieu de `_gran` | La RPC ne lit plus les minutes: lecture O(PdV x events) | Moyen/haut: nouvelle table, backfill, double écriture à fiabiliser (pollution inter-intégrations déjà vécue, BUG-384-02) | L | nouvelle migration, `aggregation.service.ts` |
| Liste d'events de la RPC: remplacer `_space_event_ids` (DISTINCT sur transactions) par `Event`/rollup (`SpaceRevenueMinuteAgg` DISTINCT `weezeventEventId`, ou `Event` de l'espace) | Supprime la lecture index-only de centaines de milliers d'entrées de `WeezeventTransaction` | Moyen: la définition de "event de l'espace" doit rester identique (events Weezevent sans `Event` DataFriday) | M/L | migration RPC |
| Index dédié timeline: `SpaceRevenueMinuteItemAgg (tenantId, spaceId, minute)` si l'EXPLAIN montre que l'UNIQUE à 8 colonnes est moins efficace | Lecture par plage plus compacte | Bas/moyen: espace disque, écriture | S | `SpaceRevenueMinuteItemAgg` |
| Vérifier/ajouter l'index `WeezeventTransactionItem (transactionId)` pour le repli brut paniers | Évite un seq scan sur 3,1 M lignes | Bas | S | `WeezeventTransactionItem` (non lu) |

## 7. Points non vérifiés

À mesurer ou lire, SELECT uniquement, dans `begin read only; ... rollback;` sur la base locale ou la connexion lecture seule, jamais de `SET` de session sur le pooleur 6543 (utiliser `SET LOCAL` à l'intérieur de `begin read only` si nécessaire pour `work_mem`).

EXPLAIN (ANALYZE, BUFFERS) à lancer:
1. RPC: `begin read only; explain (analyze, buffers) select get_space_shop_details('<spaceId>','<tenantId>',1,20,true); rollback;` (les tables temporaires `CREATE TEMP TABLE` de la RPC ne sont pas permises en `read only`: lancer plutôt chaque bloc séparément ci-dessous).
2. `_gran`: `explain (analyze, buffers) select srma."weezeventLocationId", srma."weezeventEventId", sum(srma."revenueHt") from "SpaceRevenueMinuteAgg" srma where srma."tenantId"='<t>' and srma."spaceId"='<s>' and srma."weezeventLocationId" is not null group by 1,2;` pour voir l'index choisi (`...weezeventLocationId_minute`) et le nombre de lignes.
3. `_space_event_ids`: `explain (analyze, buffers) select distinct we.id from "WeezeventTransaction" t join "WeezeventEvent" we on we.id=t."eventId" and we."tenantId"='<t>' where t."tenantId"='<t>' and t.status='V' and t."locationId" = any('{...}');`.
4. Timeline: CTE `win`+`dedup` avec 15 fenêtres réelles d'un espace (récupérées par `eventTimelineWindowCtes`), vérifier que l'index UNIQUE (minute en 3e colonne) est bien utilisé par plage et le nombre de lignes de `win`.
5. Paniers: `explain (analyze, buffers)` sur `readBasketAggSql` (ids d'un paquet) et sur le repli brut (event avec `transactionCount` null), index utilisé sur `WeezeventTransactionItem`.
6. `space-menu/shop/:id/items`: activer le log SQL Prisma sur une seule requête et compter les requêtes; EXPLAIN de `menuItem.findMany({ tenantId })` tenant complet.
7. `select count(*), pg_size_pretty(pg_total_relation_size(...))` de `SpaceRevenueMinuteAgg`, `SpaceRevenueMinuteItemAgg`, `SpaceBasketMinuteAgg`, et `pg_indexes` de chaque table citée pour confirmer les index réellement présents en base (le schéma peut dériver des migrations).

Autres inconnus:
- Taille réelle des réponses (Network): `shop-details?granular=1`, `event-timeline` minute et summary, `transaction-baskets`, `predict-versions` (liste), `space-menu/shop/:id/items`.
- Taille des clés Redis `spaces:evtimeline:*` et `spaces:baskets:*`, taux de hit, et limite mémoire de l'instance Redis.
- Mémoire de l'instance Render du backend et taille du pool Prisma (non lues) face aux 8 requêtes parallèles de `getItemsWithAvailabilityForSpace` et aux 2 slots du sémaphore.
- Fonctionnement exact de `rowsSinceMinute`, de `RedisService.getOrSet` (verrou anti-stampede ?), de `resolveEventTransactionWindow`.
- Appels front qui déclenchent ces endpoints (ordre, parallélisme, paquets de 15, N+1 sur `predict-versions`): couverts par les sections front du rapport.
- Index exacts de `Config`, `SpaceElement`, `Floor`, `Forecourt`, `Zone`, `ConfigurationElement`, `Ingredient`, `Packaging`, `MenuComponent`, `MarketPrice`, `Supplier`, `MenuItem` (non lus).
