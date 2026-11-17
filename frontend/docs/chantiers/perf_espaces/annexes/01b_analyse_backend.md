# Page Analyse, côté backend hors shop-details / event-timeline / transaction-baskets (rapport perf, partie 01b)

Statut: PARTIEL. Lus: spaces, configurations, events, analyse (event-costs, article-dimensions), menu-items, product-types,
product-categories, weezevent/products. NON lus (budget): mappings/product-menu, seasons, market-prices, config shop context,
météo, comparaison, rapport J+1, et `/preferences` (hors dépôt). Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires
du code, aucune n'est mesurée. Ce qui n'est pas lu est marqué "non vérifié".

## 1. Fiche du périmètre

Les endpoints suivants sont ceux appelés par la page Analyse (liste du rapport frontend `01_analyse_orchestration.md`,
tableau 3). Contrôleurs repérés:

| Endpoint | Contrôleur | Preuve |
|---|---|---|
| GET `/spaces/:id` | `SpacesController` | `backend/src/features/spaces/spaces.controller.ts:26` |
| GET `/spaces/:id/configurations` | à localiser | à compléter |
| GET `/events` | `EventsController` | `backend/src/features/events/events.controller.ts:25` |
| GET `/analyse/...` (event-costs, article-dimensions) | `AnalyseController` | `backend/src/features/analyse/analyse.controller.ts:18` |
| GET `/menu-items`, `/product-types`, `/product-categories` | `menu-items.controller.ts` | lignes 40, 417, 477 |
| GET `/weezevent/products` | `WeezeventController` | `backend/src/features/weezevent/weezevent.controller.ts:19` |
| GET `/mappings/product-menu` | `MappingsController` | `backend/src/features/mappings/mappings.controller.ts:33` |
| GET `/preferences` | AUCUN contrôleur NestJS. Voir constat ci-dessous | `frontend/src/utils/api.js:5` |
| seasons, market-prices | `SeasonsController`, `MarketPricesController` | `seasons.controller.ts:35`, `market-prices.controller.ts:30` |

Constat sur `/preferences`: `getUserPreferences` passe par `frontend/src/utils/api.js`, dont `baseUrl` vaut
`https://${projectId}.supabase.co/functions/v1/make-server-eb31619c` (`frontend/src/utils/api.js:5`). Ce n'est donc PAS le
backend NestJS: c'est une Edge Function Supabase. Le dépôt ne contient que `backend/supabase/functions/health` et
`send-supplier-email`; aucune fonction `make-server-eb31619c` ni aucune occurrence de "preference" dans `backend/src`
(grep insensible à la casse, aucun résultat) ni dans `backend/prisma/schema.prisma`. Le code serveur de cet endpoint est donc
hors dépôt, non vérifié.

Chaîne de garde commune à tous les contrôleurs listés: `JwtDatabaseGuard` (stratégie `jwt-db`) puis `RolesGuard`, plus
`SpaceAccessGuard` (`backend/src/core/auth/guards/space-access.guard.ts`, 66 lignes). La stratégie fait un lookup
utilisateur avec cache local en mémoire 15 s puis Redis `auth:user:<id>` 60 s, avec dédup en vol et verrou Redis
(`backend/src/core/auth/strategies/jwt-db-lookup.strategy.ts:35`, `:75-115`). Le guard d'espace n'a aucun coût DB pour les
comptes à accès complet (commentaire `space-access.guard.ts:25`); pour un compte restreint, `canAccessSpace` n'a pas été lu.
Redis: sérialisation `JSON.stringify` / `JSON.parse` sans compression (`backend/src/core/redis/redis.service.ts:103-128`).
Prisma est configuré avec `driverAdapters` et SANS `relationJoins`: chaque `include` de relation devient une requête SQL
supplémentaire (`backend/prisma/schema.prisma:15-19`, grep `relationLoadStrategy` dans `backend/src`: aucun résultat). Le code
cite lui-même "chaque round-trip Postgres coûte ~1s de latence réseau" (`space-configuration.service.ts:26`, commentaire).

## 2. Arbre des composants (côté serveur)

Pas applicable (page front). Équivalent backend: voir le tableau 3, une ligne par endpoint, avec contrôleur puis service.

## 3. Appels API, endpoint par endpoint

### 3.1 GET `/spaces/:id` (phase 1, bloque le premier rendu)

