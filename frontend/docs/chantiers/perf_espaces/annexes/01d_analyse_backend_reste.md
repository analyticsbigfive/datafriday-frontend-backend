# Page Analyse, backend restant: mappings, seasons, market-prices, contexte PdV, comparaison, preferences (rapport perf, partie 01d)

Statut: PARTIEL (arrêt imposé par le budget de tokens). Couvert: mappings/product-menu, seasons, market-prices, shop-items et contexte PdV
côté front. Partiel: configurations/:id. Non couvert: spaces/:id/shops, builder-v2, comparaison côté serveur, /preferences. Complète `01b_analyse_backend.md` (tableau 3.9 des endpoints non lus). Chemins relatifs à la racine
du dépôt. Les durées citées viennent des commentaires du code, aucune n'est mesurée. Ce qui n'est pas lu = "non vérifié".
Hors périmètre (agent 02c): météo, event-costs, article-dimensions, rapport J+1.

## 1. Fiche du périmètre

| Endpoint | Contrôleur | Service | Preuve |
|---|---|---|---|
| GET `/mappings/product-menu` | `MappingsController.getProductMappings` | `ProductMappingService.getProductMappings` | `backend/src/features/mappings/mappings.controller.ts:330-388`, `services/product-mapping.service.ts:56-122` |
| GET `/seasons` | `SeasonsController.findAll` | `SeasonsService.findAll` | `backend/src/features/seasons/seasons.controller.ts:43-47`, `seasons.service.ts:64-71` |
| GET `/market-prices` | `MarketPricesController.findAll` | `MarketPriceQueryService.findAll` | `backend/src/features/market-prices/market-prices.controller.ts:96-109`, `services/market-price-query.service.ts:67-91` |
| GET `/space-menu/:spaceId/:configId/shop-items` | `SpaceMenusController.getConfigShopMenuItemsLight` | `SpaceMenuConfigurationService.getConfigShopMenuItemsLight` | `backend/src/features/space-menus/space-menus.controller.ts:477-503`, `services/space-menu-configuration.service.ts:99-183` |
| GET `/configurations/:id` | `configurations.controller.ts:76` (01b) | `SpaceConfigurationService.getConfiguration` | `space-configuration.service.ts:73-115` (partiel) |
| GET `/spaces/:id/shops` | `space-shops.controller.ts:90-95` | `SpaceShopsService.getSpaceShops` | non lu |
| comparaison | pas d'endpoint dédié lu | contexte PdV par config (cache front séparé) | `frontend/src/store/modules/analyse.js:424-442` |
| GET `/preferences` | AUCUN (Edge Function Supabase) | hors dépôt | `frontend/src/utils/api.js:5` |

## 3. Appels API, endpoint par endpoint

### 3.1 GET `/mappings/product-menu` (pages de 200, tenant entier)

- Contrôleur `mappings.controller.ts:330-388`; `limit` par défaut 200, plafond serveur 1000 (`product-mapping.service.ts:86`).
  `includeSales` désactivé par défaut (`controller:383`), donc l'agrégat ventes lourd n'est PAS déclenché (commentaire
  `product-mapping.service.ts:103-108`: ~12 s/page en staging si activé, durée citée par le code).
- Cache Redis: AUCUN dans ce service (aucun appel `redis` dans `product-mapping.service.ts`; `MappingSupportService` n'utilise
  Redis que pour purger `spaces:unmapped:*`, `mapping-support.service.ts:16-20`).
- Requêtes (MISS permanent): `productMapping.findMany` + `productMapping.count` en parallèle (`:89-101`), puis
  `getTenantDefaultVatRate` (via `enrichMappingsPricing`, `menu-item-pricing.service.ts:550`). Le `findMany` a
  `include: { salesProduct: { include: { prices: true } }, menuItem: true }` (`:92-95`): AUCUN `select`. Sans `relationJoins`
  (`schema.prisma:15-19`), cela fait 1 requête principale + 1 pour `salesProduct` + 1 pour `prices` + 1 pour `menuItem`, soit
  5 requêtes par page avec le `count` et le taux de TVA.
