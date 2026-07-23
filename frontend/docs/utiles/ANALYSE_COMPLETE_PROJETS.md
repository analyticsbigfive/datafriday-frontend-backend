# DataFriday — Analyse Complète des Projets

> **Date :** 15 avril 2026  
> **Projets analysés :** `api-datafriday-staging` (Backend NestJS) + `datafriday-web` (Frontend Vue.js)  
> **Objectif :** Point exhaustif sur l'état des projets, le mapping entre front et back, et la roadmap restante

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Schéma de données (Prisma)](#2-schéma-de-données-prisma)
3. [Mapping détaillé Frontend ↔ Backend](#3-mapping-détaillé-frontend--backend)
4. [Pipeline de données Weezevent → Dashboard](#4-pipeline-de-données-weezevent--dashboard)
5. [État d'avancement par module](#5-état-davancement-par-module)
6. [Ce qui reste à faire (Roadmap)](#6-ce-qui-reste-à-faire-roadmap)
7. [Problèmes identifiés et dette technique](#7-problèmes-identifiés-et-dette-technique)

---

## 1. Vue d'ensemble de l'architecture

### 1.1 Stack technique

| Couche | Technologie | Détail |
|--------|-------------|--------|
| **Frontend** | Vue 3 + Vuetify 3 + Tailwind | SPA avec Vuex, Vue Router, Axios |
| **Backend** | NestJS 10 + Fastify | REST API multi-tenant avec Prisma ORM |
| **Base de données** | PostgreSQL (Supabase) | 50+ modèles Prisma, 1700+ lignes de schéma |
| **Authentication** | Supabase Auth → JWT custom | Double layer : Supabase (frontend) + NestJS JWT (backend) |
| **Cache** | Redis + In-memory | Dashboard cache (TTL 2 min), rate limiting |
| **Queue** | BullMQ | Sync jobs Weezevent asynchrones |
| **Intégration** | Weezevent API (OAuth Keycloak) | Sync transactions, produits, événements |

### 1.2 Architecture globale

```
┌──────────────────────┐     JWT Bearer      ┌──────────────────────────────┐
│                      │ ──────────────────→  │                              │
│   datafriday-web     │                      │   api-datafriday-staging     │
│   (Vue 3 SPA)        │  ←──────────────────  │   (NestJS REST API)          │
│                      │     JSON responses    │                              │
│   Port: 5173         │                      │   Port: 3000                 │
└──────┬───────────────┘                      └──────┬───────────────────────┘
       │                                              │
       │ Supabase Auth                                │ Prisma ORM
       ▼                                              ▼
┌──────────────────────┐                      ┌──────────────────────────────┐
│   Supabase           │                      │   PostgreSQL                 │
│   (Auth seulement)   │                      │   50+ tables                 │
└──────────────────────┘                      │   Multi-tenant (tenantId)    │
                                              └──────────────────────────────┘
                                                       │
                                              ┌────────┴──────────┐
                                              │   Redis            │
                                              │   (Cache + Queue)  │
                                              └───────────────────┘
                                                       │
                                              ┌────────┴──────────┐
                                              │   Weezevent API    │
                                              │   (Cashless/Events)│
                                              └───────────────────┘
```

### 1.3 URLs de base

| Environnement | Frontend | API |
|---------------|----------|-----|
| Développement | `http://localhost:5173` | `http://localhost:3000/api/v1` |
| Production | — | `https://datafriday-api.onrender.com/api/v1` |

---

## 2. Schéma de données (Prisma)

### 2.1 Vue d'ensemble des modèles (50+ tables)

```
MULTI-TENANT                    MENU/F&B                         WEEZEVENT
─────────────                   ────────                         ─────────
Tenant ─────┐                   MenuItem ──┐                     WeezeventEvent
User ───────┤                   MenuComponent │                  WeezeventMerchant
UserTenant  │                   Ingredient ───┤                  WeezeventLocation
            │                   Packaging     │                  WeezeventProduct
SPACES      │                   MarketPrice   │                  WeezeventTransaction
──────      │                   Supplier      │                  WeezeventTransactionItem
Space ──────┤                                 │                  WeezeventPayment
Config      │                   JUNCTION TABLES                  WeezeventUser
Floor       │                   ───────────────                  WeezeventWallet
Forecourt   │                   MenuItemComponent                WeezeventWebhookEvent
SpaceElement│                   MenuItemIngredient               WeezeventOrder
Station     │                   MenuItemPackaging                WeezeventPrice
            │                   ComponentIngredient              WeezeventAttendee
EVENTS      │                   ComponentComponent               WeezeventProductMapping
──────      │                   MenuAssignment                   WeezeventProductVariant
Event       │                                                    WeezeventProductComponent
EventType   │                   CLASSIFICATION                   WeezeventSyncState
EventCategory│                  ──────────────
EventSubcategory                ProductType                      DASHBOARD AGGREGATIONS
            │                   ProductCategory                  ───────────────────────
AUDIT/SYSTEM│                                                    SpaceRevenueDailyAgg
────────────│                   MAPPING                          SpaceProductRevenueDailyAgg
AuditLog    │                   ───────                          SpaceDashboardVersion
Webhook     │                   WeezeventLocationSpaceMapping    AggregationJobLog
WebhookLog  │                   WeezeventMerchantElementMapping  UnmappedDataMetrics
CsvMapping  │                   WeezeventProductMapping
Menu        │
```

### 2.2 Relations clés

#### Multi-tenant
```
Tenant (1) ──→ (N) User         (backward compat)
Tenant (1) ──→ (N) UserTenant   (many-to-many, avec role + isOwner)
Tenant (1) ──→ (N) Space
Tenant (1) ──→ (N) MenuItem
Tenant (1) ──→ (N) MenuComponent
Tenant (1) ──→ (N) Ingredient
Tenant (1) ──→ (N) Supplier
Tenant (1) ──→ (N) MarketPrice
```

#### Composition des menus (hiérarchie)
```
MenuItem ─→ (N) MenuItemComponent ←─ MenuComponent
MenuItem ─→ (N) MenuItemIngredient ←─ Ingredient
MenuItem ─→ (N) MenuItemPackaging ←─ Packaging
MenuComponent ─→ (N) ComponentIngredient ←─ Ingredient
MenuComponent ─→ (N) ComponentComponent (parent ←→ enfant récursif)
Ingredient ─→ MarketPrice ─→ Supplier
```

#### Spaces & configurations
```
Space ─→ (N) Config ─→ (N) Floor ─→ (N) SpaceElement
                   └─→ (1) Forecourt ─→ (N) SpaceElement
                   └─→ (N) Station ─→ (N) MenuAssignment ─→ MenuItem
SpaceElement ─→ ElementPerformance (1:1)
SpaceElement ─→ (N) ElementStaff
SpaceElement ─→ (N) ElementInventory
SpaceElement ─→ (N) MenuAssignment ─→ MenuItem
```

#### Classification dynamique des produits
```
ProductType (1) ──→ (N) ProductCategory
MenuItem.typeId ──→ ProductType
MenuItem.categoryId ──→ ProductCategory
```

#### Events (planification interne)
```
EventType (1) ──→ (N) EventCategory (1) ──→ (N) EventSubcategory
Event ─→ EventType, EventCategory, EventSubcategory
```

### 2.3 Enums principaux

| Enum | Valeurs |
|------|---------|
| `UserRole` | ADMIN, MANAGER, STAFF, VIEWER |
| `TenantPlan` | FREE, STARTER, PROFESSIONAL, ENTERPRISE |
| `TenantStatus` | ACTIVE, SUSPENDED, TRIAL, CANCELLED |
| `ElementType` | access, hospitality, entertainment, shop, merchshop, entrance, storage, kitchen, fnb_food, fnb_beverages, fnb_bar, fnb_snack, fnb_icecream, seating, stage, parking, restroom, office, other |
| `GoodType` | Food, Beverage, Packaging, Other |
| `StorageType` | Cold, Dry, Frozen |
| `Diet` | Vegetarian, Vegan, GlutenFree, Halal, Kosher |
| `IngredientCategory` | Vegetable, Meat, Fish, Dairy, Bread, Spice, Condiment, Grain, Fruit, Herb, Oil, Sweetener, Beverage, Packaging, Other |

---

## 3. Mapping détaillé Frontend ↔ Backend

### 3.1 Tableau récapitulatif des endpoints

#### Spaces

| Frontend (space.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|------------------------|---------|-------------|------------|-----|--------|
| `getAllSpaces()` | GET | `/spaces` | SpacesController.findAll | QuerySpaceDto | ✅ Connecté |
| `getSpace(id)` | GET | `/spaces/:id` | SpacesController.findOne | — | ✅ Connecté |
| `createSpace(data)` | POST | `/spaces` | SpacesController.create | CreateSpaceDto | ✅ Connecté |
| `updateSpace(id, data)` | PATCH | `/spaces/:id` | SpacesController.update | UpdateSpaceDto | ✅ Connecté |
| `deleteSpace(id)` | DELETE | `/spaces/:id` | SpacesController.remove | — | ✅ Connecté |
| `getSpaceConfigurations(id)` | GET | `/spaces/:id/configurations` | SpacesController | — | ✅ Connecté |
| `getSpaceShopDetails(id)` | GET | `/spaces/:id/shop-details` | SpacesController | — | ✅ Connecté |

#### Menu Items

| Frontend (menu-item.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|------------------------------|---------|-------------|------------|-----|--------|
| `getAllMenuItems()` | GET | `/menu-items?page&limit` | MenuItemsController.findAll | Query params | ✅ Connecté |
| `getMenuItemById(id)` | GET | `/menu-items/:id` | MenuItemsController.findOne | — | ✅ Connecté |
| `createMenuItem(data)` | POST | `/menu-items` | MenuItemsController.create | CreateMenuItemDto | ✅ Connecté |
| `updateMenuItem(id, data)` | PATCH | `/menu-items/:id` | MenuItemsController.update | UpdateMenuItemDto | ✅ Connecté |
| `deleteMenuItem(id)` | DELETE | `/menu-items/:id` | MenuItemsController.remove | — | ✅ Connecté |
| `refreshMenuItemCosts(id)` | POST | `/menu-items/refresh-costs` | MenuItemsController | — | ✅ Connecté |
| `replaceMenuItemComponents(id, comps)` | PUT | `/menu-items/:id/components` | MenuItemsController | ReplaceMenuItemComponentsDto | ✅ Connecté |
| `replaceMenuItemIngredients(id, ings)` | PUT | `/menu-items/:id/ingredients` | MenuItemsController | ReplaceMenuItemIngredientsDto | ✅ Connecté |
| `replaceMenuItemPackagings(id, packs)` | PUT | `/menu-items/:id/packagings` | MenuItemsController | ReplaceMenuItemPackagingsDto | ✅ Connecté |

#### Menu Components

| Frontend (component.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|------------------------------|---------|-------------|------------|-----|--------|
| `getMenuComponents()` | GET | `/menu-components?page&limit` | MenuComponentsController.findAll | Query params | ✅ Connecté |
| `createMenuComponent(data)` | POST | `/menu-components` | MenuComponentsController.create | CreateMenuComponentDto | ✅ Connecté |
| `updateMenuComponent(id, data)` | PATCH | `/menu-components/:id` | MenuComponentsController.update | UpdateMenuComponentDto | ✅ Connecté |
| `deleteMenuComponent(id)` | DELETE | `/menu-components/:id` | MenuComponentsController.remove | — | ✅ Connecté |
| — | POST | `/menu-components/repair` | MenuComponentsController.repair | — | ⚠️ Pas d'appel frontend |
| — | POST | `/menu-components/refresh-costs` | MenuComponentsController.refreshCosts | — | ⚠️ Pas d'appel frontend |
| — | PUT | `/menu-components/:id/ingredients` | MenuComponentsController | ReplaceMenuComponentIngredientsDto | ⚠️ Pas d'appel frontend |
| — | PUT | `/menu-components/:id/children` | MenuComponentsController | ReplaceMenuComponentChildrenDto | ⚠️ Pas d'appel frontend |

#### Ingredients

| Frontend (ingredient.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|-------------------------------|---------|-------------|------------|-----|--------|
| `getIngredients()` | GET | `/ingredients` | IngredientsController.findAll | — | ✅ Connecté |
| `getIngredient(id)` | GET | `/ingredients/:id` | IngredientsController.findOne | — | ✅ Connecté |
| `createIngredient(data)` | POST | `/ingredients` | IngredientsController.create | CreateIngredientDto | ✅ Connecté |
| `updateIngredient(id, data)` | PATCH | `/ingredients/:id` | IngredientsController.update | — | ✅ Connecté |
| `deleteIngredient(id)` | DELETE | `/ingredients/:id` | IngredientsController.remove | — | ✅ Connecté |
| — | GET | `/ingredients/by-market-price/:id` | IngredientsController | — | ⚠️ Pas d'appel frontend dédié |

#### Market Prices

| Frontend (market.price.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|---------------------------------|---------|-------------|------------|-----|--------|
| `getMarketPrices()` | GET | `/market-prices` | MarketPricesController.findAll | — | ✅ Connecté |
| `getMarketPrice(id)` | GET | `/market-prices/:id` | MarketPricesController.findOne | — | ✅ Connecté |
| `createMarketPrice(data)` | POST | `/market-prices` | MarketPricesController.create | CreateMarketPriceDto | ✅ Connecté |
| `updateMarketPrice(id, data)` | PATCH | `/market-prices/:id` | MarketPricesController.update | UpdateMarketPriceDto | ✅ Connecté |
| `deleteMarketPrice(id)` | DELETE | `/market-prices/:id` | MarketPricesController.remove | — | ✅ Connecté |
| — | GET | `/market-prices/with-ingredients` | MarketPricesController | — | ⚠️ Pas d'appel frontend |
| — | POST | `/market-prices/import` | MarketPricesController | ImportMarketPricesDto | ⚠️ Pas d'appel frontend |
| — | POST | `/market-prices/deduplicate` | MarketPricesController | — | ⚠️ Pas d'appel frontend |

#### Suppliers

| Frontend (suppliers dans menu.api.js ou dédié) | Méthode | URL Backend | Controller | DTO | Status |
|-----------------------------------------------|---------|-------------|------------|-----|--------|
| — | GET | `/suppliers?page&limit` | SuppliersController.findAll | — | ✅ Utilisé dans SuppliersListView |
| — | POST | `/suppliers` | SuppliersController.create | CreateSupplierDto | ✅ Utilisé |
| — | PATCH | `/suppliers/:id` | SuppliersController.update | UpdateSupplierDto | ✅ Utilisé |
| — | DELETE | `/suppliers/:id` | SuppliersController.remove | — | ✅ Utilisé |

#### Events

| Frontend (event.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|--------------------------|---------|-------------|------------|-----|--------|
| `getEvents()` | GET | `/events` | EventsController.findAll | — | ✅ Connecté |
| `getEvent(id)` | GET | `/events/:id` | EventsController.findOne | — | ✅ Connecté |
| `createEvent(data)` | POST | `/events` | EventsController.create | CreateEventDto | ✅ Connecté |
| `updateEvent(id, data)` | PATCH | `/events/:id` | EventsController.update | UpdateEventDto | ✅ Connecté |
| `deleteEvent(id)` | DELETE | `/events/:id` | EventsController.remove | — | ✅ Connecté |
| `getEventTypes()` | GET | `/event-types` | EventTypesController.findAll | — | ✅ Connecté |
| `createEventType(data)` | POST | `/event-types` | EventTypesController.create | CreateEventTypeDto | ✅ Connecté |
| `getEventCategories()` | GET | `/event-categories` | EventCategoriesController.findAll | — | ✅ Connecté |
| `createEventCategory(data)` | POST | `/event-categories` | EventCategoriesController.create | CreateEventCategoryDto | ✅ Connecté |
| `getEventSubcategories()` | GET | `/event-subcategories` | EventSubcategoriesController.findAll | — | ✅ Connecté |

#### Products (Types & Categories)

| Frontend (product.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|----------------------------|---------|-------------|------------|-----|--------|
| `getProductCategory()` | GET | `/product-categories` | ProductCategoriesController.findAll | — | ✅ Connecté |
| `createProductCategory(data)` | POST | `/product-categories` | ProductCategoriesController.create | CreateProductCategoryDto | ✅ Connecté |
| `updateProductCategory(id, data)` | PATCH | `/product-categories/:id` | ProductCategoriesController.update | — | ✅ Connecté |
| `deleteProductCategory(id)` | DELETE | `/product-categories/:id` | ProductCategoriesController.remove | — | ✅ Connecté |
| `getProductType()` | GET | `/product-types` | ProductTypesController.findAll | — | ✅ Connecté |
| `createProductType(data)` | POST | `/product-types` | ProductTypesController.create | CreateProductTypeDto | ✅ Connecté |

#### Configurations

| Frontend (configuration.api.js) | Méthode | URL Backend | Controller | DTO | Status |
|----------------------------------|---------|-------------|------------|-----|--------|
| `getAllConfigurations()` | GET | `/configurations` | SpacesController | — | ✅ Connecté |
| `getConfiguration(id)` | GET | `/configurations/:id` | SpacesController | — | ✅ Connecté |
| `getConfigurationsBySpace(spaceId)` | GET | `/configurations?spaceId=X` | SpacesController | — | ✅ Connecté |
| `createConfiguration(data)` | POST | `/configurations` | SpacesController | CreateConfigDto | ✅ Connecté |
| `updateConfiguration(id, data)` | PATCH | `/configurations/:id` | SpacesController | — | ✅ Connecté |
| `deleteConfiguration(id)` | DELETE | `/configurations/:id` | SpacesController | — | ✅ Connecté |

#### Onboarding / Auth

| Frontend (onboarding.js) | Méthode | URL Backend | Controller | DTO | Status |
|---------------------------|---------|-------------|------------|-----|--------|
| `getOnboardingStatus()` | GET | `/onboarding/status` | OnboardingController.getStatus | — | ✅ Connecté |
| `completeOnboarding(data)` | POST | `/onboarding` | OnboardingController.createOrganization | CreateOrganizationDto | ✅ Connecté |
| `joinOrganization(code)` | POST | `/onboarding/join-by-code` | OnboardingController.joinByCode | JoinByCodeDto | ✅ Connecté |

#### Endpoints Backend SANS appel frontend

| Endpoint | Controller | Commentaire |
|----------|------------|-------------|
| `GET /me` | MeController | **Utilisé indirectement** via auth store |
| `GET /me/tenant` | MeController | ⚠️ **Non exploité** côté frontend |
| `GET /spaces/:id/dashboard` | DashboardController | ❌ **Pas de vue Dashboard/Space** côté frontend |
| `GET /spaces/:id/dashboard/health` | DashboardController | ❌ |
| `POST /spaces/:id/dashboard/invalidate` | DashboardController | ❌ |
| `POST /spaces/:id/dashboard/rebuild` | DashboardController | ❌ |
| `GET /weezevent/*` | WeezeventController | ❌ **Aucune vue Weezevent** côté frontend |
| `POST /weezevent/sync` | WeezeventController | ❌ |
| `GET /weezevent/products/mappings` | WeezeventController | ❌ |
| `POST /weezevent/products/:id/map` | WeezeventController | ❌ |
| `GET /analyse/*` | AnalyseController | ❌ **Analyse globale non connectée** |
| `GET/PATCH /organizations/:org/integrations/*` | IntegrationsController | ❌ **Configuration Weezevent non connectée** |
| `POST /orchestrator/*` | OrchestratorController | ❌ |
| `GET /spaces/pinned`, `POST /spaces/pinned` | PinnedSpacesController | ⚠️ Partiel |
| `GET /spaces/:id/access` | SpacesController | ❌ |
| `POST /space-menus` | SpaceMenusController | ✅ Partiellement connecté |

### 3.2 Détail des champs — Mapping Frontend ↔ Backend ↔ Prisma

#### MenuItem : Champs envoyés par le frontend vs attendus par le backend

| Champ Frontend (JS) | Champ Backend (DTO) | Champ Prisma | Type | Notes |
|----------------------|---------------------|--------------|------|-------|
| `name` | `name` | `name` | String | ✅ Identique |
| `typeId` | `typeId` | `typeId` | String (FK) | ✅ Identique |
| `categoryId` | `categoryId` | `categoryId` | String (FK) | ✅ Identique |
| `basePrice` | `basePrice` | `basePrice` | Decimal(10,2) | ✅ |
| `totalCost` | `totalCost` | `totalCost` | Decimal(12,4) | ✅ Calculé backend |
| `margin` | `margin` | `margin` | Float | ✅ Calculé backend |
| `description` | `description` | `description` | String? | ✅ |
| `picture` | `picture` | `picture` | String? | ✅ |
| `allergens` | `allergens` | `allergens` | String[] | ✅ |
| `diet` | `diet` | `diet` | Diet[] (enum) | ✅ |
| `storageType` | `storageType` | `storageType` | StorageType[] | ✅ |
| `readyForSale` | `readyForSale` | `readyForSale` | String? ("Yes"/"No") | ✅ |
| `comboItem` | `comboItem` | `comboItem` | String? ("Yes"/"No") | ✅ |
| `numberOfPiecesRecipe` | `numberOfPiecesRecipe` | `numberOfPiecesRecipe` | Int? | ✅ |
| `components` (array) | via `PUT /:id/components` | `MenuItemComponent` relation | N:N | ⚠️ Opération séparée |
| `ingredients` (array) | via `PUT /:id/ingredients` | `MenuItemIngredient` relation | N:N | ⚠️ Opération séparée |
| `packagings` (array) | via `PUT /:id/packagings` | `MenuItemPackaging` relation | N:N | ⚠️ Opération séparée |

#### MenuComponent : Champs

| Champ Frontend | Champ DTO | Champ Prisma | Notes |
|----------------|-----------|--------------|-------|
| `name` | `name` | `name` | ✅ |
| `unit` | `unit` | `unit` | ✅ |
| `category` | `category` | `category` | ✅ Flexible string |
| `unitCost` | `unitCost` | `unitCost` | Decimal(10,4) |
| `allergens` | `allergens` | `allergens` | String[] |
| `description` | `description` | `description` | ✅ |
| `storageType` | `storageType` | `storageType` | StorageType? |
| `componentCategory` | `componentCategory` | `componentCategory` | ✅ |
| `numberOfUnitsRecipe` | `numberOfUnitsRecipe` | `numberOfUnitsRecipe` | Int? |
| `ingredients` | `ingredients[]` | ComponentIngredient | ✅ via DTO Transform |
| `children` | `children[]` | ComponentComponent | ✅ via DTO Transform |

> **Note importante :** Les DTOs `MenuComponentIngredientLineDto` et `MenuComponentChildLineDto` ont des `@Transform` sophistiqués qui acceptent plusieurs formats d'entrée (string, number, objet avec variantes de clés). Cela résout les inconsistances frontend.

#### Ingredient : Champs

| Champ Frontend | Champ DTO | Champ Prisma | Notes |
|----------------|-----------|--------------|-------|
| `name` | `name` | `name` | ✅ |
| `recipeUnit` | `recipeUnit` | `recipeUnit` | ✅ |
| `purchaseUnit` | `purchaseUnit` | `purchaseUnit` | ✅ |
| `supplier` | `supplier` | `supplier` | String? (nom) |
| `storageType` | `storageType` | `storageType` | StorageType? |
| `marketPriceId` | `marketPriceId` | `marketPriceId` | FK string? |
| `costPerRecipeUnit` | `costPerRecipeUnit` | `costPerRecipeUnit` | Decimal(10,4) |
| `costPerPurchaseUnit` | `costPerPurchaseUnit` | `costPerPurchaseUnit` | Decimal(10,4) |
| `ingredientCategory` | `ingredientCategory` | `ingredientCategory` | IngredientCategory? |
| `purchaseUnitsPerRecipeUnit` | `purchaseUnitsPerRecipeUnit` | `purchaseUnitsPerRecipeUnit` | Float? |
| `active` | `active` | `active` | Boolean (default true) |

#### MarketPrice : Champs

| Champ Frontend | Champ DTO | Champ Prisma | Notes |
|----------------|-----------|--------------|-------|
| `itemName` | `itemName` | `itemName` | ✅ |
| `unit` | `unit` | `unit` | ✅ |
| `price` | `price` | `price` | Decimal(10,2) |
| `goodType` | `goodType` | `goodType` | Enum: Food/Beverage/Packaging/Other |
| `category` | `category` | `category` | String? |
| `image` | `image` | `image` | String? |
| `supplier` | `supplier` | `supplier` | String? (nom) |
| `supplierId` | `supplierId` | `supplierId` | FK string? |
| `supplierItem` | `supplierItem` | `supplierItem` | String? |
| `recipeUnit` | `recipeUnit` | `recipeUnit` | String? |
| `purchaseUnitConversion` | `purchaseUnitConversion` | `purchaseUnitConversion` | Float? |
| `pricePerUnit` | `pricePerUnit` | `pricePerUnit` | Decimal(10,4) |
| `packedUnits` | `packedUnits` | `packedUnits` | Int? |
| `numberOfUnits` | `numberOfUnits` | `numberOfUnits` | Int? |
| `unitsPerPurchase` | `unitsPerPurchase` | `unitsPerPurchase` | Int? |

#### Space : Champs

| Champ Frontend | Champ DTO | Champ Prisma | Notes |
|----------------|-----------|--------------|-------|
| `name` | `name` | `name` | ✅ (min 2, max 100) |
| `image` | `image` | `image` | ✅ Base64/URL |
| `spaceType` | `spaceType` | `spaceType` | Enum-like string |
| `spaceTypeOther` | `spaceTypeOther` | `spaceTypeOther` | ✅ |
| `maxCapacity` | `maxCapacity` | `maxCapacity` | Int (min 0) |
| `department` | `department` | `department` | Int (1-95) |
| `homeTeam` | `homeTeam` | `homeTeam` | ✅ |
| `addressLine1/2` | `addressLine1/2` | `addressLine1/2` | ✅ |
| `city/postcode/country` | `city/postcode/country` | `city/postcode/country` | ✅ |
| `tel/email` | `tel/email` | `tel/email` | ✅ Email validé |
| `mainContactPerson` | `mainContactPerson` | `mainContactPerson` | ✅ |
| `contactTel/contactEmail` | `contactTel/contactEmail` | `contactTel/contactEmail` | ✅ |
| `instagram/facebook/twitter/tiktok` | idem | idem | ✅ |

#### Event : Champs

| Champ Frontend | Champ DTO | Champ Prisma | Notes |
|----------------|-----------|--------------|-------|
| `name` | `name` | `name` | ✅ |
| `eventDate` | `eventDate` | `eventDate` | DateTime (ISO8601) |
| `spaceId` | `spaceId` | `spaceId` | String? |
| `configurationId` | `configurationId` | `configurationId` | String? |
| `eventTypeId` | `eventTypeId` | `eventTypeId` | FK string? |
| `eventCategoryId` | `eventCategoryId` | `eventCategoryId` | FK string? |
| `eventSubcategoryId` | `eventSubcategoryId` | `eventSubcategoryId` | FK string? |
| `location` | `location` | `location` | String? |
| `spaceName` | `spaceName` | `spaceName` | String? |
| `sessions` | `sessions` | `sessions` | String? |
| `numberOfSessions` | `numberOfSessions` | `numberOfSessions` | Int? |
| `hasOpeningAct` | `hasOpeningAct` | `hasOpeningAct` | Boolean? |
| `hasIntermission` | `hasIntermission` | `hasIntermission` | Boolean? |
| `status` | `status` | `status` | String? |

#### Supplier : Champs

| Champ Frontend | Champ DTO | Champ Prisma | Notes |
|----------------|-----------|--------------|-------|
| `name` | `name` | `name` | ✅ |
| `email` | `email` | `email` | Email validé |
| `phone` (frontend) | `phone` (DTO) | `tel` (Prisma) | ⚠️ **Mapping inconsistant** |
| `address` | `address` | `address` | ✅ |
| `city` | `city` | `city` | ✅ |
| `postcode` | `postcode` | `postcode` | ✅ |
| `picture` | `picture` | `picture` | ✅ |
| `contactName` | `contactName` | `contactName` | ✅ |
| `spaceIds` | `spaceIds` | `sites` | ⚠️ **Nom différent** frontend=spaceIds, prisma=sites |
| `configurationIds` | `configurationIds` | `configurationIds` | ✅ |
| `sectors` | `sectors` | `sectors` | ✅ |

### 3.3 Inconsistances de mapping identifiées

| # | Entité | Problème | Sévérité | Correction |
|---|--------|----------|----------|------------|
| 1 | Supplier | Frontend envoie `phone`, DTO accepte `phone`, Prisma stocke `tel` | ⚠️ Moyenne | Aligner DTO et service pour mapper `phone` → `tel` |
| 2 | Supplier | Frontend utilise `spaceIds`, Prisma stocke `sites` (String[]) | ⚠️ Moyenne | Le service mappe probablement déjà, vérifier |
| 3 | MenuItem.components | Frontend envoie dans le body, Backend attend PUT séparé | ℹ️ Par design | Workflow en 2 étapes (create → set components) |
| 4 | MenuComponent | DTOs ont des `@Transform` complexes pour accepter multiples formats | ℹ️ Robustesse | Normaliser côté frontend à terme |
| 5 | Dashboard | Backend API complète, Frontend 0% | 🔴 Critique | À implémenter entièrement côté frontend |
| 6 | Weezevent | Backend API complète (~30 endpoints), Frontend 0% | 🔴 Critique | À implémenter entièrement côté frontend |

---

## 4. Pipeline de données Weezevent → Dashboard

### 4.1 Vue d'ensemble du pipeline

```
┌─────────────────┐     OAuth/API     ┌──────────────────────┐
│  Weezevent API  │ ◄───────────────► │  weezevent-auth      │
│  (Cashless)     │                   │  .service.ts         │
└─────────────────┘                   └──────────┬───────────┘
                                                  │
                                      ┌───────────▼───────────┐
                                      │  weezevent-client     │
                                      │  .service.ts          │
                                      │  (HTTP + normalisation)│
                                      └───────────┬───────────┘
                                                  │
                                      ┌───────────▼───────────┐
                                      │  weezevent-sync       │
                                      │  .service.ts          │
                                      │  (Sync & upsert)      │
                                      └───────────┬───────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    ▼                             ▼                             ▼
          ┌─────────────────┐         ┌───────────────────┐         ┌───────────────────┐
          │ WeezeventEvent  │         │ WeezeventProduct  │         │ WeezeventTrans.   │
          │ WeezeventLocation│        │ WeezeventVariant  │         │ WeezeventItem     │
          │ WeezeventMerchant│        │ WeezeventComponent│         │ WeezeventPayment  │
          └────────┬────────┘         └────────┬──────────┘         └────────┬──────────┘
                   │                            │                             │
                   │    MAPPING LAYER           │                             │
                   ▼                            ▼                             ▼
    ┌──────────────────────────┐  ┌────────────────────────┐                  │
    │ LocationSpaceMapping     │  │ ProductMapping         │                  │
    │ (Location → Space)       │  │ (WzProduct → MenuItem) │                  │
    └───────────┬──────────────┘  └────────────────────────┘                  │
                │                                                             │
    ┌───────────┼─────────────────────────────────────────────────────────────┘
    │           │
    ▼           ▼
┌──────────────────────────────────┐
│  space-aggregation.service.ts    │
│  (Agrégation quotidienne)        │
│                                  │
│  Transaction + Mapping           │
│  → GROUP BY day/event/merchant   │
│  → INSERT SpaceRevenueDailyAgg   │
│  → INSERT SpaceProductRevenueAgg │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  space-dashboard.service.ts      │
│  (Cache Redis + calculs)         │
│                                  │
│  → KPIs (revenue, transactions)  │
│  → Charts (time series)          │
│  → Lists (top shops, products)   │
│  → Filters (events, merchants)   │
└──────────────────────────────────┘
```

### 4.2 Les 3 niveaux de mapping (CRITIQUE)

#### Niveau 1 : WeezeventLocation → Space

```
Table: WeezeventLocationSpaceMapping
┌──────────┬─────────────────────┬─────────┬──────────┐
│ id       │ weezeventLocationId │ spaceId │ tenantId │
├──────────┼─────────────────────┼─────────┼──────────┤
│ map_1    │ wz_loc_paris_001    │ sp_001  │ tenant_x │
│ map_2    │ wz_loc_lyon_002     │ sp_002  │ tenant_x │
└──────────┴─────────────────────┴─────────┴──────────┘

But: Associer les données Weezevent d'un lieu physique à un Space DataFriday
Impact: Sans ce mapping, AUCUNE donnée de revenue n'est attribuée au Space
Status Backend: ✅ Modèle Prisma OK, utilisé dans l'agrégation
Status Frontend: ❌ Aucune UI pour créer/modifier ces mappings
```

#### Niveau 2 : WeezeventMerchant → SpaceElement

```
Table: WeezeventMerchantElementMapping
┌──────────┬─────────────────────┬────────────────┬──────────┐
│ id       │ weezeventMerchantId │ spaceElementId │ tenantId │
├──────────┼─────────────────────┼────────────────┼──────────┤
│ map_3    │ wz_merch_burger     │ elem_shop_N1   │ tenant_x │
│ map_4    │ wz_merch_frites     │ elem_shop_N2   │ tenant_x │
└──────────┴─────────────────────┴────────────────┴──────────┘

But: Répartir le revenu par point de vente/stand dans le plan du Space
Impact: Sans mapping, le revenu est global (pas de détail par shop)
Status Backend: ✅ Modèle Prisma OK, LEFT JOIN dans l'agrégation
Status Frontend: ❌ Aucune UI pour créer/modifier ces mappings
```

#### Niveau 3 : WeezeventProduct → MenuItem

```
Table: WeezeventProductMapping
┌──────────┬──────────────────────┬────────────┬────────────┬────────────┐
│ id       │ weezeventProductId   │ menuItemId │ autoMapped │ confidence │
├──────────┼──────────────────────┼────────────┼────────────┼────────────┤
│ map_5    │ wz_prod_hotdog       │ mi_001     │ false      │ null       │
│ map_6    │ wz_prod_biere_33cl   │ mi_002     │ true       │ 0.85       │
└──────────┴──────────────────────┴────────────┴────────────┴────────────┘

But: Réconcilier les produits Weezevent avec les MenuItem créés dans DataFriday
Impact: Permet l'analyse des marges (coût MenuItem vs revenu Weezevent)
Bonus: Auto-mapping possible par nom similaire (confidence score)
Status Backend: ✅ Modèle + endpoints (GET mappings, POST map)
Status Frontend: ❌ Aucune UI pour le mapping
```

### 4.3 Données non mappées (monitoring)

```
Table: UnmappedDataMetrics
┌──────────┬────────────┬──────────────────────┬──────────────────┬─────────┐
│ tenantId │ entityType │ entityId             │ entityName       │ revenue │
├──────────┼────────────┼──────────────────────┼──────────────────┼─────────┤
│ tenant_x │ location   │ wz_loc_inconnu       │ "Bar Zone C"    │ 5400€   │
│ tenant_x │ merchant   │ wz_merch_temp        │ "Stand Éphémère"│ 1200€   │
│ tenant_x │ product    │ wz_prod_menu_special │ "Menu du jour"  │ 3800€   │
└──────────┴────────────┴──────────────────────┴──────────────────┴─────────┘

Impact: Revenue "perdue" car non attribuée à un Space/Element/MenuItem
Endpoint backend: GET /spaces/:id/dashboard/health → missingMappingsCount
Status Frontend: ❌ Pas d'alerte ni d'UI de résolution
```

### 4.4 Endpoints du pipeline (Backend → Frontend mapping)

| Étape Pipeline | Endpoint Backend | Frontend prévu | Status |
|----------------|------------------|----------------|--------|
| Config Weezevent | `PATCH /organizations/:org/integrations/weezevent` | Settings / Intégrations | ❌ Non implémenté |
| Déclencher sync | `POST /weezevent/sync` | Bouton "Synchroniser" | ❌ Non implémenté |
| Voir état sync | `GET /weezevent/sync/status` | Badge / indicateur | ❌ Non implémenté |
| Voir événements Wz | `GET /weezevent/events` | Liste événements Wz | ❌ Non implémenté |
| Voir produits Wz | `GET /weezevent/products` | Liste produits Wz | ❌ Non implémenté |
| Mapper Location→Space | **Pas d'endpoint dédié** | UI de mapping | ❌ Manque endpoint + UI |
| Mapper Merchant→Element | **Pas d'endpoint dédié** | UI de mapping | ❌ Manque endpoint + UI |
| Mapper Product→MenuItem | `POST /weezevent/products/:id/map` | UI de mapping | ❌ UI manquante |
| Voir mappings | `GET /weezevent/products/mappings` | Status mappings | ❌ Non implémenté |
| Dashboard Space | `GET /spaces/:id/dashboard` | Vue Dashboard Space | ❌ Non implémenté |
| Santé Dashboard | `GET /spaces/:id/dashboard/health` | Alertes / badges | ❌ Non implémenté |
| Rebuild agrégation | `POST /spaces/:id/dashboard/rebuild` | Bouton admin | ❌ Non implémenté |

---

## 5. État d'avancement par module

### 5.1 Matrice complète

| Module | Backend API | Frontend Vue | Connexion Front↔Back | Complétude |
|--------|:-----------:|:------------:|:--------------------:|:----------:|
| **Auth / Onboarding** | ✅ 100% | ✅ 100% | ✅ 100% | **100%** |
| **Spaces (CRUD)** | ✅ 100% | ✅ 90% | ✅ 90% | **90%** |
| **Space Builder** | ✅ 100% | 🔄 70% | ✅ 70% | **70%** |
| **Menu Items** | ✅ 100% | ✅ 95% | ✅ 95% | **95%** |
| **Menu Components** | ✅ 100% | ✅ 90% | ⚠️ 80% | **85%** |
| **Ingredients** | ✅ 100% | ✅ 85% | ✅ 85% | **85%** |
| **Market Prices** | ✅ 100% | ✅ 90% | ✅ 90% | **90%** |
| **Suppliers** | ✅ 100% | ✅ 90% | ⚠️ 85% | **88%** |
| **Product Types/Cat** | ✅ 100% | ✅ 90% | ✅ 90% | **90%** |
| **Events** | ✅ 100% | 🔄 50% | 🔄 50% | **60%** |
| **Space Menus** | ✅ 100% | 🔄 50% | 🔄 50% | **60%** |
| **Space Dashboard** | ✅ 100% | ❌ 0% | ❌ 0% | **30%** |
| **Weezevent Sync** | ✅ 100% | ❌ 0% | ❌ 0% | **30%** |
| **Weezevent Mapping** | ✅ 100% | 🔄 80% | 🔄 70% | **80%** |
| **Analytics** | ✅ 80% | ❌ 0% | ❌ 0% | **25%** |
| **Integrations Config** | ✅ 100% | ❌ 0% | ❌ 0% | **30%** |
| **Orchestrator** | ✅ 80% | ❌ 0% | ❌ 0% | **25%** |
| **Users CRUD** | ✅ 90% | ❌ 5% | ❌ 0% | **30%** |
| **Tenants Settings** | ✅ 100% | ❌ 5% | ❌ 0% | **30%** |
| **Audit Logs** | ✅ 100% | ❌ 0% | ❌ 0% | **30%** |
| **Webhooks** | ✅ 100% | ❌ 0% | ❌ 0% | **30%** |
| **HR Module** | ❌ 0% | ❌ 10% (stubs) | ❌ 0% | **5%** |
| **Packaging** | ✅ 80% | ❌ 0% | ❌ 0% | **25%** |

### 5.2 Résumé par phase

| Phase | Description | Avancement |
|-------|-------------|------------|
| **Phase 1 — Infra** | Multi-tenant, Auth, Prisma, RLS, Guards | ✅ **100%** |
| **Phase 2 — CRUD core** | Spaces, MenuItems, Components, Ingredients, Suppliers, MarketPrices | ✅ **88%** |
| **Phase 3 — Events & Classification** | Events, ProductTypes, Categories | 🔄 **65%** |
| **Phase 4 — Weezevent Integration** | Sync, Mapping, Dashboard | 🔄 **70%** (backend 100%, frontend 80%, connexion 70%) |
| **Phase 5 — Settings & Admin** | Users, Tenants, Integrations, Audit | ⚠️ **30%** (backend OK, frontend 0%) |
| **Phase 6 — Analytics & Reports** | Dashboard global, Analyse, KPIs | ⚠️ **20%** |
| **Phase 7 — Production** | CI/CD, Tests E2E, Monitoring, Sécurité | ❌ **5%** |

---

## 6. Ce qui reste à faire (Roadmap)

### 6.1 P0 — Critique (nécessaire pour une V1 fonctionnelle)

#### Frontend — Weezevent Integration UI

| Tâche | Effort | Prérequis |
|-------|--------|-----------|
| Page Settings > Intégrations | 2-3j | — |
| Formulaire config Weezevent (clientId, secret, organizationId) | 1j | Settings page |
| Bouton Sync + indicateur d'état | 1j | API `POST /weezevent/sync` |
| Vue liste événements Weezevent | 2j | `GET /weezevent/events` |
| Vue liste produits Weezevent | 2j | `GET /weezevent/products` |

#### Frontend — Mapping UI (✅ COMPLÉTÉ)

| Tâche | Effort | Statut |
|-------|--------|--------|
| **UI Mapping Location → Space** | 3-4j | ✅ StepMapSpace.vue |
| **UI Mapping Merchant → SpaceElement** | 3-4j | ✅ StepMapShops.vue |
| **UI Mapping Product → MenuItem** | 3j | ✅ StepMapMenuItems.vue |
| Tableau de bord "données non mappées" | 2j | ✅ StepProcessTimeline.vue |
| Auto-suggestion de mapping (fuzzy match) | 2j | ✅ useSpaceMapping + useMenuMapping |

> **Note :** Les endpoints backend `MappingsController` et `AggregationController` ont été créés et enregistrés dans `app.module.ts`.

#### Frontend — Space Dashboard

| Tâche | Effort | Prérequis |
|-------|--------|-----------|
| Vue Dashboard Space (KPIs, graphiques, listes) | 5-7j | Mapping Location→Space |
| Filtres (période, événement, merchant) | 2j | — |
| Graphiques Chart.js (revenue over time, by shop) | 3j | — |
| Top shops + Top products listes | 1j | — |

### 6.2 P1 — Important (V1 complète)

#### Backend manquant

| Tâche | Effort | Notes |
|-------|--------|-------|
| ~~**Controller CRUD Mapping** (Location→Space, Merchant→Element)~~ | ~~2-3j~~ | ✅ MappingsModule créé |
| ~~Endpoint auto-suggestion mapping~~ | ~~1j~~ | ✅ Fuzzy match côté frontend |
| Soft delete actif dans services | 1j | Schema OK, filtrage `deletedAt: null` manquant |
| Script migration données legacy | 1j | `type`→`typeId`, `category`→`categoryId` |

#### Frontend manquant

| Tâche | Effort | Notes |
|-------|--------|-------|
| Page Settings complète (profile, team, billing) | 4-5j | — |
| Gestion Users (invite, roles, suppression) | 3-4j | API `UsersController` existe |
| Gestion Tenant (info org, plan, upgrade) | 2-3j | API `TenantsController` existe |
| Events — compléter CRUD avec cascade Type→Cat→SubCat | 2-3j | API existe |
| Space Menus — remplacer mock data par vraie API | 2-3j | API `SpaceMenusController` existe |
| Audit Logs viewer | 2j | API existe |
| Import CSV Market Prices | 1-2j | API `POST /market-prices/import` existe |

### 6.3 P2 — Nice to have (V2)

| Tâche | Effort | Notes |
|-------|--------|-------|
| Module HR (employés, postes, planning) | 10-15j | Backend + Frontend à créer |
| Analytics globaux (hors Space) | 5-7j | `AnalyseController` partiel |
| Webhooks outbound configuration UI | 2-3j | Backend complet |
| Packaging CRUD UI | 2j | Backend complet |
| Export XLSX depuis les listes | 1-2j | XLSX déjà en dépendance frontend |
| Mode offline / PWA | 5j | Service worker déjà enregistré |
| CI/CD pipeline (GitHub Actions) | 2-3j | — |
| Tests E2E Cypress | 5-7j | Config Cypress existe |
| Monitoring (Sentry, DataDog) | 2j | — |

### 6.4 Estimation globale

| Priorité | Effort total | Deadline suggérée |
|----------|-------------|-------------------|
| **P0** (Weezevent + Mapping + Dashboard) | ~25-30j | Sprint immédiat |
| **P1** (Settings + Users + Events complet) | ~20-25j | Sprint suivant |
| **P2** (HR, Analytics, Webhooks, CI/CD) | ~30-40j | V2 |
| **TOTAL** | ~75-95 jours/développeur | — |

---

## 7. Problèmes identifiés et dette technique

### 7.1 Problèmes d'architecture

| # | Problème | Sévérité | Solution |
|---|----------|----------|----------|
| 1 | **Deux clients API** dans le frontend (`src/api/client.js` + `src/lib/api.js`) | ⚠️ Moyenne | Supprimer `src/lib/api.js` (legacy), tout migrer vers `src/api/client.js` |
| 2 | **Mock data** dans plusieurs composants frontend (Space Menus, HR) | ⚠️ Moyenne | Remplacer par les vrais appels API |
| 3 | **Pas de gestion d'erreurs centralisée** côté frontend | ⚠️ Moyenne | L'event `api-error` existe mais n'est pas écouté globalement |
| 4 | **Pas de tests unitaires frontend** | ⚠️ Moyenne | Jest/Vitest configuré mais 0 tests |
| 5 | **Endpoints Mapping manquants** côté backend | ✅ Résolu | MappingsModule + AggregationModule créés |

### 7.2 Mapping Inconsistances

| # | Description | Impact | Fix |
|---|-------------|--------|-----|
| 1 | Supplier: `phone` (front/DTO) vs `tel` (Prisma) | ⚠️ Données perdues si non mappé dans service | Vérifier le service, aligner les noms |
| 2 | Supplier: `spaceIds` (front/DTO) vs `sites` (Prisma) | ⚠️ Idem | Vérifier le mapping |
| 3 | MenuComponent: multiples formats d'entrée acceptés via @Transform | ℹ️ OK mais fragile | Normaliser côté frontend |
| 4 | `readyForSale`/`comboItem` sont des String ("Yes"/"No") au lieu de Boolean | ℹ️ Héritage Figma | Migration à long terme |

### 7.3 Sécurité

| # | Item | Status |
|---|------|--------|
| 1 | JWT validation sur toutes les routes protégées | ✅ OK |
| 2 | Tenant isolation via `@CurrentTenant()` decorator | ✅ OK |
| 3 | Rate limiting (20 req/s, 300 req/min, 5000 req/h) | ✅ OK |
| 4 | RBAC via `@Roles()` guard | ✅ OK |
| 5 | Validation DTO avec class-validator | ✅ OK |
| 6 | Encryption Weezevent secrets | ✅ OK |
| 7 | Webhook signature validation (HMAC) | ✅ OK |
| 8 | CORS / Helmet | ✅ OK |
| 9 | Input sanitization | ⚠️ Pas de sanitization HTML explicite |
| 10 | RLS PostgreSQL | ⚠️ Fichier `rls-policies.sql` existe, déploiement non vérifié |

### 7.4 Performance

| # | Item | Status |
|---|------|--------|
| 1 | Dashboard cache Redis (TTL 2 min) | ✅ OK |
| 2 | Pagination sur findAll() | ✅ OK |
| 3 | Indexes Prisma sur toutes les FK et filtres courants | ✅ OK (60+ indexes) |
| 4 | Batch operations pour sync Weezevent | ✅ OK |
| 5 | Agrégation quotidienne pré-calculée | ✅ OK |
| 6 | Frontend lazy loading des routes | ⚠️ Non vérifié |

---

## Annexe A — Routes Frontend complètes

```
PUBLIC (guestOnly)
├── /login                    → LoginView
├── /signup                   → SignUpView
├── /forgot-password          → ForgotPasswordView
├── /reset-password           → ResetPasswordView
├── /verify-email             → VerifyEmailView
└── /auth/callback            → AuthCallbackView

AUTH ONLY (requireAuth)
└── /onboarding               → OnboardingView

PROTECTED (requireOrganization)
└── /dashboard                → DashboardView (shell)
    ├── /spaces               → SpaceListView
    ├── /spaces/:id/builder2  → BuilderPage (frontend v1 `/spaces/:id/builder` retiré le 2026-07-22)
    ├── /events               → EventsListView
    ├── /event-types          → EventsTypeListView
    ├── /event-categories     → EventsCategorieListView
    ├── /event-subcategories  → EventsSubcategorieListView
    ├── /suppliers            → SuppliersListView
    ├── /market-prices        → MarketPriceListView
    ├── /components           → componentListView
    ├── /components/new       → ComponentCreateView
    ├── /components/edit/:id  → ComponentCreateView
    ├── /space-menus          → SpaceMenuView
    ├── /space-menus/:id/shops/:id → ShopDetailView
    ├── /menu-items           → MenuItemView
    ├── /menu-items/create    → MenuItemCreateView
    ├── /menu-items/edit/:id  → MenuItemCreateView
    ├── /product-categories   → ProductCategoryList
    ├── /product-types        → ProductTypeList
    └── /data-integration/fb  → DataIntegrationView ← NOUVEAU

ROUTES MANQUANTES (à créer)
├── /settings                 → SettingsView
├── /settings/profile         → ProfileView
├── /settings/team            → TeamView
├── /settings/billing         → BillingView
├── /settings/integrations    → IntegrationsView
├── /spaces/:id/dashboard     → SpaceDashboardView ← CRITIQUE
├── /weezevent                → WeezeventOverview
├── /weezevent/events         → WeezeventEventsView
├── /weezevent/products       → WeezeventProductsView
~~├── /weezevent/mapping        → WeezeventMappingView~~ → **Remplacé par /data-integration/fb**
├── /analytics                → AnalyticsView
├── /audit                    → AuditLogsView
├── /users                    → UsersView
└── /packaging                → PackagingView
```

## Annexe B — Schéma des endpoints API Backend

```
API v1 (/api/v1)
├── /health                     GET     (public)
├── /onboarding
│   ├── /status                 GET     (JwtOnboardingGuard)
│   ├── /                       POST    (JwtOnboardingGuard)
│   ├── /join-by-code           POST    (JwtOnboardingGuard)
│   └── /join/:slug             POST    (deprecated)
├── /me                         GET     (JwtDatabaseGuard)
│   └── /tenant                 GET     (JwtDatabaseGuard)
├── /spaces
│   ├── /                       GET POST (JwtDatabaseGuard, RolesGuard)
│   ├── /statistics             GET
│   ├── /pinned                 GET POST
│   ├── /:id                    GET PATCH DELETE
│   ├── /:id/image              PUT
│   ├── /:id/configurations     GET
│   ├── /:id/shop-details       GET
│   ├── /:id/dashboard          GET
│   ├── /:id/dashboard/health   GET
│   ├── /:id/dashboard/invalidate POST
│   └── /:id/dashboard/rebuild  POST
├── /configurations
│   ├── /                       GET POST
│   └── /:id                    GET PATCH DELETE
├── /menu-items
│   ├── /                       GET POST
│   ├── /refresh-costs          POST
│   ├── /:id                    GET PATCH DELETE
│   ├── /:id/components         PUT
│   ├── /:id/ingredients        PUT
│   └── /:id/packagings         PUT
├── /menu-components
│   ├── /                       GET POST
│   ├── /repair                 POST
│   ├── /refresh-costs          POST
│   ├── /:id                    GET PATCH DELETE
│   ├── /:id/ingredients        PUT
│   └── /:id/children           PUT
├── /ingredients
│   ├── /                       GET POST
│   ├── /:id                    GET PATCH DELETE
│   └── /by-market-price/:id    GET
├── /market-prices
│   ├── /                       GET POST
│   ├── /import                 POST
│   ├── /with-ingredients       GET
│   ├── /deduplicate            POST
│   ├── /item/:itemName         GET
│   └── /:id                    GET PATCH DELETE
├── /suppliers
│   ├── /                       GET POST
│   └── /:id                    GET PATCH DELETE
├── /events
│   ├── /                       GET POST
│   └── /:id                    GET PATCH DELETE
├── /event-types
│   ├── /                       GET POST
│   └── /:id                    PATCH DELETE
├── /event-categories
│   ├── /                       GET POST
│   └── /:id                    PATCH DELETE
├── /event-subcategories
│   ├── /                       GET POST
│   └── /:id                    PATCH DELETE
├── /product-types
│   ├── /                       GET POST
│   └── /:id                    DELETE
├── /product-categories
│   ├── /                       GET POST
│   └── /:id                    PATCH DELETE
├── /space-menus
│   ├── /                       POST
│   └── /:spaceId/:configId     GET
├── /weezevent
│   ├── /transactions           GET
│   ├── /sync                   POST
│   ├── /sync/status            GET
│   ├── /sync/state             DELETE
│   ├── /events                 GET
│   ├── /products               GET
│   ├── /products/mappings      GET
│   ├── /products/:id/map       POST
│   ├── /orders                 GET
│   ├── /prices                 GET
│   ├── /attendees              GET
│   └── /webhook                POST (public)
├── /weezevent-analytics        GET (avec query params)
├── /mappings                                          ← NOUVEAU
│   ├── /location-space         GET POST
│   ├── /location-space/:id     DELETE
│   ├── /merchant-element       GET POST
│   ├── /merchant-element/bulk  POST
│   ├── /merchant-element/:id   DELETE
│   ├── /product-menu           GET
│   ├── /product-menu/bulk      POST
│   ├── /product-menu/:id       DELETE
│   └── /progress/:locationId   GET
├── /aggregation                                       ← NOUVEAU
│   ├── /events-timeline/:spaceId GET
│   ├── /process-events         POST
│   ├── /synchronize            POST
│   └── /progress/:jobId        GET
├── /organizations/:org/integrations
│   ├── /                       GET
│   ├── /weezevent              PATCH
│   └── /webhooks               PATCH
├── /analyse
│   ├── /dashboard              GET
│   ├── /kpis/menu              GET
│   ├── /kpis/events            GET
│   └── /cost-breakdown         GET
└── /orchestrator
    ├── /health                 GET (public)
    ├── /invalidate-cache       POST
    └── /strategy               GET
```

---

> **Conclusion (mise à jour 15/04/2026) :** Le backend est très avancé (~90% des features implémentées). Le module **Data Integration F&B** (Mapping + Agrégation) est désormais implémenté côté backend (MappingsModule, AggregationModule) ET frontend (5 composants wizard, 5 composables, 2 API endpoint files, route + navigation). La priorité actuelle est : **tests d'intégration**, **Space Dashboard** (visualisation des données agrégées), et **pages Settings/Users/Events**.
