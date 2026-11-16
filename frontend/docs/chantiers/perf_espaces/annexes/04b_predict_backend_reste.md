# Rapport perf, backend Event Predict (reste): predict-versions, reco stock-up, staffing-generation, shopMenuAvailability, shops, historyAliases

Lecture seule. Chemins relatifs à la racine du dépôt. Aucune durée ni taille n'est mesurée: toute valeur chiffrée est une estimation signalée. "non vérifié" = non lu. Complète `04_predict_sections.md` (staffing GET, hr/persons, hr/roles, GET /spaces déjà couverts).

## 1. Fiche du périmètre

| Sujet | Contrôleur | Service | Lignes |
|---|---|---|---|
| predict-versions (liste, création, défaut) | `backend/src/features/events/predict-versions.controller.ts` (122) | `predict-versions.service.ts` (129) | |
| predict-versions PATCH / DELETE par id | idem, classe `PredictVersionsStandaloneController` (`:86-122`) | idem | |
| predict-versions summary | `predict-versions-summary.controller.ts` (36) | idem | |
| Reco stock-up | Aucune route backend (calcul 100 % front, section 3.2) | n/a | n/a |
| staffing-generation | `staffing/staffing.controller.ts` (route generate, citée par le rapport 04) | `staffing/services/staffing-generation.service.ts` (334) | 334 |
| shopMenuAvailability (`GET /space-menu/shop/:shopId/items`) | `space-menus/space-menus.controller.ts` (529, handler `:221-308`) | `space-menus/services/space-menu-availability.service.ts` (406) | 406 |
| spaceShops / fetchForSpace (`GET /spaces/:id/shops`) | `spaces/space-shops.controller.ts` (289, handler `:90-98`) | `spaces/services/space-shops.service.ts` (269) + SQL `spaces/spaces.queries.ts` | 269 |
| historyAliases | `history-aliases/history-aliases.controller.ts` (66) | `history-aliases.service.ts` (92) | |

## 2. Arbre des composants

Sans objet (rapport backend). Les consommateurs front sont cités dans la section 3.

## 3. Appels API, endpoint par endpoint

### 3.1 predict-versions