- Payload: pour chaque mapping, la ligne COMPLÈTE de `SalesProduct` (colonnes Json `rawData`, `components`, `variants`,
  `metadata`, `schema.prisma:1411-1416`, cf. 01b 3.8) plus TOUTES ses lignes `prices`, plus la ligne COMPLÈTE de `MenuItem`,
  plus des champs calculés (`pricing`, `salesPricing: null`, `menuItem.pricing`). Taille non mesurée.
- Index (`schema.prisma:1761-1765`): `@@unique([salesProductId])`, `@@index([menuItemId])`, `@@index([tenantId])`,
  `@@index([autoMapped])`. Le tri `orderBy createdAt desc` (`:96`) n'a pas d'index `(tenantId, createdAt)`: tri sur toutes les
  lignes du tenant avant `skip/take`. Le `skip` croît avec la page (OFFSET), donc les pages tardives coûtent plus.
- Le `where.salesProduct = { integrationId }` (`:78`) est un filtre de relation: Prisma l'exécute en sous-requête sur
  `WeezeventProduct`, non indexée sur `(tenantId, integrationId)` pour la jointure inverse (index `integrationId` seul).

- Côté front, `getProductMappings()` est appelé SANS `locationId` ni `integrationId` par la page Analyse
  (`frontend/src/composables/useSpaceData.js:241`), donc le tenant entier. Pagination par 200 puis pages restantes avec
  concurrence 4 (`frontend/src/api/endpoints/mapping.api.js:111-135`). Chaque page paie donc `findMany` avec OFFSET + `count` +
  TVA + 3 requêtes de relation, ×4 en parallèle sur le pool. Le `count` est refait à chaque page (`product-mapping.service.ts:100`).
- Branche `locationId` (non utilisée par Analyse): `productIdsSoldAtLocation` fait un `SELECT DISTINCT` sur
  `WeezeventTransactionItem` JOIN `WeezeventTransaction` (`mappings.queries.ts:6-15`), table des transactions, puis le résultat
  est réinjecté en `IN (...)`. À ne pas appeler depuis Analyse (EXPLAIN obligatoire d'après la règle projet sur les tables
  transactions).

### 3.2 GET `/seasons` (setup, store `seasons/fetchAll`)

- Contrôleur `seasons.controller.ts:43-47` (guard `JwtDatabaseGuard` seul, pas de permission, commentaire `:39-42`), service
  `SeasonsService.findAll` (`seasons.service.ts:64-71`).
- Requêtes: `season.findMany({ where: { tenantId }, orderBy: { startDate: 'desc' }, include: { spaces: { select: { spaceId: true } } } })`.
  Sans `relationJoins`: 2 requêtes SQL (saisons puis `SeasonSpace WHERE seasonId IN (...)`).
- Pas de pagination, pas de cache Redis (aucun `redis` dans le fichier). Index: `Season @@index([tenantId])`,
  `SeasonSpace @@id([seasonId, spaceId])` + `@@index([spaceId])` (`schema.prisma:633`, `:643-644`). La recherche des espaces par
  `seasonId IN (...)` est servie par la PK composite (préfixe `seasonId`). Le tri `startDate desc` se fait après l'index `tenantId`
  (quelques dizaines de lignes au plus, coût négligeable).
