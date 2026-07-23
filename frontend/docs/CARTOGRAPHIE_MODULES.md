# Cartographie des modules — Data Friday

> Établie le 15 juillet 2026 à partir du code réel (backend `main`, frontend `develop`).
> C'est le **document d'entrée du projet** : on le lit avant de toucher au code.
> ⚠️ À versionner avec le reste de `docs/` (action J1 du plan de reprise).
>
> **Pour aller plus loin par domaine** : [`docs/modules/`](modules/00_INDEX.md)
> contient une page détaillée par domaine (règles métier vérifiées contre le code réel, bugs actifs
> confirmés, code mort, historique). L'archéologie complète (confrontation des anciens prototypes)
> est dans [`docs/utiles/prototypes/`](utiles/prototypes/00_INDEX_ET_SYNTHESE.md).
>
> **Avant de corriger un bug** : vérifier [`docs/bugs/00_INDEX.md`](bugs/00_INDEX.md) (et son
> pendant [`api-datafriday-staging/docs/bugs/00_INDEX.md`](../../api-datafriday-staging/docs/bugs/00_INDEX.md))
> — le bug est peut-être déjà diagnostiqué, ou volontairement laissé ouvert.
>
> **Avant de contourner une architecture existante** : vérifier [`docs/adr/00_INDEX.md`](adr/00_INDEX.md)
> — c'est peut-être une décision déjà prise, avec ses raisons. Voir aussi
> [`CONTRIBUTING.md`](../CONTRIBUTING.md) pour les règles qui ne se voient pas dans le code
> (dont le workflow Git).
>
> **Comment le code frontend est organisé concrètement** (dossiers, conventions Vuex/API/routing,
> zones mortes) : [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — à suivre pour toute
> nouvelle vue, composant ou module de store.
>
> **Si le code ou la règle métier reste ambigu** : ne pas trancher seul, on n'a pas de base de
> code auto-porteuse — noter la question dans [`docs/QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md)
> et la faire trancher avant de coder dessus.

## Le projet en un coup d'œil

| | Backend (`api-datafriday-staging`) | Frontend (`datafriday-web`) |
|---|---|---|
| Unités | **31 modules métier actifs** (+1 mort : Kv) | **48 écrans** (50 routes) |
| Données | **92 modèles Prisma**, 17 enums | **34 modules de store Vuex** |
| Interfaces | ~13 modules d'infrastructure + 1 worker séparé | **27 clients API** par domaine (`src/api/endpoints/`) |
| Mort/legacy | KvModule, imports RouterModule/Reflector | `versionReact/`, `api-datafriday-main/`, 6 vues orphelines, vestiges React (`src/ui` 94 composants, `src/figma`, `src/hooks`, `src/types`), `src/utils/api.js` monolithe 45 Ko |

**Règles de lecture (pour humains ET agents IA)** :
- Source de vérité front : `datafriday-web/src/` uniquement. `versionReact/` = prototype archivé, lecture interdite sauf archéologie. `api-datafriday-main/` = copie d'un ancien backend, ne JAMAIS s'y référer.
- Source de vérité back : `api-datafriday-staging/src/`. Le vrai backend appelé par le front est `https://datafriday-api.onrender.com/api/v1`.
- Un écran front appelle le backend via `src/api/client.js` (Axios central) → `src/api/endpoints/*.api.js`. Le monolithe `src/utils/api.js` est legacy (encore appelé par Restock).

---

## 1. Vue par domaine métier — la liaison backend ↔ frontend

C'est le tableau qui répond à « que fait quoi, relié à quoi ».

| Domaine | Modules backend | Écrans frontend | Modèles Prisma clés |
|---|---|---|---|
| **Auth & onboarding** | Onboarding, Me, Organizations, Tenants | /login, /signup, /forgot-password, /reset-password, /accept-invite, /verify-email, /auth/callback, /onboarding, /profile | Tenant, User, UserTenant |
| **RBAC** | Users, Roles, Permissions | /users, /users/create, /roles, /permissions | User, Role, Permission, RolePermission, UserSpaceAccess |
| **Intégrations & ventes** | Integrations, Weezevent, Digifood | /data-integration/fb (wizard mapping + sync) | Integration, Sales* (18 modèles), ProductMapping, CsvMapping, IntegrationWebhookEvent |
| **Espaces & builder** | Spaces (+ configurations, dashboard, pinned), BuilderV2 | /spaces, /spaces-overview, /spaces/:id/builder2 (frontend v1 retiré le 2026-07-22) | Space, Config, Zone, ConfigurationElement, Floor, SpaceElement, Element*(Perf/Staff/Inventory), MenuAssignment |
| **Analyse & agrégation** | Analyse, Aggregation, Mappings | /spaces/:id (Analyse), portions de /data-integration/fb | SpaceRevenueMinuteAgg, SpaceProductRevenueDailyAgg, AggregationJobLog, LocationSpaceMapping, LocationShopMapping |
| **Prévision (Event Predict)** | Events → PredictVersions | /spaces/:id/predict, /predict-test (banc de test sans auth) | EventPredictVersion, Event |
| **Événements** | Events (+ taxonomies, teams) | /events, /event-types, /event-categories, /event-subcategories | Event, EventType/Category/Subcategory, Team |
| **Menu & recettes** | MenuItems (+ product-types/categories), MenuComponents (+ component-types/categories), SpaceMenus, Ingredients, Packaging | /menu-items (+create/edit), /components (+new/edit), /space-menus, /space-menus/:spaceId/shops/:shopId, référentiels /product-* /component-* | MenuItem, MenuComponent, SpaceMenuItem, MenuItem*(Component/Ingredient/Packaging/PriceHistory), Ingredient, Packaging |
| **Achats & référentiels** | Suppliers, MarketPrices (+types/categories), Brands, DisplayNames, Industrials, PackingTypes | /suppliers, /market-prices, /market-price-types, /market-price-categories, /brand-names, /display-names, /industrials, /packing-types | Supplier, MarketPrice(+Type/Category), Brand, DisplayName, Industrial, PackingType |
| **Stock** | Inventory (+ inventory-counts), Logistics, RestockState | /spaces/:id/inventory, /spaces/:id/logistic, /spaces/:id/restock | InventorySnapshot, InventoryCount, StockMovement, StockLevel, StockReconciliation, RestockState |
| **Technique** | Orchestrator, Health/Metrics, Audit, Webhooks (core), Worker (process séparé) | — | AuditLog, Webhook, WebhookLog |

**Ownership actuel** : Jean-Luc = Analyse, Event Predict, Inventory, Restock (~5 écrans cœur). Emmanuel = auth + RBAC/org (~12 écrans, fondations). Ulrich = tout le backend + le reste du front (builder/builder2, logistic, events, menu-fb, référentiels, data-integration).

---

## 2. Backend — les 31 modules métier

| Module | Rôle | Routes (préfixe + clés) | Modèles Prisma | Importe |
|---|---|---|---|---|
| Onboarding | Inscription/rattachement d'un utilisateur à un tenant (création, join par code/slug) | `onboarding` — GET status, POST /, POST join-by-code, POST join/:slug | Tenant, User, UserTenant | — |
| Organizations | CRUD d'une organisation (tenant vu « organization ») | `organizations` — GET/PATCH/DELETE :id | Tenant | — |
| Integrations | Intégrations tierces (Weezevent, Digifood) : config, instances, tests, webhooks, import CSV | `organizations/:orgId/integrations` — GET /, POST weezevent/test, POST weezevent/instances, GET/POST digifood/instances, POST digifood/instances/:id/import-csv | Integration, IntegrationWebhookEvent, Tenant | Encryption, Weezevent, Digifood |
| Weezevent | Cœur de la synchro billetterie/caisse : transactions, sync incrémentale/jobs, événements, lieux, marchands, produits, mappings, prix | `weezevent` — GET transactions, POST sync, GET events/locations/merchants/products, POST products/:id/map, POST sync/start, GET sync/status/:jobId ; `weezevent/analytics` — sales-by-product, sales-by-event, margin-analysis, top-products ; `webhooks/weezevent` — POST :tenantId/:integrationId | 18 modèles Sales*/Weezevent* + ProductMapping, LocationSpaceMapping, SpaceMenuItem, MenuItem… | Http, Onboarding, Pricing |
| Digifood | Ingestion ventes Digifood : webhook signé HMAC + import CSV, mapping produits | `webhooks/digifood` — POST :tenantId/:integrationId | Integration, CsvMapping, Sales*, MenuItem, ProductMapping | — |
| Me | Profil utilisateur courant + tenant | `me` — GET /, PATCH /, GET tenant | (via Auth/cache) | Prisma, Auth |
| Tenants | Admin tenants : CRUD, stats, plan, suspend/reactivate | `tenants` — POST/GET /, GET statistics, POST :id/upgrade\|suspend\|reactivate | Tenant, User | Prisma |
| Spaces | Espaces (points de vente) : CRUD, configurations, shops, timeline événements, accès, pin, dashboards, agrégat revenus | `spaces` — POST/GET /, GET light/statistics/pinned, GET :id/configurations\|shops\|event-timeline, POST :id/access ; `configurations` ; `pinned-spaces` ; `spaces/:spaceId/dashboard` | Space, Config, Zone, ConfigurationElement, Floor, SpaceElement, agrégats… (24 modèles) | Prisma, Redis, Weezevent |
| BuilderV2 | Éditeur d'agencement v2 : zones, éléments (perf/staff/inventaire), configurations | `builder-v2` — GET spaces/:id/state, POST spaces/:id/zones, POST zones/:id/elements, PUT elements/:id/performance, POST spaces/:id/configurations | Config, Zone, ConfigurationElement, SpaceElement, Element*, MenuAssignment | Prisma, Redis, Spaces |
| Users | CRUD utilisateurs, invitations, rôle, accès espaces | `users` — POST/GET /, GET statistics/me, POST invite, PATCH :id/role, POST :id/spaces/:spaceId/access | User, UserTenant, UserSpaceAccess, Role, Space | Auth |
| Roles | CRUD rôles RBAC | `roles` — GET/POST /, GET/PATCH/DELETE :id | Role, User, UserTenant | Auth |
| Permissions | CRUD permissions fines | `permissions` — GET/POST /, PATCH/DELETE :id | Permission | — |
| Orchestrator | Supervision technique : health, invalidation cache, stratégie | `orchestrator` — GET health, POST invalidate-cache, GET strategy | — | — |
| Suppliers | CRUD fournisseurs | `suppliers` — CRUD | Supplier | Prisma |
| MarketPrices | Prix de marché + taxonomie : import, dédup, sync ingrédients/packagings | `market-prices` — POST /, POST import/deduplicate/sync-ingredients, GET with-packagings/with-ingredients ; `market-price-types` ; `market-price-categories` | MarketPrice(+Type/Category), Ingredient, Packaging | Prisma |
| MenuComponents | Composants de recette + taxonomie : ingrédients/enfants, coûts, réparation | `menu-components` — POST/GET /, POST repair/refresh-costs, PUT :id/ingredients\|children ; `component-types` ; `component-categories` | MenuComponent, Component*(Type/Category/Ingredient/Component), Ingredient | Prisma |
| MenuItems | Articles de menu : recettes, coûts, prix Weezevent, historique, taxonomie | `menu-items` — POST/GET /, POST bulk/refresh-costs/apply-weezevent-prices, GET :id/recipe, PUT :id/components ; `product-types` ; `product-categories` | MenuItem + 5 tables liées, ProductType/Category, SpaceMenuItem… | Prisma, Pricing |
| SpaceMenus | Menu/inventaire par espace ou shop, prix contextualisés | `space-menu` — GET shop/:shopId(+items/inventory), GET storage-inventory, GET space/:spaceId/items, POST / | SpaceMenuItem, MenuItem, Ingredient, Packaging, MarketPrice… | Prisma, Pricing |
| Ingredients | CRUD ingrédients | `ingredients` — CRUD, GET by-market-price/:id | Ingredient | — |
| Packaging | CRUD emballages | `packaging` — CRUD | Packaging | — |
| Events | Événements + taxonomies + équipes + versions de prévision | `events` — CRUD ; `event-types/categories/subcategories` ; `teams` ; `events/:eventId/predict-versions` + `predict-versions/:id` | Event, EventType/Category/Subcategory, Team, EventPredictVersion | Prisma |
| Analyse | Dashboards analytiques : KPIs menu/événements, timeline, coûts | `analyse` — GET dashboard, kpis/menu, kpis/events, timeline/:eventId, cost-breakdown | Event, Ingredient, MenuComponent, MenuItem, Space, Supplier | Prisma |
| Mappings | Rapprochements : lieu↔espace, lieu↔shop, marchand↔élément, produit↔menu + progression | `mappings` — GET/POST/DELETE location-space, location-shop, merchant-element, product-menu, GET progress, GET summary/:locationId | Mappings + Sales* + agrégats (16 modèles) | Prisma, Spaces, Pricing |
| Aggregation | Agrégation ventes par événement/minute (queue Bull) : timeline, traitement, sync | `aggregation` — GET events-timeline/:spaceId, POST process-events/synchronize/skip-event, GET progress/:jobId, GET event-breakdown/:spaceId/:eventId | Agrégats + Sales* + mappings | Prisma, Bull |
| Brands | CRUD marques | `brand-names` — CRUD | Brand | Prisma |
| DisplayNames | CRUD noms d'affichage | `display-names` — CRUD | DisplayName | Prisma |
| Industrials | CRUD industriels | `industrials` — CRUD | Industrial | Prisma |
| Inventory | Snapshots et comptages d'inventaire par espace/événement | `inventory` — GET :spaceId/latest, GET :spaceId/:eventId, POST / ; `inventory-counts` — POST / | InventorySnapshot, InventoryCount, Event | — |
| Logistics | Ledger de stock : niveaux, mouvements, réconciliations, simulation de vente | `logistics` — GET :spaceId/stock\|market-prices\|reconciliations, POST movements, POST :spaceId/reset\|simulate-sale | StockLevel, StockMovement, StockReconciliation + ventes | Prisma |
| PackingTypes | CRUD types de conditionnement | `packing-types` — CRUD | PackingType | Prisma |
| RestockState | État de réassort persistant par espace | `spaces/:spaceId/restock-state` — GET/PUT/DELETE | RestockState, Space | Prisma |
| **Kv (MORT)** | Store clé/valeur — **non enregistré dans app.module.ts, routes jamais montées** | `kv` — GET/PUT :key | KvStore | — |

**Infrastructure** : guards globaux dans l'ordre TenantThrottler → JwtDatabase → Tenant → Roles → Permissions → SpaceAccess ; modules core Encryption, Cache, Supabase, Tenant, SpaceAccess, Redis, Queue, Prisma, Audit, Webhooks, Auth, Health(+Metrics). `PricingModule` (shared) importé par MenuItems/SpaceMenus/Mappings/Weezevent. **WorkerModule** = process séparé (`src/worker.ts`, jobs/cron BullMQ).

### Modèles Prisma par domaine (92 + 17 enums)

- **Tenant/Auth/RBAC (9)** : Tenant, User, UserTenant, UserPinnedSpace, UserSpaceAccess, Permission, Role, RolePermission, AuditLog
- **Intégrations/Webhooks (7)** : Integration, WeezeventIntegrationConfig, DigifoodIntegrationConfig, IntegrationWebhookEvent, Webhook, WebhookLog, CsvMapping
- **Ventes (18)** : SalesEvent, SalesLocation, SalesProduct, SalesTransaction, SalesTransactionItem, SalesPayment, SalesProductVariant, SalesProductComponent, ProductMapping, WeezeventMerchant/User/Wallet/Order/Price/Attendee, WeezeventSyncState/Job/Chunk
- **Espaces/Builder (13)** : Space, Config, Zone, ConfigurationElement, Floor, SpaceElement, ElementPerformance, ElementStaff, ElementInventory, Forecourt, ExternalMerch, Station, MenuAssignment
- **Menu/Recettes (14)** : MenuComponent, ComponentType/Category, ComponentIngredient, ComponentComponent, ProductType/Category, MenuItem, SpaceMenuItem, MenuItemComponent/Ingredient/Packaging/PriceHistory, Menu
- **Approvisionnement (10)** : Ingredient, Packaging, Supplier, MarketPrice(+Type/Category), Brand, DisplayName, Industrial, PackingType
- **Événements (6)** : EventType/Category/Subcategory, Team, Event, EventPredictVersion
- **Mappings (2)** : LocationSpaceMapping, LocationShopMapping
- **Agrégation (5)** : SpaceRevenueMinuteAgg, SpaceProductRevenueDailyAgg, SpaceDashboardVersion, AggregationJobLog, UnmappedDataMetrics
- **Stock (6)** : InventorySnapshot, InventoryCount, StockMovement, StockLevel, StockReconciliation, RestockState
- **Divers (2)** : TenantVatConfig, KvStore (orphelin)
- Peu/pas utilisés côté services : `Station`, `Menu` — à confirmer avant toute suppression.

---

## 3. Frontend — les 48 écrans

Client Axios central `src/api/client.js` (`baseURL = VUE_APP_API_URL`), 27 clients par domaine dans `src/api/endpoints/`, 34 stores Vuex, gating par `meta.permission` dans `src/router/index.js` + guards (`guards.js` : auth, org, onboarding, spaceEntry `front.fb.*`).

### Auth & fondations (Emmanuel)
/login, /signup, /forgot-password, /reset-password, /accept-invite, /verify-email, /auth/callback, /onboarding (→ `onboarding.api`, `space.api`), /profile. Store : `auth` (session Supabase + getters `can`/`isAdmin`).

### RBAC & organisation (Emmanuel)
/permissions (`org.permissions.manage`), /roles (`org.roles.manage`), /users (`org.users.view`), /users/create (`org.users.manage`) — via `permission.api`, `role.api`, `user.api`.

### Écrans d'espace (le cœur du produit)
| Écran | Route | Rôle | API | Permission | Owner |
|---|---|---|---|---|---|
| Liste espaces | /spaces | CRUD espaces | `space.api` | — | Ulrich |
| **Analyse** | /spaces/:id | KPI/coûts/menu d'un espace | `analyse.api` (dashboard, kpis/events, kpis/menu, cost-breakdown) | front.fb.analyse | **Jean-Luc** |
| **Builder v2** | /spaces/:id/builder2 | Éditeur de plan (autosave granulaire) — frontend v1 (`/spaces/:id/builder`) retiré le 2026-07-22 | `builder-v2.api` | space.edit | Ulrich |
| **Event Predict** | /spaces/:id/predict | Prévision par événement | `eventPredict.api` (predict-versions) | front.fb.eventPredict | **Jean-Luc** |
| **Inventaire** | /spaces/:id/inventory | Comptages par shop/storage | `inventory.api` | front.fb.spaceInventory | **Jean-Luc** |
| **Logistique** | /spaces/:id/logistic | Stock attendu, mouvements, réconciliations | `logistics.api` | front.fb.logistic | Ulrich |
| **Restock** | /spaces/:id/restock | Planification réassort | `restock.api`, `menu-item.api`, `eventPredict.api`, `inventory.api` + legacy `utils/api.js` | front.fb.restock(Board) | **Jean-Luc** |

### Événements (Ulrich)
/events (`menu.events.manage`), /event-types, /event-categories, /event-subcategories — via `event.api`.

### RH (Jean-Luc)
/hr (`menu.hr.manage`, ?tab=suppliers|positions) — bibliothèques HR Suppliers / Staff Positions (`components/hr/` : HrView + onglets Vuetify/i18n, chrome WorkspaceAppHeader + rail, 2026-07-21 ; données **localStorage** via `utils/hrApi.js`, aucune table ni API backend — voir [`modules/11_RH_STAFFING.md`](modules/11_RH_STAFFING.md)).

### Menu F&B (Ulrich)
/suppliers (`menu.fb.suppliers`), /market-prices (`menu.fb.marketPrices`), /components + new/edit (`menu.fb.components`), /space-menus + détail shop (`menu.fb.spaceMenu`), /menu-items + create/edit (`menu.fb.menuItems`).

### Référentiels de configuration (Ulrich, `menu.config.manage`)
/product-categories, /product-types, /market-price-categories, /market-price-types, /component-categories, /component-types, /brand-names, /display-names, /industrials, /packing-types.

### Intégration & divers
/data-integration/fb (`menu.integration.fb`, Ulrich) — wizard mapping/sync via `mapping.api` + `aggregation.api` ; /predict-test (banc de test predict, **sans auth** — à gater ou retirer avant mise en avant) ; /about (stub legacy).

### Les 34 stores Vuex (résumé)
`auth` (RBAC), `analyse` (~90 filtres + caches), `inventory`, `logistics`, `spaces`, `spaceShops`, `spaceConfigurations`, `shopMenuItems`, `events` + 3 taxonomies, `menuItems`, `menuComponents`, `marketPrices` (+2 taxonomies +ingredients), `suppliers`, `packaging`, `productCategories/Types`, `componentCategories/Types`, `brandNames`, `displayNames`, `industrials`, `packingTypes`, `permissions`, `roles`, `users`, `weezeventLocations/Products`, `notifications`. La plupart avec cache TTL 5–15 min et single-flight.

---

## 4. Zones mortes et quarantaine (à purger — plan J8-10)

| Zone | Nature | Action |
|---|---|---|
| `versionReact/` (5,7 Mo, 225 fichiers) | Prototype Figma Make React — 0 import, mais divergence métier non portée (règle attendance [0,5–2,0]) | Arbitrer la règle avec Jean-Luc → taguer → sortir du repo |
| `api-datafriday-main/` (140 fichiers) | Copie d'un ancien backend DANS le repo front | Vérifier les tickets qui le ciblent → sortir du repo |
| `appCopy.vue`, `MenuBuilder.vue`, Consolidated*(Events/HR/Account), HRSuppliersView, StaffPositionsView | Vues jamais routées (les 3 vues RH : brièvement routées le 2026-07-21, puis remplacées le même jour par `components/hr/` en Vuetify natif — dialogs shadcn cassés dans le layout, cf. BUG-231) | Supprimer |
| `SpacesPage.vue` + `views/SpacesOverviewView.vue` (route `/spaces-overview`) | Cul-de-sac audité 2026-07-21 : **aucune entrée de navigation n'y mène** (restes : déf. de route, libellé RouteTransitionLoader, map AppHeader) ; style prototype, doublon de `/spaces` | Décision à acter : retirer la route ou assumer (cf. `modules/11_RH_STAFFING.md` 4ᵉ passe) |
| `src/ui/` (94 composants), `src/figma/`, `src/hooks/`, `src/types/` | Vestiges du portage React | Audit d'usage puis purge de l'inutilisé |
| `src/utils/api.js` (45 Ko) + `eventApi.js`, `mockAPI.js`, `predictiveAnalytics.legacy.js`, `.bak` | Monolithe API legacy (encore appelé par Restock ; ⚠️ son `baseUrl` = Edge Function KV morte `make-server-…` — les écrans RH l'ont quitté le 2026-07-21, cf. BUG-231) | Migrer Restock vers `endpoints/`, puis supprimer |
| `src/utils/hrApi.js` | ~~Mort~~ → **couche de données localStorage des écrans RH routés** (2026-07-21) | Remplacer par tables + `endpoints/hr.api.js` (étape 2, Bertrand #29) |
| `views/HomeView.vue` | Orpheline (route home = redirect) | Supprimer |
| Backend : `src/features/kv/` + modèle KvStore, imports RouterModule/Reflector | Module jamais enregistré | Enregistrer ou supprimer (recommandé : supprimer) |

---

## 5. Blocs CLAUDE.md proposés (à poser à la racine de chaque repo)

**datafriday-web/CLAUDE.md** :
```
# Data Friday — Frontend Vue 3
- Source de vérité : src/ uniquement. INTERDIT de lire ou copier : versionReact/ (prototype archivé), api-datafriday-main/ (ancien backend copié), appCopy.vue, MenuBuilder.vue.
- API : src/api/client.js + src/api/endpoints/*.api.js. Ne pas étendre src/utils/api.js (legacy).
- Branche de travail : develop. ⚠️ push sur develop = déploiement PROD Cloudflare (tant que le pipeline n'est pas changé).
- Carte des modules : ../docs/CARTOGRAPHIE_MODULES.md. Owners : Jean-Luc = Analyse/Predict/Inventory/Restock ; Emmanuel = auth/RBAC ; Ulrich = reste.
```

**api-datafriday-staging/CLAUDE.md** :
```
# Data Friday — Backend NestJS
- Branche unique : main. Migrations Prisma appliquées MANUELLEMENT (prisma migrate deploy, .env ciblé, DIRECT_URL 5432) AVANT le code — Render n'applique rien.
- 31 modules actifs sous src/features/ — carte : docs/ ou ../docs/CARTOGRAPHIE_MODULES.md. KvModule = mort, ne pas s'en inspirer.
- Multi-tenant : ne jamais requêter Prisma hors scoping tenant (guards globaux + nestjs-cls).
```