- GET `/events/:eventId/predict-versions`: `PredictVersionsController.findAll` (`predict-versions.controller.ts:41-50`) puis `PredictVersionsService.findAll` (`predict-versions.service.ts:13-18`): `eventPredictVersion.findMany({ where: { eventId, tenantId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] })`. AUCUN `select`: toutes les colonnes sont renvoyées, dont les colonnes Json `eventSnapshot`, `menuConfig`, `quantityAdjustments`, `manualQuantities`, `predictedRecords`, `predictedTimeline` (`schema.prisma:3730-3743`). Aucun cache Redis. Aucune pagination. Index couvrant: `@@index([tenantId, eventId])` (`schema.prisma:3753`), mais pas d'index sur (`isDefault`, `createdAt`), donc tri en mémoire (petit ensemble par event, bas).
- GET `/predict-versions/summary?eventIds=`: `predict-versions-summary.controller.ts:20-35` puis `service.eventIdsWithVersions` (`:27-41`): `findMany` avec `select: { eventId: true }` et `distinct: ['eventId']`, plafond 500 ids. Prisma `distinct` s'exécute en mémoire côté Prisma (récupère toutes les lignes correspondantes puis dédoublonne), mais comme seule la colonne `eventId` est lue, le coût est faible. Index `(tenantId, eventId)` utilisable.
- POST `/events/:eventId/predict-versions`: `create` (`:51-81`): `event.findFirst` (1 requête, vérification) puis `eventPredictVersion.create` avec toutes les colonnes Json du DTO, retourne la ligne complète (RETURNING toutes colonnes, y compris `predictedRecords` et `predictedTimeline`).
- PATCH `/predict-versions/:id`: `patch` (`:83-100`): `findById` (`findFirst` avec toutes les colonnes JSON, ligne entière lue pour un simple contrôle d'appartenance) puis `update` (retourne la ligne complète).
- DELETE: `removeById` (`:102-105`): `findById` (ligne entière lue) puis `delete`.
- PUT `/events/:eventId/predict-versions/default`: `setDefault` (`:107-128`): `findById` (ligne entière lue) puis `$transaction([updateMany, update])`.

Précisions front (correction du rapport 04): le `:63` cité par `04_predict_sections.md` pour "GET /events/:id/predict-versions/default" est en réalité un PUT (`frontend/src/api/endpoints/eventPredict.api.js:63-68`). Il n'existe pas de GET `/default` côté contrôleur (`predict-versions.controller.ts:41-84`: GET liste, POST, PUT default seulement). Tous les lecteurs du front appellent la liste COMPLÈTE puis filtrent `isDefault` côté client:
- `useLivePredictBackground.js:25-27` (Live, `find(v => v.isDefault)`, n'utilise que `predictedTimeline` et `name`),
- `useLiveHr.js:51-54` (Live RH, `def.predictedRecords` seulement),
- `usePredictedNeed.js:229` (Réarmement, `pickReferenceVersion(rows)`),
- `useComparisonPredictScenarios.js:41` (Comparaison, une requête par event),
- `useEventPredictVersions.js:338` (page Event Predict: `dbToVersion` sur toutes les versions puis `reconcileLocalToDb`, écriture éventuelle de versions locales vers la base),
- `SpaceRestockView.vue:4873`.
Chacun jette 90 % du payload: un lecteur Live ne veut qu'une colonne Json de la version par défaut, et reçoit les 6 colonnes Json de TOUTES les versions de l'event.

### 3.2 Reco stock-up: pas de route backend dédiée

`EventPredictStockUpSection.vue` n'importe ni `@/api` ni store (imports `:152-177`: `Card`, `ImageWithFallback`, `StockElementRow`, utilitaires `predictiveAnalytics`, `menuItemExpansion`, `stockPlanning`). `utils/stockPlanning.js` n'importe que `marketPricePackSize` et `menuItemExpansion` (`:5-6`). Aucun endpoint contenant `stock-up` ou `stockup` côté `backend/src/features/**/*.controller.ts` ni côté `frontend/src/api` (grep). Les seules occurrences backend sont le code de permission `front.fb.stockUp` (`backend/src/core/rbac/permission-catalog.ts:75`) et un commentaire dans `logistics/services/recipe-explosion.service.ts:360`. Conclusion: la "reco stock-up" est un calcul 100 % front à partir des props du parent (`configShops` issus de `GET /spaces/:id/shops`, `shopMenuUnavailable` issus du store `shopMenuAvailability`, `predictedTimelineData`, `ingredients`, `components`). Son coût réseau est donc celui de ses sources: sections 3.3 et 3.4.

### 3.3 GET `/space-menu/shop/:shopId/items` (store `shopMenuAvailability`)

Note: la route réelle est `GET /space-menu/shop/:shopId/items` (`space-menus.controller.ts:16`, `:221`), pas `/spaces/:id/space-menu/...`.

| Déclencheur | Front | Backend | Requêtes | Redis | Payload | Coût |
|---|---|---|---|---|---|---|
| `store.dispatch("shopMenuAvailability/fetchForShop")` par PdV (`EventPredictView.vue:4603`, boucle sur les PdV de la config, détail de la boucle non relu), aussi `SpaceRestockView.vue:5015` | `api/endpoints/menu.api.js:543-552`; store `store/modules/shopMenuAvailability.js:99-119`: TTL 15 min (`:22`), single-flight par clé `shopId::configId` (`:27`, `:103`), clé de cache PAR PdV | `space-menus.controller.ts:295-308` puis `space-menu-availability.service.ts:313-385` (`getShopAvailableMenuItems`) puis `getItemsWithAvailabilityForSpace` (`:54-298`) | (1) `spaceElement.findFirst` avec 4 relations + `menuAssignments` (`:324-340`), (2) `assertCanAccessSpace` (`:348`, requêtes non lues), (3) 8 requêtes en `Promise.all` (`:66-146`) toutes tenant-wide: `menuItem` de l'espace avec 8 sous-relations, `ingredient`, `packaging`, `menuComponent` avec relations, `marketPrice`, `supplier`, `getTenantDefaultVatRate`, ET UN SECOND `menuItem.findMany` du tenant entier (`:135-145`, `comboSourceMenuItems`) | Aucun | Une ligne par item associé à l'espace (id, nom, `picture`, type, catégorie, `seasonIds`, prix, `missingIngredients`, `enabled`, `assigned`). Centaines de lignes par PdV (estimation), `picture` potentiellement lourd | Haut quand N PdV |

Le résultat de `getItemsWithAvailabilityForSpace` dépend de (tenant, espace) seulement; seuls `enabled` et `assigned` dépendent du PdV (`:366-372`). Or il est recalculé pour CHAQUE PdV d'un même espace, avec les 8 mêmes requêtes tenant-wide, sans cache (ni Redis ni mémoire). Pour un event de 30 PdV, 30 × 8 = 240 requêtes lourdes + 30 × `spaceElement.findFirst`, au lieu de 8 + 30. Le route frère `GET /space-menu/space/:spaceId/items` (`space-menus.controller.ts:459`, appelle `getSpaceMenuItems` `:392-405`) renvoie exactement le calcul sans état par PdV, mais ne porte pas `enabled`.

### 3.4 GET `/spaces/:id/shops` (store `spaceShops`, `fetchForSpace`)

| Élément | Constat (preuve) |
|---|---|
| Front | `store/modules/spaceShops.js:3` TTL 15 min, `:6-9` single-flight par clé, `:33-54` `fetchForSpace`, clé = spaceId + configId (`:12`). `api/endpoints/space.api.js:105-115` (`getSpaceShopList`) |
| Backend | `space-shops.controller.ts:90-98` puis `space-shops.service.ts:45-99` |
| Redis | Oui. Clé `SPACE_SHOPS_CACHE_KEY(tenantId, spaceId)` suffixée `:configId` (`space-shops.service.ts:50-54`), TTL 30 s (`space-cache.service.ts:16`). Hit renvoyé sans requête (`:53-54`) |
| SQL | UNE seule requête brute `spaceShopsPayload` (`spaces.queries.ts:5-125`): CTE `target_configs`, 4 branches `UNION ALL` (floor, forecourt, externalMerch, zone), puis `enriched` avec, PAR LIGNE, deux sous-requêtes sur `WeezeventLocationShopMapping` (valeur + EXISTS, `:90-100`) et un `LEFT JOIN LATERAL COUNT(*)` sur `MenuAssignment` (`:104-109`), puis `json_agg`. Bien pensé (1 aller-retour, voir commentaire `space-shops.service.ts:35-43`) |
| Index | `SpaceElement (floorId,type)`, `(forecourtId,type)`, `(zoneId,type)`, `externalMerchId` (`schema.prisma:1021-1027`); `MenuAssignment (elementId,enabled)`, `unique(elementId,menuItemId,configId)`, `configId` (`:2684-2687`); `WeezeventLocationShopMapping_spaceElementId_idx` (`migrations/20261009150000_fk_indexes_and_drop_redundant/migration.sql:25`); `ConfigurationElement` PK `(configId, elementId)` + index `elementId` (`schema.prisma:926-927`). Aucun manque évident |
| Payload | Colonnes `image` et `notes` de `SpaceElement` incluses dans chaque ligne (`spaces.queries.ts:15`, `:25`, `:34`, `:62-63`). Taille de `image` (URL ou data URL): non vérifié. Sans `configId`, UNE LIGNE PAR (élément, config) (`spaces.queries.ts:46-58`): un espace à K configs sert K fois chaque PdV partagé; les consommateurs refiltrent côté client (commentaire BUG-286-01, `:50-52`) |
| Écriture dans un GET | Non |

### 3.5 historyAliases

| Endpoint | Contrôleur / service | SQL | Cache | Constat |
|---|---|---|---|---|
| GET `/menu-item-history-aliases?spaceId=` | `history-aliases.controller.ts:30-37` (permission `menu.events.manage`) puis `history-aliases.service.ts:18-25` | `menuItemHistoryAlias.findMany({ where: { tenantId, spaceId }, orderBy createdAt desc })`, sans `select` | Aucun Redis. Front: `store/modules/historyAliases.js:12` TTL 15 min par spaceId (`:56-59`) | Une ligne par alias: petit. Index: `unique(tenantId, spaceId, sourceName)` (`schema.prisma:3779`) sert le préfixe (tenantId, spaceId); `index(targetMenuItemId)` (`:3780`). Pas de N+1. Coût bas |
| POST (upsert) | `service.create` `:27-82` | `assertSpaceInTenant`, `menuItem.findFirst`, 2 `findFirst` parallèles, `upsert`: 5 requêtes, 3 séquentielles puis 1 | n/a | Action utilisateur, coût bas |
| DELETE | `service.remove` `:84-91` | `findFirst` puis `delete` | n/a | Bas |

Note: le GET est protégé par `menu.events.manage` (`history-aliases.controller.ts:31`), alors que le GET des versions n'a aucune permission (`predict-versions.controller.ts:41`). Un utilisateur qui voit Event Predict sans ce droit reçoit un 403 sur la liste d'alias: comportement front non vérifié.

### 3.6 Génération de staffing (POST `/events/:id/staffing/generate`)

`staffing/services/staffing-generation.service.ts:53-322` (334 lignes). Séquence:
1. `getEventContext` (`:59`), `resolveSettings` (`:60`), `loadHrContext` (`:69`), `resolvePredictedRevenueByElement` si pas de CA fourni dans le corps (`:75`; lit `EventPredictVersion.predictedRecords` de la version par défaut, `staffing-context.service.ts:114-130`, citation du rapport 04). Tous séquentiels (`await` à la suite).
2. `spaceElement.findMany` avec `include performances` et `menuItemSalesInputs` filtrés par config (`:77-88`), puis `eventStaffLine.findMany({ where: { eventId } })` toutes colonnes (`:90`).
3. Boucle sur les PdV (`:109`): le calcul est en mémoire (aucun appel Prisma dans la boucle hors transaction, vérifié par grep des `await`), mais chaque PdV déclenche sa propre `$transaction([deleteMany, createMany, elementPerformance.upsert])` AWAITÉE en série (`:296-312`, commentaire "transaction courte par élément (pooler)").
4. Fin: `staffingService.getStaffing(...)` (`:322`), qui refait le contexte et la lecture complète (les ~6 requêtes décrites dans le rapport 04, section 3.1).
Coût: environ 8 requêtes de préparation, N transactions séquentielles (chacune: BEGIN, 2 à 3 instructions, COMMIT) pour N PdV, puis ~6 requêtes. Le commentaire `space-shops.service.ts:37-39` mentionne ~1 à 2 s par aller-retour vers le pooler (affirmation du code, non mesurée ici): ordre de grandeur de plusieurs secondes par dizaine de PdV (estimation). Action explicite de l'utilisateur, donc pas sur le chemin critique d'ouverture, mais bloque l'UI (`saving`).

## 4. Cascade au premier affichage (côté backend)

Ce qui suit ne couvre que les endpoints de ce rapport; l'ordre exact des appels du parent est traité par un autre agent.
- t0: `GET /events/:id/predict-versions` (`useEventPredictVersions.js:338`, tableau complet avec les 6 colonnes Json de chaque version) en parallèle de `GET /spaces/:id/shops` (Redis 30 s, 1 SQL) et `GET /menu-item-history-aliases` (petit, store 15 min).
- t1: pour chaque PdV de la config, `shopMenuAvailability/fetchForShop` (`EventPredictView.vue:4603`): chaque appel = 1 `spaceElement.findFirst` + 8 requêtes tenant-wide (3.3). Appels groupés en parallèle ou en série: non vérifié (boucle `:4590-4610` non relue); le single-flight du store ne dédoublonne que la même clé PdV.
- Chemin critique backend le plus lourd: N × 8 requêtes tenant-wide identiques (3.3). Le Live ajoute 2 GET de la liste complète de versions pour une même version par défaut (`useLivePredictBackground.js:25`, `useLiveHr.js:51`), dédoublonnage non vérifié.

## 5. Problèmes de performance (backend)

1. `GET /events/:eventId/predict-versions` renvoie toutes les colonnes de toutes les versions (`predict-versions.service.ts:13-18`, aucun `select`), alors que 5 lecteurs sur 6 n'utilisent que la version par défaut et une colonne (`useLivePredictBackground.js:25-27`: `predictedTimeline`; `useLiveHr.js:51-54`: `predictedRecords`). Poids: `predictedRecords` = un enregistrement par (PdV, article) (`predict-version.dto.ts:74-78`), `predictedTimeline` jusqu'à 4000 points × 3 tableaux (`predicted-timeline-snapshot.ts:34`), plus `eventSnapshot`, `menuConfig`, `quantityAdjustments`, `manualQuantities`. Ordre de grandeur: de la centaine de Ko au Mo par version (estimation, non mesurée). Impact: haut sur Live, Comparaison (une requête par event, `useComparisonPredictScenarios.js:41`), Réarmement, Event Predict. Pages: Live, Comparaison, Restock, Event Predict.
2. Aucun plafond serveur sur la taille des colonnes Json ni sur le nombre de versions par event: seul `bodyLimit` global de 5 Mo (`backend/src/main.ts:23-24`); le DTO n'a ni `ArrayMaxSize` ni limite sur `menuConfig` / `quantityAdjustments` (`predict-version.dto.ts:56-78`); `create` n'a pas de plafond de nombre (`predict-versions.service.ts:51-81`). Une liste peut donc croître sans borne. Impact: moyen, croissant avec le temps.
3. Pré-lecture de ligne entière pour un simple contrôle d'appartenance: `findById` (`:43-49`, sans `select`) est appelé par `patch` (`:84`), `removeById` (`:103`), `setDefault` (`:118`), qui lisent donc les 6 colonnes Json pour ne tester que l'existence. Ensuite `update` et `create` renvoient la ligne entière (`:59`, `:99`). Une sauvegarde de version = lecture entière + écriture + retour entier. Impact: moyen (fréquence des PATCH non vérifiée).
4. Aucune mise en cache Redis de la liste ni de la version par défaut, alors que toutes les écritures passent par un seul service (`predict-versions.service.ts`), ce qui rend l'invalidation simple. Impact: moyen. (Exception: `staffing-context.service.ts:114-130` lit la table directement.)
5. `getItemsWithAvailabilityForSpace` est recalculé pour chaque PdV d'un même espace, avec 8 requêtes tenant-wide (3.3): `menuItem` de l'espace avec 8 sous-relations (`space-menu-availability.service.ts:76-103`), `ingredient`, `packaging`, `menuComponent` avec relations, `marketPrice`, `supplier` (`:104-129`), et un SECOND `menuItem.findMany` du tenant entier avec 4 sous-relations (`:135-145`, utile seulement aux combos). Ni Redis ni mémoire. Impact: haut pour un event à nombreux PdV.
6. Calcul indépendant du PdV mais dans une réponse par PdV: seuls `enabled` / `assigned` varient (`:366-372`). La liste d'items (avec `picture`, `missingIngredients`) est donc renvoyée N fois. Impact: moyen (réseau et parsing).
7. `GET /spaces/:id/shops` sans `configId` multiplie les lignes par le nombre de configs et embarque `image` et `notes` (`spaces.queries.ts:15`, `:46-58`). Impact: bas à moyen (le cache Redis 30 s et le store 15 min amortissent). Le consommateur Event Predict passe-t-il `configId`: non vérifié.
8. `generate` staffing: N transactions séquentielles (3.6, `staffing-generation.service.ts:296-312`), lectures de préparation séquentielles (`:59-90`), et relecture complète finale via `getStaffing` (`:322`). Impact: moyen (action utilisateur, UI bloquée).
9. `setDefault` n'impose pas que la version cible appartienne à l'event de l'URL: `findById(versionId, tenantId)` vérifie le tenant seulement (`predict-versions.service.ts:118`), alors que `updateMany` met à `false` les versions de `eventId` (`:109-112`) et `update` met à `true` la cible par id (`:120-123`). Une version d'un autre event du même tenant serait promue sans retirer son défaut précédent. Pas un problème de performance, signalé car trouvé en lisant (impact: correction, bas).
10. Pas de N+1 trouvé dans les endpoints lus: tous les référentiels sont chargés en `Promise.all` puis résolus en mémoire (`space-menu-availability.service.ts:64-146`, commentaire `:64-65`). Le coût vient du volume tenant-wide répété, pas des allers-retours.
11. Points sans problème: `GET /predict-versions/summary` ne lit que `eventId` avec plafond 500 (`predict-versions.service.ts:27-41`) et index `(tenantId, eventId)` (`schema.prisma:3753`). `historyAliases` est léger (3.5).

## 6. Recommandations

Backend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Ajouter `GET /events/:eventId/predict-versions/default?fields=timeline,records` (ou `?view=meta` pour la liste) ne lisant qu'UNE ligne et les colonnes demandées (`select`); migrer Live (`useLivePredictBackground`, `useLiveHr`), Réarmement (`usePredictedNeed`) et Comparaison | Divise le payload Live/Comparaison/Réarmement par un facteur égal au nombre de versions et aux colonnes inutiles (estimation) | Bas côté backend (nouvelle route, aucune existante modifiée; pas de collision, le contrôleur n'a pas de `:versionId`, `predict-versions.controller.ts:41-84`). Moyen côté front (5 sites d'appel) | M | `predict-versions.controller.ts`, `predict-versions.service.ts`, `frontend/src/api/endpoints/eventPredict.api.js`, 5 composables |
| `findById` avec `select: { id: true, eventId: true }` pour `patch`, `remove`, `setDefault`; `update`/`create` avec `select` minimal si le front n'utilise pas la ligne retournée (vérifier `useEventPredictVersions.js` avant) | Retire 1 lecture entière par sauvegarde | Moyen: le front peut lire la réponse de POST/PATCH (commentaire `eventPredict.api.js:3-11` indique qu'il l'utilise) | S | `predict-versions.service.ts:43-49`, `:59`, `:99` |
| Cache Redis court de la version par défaut et de la liste (clé `tenant:event`, TTL 30 à 60 s), invalidé dans `create`, `patch`, `removeById`, `setDefault` | Absorbe les relectures Live (reload au retour de page) | Bas à moyen: la lecture directe de `staffing-context.service.ts:114-130` reste hors cache (lecture seule, sans impact) | S | `predict-versions.service.ts`, `core/redis` |
| `setDefault`: refuser (404) si `version.eventId !== eventId` | Correction | Bas | S | `predict-versions.service.ts:118` |
| Garde-fous techniques: `ArrayMaxSize` sur `predictedRecords`, limite de taille sur les objets Json. Un plafond du NOMBRE de versions par event est une règle métier: à demander à Bertrand, ne pas l'inventer | Borne la croissance | Moyen: peut refuser une sauvegarde légitime si mal calibré | S | `dto/predict-version.dto.ts` |
| Mutualiser le calcul de disponibilité par (tenant, espace): promesse en vol + cache mémoire ou Redis TTL 30 s, clé `tenant:space`; `getShopAvailableMenuItems` ne garde par PdV que `spaceElement.findFirst` + fusion `enabled/assigned` | De 9N à 8 + N requêtes pour N PdV du même espace | Moyen: obsolescence ≤ TTL après modification d'ingrédient, fournisseur ou composant (le store front garde déjà 15 min, `shopMenuAvailability.js:22`) | M | `space-menu-availability.service.ts:54-146`, `:313-385` |
| Endpoint groupé `GET /space-menu/space/:spaceId/items?configId=` renvoyant la liste UNE fois plus `enabledByShop: { [shopId]: ids[] }`; le store remplit les N clés d'un coup | N requêtes HTTP → 1, N listes identiques → 1 | Moyen à élevé: refonte du store et de l'appelant (`EventPredictView.vue:4603`, `SpaceRestockView.vue:5015`) | L | `space-menus.controller.ts:459`, `space-menu-availability.service.ts`, `store/modules/shopMenuAvailability.js`, `menu.api.js` |
| Supprimer le second `menuItem.findMany` tenant-wide (`:135-145`): ne charger que les enfants de combo manquants (`id in childIds`) en une requête supplémentaire, et seulement s'il existe des combos | Retire 1 des 8 requêtes lourdes quand l'espace n'a pas de combo | Moyen: récursion combo à conserver (`collectMenuItemComboIssues`, `:221-250`) | M | `space-menu-availability.service.ts:135-145` |
| `generate` staffing: accumuler `deletableIds`, `creations` et upserts de tous les PdV puis UNE `$transaction` (un `deleteMany`, un `createMany`, upserts regroupés); passer le contexte déjà résolu à `getStaffing` au lieu de le recalculer; `Promise.all` pour `resolveSettings`, `loadHrContext`, `spaceElement.findMany`, `eventStaffLine.findMany` | De N transactions à 1; ~3 requêtes de préparation au lieu de ~8 séquentielles | Moyen: atomicité tout-ou-rien au lieu de par PdV (plutôt un gain); conserver les warnings par PdV | M | `staffing-generation.service.ts:59-90`, `:296-312`, `:322` |
| `GET /spaces/:id/shops`: retirer `image` et `notes` de la liste si les consommateurs ne s'en servent pas (grep des usages d'abord); côté Event Predict toujours passer `configId` | Allège la réponse | Moyen: usages de `image` non recensés | S | `spaces.queries.ts:15-63`, `space-shops.service.ts:67-94` |

SQL / index: aucun index manquant identifié pour les requêtes lues. Candidats à valider par EXPLAIN: `MenuItem` filtré par `spaceAssociationWhere` (`space-menu-scope.service.ts`, non lu), `Packaging` (index non relevés), tri `isDefault desc, createdAt desc` des versions (ensemble par event petit, index inutile tant que le nombre de versions reste faible).

Frontend (complément du rapport 04): lire la version par défaut via la nouvelle route; ne pas appeler deux fois la liste dans le Live (`useLivePredictBackground` et `useLiveHr` visent la même version par défaut): partager une promesse ou un store.

## 7. Points non vérifiés

- Tailles réelles des colonnes Json de `EventPredictVersion` en production, nombre de versions par event, taille de `SpaceElement.image` et `MenuItem.picture` (URL ou data URL).
- Boucle d'appels `fetchForShop` du parent (`EventPredictView.vue:4590-4610`): parallèle ou série, nombre de PdV par event.
- `SpaceMenuScopeService.spaceAssociationWhere` (`space-menu-scope.service.ts`), `SpaceAccessService.assertCanAccessSpace` (requêtes éventuelles à chaque appel), `JwtDatabaseGuard` (lookup en base à chaque requête?).
- Si Prisma exécute `distinct: ['eventId']` en base ou en mémoire (version Prisma et preview `nativeDistinct`): sans conséquence tant que seule la colonne `eventId` est lue.
- Fréquence des PATCH de versions (autosave?) et usage de la réponse de POST/PATCH par `useEventPredictVersions.js`.
- Si `EventPredictView` appelle `GET /spaces/:id/shops` avec `configId`; usages de `image` / `notes`.
- `staffing-generation.service.ts:109-284` (boucle de calcul): lue seulement par grep des `await`; `getStaffing` et `getEventContext` non relus dans cette passe (voir rapport 04).
- Aucune mesure EXPLAIN ni durée réelle; toutes les durées citées viennent des commentaires du code.