- Payload: une ligne par saison (id, name, dates, allSpaces, spaceIds). Petit (non mesuré, nombre de saisons d'un tenant: non vérifié).
- Front: store avec TTL 15 min (`frontend/src/store/modules/seasons.js:12`, `:25`, `:41-42`). Coût serveur négligeable; le seul
  levier est l'aller-retour réseau (1 à 2 requêtes SQL, ~1 s si on croit le commentaire `space-configuration.service.ts:26`).

### 3.3 GET `/market-prices` (store `inventory/loadMarketPrices`, pages de 200)

- Contrôleur `market-prices.controller.ts:96-109` (sans `RequirePermissions` sur le GET), service
  `MarketPriceQueryService.findAll` (`backend/src/features/market-prices/services/market-price-query.service.ts:67-91`).
- Cache Redis: AUCUN (grep `redis` dans `features/market-prices/`: aucun résultat hors spec). Aucun cache HTTP non plus.
- Requêtes par page: `marketPrice.findMany({ where: { tenantId, ...scope }, orderBy: { itemName: 'asc' }, include: { supplierRel: true },
  skip, take })` + `marketPrice.count(where)` en parallèle (`:72-81`). `include: { supplierRel: true }` ramène la ligne COMPLÈTE de
  `Supplier` (`picture`, `notes`, `address`, `sites[]`, `configurationIds[]`, `sectors[]`, `schema.prisma:1166-1190`) répétée pour
  chaque prix (Prisma dédoublonne la requête `Supplier WHERE id IN (...)` mais le JSON final répète l'objet fournisseur dans chaque
  ligne de prix). Pas de `select` des colonnes de `MarketPrice` (dont `image String?`, `schema.prisma:1221`).
- Format de `image` et `Supplier.picture`: le DTO les déclare `string` simple (`create-market-price.dto.ts:57`, `create-supplier.dto.ts:38`);
  si ce sont des data URLs base64 la charge est lourde. Non vérifié (lecture seule de la base interdite).
- Filtre: `where` ne contient PAS `deletedAt: null` (`:71`) alors que `MarketPrice.deletedAt` existe (`schema.prisma:1251`). Les lignes
  supprimées logiquement sont donc relues et renvoyées si le champ est utilisé (usage de `deletedAt` pour MarketPrice: non vérifié).
- Compte restreint: `spaceScopeFilter` appelle `getAccessibleSpaceIds` (`findMany userSpaceAccess`, `space-access.service.ts:29-36`) et
  filtre par `supplierRel: { sites: { hasSome: accessible } }` (`market-price-query.service.ts:28-35`): filtre de relation + tableau,
  non indexé (`Supplier.sites` sans index GIN). Les comptes à accès complet n'ont pas ce coût.
- Index `MarketPrice` (`schema.prisma:1264-1271`): `tenantId`, `supplierId`, `goodType`, `itemName`, `category`, types, `industrialId`.
  Pas d'index composite `(tenantId, itemName)`: le tri alphabétique avec OFFSET se fait par `tenantId` puis tri, ou par l'index
  `itemName` avec filtre tenant, au choix du planificateur (EXPLAIN non fait).
- Front: SWR (hydratation immédiate depuis le cache disque, refresh réseau en fond), commentaire « ~60s / cold-start Render »
  (`frontend/src/store/modules/inventory.js:337-339`, durée citée par le commentaire, non mesurée); pagination `fetchAllPaginated`
  limit 200 concurrence 4 (`:353`, `frontend/src/utils/paginateAll.js:27-44`). Premier appel séquentiel (page 1) puis les autres en
  parallèle. Le `count` est refait à chaque page.
- Payload: N prix × (colonnes MarketPrice + objet Supplier complet). Pour la page Analyse, seules des colonnes de coût (`price`,
  `pricePerUnit`, `goodType`, `category`, `supplierId`, `industrialId`, `unit`) sont a priori utiles (usage exact par Analyse: non
  vérifié).

### 3.4 Contexte PdV: `loadConfigShopContext` / `loadAllConfigsShopContext` (store `analyse`) et `getConfigShopMenuItemsLight`

Ce ne sont PAS des endpoints: ce sont des actions du store qui composent plusieurs appels, PAR configuration.

Côté front (`frontend/src/store/modules/analyse.js`):
- `buildConfigShopEntry(spaceId, configId)` (`:272-353`) lance, pour UNE config: (a) `getBuilder2SubtypesByName(spaceId)` en
  parallèle, promesse partagée par espace (`:208-248`) = `GET builder-v2 state` une fois par espace; (b) `getConfiguration(configId)`
  seulement si la config en mémoire n'a pas de `floors` (`:276-281`); (c) `fetchNestShopMenus` (`:136-195`): `spaceShops/fetchForSpace`
  puis `getConfigShopMenuItemsLight(spaceId, configId)` (`:179-180`), les deux en SÉQUENCE (le second attend le premier, `:141` puis `:180`).
- `loadAllConfigsShopContext` (`:2067-2122`) répète cela pour CHAQUE config de l'espace avec une concurrence de 3
  (`runWithConcurrency(..., 3, ...)`, `:2089-2100`). Pour un espace à C configs: C appels `shop-items`, jusqu'à C appels
  `GET /configurations/:id`, et 1 seule liste de shops (`spaceShops` a un cache 15 min et une dédup en vol,
  `frontend/src/store/modules/spaceShops.js:3-9`, `:33-56`).
- Cache du résultat: `configShopEntryCache` (Promise par espace+config, durée de vie = la page, purgé par `loadSpace`,
  `analyse.js:371-376`, `:444-465`). Le tiroir Comparaison a son PROPRE cache `comparisonShopEntryCache` (`:424-442`): il ne réutilise
  pas le résultat déjà chargé par le contexte principal. Une comparaison sur une config déjà chargée par le principal repaie donc
  `getConfiguration` + `shop-items` (+ les `spaceShops` en cache). Les deux caches sont purgés ensemble (`:373-376`).

Côté backend, `GET /space-menu/:spaceId/:configId/shop-items` (`space-menus.controller.ts:477-503`, pas de `RequirePermissions`):
- Service `SpaceMenuConfigurationService.getConfigShopMenuItemsLight` (`space-menus/services/space-menu-configuration.service.ts:99-183`).
- Cache Redis: AUCUN (le service injecte Redis uniquement pour invalider, `:24-29`).
- Requêtes: (1) `config.findFirst({ id, spaceId, space.tenantId })` (`:105-108`, séquentiel, sert au contrôle d'accès); (2) `spaceElement.findMany`
  avec `where.OR` de 4 filtres de relation (`floor`, `forecourt`, `externalMerch`, `configurationElements some`, `:125-133`) et
  `select menuAssignments (where enabled, menuItem.deletedAt null) -> menuItem -> productCategory.name`. Sans `relationJoins`
  (`schema.prisma:15-19`): SpaceElement, puis MenuAssignment `WHERE elementId IN (...)`, puis MenuItem `IN (...)`, puis
  ProductCategory `IN (...)`, soit 5 requêtes séquentielles par config. Le `OR` de 4 sous-requêtes empêche un seul chemin d'index.
- Index: `MenuAssignment`: `@@unique([elementId, menuItemId, configId])`, `@@index([elementId, enabled])`, `@@index([configId])`,
  `@@index([menuItemId])`; `ConfigurationElement`: `@@id([configId, elementId])`, `@@index([elementId])`; `Floor @@index([configId])`
  (`schema.prisma`, blocs relus par grep). `SpaceElement`: `[floorId,type]`, `[forecourtId,type]`, `[externalMerchId]`, `[zoneId,type]`.
  Les index existent pour chaque branche du OR; le planificateur peut les combiner par BitmapOr (EXPLAIN non fait).
- Payload: `{ [elementId]: { shopName, items[{id,name,category,basePrice}] } }`. Le service interdit volontairement `picture`
  (commentaire BUG-199 `:94-97`, `:147-154`): une réponse était passée à 5,6 Mo / 53 s quand la photo base64 était sélectionnée
  (valeurs citées par le commentaire du code, non mesurées ici). Le payload actuel est l'ordre de grandeur « articles assignés
  × PdV » : un article assigné à 40 PdV est émis 40 fois (non mesuré).
- Le mode `itemsScope=space` (inventaire) élargit `assignmentWhere` à toutes les configs de l'espace (`:116-119`): il renvoie
  jusqu'à C fois plus de lignes d'assignation; Analyse n'utilise pas ce mode (défaut `config`).

### 3.5 `GET /configurations/:id` (appelé par config dans le contexte PdV, lecture PARTIELLE)

- Service `SpaceConfigurationService.getConfiguration` (`backend/src/features/spaces/services/space-configuration.service.ts:73-115` lu,
  suite non lue). Requêtes lues: (1) `config.findFirst` avec `select data: true` (le JSON complet du plan) + `space {id,name,tenantId}`
  (`:75-96`); (2) `assertCanAccessSpace` (coût pour compte restreint: non vérifié); (3) `floor.findMany({ where: { configId }, include: { elements: true } })`
  (`:111-114`), tous les éléments de tous les étages sans `select`. La suite (fusion JSON / relationnel par `level`, `:115+`): NON LUE.
- Cache Redis: non vérifié pour cette méthode (aucun `redis` relevé dans les 45 lignes lues). Payload: JSON `data` complet + éléments
  relationnels, donc en partie dupliqués avec ce que `GET /spaces/:id` a déjà renvoyé dans `configs[].data` (01b 3.1).
- Appelé uniquement si la config en mémoire n'a pas de `floors` (`analyse.js:276-281`). Comme `/configurations` (liste légère) ne porte pas
  `data`, il faut en pratique 1 appel par config pour `loadAllConfigsShopContext` (hypothèse: dépend de ce que contient
  `state.configurations`, non vérifié).

### 3.6 `GET /spaces/:id/shops` (contexte PdV)

- Contrôleur `backend/src/features/spaces/space-shops.controller.ts:90-95`, service `SpaceShopsService.getSpaceShops`
  (`spaces/services/space-shops.service.ts:45`). Une clé Redis `spaces:shops:<tenant>:<spaceId>[:<configId>]` existe
  (`space-cache.service.ts:68`, `space-menu-configuration.service.ts:27`): TTL et requêtes: NON LUS.
- Front: appelé une seule fois par espace grâce au cache 15 min et à la dédup en vol (`spaceShops.js:3-9`, `:33-56`).

### 3.7 Comparaison (tiroir): endpoints

- Le tiroir Comparaison n'a pas d'endpoint dédié lu dans cette passe. Ses besoins serveur connus: le contexte PdV par configuration
  (3.4, 3.5, 3.6) via `buildConfigShopEntryReadOnly` et son cache propre (`analyse.js:424-442`), donc `shop-items` + `configurations/:id`
  repayés pour toute config déjà chargée par le contexte principal. Les autres appels du tiroir (agrégats ventes de la période
  comparée, météo): NON LUS, ni côté front ni côté backend.

### 3.8 `GET /preferences` (Edge Function Supabase)

- Constat déjà établi par 01b: URL `https://<projectId>.supabase.co/functions/v1/make-server-eb31619c` (`frontend/src/utils/api.js:5`), absente
  de NestJS. 01b a trouvé dans le dépôt seulement `backend/supabase/functions/health` et `send-supplier-email`.
- Dans cette passe, aucune recherche supplémentaire n'a pu être faite (consigne d'arrêt). Où vit la fonction `make-server-eb31619c`, ce
  qu'elle lit (KV Supabase, table, auth) et sa latence: NON VÉRIFIÉ. Le commentaire du store `analyse.js:282` parle d'un « make-server legacy
  MORT » supprimé pour `getSpaceMenuConfiguration`: l'Edge Function est donc probablement un reliquat; `/preferences` serait l'un des derniers
  appels qui l'utilisent (à confirmer par grep des appels à `utils/api.js` hors Restock; CLAUDE.md frontend dit que ce fichier n'est utilisé
  que par Restock, ce qui est en tension avec `getUserPreferences` appelé par Analyse).