- Contrôleur: `spaces.controller.ts:218-298` (`findOne`), service `SpaceCrudService.findOne`
  (`backend/src/features/spaces/services/space-crud.service.ts:281-377`).
- Cache Redis: clé `spaces:detail:<spaceId>`, TTL 120 s (`space-cache.service.ts:15-16`, `:23-24`). Lecture avant tout accès
  DB, hit accepté si `cached.tenantId === tenantId` (`space-crud.service.ts:282-286`). La rédaction des champs financiers se
  fait APRÈS lecture du cache (`redactSpaceFinancials`).
- Sur MISS, trois lectures séquentielles: (1) `space.findFirst` avec `select` large incluant `configs[]` avec `data: true`
  (le JSON complet floors/forecourt/externalMerch de CHAQUE config, `space-crud.service.ts:322-346`, commentaire "Include full
  configuration data") et `_count` sur `pinnedByUsers` et `userAccess`; (2) `fetchZoneElementsForSpace`
  (`space-zone-elements.service.ts:281-289`): `spaceElement.findMany` sur toute l'espace avec `include: { zone: true,
  configurationElements: { select: { configId } } }`, sans pagination ni `select` des colonnes d'élément; (3) fusion en
  mémoire des éléments dans `configs[].data` pour CHAQUE config (`mergeZoneElementsIntoConfigData`, `space-crud.service.ts:361-370`,
  copie des tableaux `floors/elements` par config). Prisma exécute en outre les sous-requêtes `configs` et `_count` séparément
  (pas de `relationJoins`), donc 4 à 5 requêtes SQL sur un MISS.
- Payload: non mesuré. Il dépend du nombre de configs et d'éléments par config, car `configs[].data` est renvoyé en entier et
  s'y ajoutent les éléments des Zones (builder v2) fusionnés dans chaque config. Le champ `image` est aussi renvoyé (le mode
  `?light=true` ne le retire qu'en sortie, après le coût DB et Redis, `spaces.controller.ts:281-296`); le front n'envoie pas
  `light` (non vérifié). Format de `image` (URL ou base64): non vérifié.
- Même cache Redis pour les 2 cas (cache stocke l'objet complet, `JSON.stringify` de tout `configs[].data`), donc le coût de
  parse JSON d'un gros espace est payé aussi sur un HIT.

### 3.2 GET `/spaces/:id/configurations` (phase 1, bloque le premier rendu)

- Contrôleur: `spaces.controller.ts:342-374`, service `SpaceConfigurationService.getConfigurations`
  (`backend/src/features/spaces/services/space-configuration.service.ts:25-70`).
- Cache Redis: `spaces:configs:<tenantId>:<spaceId>`, TTL 30 s (`space-cache.service.ts:17`, `:30-31`).
- MISS: un seul `config.findMany` avec `select` léger (id, name, capacity, isSystem, dates) et `_count` floors/stations;
  le commentaire précise "Don't include full data here" (`space-configuration.service.ts:55`). Léger. Mais redondant avec
  le point 3.1 qui renvoie déjà `configs[]` (avec `data`), voir problème 4.
- Payload: petit (liste de configs sans JSON de plan).

### 3.3 GET `/events?spaceId=&limit=200&excludeSimulated=true` (phase 1, bloque le premier rendu)

- Contrôleur: `events.controller.ts:25`, route `GET` à `:40-66` (`findAll`, appel service `:60`), service `EventsService.findAll`
  (`backend/src/features/events/events.service.ts:320-356`).
- AUCUN cache Redis (aucun appel `redis` dans `findAll`, `events.service.ts:320-356`).
- Requêtes: `event.findMany({ where: { tenantId, spaceId, isSimulated: false }, orderBy: { eventDate: 'desc' }, include:
  includeRelations, take: 200 })` plus `event.count(where)` en parallèle (`:343-352`). `includeRelations` = `eventType`,
  `eventCategory`, `eventSubcategory`, `visitingTeam` (relations complètes, pas de `select`) et `integration {id,name}`
  (`events.service.ts:42-52`). Sans `relationJoins`, cela fait 1 requête principale + jusqu'à 5 requêtes `IN (...)` pour les
  relations + 1 `count`, soit 7 requêtes SQL pour une page. Le `count` est calculé alors que le front plafonne déjà à 200 et
  n'utilise a priori pas `meta.total` (usage de `meta` côté front: non vérifié).
- Chaque ligne Event porte aussi les colonnes de revenue, météo, `sessions`, noms d'équipes, etc. (`schema.prisma:2828-2930`),
  non réduites par un `select`.
- Index: `Event` a `@@index([tenantId])`, `@@index([spaceId, integrationId])`, `@@index([eventDate])`
  (`schema.prisma:2932-2941`). Il n'y a PAS d'index composite `(tenantId, spaceId, eventDate)` ni couvrant `isSimulated`. Le
  filtre `tenantId + spaceId` puis tri `eventDate desc` se résout donc par l'index `tenantId` (ou `spaceId, integrationId`
  en préfixe) puis tri en mémoire. Coût réel: non vérifié (EXPLAIN à faire).
- Pour un compte restreint à certains espaces, appel supplémentaire `getAccessibleSpaceIds` seulement si `spaceId` absent;
  le front envoie `spaceId`, donc non concerné (`events.service.ts:329-337`).
- Payload: jusqu'à 200 events complets avec 4 relations. Taille non mesurée.

### 3.4 GET `/analyse/:spaceId/event-costs?eventIds=` (par paquets de 100, hors portillon front)

- Contrôleur: `analyse.controller.ts:246-259` (`getEventCosts`, permission `front.fb.analyse`), service
  `EventCostsService.getEventCosts` (`backend/src/features/analyse/event-costs.service.ts:38-60`), puis
  `CostTrackingAsOfService.costsAsOfMany` (`backend/src/features/cost-tracking/services/cost-tracking-as-of.service.ts:61-73`) et
  `CostTrackingSnapshotReaderService.readAsOfMany` (`cost-tracking-snapshot-reader.service.ts:94-149`).
- Cache Redis: AUCUN (aucun `redis` dans ces fichiers).
- Requêtes SQL par appel (ordre): (1) `assertSpaceAccessible` = `space.findFirst` (`space-access.service.ts:55-59`, +
  `canAccessSpace` pour un compte restreint); (2) `event.findMany` des ids demandés (`event-costs.service.ts:43-46`);
  (3) `productMapping.findMany distinct menuItemId` sur TOUT le tenant (`:62-67`); (4) `menuItem.findMany` des articles
  mappés avec `totalCost` non nul (`:70-74`); (5) `space.findFirst` pour le fuseau (`:53`, en parallèle de 3-4);
  (6) lecture `MenuItemCostSnapshot` en raw SQL par lots de 2000 articles (`MANY_BATCH_SIZE = 2000`,
  `snapshot-reader:10`), sans le Json `recipe` (`SNAPSHOT_COLUMNS`, `:26`), puis éventuellement `firstOf` pour le repli.
  Soit 6 requêtes minimum, comme annoncé dans le brief.
- Point fort: la requête (6) lit TOUTES les versions de chaque article jusqu'à l'instant le plus récent (borne basse
  absente: `"effectiveFrom" <= latest`, `:111`), pas seulement la version en vigueur. Le volume croît avec l'historique de
  coûts (une ligne par modification de recette ou de prix de marché, cf. `reason` dans `schema.prisma:2538`). Le filtrage par
  instant se fait ensuite en JS par recherche dichotomique (`:122-134`).
- Les étapes (3) et (4) ne dépendent ni des events ni de l'espace: elles sont REFAITES à chaque paquet de 100 events.
  Elles seraient cachables par tenant.
- Index: `MenuItemCostSnapshot` `(tenantId, menuItemId, effectiveFrom desc)` (`schema.prisma:2545`, migration
  `20261022100000_menu_item_cost_snapshot/migration.sql:23`), `(tenantId, effectiveFrom)`, `(menuItemId)`. La requête (6)
  filtre par `ANY(ids)` + `<= latest` + tri `menuItemId, effectiveFrom, createdAt`: l'index couvre le filtre mais pas
  `createdAt` dans le tri (tri complémentaire). `ProductMapping` (table `WeezeventProductMapping`): index `tenantId`,
  `menuItemId` (`schema.prisma:1761-1764`): le `DISTINCT menuItemId` sur `tenantId` est un parcours de toutes les lignes du
  tenant. EXPLAIN: non fait.
- Payload: pour 100 events x N articles mappés (`{ totalCost, source, versionAt }` par article, `event-costs.service.ts:84-89`).
  Avec 500 articles mappés et 100 events cela fait 50 000 entrées JSON répétant les mêmes clés. Non mesuré.

### 3.5 GET `/analyse/article-dimensions?spaceId=` (au setup, hors portillon, si permission `stats.financial.view`)

- Contrôleur `analyse.controller.ts:197-210`, service `ArticleDimensionsService.getDimensions`
  (`backend/src/features/analyse/article-dimensions.service.ts:79-174`, 221 lignes).
- Cache Redis: AUCUN. Pagination: AUCUNE.
- Requêtes: `menuItem.findMany` de TOUS les articles de l'espace (filtre `spaceLinks.some`, `:83-86`) avec un `select`
  profond: `brand`, `spaceLinks`, `ingredients -> ingredient -> marketPrice -> supplierRel / industrial`, `packagings -> ...`
  (même profondeur), `components`, `comboChildren`, `promotion -> promotionType` (`:48-72`, `MP_SELECT` `:38-45`). Sans `relationJoins`, Prisma
  exécute une requête par niveau de relation (plus d'une dizaine de requêtes avec de gros `IN (...)`). Puis jusqu'à 3 tours de
  `findMany` pour les enfants de combos absents (`:90-96`), jusqu'à 6 tours de `menuComponent.findMany` pour le graphe des
  composants (`loadComponentGraph`, `:176-216`, chaque tour avec `ingredients -> ingredient -> marketPrice -> ...` et
  `children`), et un `findMany` pour les prix de référence de promotion (`:108-114`). Au total, plusieurs dizaines de
  requêtes SQL et de la charge CPU Node (calcul de parts industriels et fournisseurs par article) sur le chemin d'une
  réponse, rien n'est mis en cache alors que ces données ne changent qu'à l'édition du catalogue.
- Payload: une entrée par article de l'espace avec parts industriel, coûts fournisseur, promotion, enfants de combo. Taille
  non mesurée.
- Dépendance côté front: lancé au setup (cache module par espace, sans TTL, rapport 01) donc payé une fois par session.

### 3.6 GET `/menu-items?page=1&limit=150&spaceId=` puis pages 2..N (vague 2a)

- Contrôleur `menu-items.controller.ts:70` / `:174-186`, service `MenuItemQueryService.findAll`
  (`backend/src/features/menu-items/services/menu-item-query.service.ts:32-112`). Plafond serveur 500 par page (`:40`).
- Cache Redis: `redis.getOrSet`, clé `menu-items:<tenant>:list:<page>:<limit>:<scope>:<filtres>` (via `TenantListCache`,
  `menu-item-support.service.ts:19`), TTL 3600 s (`menu-item-query.service.ts:59-62`, `:107`). Invalidé à chaque écriture
  d'article (commentaire `:101-106`). Un cache MISS (premier chargement du jour, ou après toute édition de menu) paie le
  coût complet ci-dessous. Le cache est par page: les pages 2..N du front sont des clés distinctes.
- MISS: `menuItem.findMany` + `count` + `getTenantDefaultVatRate`, en parallèle (`:85-95`), avec `include:
  includeRelations` (`menu-item-support.service.ts:30-71`): `kitchen`, `productType`, `productCategory`, `brand`,
  `displayName`, `seasonLinks`, `components -> component` (ligne complète), `ingredients -> ingredient -> marketPrice`,
  `packagings -> packaging -> marketPrice`, `comboChildren -> child` (MenuItem complet), `promotion -> promotionType +
  discountedProduct`, `menuAssignments -> station -> config.spaceId`, `spaceLinks`. Sans `relationJoins` Prisma, chaque
  relation (et chaque sous-relation) est une requête SQL de plus: de l'ordre de 15 à 20 requêtes SQL par page de 150
  (comptage par lecture du `include`, non mesuré).
- Les recettes (ingrédients, emballages, composants, enfants de combo) sont sérialisées dans la réponse pour CHAQUE article,
  alors que la page Analyse n'en consomme que des attributs d'article (nom, type, catégorie, prix, saisons). Le rapport 01
  note que le front sait déjà éviter le catalogue de recettes pour ingrédients et composants (`skipRecipeCatalog`,
  `AnalyseView.vue:2660`) mais pas pour les articles.
- Index: `where tenantId, deletedAt null, spaceLinks some { spaceId }`, tri `name asc` (`:68-70`, `:88`). Index `MenuItem`
  non relus dans le détail (non vérifié); jointure `SpaceMenuItem` cf. commentaire "join indexé" (`:65-67`).
- Le commentaire du front précise que `limit=500` dépassait 60 s sur le backend Render, d'où `limit=150`
  (`frontend/src/api/endpoints/menu-item.api.js:38-42`): signal que ce `include` est le coût dominant d'un MISS.
- Payload: 150 articles avec recette complète par page. Non mesuré.

### 3.7 GET `/product-types` et `/product-categories` (vague 2a)

- Contrôleurs `menu-items.controller.ts:417-440` et `:477-500`, service `ProductTaxonomyService.getProductTypes` /
  `getProductCategories` (`backend/src/features/menu-items/services/product-taxonomy.service.ts:18-43`, `:162-182`).
- Cache Redis: AUCUN. Pagination 200 par page (le front boucle sur les pages, commentaire `:15-18`).
- Requêtes: types = `findMany` (avec `include categories` filtré tenant ou global) + `count`; catégories = `findMany` (avec
  `include type`) + `count`. Soit environ 3 requêtes pour les types (la sous-requête `categories` est la 3e) et 3 pour les
  catégories. Redondance: `product-types` renvoie déjà ses `categories` imbriquées, et `product-categories` renvoie chaque
  catégorie avec son `type` (`:35-38`, `:176`): le front charge deux fois la même arborescence.
- Index: `@@unique([tenantId, name])`, `@@index([name])` pour les types; `@@unique([tenantId, typeId, name])`, `@@index([typeId])`
  pour les catégories (`schema.prisma:2201-2219`). Référentiels petits: coût principalement en allers-retours.

### 3.8 GET `/weezevent/products?catalogSpaceId=` (pages de 500, vague 2a)

- Contrôleur `weezevent.controller.ts:204-218`, service `WeezeventProductCatalogService.getProducts`
  (`backend/src/features/weezevent/services/console/weezevent-product-catalog.service.ts:41-202`).
- Cache Redis: AUCUN (grep `redis|cache` dans ce fichier: aucun résultat).
- CONSTAT MAJEUR: le catalogue COMPLET du tenant est relu à CHAQUE page demandée. `salesProduct.findMany({ where, orderBy:
  { name: 'asc' } })` n'a ni `take`, ni `skip`, ni `select` (`:67`, le commentaire BUG-337-02 `:60-66` le justifie pour
  filtrer `onlySold` avant pagination). La pagination n'est faite qu'APRES, en mémoire: `data.slice(...)` (`:192-193`). Un
  front qui pagine par 500 refait donc N fois la même lecture complète et le même calcul de prix, puis jette tout sauf une
  tranche.
- Pas de `select`: la table `WeezeventProduct` porte des colonnes Json `components`, `variants`, `metadata` et `rawData`
  (obligatoire) (`schema.prisma:1411-1416`). Elles sont lues pour chaque produit, et renvoyées au client (les objets
  `pr` sont renvoyés tels quels via `...pr`, `:149-156`). Taille de `rawData`: non mesurée.
- Branche utilisée par la page (sans `spaceId`, avec `catalogSpaceId`): (1) `locationSpaceMapping.findFirst` pour trouver
  l'intégration de l'espace (`:51-57`); (2) lecture complète du catalogue; (3) `deriveSalesPrices` pour les produits dont
  `basePrice` est nul ou 0, via `pricing.getModalSalesPrices` (`menu-item-pricing.service.ts:475`, non lu en détail; le
  commentaire annonce "~20ms/100 produits" sur l'index `WeezeventTransactionItem_productId_idx`, `:30-31`, commentaire);
  (4) `getTenantDefaultVatRate`; (5) `withPricing` en JS sur chaque produit. Pas de cache sur (3): chaque page recalcule le
  prix modal des produits sans prix (les produits F&B ont `basePrice` nul d'après le commentaire `:166-169`, donc potentiellement
  la majorité du catalogue).
- Index `WeezeventProduct`: `@@unique([tenantId, integrationId, externalId])`, `@@index([integrationId])`, `[externalId]`,
  `[nature]`, `[subnature]`, `[productType]`, `[tenantId, provider]` (`schema.prisma:1432-1439`). Le filtre
  `tenantId + integrationId` est servi par l'unique composite (préfixe) ou `integrationId`. Le tri `name asc` se fait en
  mémoire/tri. EXPLAIN non fait.
- Garde-fou côté front noté par le rapport 01: un essai avec `spaceId` annulait la requête après plus d'une minute
  (`useSpaceData.js:229-234`), ce qui est cohérent avec la cascade de prix annoncée "ATTENTION coûteux" dans
  `weezevent.controller.ts:208`.

### 3.9 Endpoints NON LUS (arrêt de lecture imposé par le budget)

Les endpoints suivants n'ont pas été ouverts. Seuls les chemins de contrôleurs sont connus, tout le reste est "non vérifié".

| Endpoint | Ce qui est connu | Ce qui manque |
|---|---|---|
| GET `/mappings/product-menu` (pages de 200) | `MappingsController` `backend/src/features/mappings/mappings.controller.ts:33`, services `mappings/services/product-mapping.service.ts`. Le front le charge pour tout le tenant (rapport 01) | requêtes, includes, cache, index, taille |
| GET `/preferences` | Hors NestJS: Edge Function Supabase `make-server-eb31619c` (`frontend/src/utils/api.js:5`), code absent du dépôt | latence, cold start Deno, accès KV ou table |
| `seasons/fetchAll` | `SeasonsController` `backend/src/features/seasons/seasons.controller.ts:35` (69 lignes), `seasons.service.ts` | service, cache |
| market-prices (`inventory/loadMarketPrices`) | `MarketPricesController` `backend/src/features/market-prices/market-prices.controller.ts:30` (248 lignes), `market-prices.service.ts` | requêtes, pagination, cache, taille (commentaire front "~60 s à froid") |
| config shop context (`getConfigShopMenuItemsLight`) | défini dans `space-menus` (non lu); `GET /configurations/:id` existe `configurations.controller.ts:76` et appelle `getConfiguration` `space-configuration.service.ts:73-115` (vu en grep: lit `config.findFirst` puis `floor.findMany({ include: { elements: true } })` `:111-113`) | coût du contexte PdV, cache |
| météo (`events/weather`) | fichiers `event-weather.service.ts`, `event-weather.cron.ts` (job de nuit à J+1 d'après le schéma, `schema.prisma` bloc météo de `Event`) | la météo est une colonne de `Event`, donc comprise dans GET /events; aucun appel réseau externe à l'ouverture de la page n'a été constaté ni cherché |
| comparaison, rapport J+1 | `analyse/report-layout/` (répertoire), `analyse.controller.ts:261` route `:spaceId/report-layouts/:kind` | non lus |

## 4. Cascade au premier affichage (vue serveur)

Reprend la chronologie du rapport 01 (t3 à t5) avec les coûts serveur lus ici. Aucune durée mesurée.

- t3 `/preferences`: Edge Function Supabase, hors NestJS, non lue.
- t4/t5 phase 1: GET `/spaces/:id` (HIT Redis 120 s sinon 4-5 requêtes SQL avec `configs[].data` complet et éléments de
  zones), GET `/spaces/:id/configurations` (HIT 30 s sinon 1 requête légère, redondant avec le précédent) et GET `/events`
  (jamais en cache, ~7 requêtes SQL). C'est la phase 1 qui bloque le premier rendu: son chemin critique côté serveur est le
  plus lent des trois, donc probablement `/spaces/:id` à froid ou `/events` (non mesuré).
- Vague 2a juste après: `/menu-items` (HIT Redis 1 h sinon ~15-20 requêtes SQL par page), `/product-types` et
  `/product-categories` (sans cache), `/weezevent/products` (sans cache, relit tout le catalogue par page),
  `/mappings/product-menu` (non lu).
- Pendant les paquets: `event-costs` (6 requêtes par paquet de 100 events, sans cache) et `article-dimensions` (plusieurs
  dizaines de requêtes, sans cache).
- Tous ces endpoints passent par le même pool Prisma/pg et le pooler: la charge simultanée décrite dans le rapport 01 (une
  dizaine de requêtes à t5) se traduit côté serveur par plusieurs dizaines de requêtes SQL concurrentes. Taille du pool et
  limites: non lues dans cette passe (la mémoire projet signale une saturation du pooler le 09/10, résolue par un correctif
  de pool, sans détail relu ici).

## 5. Problèmes de performance

1. `GET /weezevent/products` relit tout le catalogue (avec les colonnes Json `rawData`, `components`, `variants`,
   `metadata`) et recalcule les prix pour CHAQUE page, puis pagine en mémoire. Preuve:
   `weezevent-product-catalog.service.ts:67` (findMany sans take/select), `:192-193` (slice), `schema.prisma:1411-1416`.
   Aucun cache Redis. Impact: haut dès que le catalogue dépasse une page. Pages: Analyse, tout écran qui charge le catalogue
   Weezevent (wizard de mapping, non traité).
2. `GET /menu-items` renvoie la recette complète de chaque article (ingrédients, emballages, composants, enfants de combo,
   promotion, affectations) alors qu'Analyse n'en lit que des attributs d'article. Preuve:
   `menu-item-support.service.ts:30-71`, `menu-item-query.service.ts:85-95`. ~15-20 requêtes SQL par page sans
   `relationJoins` (`schema.prisma:15-19`). Le cache Redis 1 h masque le coût sauf après chaque édition de menu ou à froid.
   Preuve de gravité: `limit=500` dépassait 60 s (`menu-item.api.js:38-42`, commentaire). Impact: haut à froid, bas à chaud.
3. `GET /analyse/article-dimensions`: aucune pagination, aucun cache, `select` profond sur tous les articles de l'espace,
   boucles jusqu'à 3 puis 6 tours de requêtes, calcul CPU en Node. Preuve: `article-dimensions.service.ts:79-174`, `:176-216`.
   Les données ne changent qu'à l'édition du catalogue. Impact: moyen à haut (CPU + dizaines de requêtes), hors portillon.
4. `GET /spaces/:id` renvoie `configs[].data` complet (plans, floors, éléments des zones fusionnés par config) en plus de
   `image`, et `GET /spaces/:id/configurations` renvoie la même liste de configs en version légère juste à côté, dans la même
   phase 1. Preuve: `space-crud.service.ts:322-346`, `:361-370`, `space-configuration.service.ts:25-70`. Le mode
   `?light=true` retire `image` mais seulement en sortie (`spaces.controller.ts:281-296`). Impact: moyen (taille de payload
   non mesurée), sur le chemin critique du premier rendu.
5. `GET /events`: aucun cache Redis, `include` de 4 relations complètes + `count` inutile pour une page plafonnée, aucun
   index composite `(tenantId, spaceId, eventDate)`. Preuve: `events.service.ts:320-356`, `:42-52`, `schema.prisma:2932-2941`.
   Impact: moyen, sur le chemin critique (phase 1). Les events passés changent peu.
6. `GET /analyse/:spaceId/event-costs`: sans cache; les 2 lectures indépendantes de l'événement (mappings DISTINCT sur le tenant
   et coûts courants) sont refaites à chaque paquet de 100, et la lecture des snapshots n'a pas de borne basse. Preuve:
   `event-costs.service.ts:43-78`, `cost-tracking-snapshot-reader.service.ts:105-113`. Impact: moyen.
7. `/product-types` + `/product-categories`: sans cache, jeux de données qui se recoupent (types avec catégories imbriquées
   et catégories avec type imbriqué). Preuve: `product-taxonomy.service.ts:18-43`, `:162-182`. Impact: bas (petits
   référentiels, ~6 requêtes).
8. `/preferences` est une Edge Function hors du backend (donc hors cache Redis, hors logs NestJS), appelée en séquentiel
   avant tout (rapport 01, problème 1). Preuve: `frontend/src/utils/api.js:5`. Impact: haut côté chemin critique, cause non
   vérifiée (cold start Edge, accès base).
9. Prisma sans `relationJoins`: tous les `include` sont éclatés en requêtes séparées, et le code cite ~1 s de latence par
   round-trip Postgres. Preuve: `schema.prisma:15-19`, `space-configuration.service.ts:26` (commentaire). Multiplicateur
   transverse des points 2, 3, 4 et 5. Impact: haut (transverse).

## 6. Recommandations

### Backend (code)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| `getProducts`: paginer en base ou mettre en cache Redis le catalogue résolu par (tenant, intégration, onlySold), invalider à la fin d'un sync produits; ajouter un `select` sans `rawData`/`components`/`variants`/`metadata` | Supprime N relectures du catalogue complet et réduit fortement le payload | Un consommateur du front lit peut-être `rawData` (à grepper avant) | M | `weezevent-product-catalog.service.ts:67`, `:192-193`, `weezevent.controller.ts:204` |
| `GET /menu-items`: ajouter un mode léger (`?view=light`) sans recettes pour Analyse, ou un `select` restreint | Divise le nombre de requêtes SQL et le payload du MISS | Nouveau contrat à documenter; Analyse doit vérifier qu'elle n'utilise pas les recettes | M | `menu-item-query.service.ts:85-95`, `menu-item-support.service.ts:30-71`, `menu-item.api.js` |
| `article-dimensions`: cache Redis par (tenant, espace), TTL court plus invalidation à l'édition du catalogue; ou calcul incrémental | Sort des dizaines de requêtes du chemin de chaque session | Invalidation à brancher sur les écritures de menu items, composants, prix de marché | M | `article-dimensions.service.ts:79-174`, `menu-item-support.service.ts` (invalidateCache) |
| `GET /spaces/:id`: ne plus renvoyer `configs[].data` quand le front n'en a pas besoin (variante légère), ou supprimer l'appel `/configurations` en réutilisant `configs[]` | Un aller-retour de moins dans la phase 1 critique et un payload plus petit | Le front de Analyse peut lire `data` (à vérifier avant) | S à M | `space-crud.service.ts:281-377`, `useSpaceData.js:124-150` |
| `GET /events`: cache Redis par (tenant, espace, page) TTL 60 s invalidé aux écritures d'event; retirer le `count` quand `limit` est atteint; `select` des relations | Phase 1 sans accès DB sur HIT | Fraîcheur des events du jour (live) | S | `events.service.ts:320-356` |
| `event-costs`: cacher par tenant la liste des articles mappés et leurs coûts courants (TTL 60 s), ou fusionner les paquets en un seul appel | Retire 2 requêtes sur 6 par paquet | Coût courant légèrement ancien | S | `event-costs.service.ts:62-78` |
| Activer `relationLoadStrategy: 'join'` (preview `relationJoins`) sur les `include` lourds de menu-items et events | Moins d'allers-retours par page | Changement transverse, à tester sur toutes les lectures concernées | L | `schema.prisma:15-19`, services concernés |
| `product-types`: ne pas imbriquer les catégories si le front charge aussi `product-categories` (ou l'inverse) | Moins de lignes lues et sérialisées | Autres consommateurs du contrat | S | `product-taxonomy.service.ts:18-43`, `:162-182` |

### SQL / index (à valider par EXPLAIN avant, rien n'a été mesuré)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Index `Event (tenantId, spaceId, eventDate DESC)` | Tri et filtre de `GET /events` servis par un seul index | Écriture légèrement plus lente | S | nouvelle migration, `schema.prisma:2932-2941` |
| Vérifier `WeezeventProductMapping` pour `DISTINCT menuItemId` par tenant (index `(tenantId, menuItemId)`) | Évite le parcours complet du tenant dans `event-costs` | Faible | S | `schema.prisma:1761-1764` |
| Vérifier les index de `MenuItem` (tenantId, deletedAt, name) et de la jointure `SpaceMenuItem (spaceId)` | Tri `name asc` et filtre `spaceLinks some` | À mesurer | S | `schema.prisma` (non relu ici) |

### Frontend lié aux constats backend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Ne pas boucler sur les pages de `/weezevent/products` tant que le serveur relit tout le catalogue: demander une seule page avec `perPage` suffisant | Une lecture au lieu de N | Page plus grosse | S | `useSpaceData.js:235`, `weezevent.controller.ts:204` |
| Éviter `/configurations` si `/spaces/:id` renvoie déjà les configs | Une requête de moins en phase 1 | Cache `configs` du store | S | `useSpaceData.js:124-150` |

## 7. Points non vérifiés

- `GET /mappings/product-menu`, `seasons`, `market-prices`, `getConfigShopMenuItemsLight` (`space-menus`), météo
  (`events/weather`), comparaison, rapport J+1 (`analyse/report-layout`): AUCUNE lecture, voir tableau 3.9.
- `/preferences` (Edge Function Supabase hors dépôt): code, latence et stockage inconnus.
- `MenuItemPricingService.getModalSalesPrices` (`backend/src/shared/pricing/menu-item-pricing.service.ts:475`): coût réel de
  la requête sur `WeezeventTransactionItem`, uniquement le commentaire "~20ms/100 produits".
- Index de `MenuItem`, `SpaceMenuItem`, `Season`, `MarketPrice`: non relus. Aucun EXPLAIN n'a été fait.
- `SpaceAccessService.canAccessSpace` pour les comptes restreints (requêtes DB éventuelles à chaque appel).
- Format réel de `Space.image` (URL ou base64) et taille réelle de `configs[].data`.
- Taille de pool Prisma/pg et limite de connexions du pooler en production.
- Tailles de réponse réelles de tous les endpoints (aucune mesure faite, lecture seule).
- Le front envoie-t-il `light=true` à `/spaces/:id` ? Non vérifié.
- Usage de `meta.total` de `GET /events` par le front: non vérifié.
