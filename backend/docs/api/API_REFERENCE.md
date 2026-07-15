# API Reference — DataFriday

> ⚙️ **Document généré** par `node scripts/generate-api-reference.mjs` — ne pas éditer à la main.
> Les descriptions viennent des décorateurs `@ApiOperation` des contrôleurs ; les notes de module vivent dans le script.

**305 routes** · générées le 2026-07-05

## Base URL

```
Staging/Prod : https://datafriday-api.onrender.com
Local        : http://localhost:3000
```

**Préfixe :** `/api/v1` (toutes les routes ci-dessous sont relatives à ce préfixe)

- Documentation interactive : `/docs` (Basic Auth via `DOCS_USER`/`DOCS_PASSWORD` si définis)
- Spécification OpenAPI brute : `GET /api/v1/openapi.json` (public, consommé par le front et la CI)
- Export statique de la spec : [openapi.json](./openapi.json) (régénéré par `pnpm docs:api`) — importable dans Postman/Insomnia, générateurs de clients, etc.

## Authentification

JWT Supabase dans `Authorization: Bearer <token>`. Exceptions : `GET /health`, le webhook Weezevent et `openapi.json`.
Le groupe **Onboarding** exige le JWT mais pas de tenant ; tout le reste exige un utilisateur rattaché à un tenant (isolation multi-tenant automatique côté Prisma).
CORS : headers autorisés `Content-Type`, `Authorization`, `X-Requested-With`, `If-Match`.

Codes d'erreur : voir [HTTP_ERROR_CODES.md](./HTTP_ERROR_CODES.md). Guides détaillés : [SPACES_API_GUIDE.md](./SPACES_API_GUIDE.md), [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md), [FRONTEND_MENU_COMPOSITION_API.md](./FRONTEND_MENU_COMPOSITION_API.md).

## Sommaire