## 4. Cascade au premier affichage (vue serveur, ce périmètre)

Aucune durée mesurée.
- Setup: `/seasons` (2 requêtes SQL, store 15 min), `/market-prices` (pages de 200, 1 page puis N en parallèle, SWR disque côté front),
  `/mappings/product-menu` (pages de 200, concurrence 4, 5 requêtes SQL par page).
- Après le chargement de l'espace: `loadAllConfigsShopContext`, par vagues de 3 configs: pour chaque config `GET /configurations/:id` puis
  `shop-items` (config + éléments + 3 requêtes de relation) en SÉQUENCE avec `spaceShops` (1 fois). Pour C configs: environ C × (1 gros appel
  config + 5 requêtes shop-items) requêtes SQL, en 3 vagues parallèles. Ce chemin n'est PAS bloquant pour le premier rendu (fire-and-forget,
  `AnalyseView.vue:1595-1598`) mais charge le même pool Prisma que la phase 1 et les paquets d'event-costs.
- Tiroir Comparaison: repaie le contexte PdV de chaque config comparée (cache séparé).

## 5. Problèmes de performance

1. `GET /mappings/product-menu` renvoie `SalesProduct` complet (colonnes Json `rawData`, `components`, `variants`, `metadata`) + TOUTES les lignes
   `prices` + `MenuItem` complet, pour chaque mapping, alors que le chargement ne lit que les paires produit-article (commentaire
   `product-mapping.service.ts:103-108`). Preuve: `:89-101`. OFFSET croissant, tri `createdAt desc` sans index `(tenantId, createdAt)`
   (`schema.prisma:1761-1765`), `count` refait à chaque page. Impact: haut. Pages: Analyse, wizard de mapping, fiche Menu Item.
2. `GET /market-prices`: `include supplierRel: true` (Supplier complet, avec `picture`) répété par ligne, aucun `select`, aucun cache Redis,
   `count` à chaque page, pas de `deletedAt: null`. Preuve: `market-price-query.service.ts:67-91`, `schema.prisma:1166-1190`, `:1221`. Impact:
   moyen à haut (le commentaire front cite ~60 s à froid, `inventory.js:337-339`). Pages: Analyse, Logistique, Inventaire, Réarmement, Stockage.
3. Contexte PdV: C appels `shop-items` + C appels `configurations/:id` par ouverture de l'Analyse en « All Configurations », sans cache serveur
   (`space-menu-configuration.service.ts:99-183`, `analyse.js:2089-2100`). Le tiroir Comparaison double ce coût (cache séparé,
   `analyse.js:424-442`). Impact: moyen (hors chemin critique du premier rendu, mais charge le pool).
4. `shop-items` répète `config.findFirst` puis `spaceElement.findMany` avec `OR` de 4 sous-requêtes de relation et 3 requêtes de relation
   (sans `relationJoins`). Preuve: `:105-133`. Impact: moyen, multiplié par le nombre de configs.
5. `GET /configurations/:id` renvoie `data` JSON complet + éléments (`:75-114`), déjà fournis par `GET /spaces/:id` (01b 3.1). Doublon de payload.
   Impact: moyen (taille non mesurée).