- [Général](#général) — 9 routes
- [Auth, comptes & RBAC](#auth-comptes-rbac) — 43 routes
- [Espaces & Builder](#espaces-builder) — 56 routes
- [Menus d'espace, inventaire & réarmement](#menus-d-espace-inventaire-réarmement) — 16 routes
- [Événements & prédiction](#événements-prédiction) — 26 routes
- [Catalogue, recettes & coûts](#catalogue-recettes-coûts) — 78 routes
- [Intégration Weezevent & analytics](#intégration-weezevent-analytics) — 77 routes

---

## Général

`GET /health` est public ; `/health/protected` et `/health/admin` servent à tester la chaîne auth/RBAC. Les métriques (`/metrics*`) exposent cache, queues et DB.

### App

_Source : `src/app.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Obtenir le message racine de l’application |

### Health

_Source : `src/health/health.controller.ts`, `src/health/metrics.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Vérifier le status de l'API |
| GET | `/health/detailed` | Health check détaillé avec Redis et Queues |
| GET | `/health/protected` | Test endpoint protégé |
| GET | `/health/admin` | Test endpoint admin |
| GET | `/metrics` | Get system metrics and performance stats |
| GET | `/metrics/cache` | Get cache performance metrics |
| GET | `/metrics/queues` | Get queue performance metrics |
| GET | `/metrics/database` | Get database performance metrics |

---

## Auth, comptes & RBAC

Auth Supabase (JWT Bearer). Onboarding = seul groupe accessible sans tenant. RBAC dynamique : ADMIN + 6 rôles métier, permissions par écran. Un compte déjà rattaché à une organisation ne peut pas en créer une nouvelle (409).

### Onboarding

_Source : `src/features/onboarding/onboarding.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/onboarding/status` | Vérifier le statut de l'utilisateur |
| POST | `/onboarding` | Créer une organisation |
| POST | `/onboarding/join-by-code` | Rejoindre une organisation via code d'invitation |
| POST | `/onboarding/join/:slug` | [DÉPRÉCIÉ] Rejoindre par slug |

### Me

_Source : `src/features/me/me.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/me` | Obtenir le profil utilisateur courant |
| PATCH | `/me` | Mettre à jour son propre profil |
| GET | `/me/tenant` | Obtenir l'organisation de l'utilisateur courant |

### Users

_Source : `src/features/users/users.controller.ts`_

Expose `status`/`lastSignInAt` (Supabase) et le champ `phone`. `POST /:id/reinvite` répond 409 si l'utilisateur s'est déjà connecté ou appartient à plusieurs organisations.

| Méthode | Route | Description |
|---|---|---|
| POST | `/users` | Créer un nouvel utilisateur |
| GET | `/users` | Lister les utilisateurs |
| GET | `/users/statistics` | Statistiques des utilisateurs |
| GET | `/users/me` | Profil utilisateur courant |
| GET | `/users/:id` | Détail d'un utilisateur |
| PATCH | `/users/:id` | Mettre à jour un utilisateur |
| DELETE | `/users/:id` | Supprimer un utilisateur |
| POST | `/users/invite` | Inviter un utilisateur |
| POST | `/users/:id/reinvite` | Renvoyer une invitation |
| PATCH | `/users/:id/role` | Changer le rôle d'un utilisateur |
| POST | `/users/:id/spaces/:spaceId/access` | Accorder l'accès à un espace |
| DELETE | `/users/:id/spaces/:spaceId/access` | Révoquer l'accès à un espace |

### Roles

_Source : `src/features/roles/roles.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/roles` | Lister les rôles |
| GET | `/roles/:id` | Détail d'un rôle |
| POST | `/roles` | Créer un rôle |
| PATCH | `/roles/:id` | Mettre à jour un rôle |
| DELETE | `/roles/:id` | Supprimer un rôle |

### Permissions

_Source : `src/features/permissions/permissions.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/permissions` | Lister les permissions |
| POST | `/permissions` | Créer une permission custom |
| PATCH | `/permissions/:id` | Mettre à jour une permission |
| DELETE | `/permissions/:id` | Supprimer une permission |

### Organizations

_Source : `src/features/organizations/organizations.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/organizations/:id` | Obtenir une organisation |
| PATCH | `/organizations/:id` | Mettre à jour une organisation |
| DELETE | `/organizations/:id` | Supprimer une organisation |

### Tenants

_Source : `src/features/tenants/tenants.controller.ts`_

Réservé super admin (administration des organisations).

| Méthode | Route | Description |
|---|---|---|
| POST | `/tenants` | Créer un nouveau tenant (admin) |
| GET | `/tenants` | Lister tous les tenants (admin) |
| GET | `/tenants/statistics` | Statistiques des tenants (admin) |
| GET | `/tenants/by-slug/:slug` | Obtenir un tenant par slug |
| GET | `/tenants/:id` | Obtenir un tenant par ID |
| PATCH | `/tenants/:id` | Mettre à jour un tenant |
| DELETE | `/tenants/:id` | Supprimer un tenant (soft delete) |
| DELETE | `/tenants/:id/permanent` | Supprimer définitivement un tenant (hard delete) |
| POST | `/tenants/:id/upgrade` | Changer le plan d'un tenant |
| GET | `/tenants/:id/usage` | Statistiques d'usage d'un tenant |
| POST | `/tenants/:id/suspend` | Suspendre un tenant |
| POST | `/tenants/:id/reactivate` | Réactiver un tenant suspendu |

---

## Espaces & Builder

Le Builder v2 (zones/éléments relationnels, table `Zone`) est le chemin principal ; `Configurations` (floors JSON v1) est legacy — pas de nouvelles écritures v1 quand l'espace a des zones.

### Spaces

_Source : `src/features/spaces/spaces.controller.ts`_

`GET /:id/shops?configId=` scope la liste à une configuration. `POST /:id/quick-elements/bulk` remplace la boucle quick-element + location-shop (1 appel au lieu de ~2N). `POST /:id/assign-floor` porte `zoneName`/`position`/`shopDimensions` et accepte `configId`.

| Méthode | Route | Description |
|---|---|---|
| POST | `/spaces` | Créer un nouvel espace/établissement |
| GET | `/spaces` | Lister tous les espaces de l'organisation |
| GET | `/spaces/light` | Liste légère des espaces (id + name) |
| GET | `/spaces/statistics` | Statistiques des espaces |
| GET | `/spaces/pinned` | Obtenir les espaces épinglés |
| GET | `/spaces/:id` | Obtenir un espace par ID |
| PATCH | `/spaces/:id` | Mettre à jour un espace |
| PUT | `/spaces/:id/image` | Mettre à jour l'image d'un espace |
| GET | `/spaces/:id/configurations` | Obtenir les configurations d'un espace |
| GET | `/spaces/:id/shops` | Lister les shops (SpaceElements) d'un espace — version légère — Query : `configId`. |
| GET | `/spaces/:id/shop-details` | Obtenir tous les shops (points de vente) d'un espace |
| GET | `/spaces/:id/event-timeline/:eventId` | Timeline minute par minute d'un événement |
| GET | `/spaces/:id/weezevent-events` | Liste des WeezeventEvents d'un espace avec métadonnées d'enrichissement |
| PATCH | `/spaces/:id/weezevent-events/:eventId` | Mettre à jour les métadonnées d'enrichissement d'un WeezeventEvent |
| POST | `/spaces/:id/weezevent-events/:eventId/sync-attendees` | Synchronise les participants d'un événement depuis l'API WeezPay |
| DELETE | `/spaces/:id` | Supprimer un espace |
| POST | `/spaces/:id/pin` | Épingler un espace |
| DELETE | `/spaces/:id/pin` | Désépingler un espace |
| POST | `/spaces/:id/access` | Donner accès à un utilisateur |
| DELETE | `/spaces/:id/access/:userId` | Révoquer l'accès d'un utilisateur |
| GET | `/spaces/:id/users` | Lister les utilisateurs ayant accès |
| POST | `/spaces/:id/quick-element` | Créer rapidement un shop dans un espace (import Weezevent) |
| POST | `/spaces/:id/quick-elements/bulk` | Créer et mapper des shops en masse (étape 2 import Weezevent) |
| POST | `/spaces/:id/assign-floor` | Assigner des shops à un étage, au parvis ou à la zone External Merch |
| GET | `/spaces/:id/floor-options` | Lister les zones/étages disponibles (dialogue « Assigner un étage », étape 2) |

### Configurations

_Source : `src/features/spaces/spaces.controller.ts`_

Legacy v1 (floors JSON). À n'utiliser que pour les espaces sans zones v2 ; le save réécrit et renvoie les ids d'éléments (réconciliation par `level` côté front).

| Méthode | Route | Description |
|---|---|---|
| POST | `/configurations` | Créer ou mettre à jour une configuration |
| GET | `/configurations/:id` | Obtenir une configuration par ID |
| DELETE | `/configurations/:id` | Supprimer une configuration |
| PATCH | `/configurations/:id` | Mettre à jour une configuration |
| PATCH | `/configurations/elements/:elementId` | Modifier un shop (SpaceElement) |
| POST | `/configurations/:id/quick-element` | Créer rapidement un shop dans un espace (import Weezevent) |

### Builder v2

_Source : `src/features/builder-v2/builder-v2.controller.ts`_

Verrou optimiste : `PATCH /elements/:id` exige le header `If-Match` (version élément). Suppressions : 409 avec `blockers`/`reasons`/`orphanCount`, puis `?force=true` après confirmation utilisateur. `performance`/`staff`/`inventory` sont scopés configuration via `?configId=` (défaut : première adhésion).

| Méthode | Route | Description |
|---|---|---|
| GET | `/builder-v2/spaces/:spaceId/state` | État complet du builder en 1 round-trip |
| POST | `/builder-v2/spaces/:spaceId/zones` | Créer une zone (étage / parvis / espace externe) |
| PATCH | `/builder-v2/zones/reorder` | Réordonner les zones d'un espace (sortIndex) |
| PATCH | `/builder-v2/zones/:id` | Modifier une zone (nom, dimensions, geometry — hole/cornerRadius) |
| DELETE | `/builder-v2/zones/:id` | Supprimer une zone — 409 { blockers } si éléments utilisés, ?force=true après confirmation — Query : `force`. |
| POST | `/builder-v2/zones/:id/duplicate` | Dupliquer un étage (zone + éléments + adhésions, PAS les mappings) |
| POST | `/builder-v2/zones/:zoneId/elements` | Créer un élément — l'id serveur revient dans la réponse (jamais d'id temporaire) |
| PATCH | `/builder-v2/elements/batch` | Patch géométrique de plusieurs éléments en une transaction |
| PATCH | `/builder-v2/elements/:id` | PATCH partiel d'un élément (verrou optimiste par élément) — Header `If-Match` requis. |
| POST | `/builder-v2/elements/:id/duplicate` | Dupliquer un élément (copie adhésions + perf/staff/inventaire, PAS les mappings) |
| DELETE | `/builder-v2/elements/:id` | Supprimer un élément — 409 { reasons } si utilisé, ?force=true après confirmation — Query : `force`. |
| PUT | `/builder-v2/elements/:id/performance` | Remplacer les métriques de performance de l'élément (scopé config : ?configId=, défaut 1re adhésion) |
| PUT | `/builder-v2/elements/:id/staff` | Remplacer la liste des postes staff de l'élément (scopé config : ?configId=, défaut 1re adhésion) |
| PUT | `/builder-v2/elements/:id/inventory` | Remplacer l'inventaire de l'élément (scopé config : ?configId=, défaut 1re adhésion) |
| POST | `/builder-v2/configurations/:configId/elements/:elementId` | Cocher : ajouter l'élément à la configuration (idempotent) |
| DELETE | `/builder-v2/configurations/:configId/elements/:elementId` | Décocher : retirer l'adhésion — 409 si c'est la dernière de l'élément |
| POST | `/builder-v2/spaces/:spaceId/configurations` | Créer une configuration — cloneFromConfigId = copie des adhésions (instantané) |
| PATCH | `/builder-v2/configurations/:id` | Renommer une configuration — 404 stricte (pas d'upsert) |
| DELETE | `/builder-v2/configurations/:id` | Supprimer une configuration — 409 { orphanCount } si des éléments seraient orphelins |

### Pinned Spaces

_Source : `src/features/spaces/pinned-spaces.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/pinned-spaces` | Obtenir les espaces épinglés |
| POST | `/pinned-spaces` | Définir les espaces épinglés |

### Space Dashboard

_Source : `src/features/spaces/dashboard.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/spaces/:spaceId/dashboard` | Obtenir le dashboard agrégé d’un espace |
| GET | `/spaces/:spaceId/dashboard/health` | Obtenir l’état de santé des agrégations du dashboard |
| POST | `/spaces/:spaceId/dashboard/invalidate` | Invalider le cache du dashboard d’un espace |
| POST | `/spaces/:spaceId/dashboard/rebuild` | Reconstruire les agrégations du dashboard d’un espace |

---

## Menus d'espace, inventaire & réarmement

La disponibilité des menu items est calculée côté serveur (ingrédient actif + fournisseur résolu + `Supplier.sites` contenant l'espace, règle stricte). L'inventaire des shops est dérivé du menu (déduplication par référence de recette), les quantités persistent dans `ElementInventory`.

### Space Menus

_Source : `src/features/space-menus/space-menus.controller.ts`_

`GET /shop/:shopId/items` accepte `?enabledOnly=true`. `GET /storage-inventory?shopIds=a,b,c` agrège l'inventaire dérivé de plusieurs shops (élément Storage du builder2 : recettes F&B + articles merch).

| Méthode | Route | Description |
|---|---|---|
| GET | `/space-menu/shop/:shopId` | Get all menu items assigned to a shop (SpaceElement) |
| GET | `/space-menu/shop/:shopId/items` | Get full tenant menu item catalog with server-computed availability for a shop — Query : `enabledOnly`. |
| GET | `/space-menu/shop/:shopId/inventory` | Get derived inventory lines for a shop (deduplicated recipe references) |
| GET | `/space-menu/storage-inventory` | Get aggregated derived inventory for a set of shops (Storage element, builder2) — Query : `shopIds` (csv). |
| GET | `/space-menu/space/:spaceId/items` | Get menu items associated to a space with server-computed availability |
| GET | `/space-menu/:spaceId/:configId` | Get menu configuration for a space/config |
| POST | `/space-menu` | Save menu configuration for a space/config |

### Inventory

_Source : `src/features/inventory/inventory.controller.ts`_

Snapshots append-only par espace(+event) ; `POST /inventory-counts` fait un upsert unitaire par space+event+shop+item.

| Méthode | Route | Description |
|---|---|---|
| GET | `/inventory/:spaceId/latest` | Dernier snapshot d'inventaire d'un espace (tous events) |
| GET | `/inventory/:spaceId/:eventId` | Dernier snapshot d'inventaire pour un espace+événement |
| POST | `/inventory` | Enregistrer un snapshot d'inventaire (append-only) |
| POST | `/inventory-counts` | Upsert un comptage unitaire (par space+event+shop+item) |

### Restock State

_Source : `src/features/restock-state/restock-state.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/spaces/:spaceId/restock-state` | Lire l'état de réarmement d'un space |
| PUT | `/spaces/:spaceId/restock-state` | Enregistrer / mettre à jour l'état de réarmement (upsert) |
| DELETE | `/spaces/:spaceId/restock-state` | Réinitialiser l'état de réarmement |

### KV

_Source : `src/features/kv/kv.controller.ts`_

⚠️ **Module non enregistré dans AppModule** : ces routes existent dans le code mais renvoient 404 en réel (décision « KV front » en attente). Absentes de la spec OpenAPI.

| Méthode | Route | Description |
|---|---|---|
| GET | `/kv/:key` | Lire une valeur KV |
| PUT | `/kv/:key` | Écrire / mettre à jour une valeur KV |

---

## Événements & prédiction

Les events portent tickets vendus/scannés et, pour le sport, les équipes (les events gardent le nom en repli si l'équipe est supprimée). Les versions de prédiction sont rattachées à un event, avec une version par défaut exclusive.

### Events

_Source : `src/features/events/events.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| POST | `/events` | Créer un événement |
| GET | `/events` | Lister les événements |
| GET | `/events/:id` | Obtenir un événement par ID |
| PATCH | `/events/:id` | Mettre à jour un événement |
| DELETE | `/events/:id` | Supprimer un événement |

### Event Types

_Source : `src/features/events/events.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/event-types` | Lister les types d’événements |
| POST | `/event-types` | Créer un type d’événement |
| PATCH | `/event-types/:id` | Mettre à jour un type d’événement |
| DELETE | `/event-types/:id` | Supprimer un type d’événement |

### Event Categories

_Source : `src/features/events/events.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/event-categories` | Lister les catégories d’événements |
| POST | `/event-categories` | Créer une catégorie d’événement |
| PATCH | `/event-categories/:id` | Mettre à jour une catégorie d’événement |
| DELETE | `/event-categories/:id` | Supprimer une catégorie d’événement |

### Event Subcategories

_Source : `src/features/events/events.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/event-subcategories` | Lister les sous-catégories d’événements |
| POST | `/event-subcategories` | Créer une sous-catégorie d’événement |
| PATCH | `/event-subcategories/:id` | Mettre à jour une sous-catégorie d’événement |
| DELETE | `/event-subcategories/:id` | Supprimer une sous-catégorie d’événement |

### Teams

_Source : `src/features/events/events.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/teams` | Lister les équipes (scopées tenant, filtrables par compétition) |
| POST | `/teams` | Créer une équipe |
| PATCH | `/teams/:id` | Mettre à jour une équipe |
| DELETE | `/teams/:id` | Supprimer une équipe (les events gardent le nom en repli) |

### Event Predict Versions

_Source : `src/features/events/predict-versions.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/events/:eventId/predict-versions` | Lister les versions de prédiction d'un événement |
| POST | `/events/:eventId/predict-versions` | Créer une version de prédiction |
| PUT | `/events/:eventId/predict-versions/default` | Définir la version par défaut (exclusif) |
| PATCH | `/predict-versions/:id` | Mettre à jour partiellement une version de prédiction |
| DELETE | `/predict-versions/:id` | Supprimer une version de prédiction |

---

## Catalogue, recettes & coûts

Prix de vente par espace sur les menu items : `spacePrices` `{ spaceId: { ttc, vatRate } }`, `basePrice` = repli global ; chaque application de prix est historisée (`MenuItemPriceHistory`, scopée espace). Les Market Prices ont leur propre taxonomie (types/catégories), distincte de celle des menu items.

### Menu Items

_Source : `src/features/menu-items/menu-items.controller.ts`_

`GET /menu-items?spaceId=` filtre les items associés à un espace (évite de paginer tout le catalogue). `backfill-weezevent-prices` : body `{ dryRun, overwrite, eventId? }`, résout le dernier prix non nul **de l'espace** (jamais cross-espace).

| Méthode | Route | Description |
|---|---|---|
| POST | `/menu-items` | Créer un article de menu |
| POST | `/menu-items/bulk` | Créer plusieurs articles de menu |
| GET | `/menu-items` | Lister tous les articles de menu — Query : `spaceId`, pagination. |
| POST | `/menu-items/refresh-costs` | Recalculer les coûts des articles |
| POST | `/menu-items/:id/refresh-costs` | Recalculer les coûts d'un article |
| POST | `/menu-items/apply-weezevent-prices` | Appliquer le prix Weezevent à plusieurs menu items (étape 3 Data Integration) |
| POST | `/menu-items/backfill-weezevent-prices` | Backfill de masse : corriger tous les menu items mappés à 0 (prix par espace) |
| POST | `/menu-items/recipes` | Recettes de plusieurs menu items (réarmement plats composés) |
| GET | `/menu-items/:id/recipe` | Recette d'un menu item (réarmement plat composé) |
| POST | `/menu-items/:id/apply-weezevent-price` | Appliquer le prix Weezevent à un menu item |
| GET | `/menu-items/:id/price-history` | Historique des prix d’un menu item |
| GET | `/menu-items/:id` | Obtenir un article par ID |
| PUT | `/menu-items/:id/components` | Remplacer les composants d'un menu item |
| PUT | `/menu-items/:id/ingredients` | Remplacer les ingrédients d'un menu item |
| PUT | `/menu-items/:id/packagings` | Remplacer les packagings d'un menu item |
| PATCH | `/menu-items/:id` | Mettre à jour un article |
| DELETE | `/menu-items/:id` | Supprimer un article |

### Product Types

_Source : `src/features/menu-items/menu-items.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/product-types` | Lister tous les types de produits |
| POST | `/product-types` | Créer un type de produit |
| PATCH | `/product-types/:id` | Mettre à jour un type de produit |
| DELETE | `/product-types/:id` | Supprimer un type de produit |

### Product Categories

_Source : `src/features/menu-items/menu-items.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/product-categories` | Lister toutes les catégories de produits |
| POST | `/product-categories` | Créer une catégorie de produit |
| PATCH | `/product-categories/:id` | Mettre à jour une catégorie de produit |
| DELETE | `/product-categories/:id` | Supprimer une catégorie de produit |

### Brands

_Source : `src/features/brands/brands.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/brand-names` | Lister les brands du tenant |
| POST | `/brand-names` | Créer un brand |
| GET | `/brand-names/:id` | Récupérer un brand par id |
| PATCH | `/brand-names/:id` | Mettre à jour un brand |
| DELETE | `/brand-names/:id` | Supprimer un brand |

### Display Names

_Source : `src/features/display-names/display-names.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/display-names` | Lister les display names du tenant |
| POST | `/display-names` | Créer un display name |
| DELETE | `/display-names/:id` | Supprimer un display name |

### Menu Components

_Source : `src/features/menu-components/menu-components.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| POST | `/menu-components` | Créer un composant de menu |
| POST | `/menu-components/repair` | Réparer les composants de menu |
| POST | `/menu-components/refresh-costs` | Recalculer les coûts des composants de menu |
| GET | `/menu-components` | Lister tous les composants de menu |
| GET | `/menu-components/:id` | Obtenir un composant par ID |
| PUT | `/menu-components/:id/ingredients` | Remplacer les lignes d'ingrédients d'un composant |
| PUT | `/menu-components/:id/children` | Remplacer les sous-composants (children) d'un composant |
| PATCH | `/menu-components/:id` | Mettre à jour un composant |
| DELETE | `/menu-components/:id` | Supprimer un composant |

### Ingredients

_Source : `src/features/ingredients/ingredients.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| POST | `/ingredients` | Créer un ingrédient |
| GET | `/ingredients` | Lister tous les ingrédients |
| GET | `/ingredients/by-market-price/:marketPriceId` | Obtenir tous les ingrédients liés à un MarketPrice |
| GET | `/ingredients/:id` | Obtenir un ingrédient par ID |
| PATCH | `/ingredients/:id` | Mettre à jour un ingrédient |
| DELETE | `/ingredients/:id` | Supprimer un ingrédient |

### Packaging

_Source : `src/features/packaging/packaging.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| POST | `/packaging` | Créer un packaging |
| GET | `/packaging` | Lister tous les packagings |
| GET | `/packaging/:id` | Obtenir un packaging par ID |
| PATCH | `/packaging/:id` | Mettre à jour un packaging |
| DELETE | `/packaging/:id` | Supprimer un packaging |

### Suppliers

_Source : `src/features/suppliers/suppliers.controller.ts`_

`Supplier.sites` = liste des espaces desservis ; un tableau vide signifie **aucun** espace (règle stricte utilisée par la disponibilité des menus).

| Méthode | Route | Description |
|---|---|---|
| POST | `/suppliers` | Créer un fournisseur |
| GET | `/suppliers` | Lister tous les fournisseurs |
| GET | `/suppliers/:id` | Obtenir un fournisseur par ID |
| PATCH | `/suppliers/:id` | Mettre à jour un fournisseur |
| DELETE | `/suppliers/:id` | Supprimer un fournisseur |

### Market Prices

_Source : `src/features/market-prices/market-prices.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| POST | `/market-prices` | Créer un prix du marché |
| POST | `/market-prices/import` | Importer des prix en masse |
| POST | `/market-prices/deduplicate` | Dédupliquer les prix du marché |
| POST | `/market-prices/sync-ingredients` | Synchroniser les ingrédients depuis les prix du marché (Food/Beverage) |
| POST | `/market-prices/sync-packagings` | Synchroniser les packagings depuis les prix du marché (Packaging) |
| GET | `/market-prices` | Lister tous les prix du marché |
| GET | `/market-prices/with-packagings` | Lister les MarketPrices de type Packaging avec leurs Packagings liés |
| GET | `/market-prices/with-ingredients` | Lister tous les prix du marché avec leurs ingrédients (tenant actuel uniquement) |
| GET | `/market-prices/:id` | Obtenir un prix par ID |
| PATCH | `/market-prices/:id` | Mettre à jour un prix |
| DELETE | `/market-prices/:id` | Supprimer un prix |
| DELETE | `/market-prices/item/:itemName` | Supprimer tous les prix par nom de produit |

### Market Price Types

_Source : `src/features/market-prices/market-price-taxonomy.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/market-price-types` | Lister tous les Market Price Types |
| POST | `/market-price-types` | Créer un Market Price Type |
| PATCH | `/market-price-types/:id` | Mettre à jour un Market Price Type |
| DELETE | `/market-price-types/:id` | Supprimer un Market Price Type |

### Market Price Categories

_Source : `src/features/market-prices/market-price-taxonomy.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/market-price-categories` | Lister toutes les Market Price Categories |
| POST | `/market-price-categories` | Créer une Market Price Category |
| PATCH | `/market-price-categories/:id` | Mettre à jour une Market Price Category |
| DELETE | `/market-price-categories/:id` | Supprimer une Market Price Category |

---

## Intégration Weezevent & analytics

Pipeline : credentials (Integrations, multi-instance) → sync (jobs par bissection) → mappings location/shop/merchant/produit → agrégation → analytics. Le prix F&B affiché est dérivé des transactions (prix modal par produit×espace) car le catalogue Weezevent est souvent sans prix.

### Integrations

_Source : `src/features/integrations/integrations.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/organizations/:organizationId/integrations` | Lister les intégrations d’une organisation |
| POST | `/organizations/:organizationId/integrations/weezevent/test` | Tester les credentials Weezevent |
| PATCH | `/organizations/:organizationId/integrations/weezevent` | Mettre à jour la configuration Weezevent |
| GET | `/organizations/:organizationId/integrations/weezevent` | Obtenir la configuration Weezevent |
| GET | `/organizations/:organizationId/integrations/weezevent/instances` | Lister les instances Weezevent |
| POST | `/organizations/:organizationId/integrations/weezevent/instances` | Créer une instance Weezevent |
| PATCH | `/organizations/:organizationId/integrations/weezevent/instances/:instanceId` | Mettre à jour une instance Weezevent |
| DELETE | `/organizations/:organizationId/integrations/weezevent/instances/:instanceId` | Supprimer une instance Weezevent |
| POST | `/organizations/:organizationId/integrations/weezevent/instances/:instanceId/test` | Tester les credentials d'une instance Weezevent |
| PATCH | `/organizations/:organizationId/integrations/webhooks` | Mettre à jour la configuration des webhooks |
| GET | `/organizations/:organizationId/integrations/webhooks` | Obtenir la configuration des webhooks |

### Mappings

_Source : `src/features/mappings/mappings.controller.ts`_

`GET /product-menu?includeSales=true` (défaut `false`) ajoute l'agrégat `salesPricing`, coûteux — ne l'activer que là où le prix comparé est affiché.

| Méthode | Route | Description |
|---|---|---|
| GET | `/mappings/location-space` | Lister les mappings location → space |
| GET | `/mappings/location-space/:locationId` | Obtenir le mapping d'une location |
| POST | `/mappings/location-space` | Créer/mettre à jour un mapping location → space |
| DELETE | `/mappings/location-space/:locationId` | Supprimer un mapping location → space |
| GET | `/mappings/location-shop` | Lister les mappings location → shop |
| POST | `/mappings/location-shop` | Créer/mettre à jour un mapping location → shop |
| POST | `/mappings/location-shop/bulk` | Créer/mettre à jour des mappings location → shop en masse |
| DELETE | `/mappings/location-shop/:locationId` | Supprimer un mapping location → shop |
| GET | `/mappings/merchant-element` | Lister les mappings merchant → element |
| POST | `/mappings/merchant-element` | Créer/mettre à jour un mapping merchant → element |
| POST | `/mappings/merchant-element/bulk` | Créer/mettre à jour des mappings merchant → element en masse |
| DELETE | `/mappings/merchant-element/:merchantId` | Supprimer un mapping merchant → element |
| GET | `/mappings/product-menu/stats` | Compteurs réels des mappings product → menu item |
| GET | `/mappings/product-menu` | Lister les mappings product → menu item — Query : `includeSales` (défaut `false`). |
| POST | `/mappings/product-menu/bulk` | Créer/mettre à jour des mappings product → menu item en masse |
| DELETE | `/mappings/product-menu/:productId` | Supprimer un mapping product → menu item |
| GET | `/mappings/progress` | Progression globale de l'intégration Weezevent |
| GET | `/mappings/progress/:locationId` | Progression d'intégration d'une location spécifique |
| GET | `/mappings/summary/:locationId` | Résumé post-synchronisation d'une location |

### Aggregation

_Source : `src/features/aggregation/aggregation.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/aggregation/events-timeline/:spaceId` | Timeline des événements d'un space |
| POST | `/aggregation/process-events` | Traiter les événements pour agrégation |
| POST | `/aggregation/synchronize` | Synchronisation complète des données agrégées |
| POST | `/aggregation/skip-event` | Ignorer un événement |
| GET | `/aggregation/progress/:jobId` | Progression d'un job d'agrégation |
| GET | `/aggregation/event-breakdown/:spaceId/:eventId` | Détail par shops et articles pour un événement |
| GET | `/aggregation/event-stats/:spaceId/:eventId` | Statistiques agrégées d'un événement |
| GET | `/aggregation/step4-context/:spaceId` | Contexte complet pour le step 4 du wizard |
| GET | `/aggregation/event-minute-chart/:spaceId/:eventId` | CA par minute pour un événement |

### Weezevent

_Source : `src/features/weezevent/weezevent.controller.ts`_

`POST /sync/start` lance un job de synchronisation par bissection ; suivi via `/sync/status/:jobId`, `/sync/jobs*`. `GET /integrity` liste mappings cassés et doublons du tenant.

| Méthode | Route | Description |
|---|---|---|
| GET | `/weezevent/transactions` | Lister les transactions Weezevent synchronisées |
| GET | `/weezevent/transactions/:id` | Obtenir une transaction Weezevent par ID |
| GET | `/weezevent/raw-transactions` | Récupérer les transactions brutes depuis l'API Weezevent (sans passer par la DB) |
| POST | `/weezevent/sync` | Déclencher une synchronisation Weezevent |
| GET | `/weezevent/sync/status` | Obtenir le statut de synchronisation Weezevent |
| GET | `/weezevent/integrity` | État d'intégrité Data Integration (mappings cassés, doublons) du tenant |
| DELETE | `/weezevent/sync/state` | Réinitialiser l’état de synchronisation Weezevent |
| DELETE | `/weezevent/data` | Supprimer toutes les données Weezevent synchronisées |
| GET | `/weezevent/events` | Lister les événements Weezevent synchronisés |
| GET | `/weezevent/locations` | Lister les locations Weezevent synchronisées |
| GET | `/weezevent/merchants` | Lister les merchants Weezevent synchronisés |
| GET | `/weezevent/products` | Lister les produits Weezevent synchronisés |
| GET | `/weezevent/products/:productId/refresh` | Rafraîchir les détails d’un produit Weezevent local-first |
| POST | `/weezevent/backfill-transaction-item-products` | Backfill : relier les ventes orphelines (productId null) à leur produit (créé si absent) |
| POST | `/weezevent/products/:productId/map` | Associer un produit Weezevent à un menu item |
| GET | `/weezevent/products/mappings` | Lister les mappings produits Weezevent / menu items |
| DELETE | `/weezevent/products/:productId/map` | Supprimer le mapping d’un produit Weezevent |
| GET | `/weezevent/orders` | Lister les commandes Weezevent synchronisées |
| GET | `/weezevent/prices` | Lister les tarifs Weezevent synchronisés |
| GET | `/weezevent/attendees` | Lister les participants Weezevent synchronisés |
| POST | `/weezevent/sync/start` | Démarrer un job de synchronisation par bissection |
| GET | `/weezevent/sync/status/:jobId` | État d'un job de synchronisation |
| GET | `/weezevent/sync/jobs` | Lister les jobs de sync pour une intégration |
| GET | `/weezevent/sync/jobs/:jobId/stats` | Statistiques d'un job de sync (transactions, events, locations, produits) |
| DELETE | `/weezevent/sync/jobs/:jobId` | Supprimer un job de sync |

### Weezevent Analytics

_Source : `src/features/weezevent/weezevent-analytics.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/weezevent/analytics/sales-by-product` | Analyser les ventes par produit Weezevent |
| GET | `/weezevent/analytics/sales-by-event` | Analyser les ventes par événement Weezevent |
| GET | `/weezevent/analytics/margin-analysis` | Analyser la marge Weezevent |
| GET | `/weezevent/analytics/top-products` | Lister les meilleurs produits Weezevent par chiffre d’affaires |

### Weezevent Webhooks

_Source : `src/features/weezevent/webhook.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| POST | `/webhooks/weezevent/:tenantId/:integrationId` | Recevoir un webhook Weezevent — Public (signé) — pas de JWT. |

### Analyse

_Source : `src/features/analyse/analyse.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/analyse/dashboard` | Tableau de bord analytique global |
| GET | `/analyse/kpis/menu` | KPIs par article de menu |
| GET | `/analyse/kpis/events` | KPIs par événement |
| GET | `/analyse/timeline/:eventId` | Timeline minute par minute d'un événement (via WeezeventEvent.id) |
| GET | `/analyse/cost-breakdown` | Ventilation des coûts |

### Orchestrator

_Source : `src/features/orchestrator/orchestrator.controller.ts`_

| Méthode | Route | Description |
|---|---|---|
| GET | `/orchestrator/health` | Check health of all processing backends |
| POST | `/orchestrator/invalidate-cache` | Invalidate cache for a tenant |
| GET | `/orchestrator/strategy` | Get recommended processing strategy for a context |

---

_Régénérer après tout ajout/modification de route : `node scripts/generate-api-reference.mjs`_