6. `GET /seasons`: 2 requêtes SQL sans cache serveur. Impact: bas (petit référentiel).
7. `/preferences`: Edge Function hors dépôt, cause non vérifiée (01b problème 8).

## 6. Recommandations

### Backend (code)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| `getProductMappings`: ajouter un mode léger (`?view=pairs`) qui renvoie `salesProductId`, `menuItemId`, `autoMapped` sans `include`; ou `select` explicite sans `rawData`/`prices`/`MenuItem` complet | Divise payload et requêtes (5 vers 2) sur chaque page | Le wizard et la fiche Menu Item lisent peut-être `weezeventProduct.pricing` et `menuItem.pricing`: grepper les consommateurs avant, garder le mode complet par défaut | M | `product-mapping.service.ts:89-122`, `mappings.controller.ts:330-388`, `mapping.api.js:111-135` |
| `getProductMappings`: ne compter qu'à la page 1 (le front relit `meta.totalPages` de la page 1 seulement, `mapping.api.js:123`) | Supprime N-1 `count` | Faible | S | `product-mapping.service.ts:100` |
| `market-prices` GET: `select` des colonnes utiles + `supplierRel: { select: { id, name } }`, ajouter `deletedAt: null` après vérification métier | Réduit nettement le payload et la lecture | Un écran peut lire `supplierRel.picture` ou d'autres champs du fournisseur (à grepper) | M | `market-price-query.service.ts:67-91` |
| `market-prices` GET: cache Redis par (tenant, page, limit, scope), invalidé aux écritures de prix | Évite la lecture complète répétée (~60 s à froid cité) | Fraîcheur après édition (invalidation à brancher sur create/update/delete/import) | M | `market-price-query.service.ts`, `market-prices.service.ts` |
| `shop-items`: cache Redis par (tenant, espace, config, scopes) TTL court, invalidé par `invalidateAfterAssignmentWrite` | Les C appels deviennent des HIT lors des ouvertures suivantes et de la Comparaison | Il faut aussi invalider à l'édition du Builder (éléments ajoutés ou retirés) | M | `space-menu-configuration.service.ts:24-29`, `:99-183` |
| `shop-items`: endpoint batch « toutes les configs de l'espace » (une seule requête SQL groupée par `configId`) au lieu de C appels | Un appel au lieu de C, pas de vagues de 3 | Nouveau contrat à documenter, Analyse à adapter | L | `space-menus.controller.ts`, store `analyse.js:2067-2122` |
| Activer `relationLoadStrategy: 'join'` sur les `include` de `mappings` et `shop-items` | Moins d'aller-retours | Changement transverse (01b), à tester | L | `schema.prisma:15-19` |
| `seasons` GET: cache Redis par tenant (TTL 60 s, invalidé sur create/update/delete) | Retire 2 requêtes | Très faible | S | `seasons.service.ts:64-71` |

### SQL / index (à valider par EXPLAIN avant, rien n'a été mesuré)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Index `WeezeventProductMapping (tenantId, createdAt DESC)` | Tri `createdAt desc` + OFFSET servi par l'index | Écritures légèrement plus lentes | S | migration, `schema.prisma:1761-1765` |
| Index `MarketPrice (tenantId, itemName)` | Tri alphabétique paginé servi par un seul index | Idem | S | migration, `schema.prisma:1264-1271` |
| Vérifier `WeezeventProduct (tenantId, integrationId)` pour le filtre de relation `salesProduct.integrationId` | Jointure inverse indexée | À mesurer | S | `schema.prisma:1432-1439` (01b) |

### Frontend lié aux constats

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Partager `comparisonShopEntryCache` et `configShopEntryCache` (une seule table par espace+config) | Comparaison sans appel pour les configs déjà chargées | Cache en lecture seule vs contexte principal: vérifier que l'entrée n'est pas mutée (le principal mute `el.shopType`, `analyse.js:329-334`) | S à M | `analyse.js:371-376`, `:424-442` |
| `/preferences`: lancer en parallèle de la phase 1 au lieu de séquentiellement (rapport 01), avec valeur locale (localStorage) affichée d'abord, puis réconciliation | Retire la fonction du chemin critique | Préférence affichée un instant puis corrigée | S | `frontend/src/utils/api.js:5`, appelant `getUserPreferences` (non lu) |
| `/preferences`: si la fonction Edge est un reliquat, migrer vers une table + endpoint NestJS (cache Redis) | Supprime le cold start Deno | Migration de données | L | hors dépôt pour la fonction, à localiser |

## 7. Points non vérifiés

- `/preferences`: emplacement du code de `make-server-eb31619c`, ce qu'il lit, latence, cold start. Aucune recherche additionnelle dans cette passe.
- Fin de `SpaceConfigurationService.getConfiguration` (après `:115`), présence d'un cache Redis, coût de `assertCanAccessSpace` restreint.
- `SpaceShopsService.getSpaceShops` (requêtes, TTL de `spaces:shops:*`), builder-v2 `getBuilderState` (contrôleur, requêtes, cache).
- Comparaison: endpoints propres au tiroir (agrégats de la période comparée), non lus ni côté front ni côté backend.
- `GET /mappings/product-menu`: usage réel de `weezeventProduct.pricing` / `menuItem.pricing` par Analyse; tailles de réponse.
- `GET /market-prices`: format de `image` et `Supplier.picture` (URL ou base64), colonnes réellement lues par Analyse, usage de `deletedAt`.
- `loadAllConfigsShopContext`: nombre de configs d'un espace type, contenu de `state.configurations` (avec ou sans `data`), donc nombre réel d'appels `configurations/:id`.
- Index `MenuItem`, `Season`: non relus. Aucun EXPLAIN fait. Aucune durée mesurée.
