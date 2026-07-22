# Système d'authentification & d'autorisation DataFriday — Documentation complète

> Vue d'ensemble exhaustive du système d'utilisateurs : authentification, rôles, droits,
> permissions, isolation multi-tenant, et liste des éléments affichés — **page par page,
> route par route**, côté **Frontend (Vue 3)** et **Backend (NestJS)**.
>
> Généré le 2026-06-24 à partir du code source.
> Backend : [`api-datafriday-staging/`](../api-datafriday-staging/) ·
> Frontend : [`datafriday-web/`](../datafriday-web/)

---

## Table des matières

1. [Architecture & flux global](#1-architecture--flux-global)
2. [Modèle de données (Prisma)](#2-modèle-de-données-prisma)
3. [Les rôles système](#3-les-rôles-système)
4. [Le catalogue de permissions](#4-le-catalogue-de-permissions)
5. [Matrice rôles × permissions](#5-matrice-rôles--permissions)
6. [Backend — chaîne d'authentification](#6-backend--chaîne-dauthentification)
7. [Backend — cartographie route par route](#7-backend--cartographie-route-par-route)
8. [Backend — règles métier d'autorisation](#8-backend--règles-métier-dautorisation)
9. [Backend — isolation multi-tenant](#9-backend--isolation-multi-tenant)
10. [Frontend — flux d'authentification](#10-frontend--flux-dauthentification)
11. [Frontend — guards de route](#11-frontend--guards-de-route)
12. [Frontend — cartographie page par page](#12-frontend--cartographie-page-par-page)
13. [Frontend — gating de l'UI](#13-frontend--gating-de-lui)
14. [Onboarding & cycle de vie utilisateur](#14-onboarding--cycle-de-vie-utilisateur)
15. [Écarts & observations de sécurité](#15-écarts--observations-de-sécurité)
16. [Annexes](#16-annexes)

---

## 1. Architecture & flux global

### 1.1 Stack

| Couche | Technologie | Rôle dans l'auth |
|--------|-------------|------------------|
| **Identité / IdP** | **Supabase Auth** | Émet le JWT (email/password, Google OAuth, magic links), gère sessions & refresh tokens |
| **Frontend** | **Vue 3 + Vuex + Vue Router + Vuetify** | Login, stockage session, injection du Bearer token, redirections |
| **Backend** | **NestJS (Fastify) + Passport JWT + Prisma** | Vérifie le JWT, résout l'utilisateur/tenant en DB, applique RBAC |
| **Cache** | **Redis** | Cache du payload d'auth (5 min) + invalidation cross-pod |
| **Base** | **PostgreSQL (via Supabase)** | Source de vérité users/tenants/rôles/permissions |

> ⚠️ **Supabase est l'émetteur du token, mais PAS la source de vérité des droits.**
> Le backend ne fait pas confiance aux claims du JWT pour le rôle/tenant : il refait un
> **lookup DB** à chaque requête (mis en cache). Le JWT sert uniquement à prouver *qui*
> est l'utilisateur (`sub` = user id Supabase).

### 1.2 Flux d'une requête authentifiée (vue d'ensemble)

```
┌─────────────┐   1. login (email/pwd ou Google)      ┌──────────────┐
│  Frontend   │ ────────────────────────────────────► │ Supabase Auth│
│   (Vue)     │ ◄──────── JWT (access + refresh) ───── └──────────────┘
└─────┬───────┘
      │ 2. Authorization: Bearer <JWT>  (intercepteur Axios)
      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Backend NestJS — chaîne de guards globaux (ordre strict)             │
│                                                                        │
│  ① TenantThrottlerGuard   → rate-limit par tenant                     │
│  ② JwtDatabaseGuard       → vérifie JWT + lookup DB (user+role+perms)  │
│  ③ TenantGuard            → refuse si pas de tenant résolu (fail-closed)│
│  ④ RolesGuard             → applique @Roles()                          │
│  ⑤ PermissionsGuard       → applique @RequirePermissions()             │
│                                                                        │
│  → TenantContextInterceptor : pousse tenantId dans le CLS             │
│  → Prisma auto-scope toutes les requêtes par tenantId                  │
└──────────────────────────────────────────────────────────────────────┘
```

Fichiers clés :
- Enregistrement des guards : [`src/app.module.ts:150-166`](../api-datafriday-staging/src/app.module.ts#L150-L166)
- Stratégie JWT-DB : [`src/core/auth/strategies/jwt-db-lookup.strategy.ts`](../api-datafriday-staging/src/core/auth/strategies/jwt-db-lookup.strategy.ts)

---

## 2. Modèle de données (Prisma)

Schéma : [`prisma/schema.prisma`](../api-datafriday-staging/prisma/schema.prisma)

### 2.1 Entités d'auth

| Modèle | Rôle | Notes |
|--------|------|-------|
| `User` | Compte utilisateur | `id` = id Supabase. Champs : `email`, `firstName/lastName/fullName`, `role` (enum legacy), `roleId` (FK RBAC), `tenantId` |
| `Tenant` | Organisation | `slug` unique, `plan`, `status`, `invitationCode`, intégrations Weezevent |
| `UserTenant` | Appartenance N-N user↔tenant | `isOwner`, `role` (legacy) + `roleId` (RBAC). Permet le multi-organisation |
| `Role` | Rôle dynamique **par tenant** | `name`, `systemKey` (ADMIN/MANAGER/STAFF/VIEWER ou null si custom), `isSystem` |
| `Permission` | Permission | `code`, `category`, `scope` (SYSTEM/CUSTOM), `isSystem`. `tenantId = null` = catalogue système global |
| `RolePermission` | Liaison N-N rôle↔permission | clé composite `[roleId, permissionId]` |
| `UserSpaceAccess` | Accès **par espace** | `role` par espace (granularité fine, optionnel) |
| `UserPinnedSpace` | Favoris UI | espaces épinglés par utilisateur |

### 2.2 Enums

```prisma
enum UserRole       { ADMIN  MANAGER  STAFF  VIEWER }
enum TenantPlan     { FREE  STARTER  PROFESSIONAL  ENTERPRISE }
enum TenantStatus   { ACTIVE  SUSPENDED  TRIAL  CANCELLED }
enum PermissionScope{ SYSTEM  CUSTOM }
```

### 2.3 Double système de rôles (transition legacy → RBAC)

Le système est **en cours de migration** d'un rôle "enum simple" vers un RBAC dynamique :

- **Legacy** : `User.role` / `UserTenant.role` = enum `UserRole` (toujours présent, fallback).
- **RBAC dynamique** : `User.roleId` → `Role` (par tenant) → `RolePermission[]` → `Permission[]`.

Le champ `Role.systemKey` fait le pont : il relie un rôle dynamique à son équivalent système
(ADMIN/MANAGER/STAFF/VIEWER) pour conserver la règle « ADMIN = toutes les permissions ».

> Lors du lookup, le backend résout `role.systemKey ?? user.role` — donc même un utilisateur
> sans `roleId` assigné reste fonctionnel via son enum legacy.
> Voir [`jwt-db-lookup.strategy.ts:248-255`](../api-datafriday-staging/src/core/auth/strategies/jwt-db-lookup.strategy.ts#L248-L255).

### 2.4 Statut SUSPENDED

Si `Tenant.status === 'SUSPENDED'`, l'authentification est rejetée (`401 Organization is suspended`)
même avec un JWT valide — vérifié à chaque lookup et au hit de cache.

---

## 3. Les rôles système

Définis dans [`src/core/rbac/permission-catalog.ts`](../api-datafriday-staging/src/core/rbac/permission-catalog.ts).
Les 4 rôles sont **clonés dans chaque tenant** à sa création (`cloneSystemRolesForTenant`).

| Rôle | `systemKey` | Description | Permissions |
|------|-------------|-------------|-------------|
| **ADMIN** | `ADMIN` | Accès complet à l'organisation : toutes fonctionnalités + gestion utilisateurs/rôles/permissions | **Toutes** (les 19 codes) |
| **MANAGER** | `MANAGER` | Gestion opérationnelle : F&B, événements, configuration, intégrations, utilisateurs (hors rôles/permissions) | 16 codes (tout sauf `org.users.changeRole`, `org.roles.manage`, `org.permissions.manage`) |
| **STAFF** | `STAFF` | Accès opérationnel quotidien : spaces, analytiques, menus F&B | 10 codes |
| **VIEWER** | `VIEWER` | Lecture seule : spaces + analytiques | 6 codes (navigation seule) |

> **Règle de sécurité clé** : un utilisateur dont le `systemKey === ADMIN` est **toujours
> autorisé**, quelle que soit la liste `RolePermission` réelle. Cela évite un auto-verrouillage
> accidentel si on retire par erreur une permission au rôle ADMIN.
> Implémenté à la fois dans le guard ([`permissions.guard.ts:38`](../api-datafriday-staging/src/core/auth/guards/permissions.guard.ts#L38)) et dans le front (getter `can`).

---

## 4. Le catalogue de permissions

19 permissions système, regroupées par catégorie. Codes utilisés par `@RequirePermissions(...)`
côté backend et par le getter `can(code)` côté front.

| Catégorie | Code | Libellé |
|-----------|------|---------|
| **Navigation** | `nav.spaces` | Accès Spaces |
| | `nav.analytics.fb` | Analytiques F&B |
| | `nav.analytics.hospitality` | Analytiques Hospitality |
| | `nav.analytics.merch` | Analytiques Merch |
| | `nav.analytics.ticketing` | Analytiques Ticketing |
| | `nav.analytics.storage` | Analytiques Storage |
| **F&B** | `menu.fb.suppliers` | Fournisseurs F&B |
| | `menu.fb.marketPrices` | Prix du marché |
| | `menu.fb.components` | Composants |
| | `menu.fb.menuItems` | Articles de menu |
| | `menu.fb.spaceMenu` | Menus par espace |
| **Events** | `menu.events.manage` | Gestion des événements |
| **Configuration** | `menu.config.manage` | Configurations produits |
| **Intégration** | `menu.integration.fb` | Intégration de données F&B |
| **Organisation** | `org.users.view` | Voir les utilisateurs |
| | `org.users.manage` | Gérer les utilisateurs |
| | `org.users.changeRole` | Changer le rôle d'un utilisateur |
| | `org.roles.manage` | Gérer les rôles |
| | `org.permissions.manage` | Gérer les permissions |

- **Permissions SYSTEM** (`tenantId = null`, `isSystem = true`) : catalogue global, en lecture seule.
- **Permissions CUSTOM** : un ADMIN de tenant peut en créer (`scope = CUSTOM`, `tenantId` renseigné).

---

## 5. Matrice rôles × permissions

| Permission | ADMIN | MANAGER | STAFF | VIEWER |
|------------|:-----:|:-------:|:-----:|:------:|
| `nav.spaces` | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.fb` | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.hospitality` | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.merch` | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.ticketing` | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.storage` | ✅ | ✅ | ✅ | ✅ |
| `menu.fb.suppliers` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.marketPrices` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.components` | ✅ | ✅ | ❌ | ❌ |
| `menu.fb.menuItems` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.spaceMenu` | ✅ | ✅ | ✅ | ❌ |
| `menu.events.manage` | ✅ | ✅ | ❌ | ❌ |
| `menu.config.manage` | ✅ | ✅ | ❌ | ❌ |
| `menu.integration.fb` | ✅ | ✅ | ❌ | ❌ |
| `org.users.view` | ✅ | ✅ | ❌ | ❌ |
| `org.users.manage` | ✅ | ✅ | ❌ | ❌ |
| `org.users.changeRole` | ✅ | ❌ | ❌ | ❌ |
| `org.roles.manage` | ✅ | ❌ | ❌ | ❌ |
| `org.permissions.manage` | ✅ | ❌ | ❌ | ❌ |
| **Total** | **19** | **16** | **10** | **6** |

---

## 6. Backend — chaîne d'authentification

### 6.1 Guards globaux (ordre d'exécution)

Enregistrés dans [`app.module.ts`](../api-datafriday-staging/src/app.module.ts#L150-L166), exécutés **dans l'ordre de déclaration** :

| # | Guard | Fichier | Rôle | Court-circuit |
|---|-------|---------|------|---------------|
| 1 | `TenantThrottlerGuard` | `core/throttle/` | Rate-limiting par tenant | — |
| 2 | `JwtDatabaseGuard` | `core/auth/guards/jwt-db.guard.ts` | Vérifie le JWT, peuple `request.user` (avec rôle + permissions résolus en DB) | `@Public()` |
| 3 | `TenantGuard` | `core/auth/guards/tenant.guard.ts` | **Fail-closed** : `403` si aucun tenant résolu | `@Public()`, `@AllowNoTenant()` |
| 4 | `RolesGuard` | `core/auth/guards/roles.guard.ts` | Applique `@Roles(...)` (OR sur `systemKey`) | absence de `@Roles` = autorisé |
| 5 | `PermissionsGuard` | `core/auth/guards/permissions.guard.ts` | Applique `@RequirePermissions(...)` (OR sur codes) | absence de `@RequirePermissions` = autorisé |

> **Conséquence importante** : un endpoint **sans** `@Roles` **ni** `@RequirePermissions` est
> accessible à **tout utilisateur authentifié ayant un tenant** (n'importe quel rôle, y compris
> VIEWER). Le RBAC fin n'est donc appliqué que là où c'est explicitement déclaré (cf. §7).

### 6.2 Les deux stratégies Passport

| Stratégie | Nom | Usage | Particularité |
|-----------|-----|-------|---------------|
| `JwtDatabaseStrategy` | `jwt-db` (défaut) | Toutes les routes protégées | Vérifie le JWT **puis lookup DB** (user + tenant + roleRef + permissions). Cache Redis 5 min + cache local 15 s + lock distribué anti-stampede |
| `JwtOnboardingStrategy` | `jwt-onboarding` | Onboarding uniquement | N'exige **pas** de tenant/`org_id` — permet de créer/rejoindre une orga avant d'en avoir une |

`JwtDatabaseStrategy.validate()` construit le `request.user` :

```ts
{
  id, email, firstName, lastName, fullName,
  tenantId, tenant: { id, name, slug, plan, status },
  role: { id, name, systemKey, isSystem, permissions: string[] },  // résolu via roleRef ?? legacy
  isOwner: boolean
}
```

Cache invalidé via `invalidateUserCache(userId)` après tout changement impactant l'auth
(changement de rôle, édition des permissions d'un rôle, MAJ profil) — broadcast Redis pub/sub
canal `auth:invalidate` pour purger tous les pods.

### 6.3 Décorateurs

| Décorateur | Effet | Fichier |
|------------|-------|---------|
| `@Public()` | Bypass de l'authentification (route publique) | `decorators/public.decorator.ts` |
| `@AllowNoTenant()` | Auth requise mais tenant optionnel (ex : `/me`) | `decorators/allow-no-tenant.decorator.ts` |
| `@Roles(...roles)` | Restreint à certains `systemKey` | `decorators/roles.decorator.ts` |
| `@RequirePermissions(...codes)` | Exige ≥ 1 code (logique OR) | `decorators/permissions.decorator.ts` |
| `@CurrentUser()` | Injecte `request.user` | `decorators/current-user.decorator.ts` |
| `@CurrentTenant()` | Injecte `tenantId` | `decorators/current-tenant.decorator.ts` |

---

## 7. Backend — cartographie route par route

Préfixe global : **`/api/v1`** ([`main.ts:103`](../api-datafriday-staging/src/main.ts#L103)).
Légende : 🌐 = public · 🔓 = auth seule (tout rôle avec tenant) · 🔒 = rôles/permissions requis.

### 7.1 Routes PUBLIQUES (sans authentification)

| Méthode | Route | Contrôleur | Accès |
|---------|-------|------------|-------|
| GET | `/` | `AppController` | 🌐 `@Public()` |
| GET | `/health` | `HealthController` | 🌐 `@Public()` |
| `*` | `/onboarding/*` | `OnboardingController` | 🌐 `@Public()` + `JwtOnboardingGuard` (JWT requis, tenant optionnel) |
| POST | `/webhooks/weezevent/:tenantId/:integrationId` | `WebhookController` | ⚠️ pas de `@Public` — auth par **signature HMAC** (voir §15) |
| GET | `/metrics` | `MetricsController` | ⚠️ aucun guard explicite (voir §15) |

### 7.2 Onboarding — `/onboarding` (JWT requis, tenant optionnel)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/onboarding/status` | L'utilisateur existe-t-il en DB ? a-t-il une orga ? |
| POST | `/onboarding` | Créer une organisation → l'utilisateur devient **ADMIN + owner** |
| POST | `/onboarding/join-by-code` | Rejoindre via code d'invitation → rôle **STAFF** |
| POST | `/onboarding/join/:slug` | _[Déprécié]_ Rejoindre par slug → rôle **STAFF** |

### 7.3 Profil courant — `/me` (`@AllowNoTenant`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/me` | 🔓 auth | Profil + organisation + rôle + permissions de l'utilisateur connecté |
| PATCH | `/me` | 🔓 auth | MAJ de **son propre** profil (prénom/nom/avatar uniquement — jamais le rôle) |
| GET | `/me/tenant` | 🔓 auth | Détails de l'organisation |

### 7.4 Utilisateurs — `/users` 🔒

`@UseGuards(JwtDatabaseGuard, RolesGuard, PermissionsGuard)`

| Méthode | Route | Rôles | Permission | Description |
|---------|-------|-------|-----------|-------------|
| POST | `/users` | ADMIN, MANAGER | `org.users.manage` | Créer un utilisateur |
| GET | `/users` | ADMIN, MANAGER | `org.users.view` | Lister (paginé, recherche, filtre rôle) |
| GET | `/users/statistics` | ADMIN, MANAGER | `org.users.view` | Statistiques |
| GET | `/users/me` | 🔓 (aucun `@Roles`) | — | Profil courant (alias de `/me`) |
| GET | `/users/:id` | ADMIN, MANAGER | `org.users.view` | Détail |
| PATCH | `/users/:id` | ADMIN, MANAGER | `org.users.manage` | Mettre à jour |
| DELETE | `/users/:id` | **ADMIN** | `org.users.manage` | Supprimer |
| POST | `/users/invite` | ADMIN, MANAGER | `org.users.manage` | Inviter (email) |
| PATCH | `/users/:id/role` | **ADMIN** | `org.users.changeRole` | Changer le rôle |
| POST | `/users/:id/spaces/:spaceId/access` | ADMIN, MANAGER | `org.users.manage` | Accorder accès à un espace |
| DELETE | `/users/:id/spaces/:spaceId/access` | ADMIN, MANAGER | `org.users.manage` | Révoquer l'accès |

### 7.5 Rôles — `/roles` 🔒

| Méthode | Route | Rôles | Permission | Description |
|---------|-------|-------|-----------|-------------|
| GET | `/roles` | 🔓 (auth+tenant) | — | Lister les rôles du tenant |
| GET | `/roles/:id` | 🔓 (auth+tenant) | — | Détail d'un rôle |
| POST | `/roles` | **ADMIN** | `org.roles.manage` | Créer un rôle custom |
| PATCH | `/roles/:id` | **ADMIN** | `org.roles.manage` | Modifier (rôle système : description + permissions seulement) |
| DELETE | `/roles/:id` | **ADMIN** | `org.roles.manage` | Supprimer (impossible si système ou assigné) |

### 7.6 Permissions — `/permissions` 🔒

| Méthode | Route | Rôles | Permission | Description |
|---------|-------|-------|-----------|-------------|
| GET | `/permissions` | 🔓 (auth+tenant) | — | Catalogue système + permissions custom du tenant |
| POST | `/permissions` | **ADMIN** | `org.permissions.manage` | Créer une permission custom |
| PATCH | `/permissions/:id` | **ADMIN** | `org.permissions.manage` | Modifier (système = lecture seule) |
| DELETE | `/permissions/:id` | **ADMIN** | `org.permissions.manage` | Supprimer (système protégé) |

### 7.7 Organisations / Tenants — `/tenants` 🔒

`@UseGuards(JwtDatabaseGuard, RolesGuard)` — **rôles uniquement, pas de permissions fines**

| Méthode | Route | Rôles | Description |
|---------|-------|-------|-------------|
| POST | `/tenants` | **ADMIN** | Créer un tenant |
| GET | `/tenants` | **ADMIN** | Lister tous les tenants |
| GET | `/tenants/statistics` | **ADMIN** | Statistiques globales |
| GET | `/tenants/by-slug/:slug` | ADMIN, MANAGER | Tenant par slug |
| GET | `/tenants/:id` | ADMIN, MANAGER | Tenant par id |
| PATCH | `/tenants/:id` | ADMIN, MANAGER | Mettre à jour |
| DELETE | `/tenants/:id` | **ADMIN** | Soft-delete |
| DELETE | `/tenants/:id/permanent` | **ADMIN** | Hard-delete |
| POST | `/tenants/:id/upgrade` | ADMIN, MANAGER | Changer de plan |
| GET | `/tenants/:id/usage` | ADMIN, MANAGER | Statistiques d'usage |
| POST | `/tenants/:id/suspend` | **ADMIN** | Suspendre |
| POST | `/tenants/:id/reactivate` | **ADMIN** | Réactiver |

### 7.8 Spaces & Configurations — gating par rôle 🔒

`spaces.controller.ts` : `@UseGuards(JwtDatabaseGuard, RolesGuard)`

| Méthode | Route (extrait) | Rôles |
|---------|-----------------|-------|
| GET | `/spaces`, `/spaces/:id` … (lecture) | 🔓 auth (pas de `@Roles` sur les GET) |
| POST/PATCH | `/spaces`, `/spaces/:id` (écriture) | ADMIN, MANAGER |
| DELETE | `/spaces/:id` | **ADMIN** |
| `/configurations` (CRUD) | création/maj | ADMIN, MANAGER (certaines lectures STAFF) |

`pinned-spaces.controller.ts` et `space-menus.controller.ts` : `@UseGuards(JwtDatabaseGuard, RolesGuard)`.

### 7.9 Routes "métier" 🔓 (auth + tenant, AUCUN rôle/permission requis)

Ces contrôleurs n'ont que `@UseGuards(JwtDatabaseGuard)` (ou rien de plus que les guards globaux),
**sans** `@Roles` ni `@RequirePermissions` sur leurs méthodes → accessibles à **tout rôle**
(ADMIN/MANAGER/STAFF/VIEWER) du tenant :

| Contrôleur | Préfixe | Domaine |
|------------|---------|---------|
| `SuppliersController` | `/suppliers` | Fournisseurs F&B |
| `MarketPricesController` | `/market-prices` | Prix du marché |
| `MenuComponentsController` | `/menu-components` | Composants |
| `MenuItemsController` | `/menu-items`, `/product-types`, `/product-categories` | Articles de menu |
| `IngredientsController` | `/ingredients` | Ingrédients |
| `PackagingController` | `/packaging` | Conditionnements |
| `BrandsController` | `/brand-names` | Marques |
| `DisplayNamesController` | `/display-names` | Noms d'affichage |
| `EventsController` | `/events`, `/event-types`, `/event-categories`, `/event-subcategories` | Événements |
| `PredictVersionsController` | `/events/:eventId/predict-versions`, `/predict-versions` | Prédiction |
| `InventoryController` | `/inventory`, `/inventory-counts` | Inventaire |
| `RestockStateController` | `/spaces/:spaceId/restock-state` | Réarmement |
| `AnalyseController` | `/analyse` | Analyses |
| `AggregationController` | `/aggregation` | Agrégations |
| `MappingsController` | `/mappings` | Mappings CSV |
| `OrganizationsController` | `/organizations` | Organisations (vue) |
| `IntegrationsController` | `/organizations/:organizationId/integrations` | Intégrations |
| `WeezeventController` | `/weezevent` | Weezevent |
| `WeezeventAnalyticsController` | `/weezevent/analytics` | Analytics Weezevent |
| `DashboardController` | `/spaces/:spaceId/dashboard` | Dashboards |
| `KvController` | `/kv` | Key-Value store |
| `OrchestratorController` | `/orchestrator` | Orchestrateur (`@UseGuards` au niveau méthode) |
| `SpaceMenusController` | `/space-menu` | Menus d'espace |

> 💡 C'est cohérent avec la matrice : ces domaines correspondent aux permissions `menu.fb.*`,
> `menu.events.*`, etc. **MAIS** elles ne sont pas *techniquement* appliquées sur ces routes —
> le contrôle réel se limite à « authentifié + a un tenant ». Voir §15.

---

## 8. Backend — règles métier d'autorisation

Au-delà des guards, le `UsersService` ([`users.service.ts`](../api-datafriday-staging/src/features/users/users.service.ts)) applique des garde-fous :

### `changeRole(id, …)` — `PATCH /users/:id/role`
- ❌ **Impossible de changer son propre rôle** (`You cannot change your own role`).
- ❌ **Seul un ADMIN peut promouvoir ADMIN** (`Only admins can promote users to admin`).
- ❌ **Impossible de rétrograder le propriétaire** de l'organisation (`isOwner` ne peut pas perdre ADMIN).
- ✅ Invalide le cache d'auth de l'utilisateur cible après changement.

### `remove(id, …)` — `DELETE /users/:id`
- ❌ **Impossible de supprimer son propre compte**.
- ❌ **Impossible de supprimer le propriétaire** de l'organisation.
- ✅ Le compte Supabase n'est détruit que s'il n'a plus aucune appartenance tenant.

### Rôles & permissions système
- Un rôle `isSystem` ne peut pas être supprimé ; seules description & permissions sont éditables.
- Une permission `isSystem` (catalogue global) est en lecture seule et non supprimable.

### Règle ADMIN = toutes permissions
- `PermissionsGuard` : `systemKey === ADMIN` court-circuite toute vérification → toujours autorisé.

---

## 9. Backend — isolation multi-tenant

1. **`TenantGuard`** (fail-closed) : toute route protégée sans `tenantId` résolu → `403`.
2. **`TenantContextInterceptor`** : pousse le `tenantId` authentifié dans un **CLS** (`nestjs-cls`).
3. **Auto-scoping Prisma** : un middleware/extension Prisma injecte automatiquement le `tenantId`
   dans les requêtes des modèles tenant-aware → impossible de lire/écrire les données d'un autre
   tenant, même en cas d'oubli applicatif.
4. **`UserTenant`** : un même utilisateur peut appartenir à plusieurs tenants (avec un rôle par tenant).
5. **RLS Supabase** : des politiques Row-Level Security existent aussi côté PostgreSQL
   ([`supabase/migrations/*_*_rls.sql`](../api-datafriday-staging/supabase/)) en défense supplémentaire.

Voir aussi la mémoire projet *« Durcissement Auth & multi-tenant »*.

---

## 10. Frontend — flux d'authentification

Store Vuex : [`src/store/modules/auth.js`](../datafriday-web/src/store/modules/auth.js) ·
Client Supabase : [`src/lib/supabase.js`](../datafriday-web/src/lib/supabase.js) ·
Client API : [`src/api/client.js`](../datafriday-web/src/api/client.js)

### 10.1 État du store `auth`

```js
state = {
  userId, token, refreshToken,     // session Supabase
  tenantId, tenantName,            // organisation
  userRole,                        // systemKey: ADMIN/MANAGER/STAFF/VIEWER
  permissions: [],                 // codes RBAC (alimentés par /me)
  loading, error, initialized
}
```

### 10.2 Getters d'autorisation

| Getter | Logique |
|--------|---------|
| `isAuthenticated` | `!!token` |
| `hasOrganization` | `!!tenantId` |
| `userRole` | `systemKey` courant |
| `isAdmin` | `userRole === 'ADMIN'` |
| `isManager` | `['ADMIN','MANAGER'].includes(userRole)` |
| `permissions` | liste des codes |
| **`can(code)`** | `userRole === 'ADMIN' || permissions.includes(code)` — **aligné sur le backend** |

### 10.3 Actions principales

| # | Action | Description |
|---|--------|-------------|
| 1 | `signUp` | Inscription email/mot de passe (Supabase) |
| 2 | `signIn` | Connexion email/mot de passe → puis `checkOnboardingStatus` + `fetchCurrentUser` |
| 3 | `signInWithGoogle` | OAuth Google (redirect `/auth/callback`) |
| 4 | `signOut` | Déconnexion + purge token Axios |
| 5 | `checkOnboardingStatus` | `GET /onboarding/status` (dédupliqué) |
| 6 | `createOrganization` | `POST /onboarding` puis **refresh du JWT** (pour embarquer le tenant) |
| 7 | `joinOrganization` | `POST /onboarding/join-by-code` + refresh JWT |
| 8 | `fetchCurrentUser` | `GET /me` → normalise `role.systemKey` + `permissions` dans le store |
| 9 | `initialize` | Récupère la session, écoute `onAuthStateChange` (refresh auto) |
| 10–13 | `resetPassword`, `updatePassword`, `verifyEmailToken`, `resendVerificationEmail` | Gestion mot de passe / vérif email |

### 10.4 Injection du token & gestion 401 (`api/client.js`)

- **Intercepteur requête** : ajoute `Authorization: Bearer <token>`. Si le token mémoire est
  absent (reload, deep-link, callback OAuth) et que l'utilisateur ne s'est pas explicitement
  déconnecté, il récupère la session Supabase persistée.
- **Intercepteur réponse** :
  - `401` → tente **un** refresh de session Supabase et rejoue la requête ; sinon purge + redirect `/login`.
  - `403` → message « Accès interdit — vous n'avez pas les droits nécessaires ».
  - `404 / 422 / 429 / 5xx / timeout / réseau` → messages utilisateur dédiés + événement global `api-error`.

> Le JWT contient le `tenant_id` grâce à un **custom access token hook Supabase** ; c'est pourquoi
> `createOrganization`/`joinOrganization` forcent un `refreshSession()` après l'onboarding.

---

## 11. Frontend — guards de route

Définis dans [`src/router/guards.js`](../datafriday-web/src/router/guards.js) :

| Guard | Comportement | Redirection |
|-------|--------------|-------------|
| `requireAuth` | Exige une session | → `/login?redirect=…` |
| `requireOrganization` | Exige session **+ organisation** | → `/login` ou `/onboarding`. Bypass possible en **mode démo** (`?demo=1` ou `localStorage.analyse_demo`) |
| `guestOnly` | Pages publiques ; si déjà connecté → `/dashboard` (ou `/onboarding`) | — |
| `requireAdmin` | Exige `isAdmin` | → `/dashboard` si non-admin |
| `requireManager` | Exige `isManager` | → `/dashboard` si non-manager |

> ⚠️ **`requireAdmin` et `requireManager` ne sont importés/câblés sur AUCUNE route** dans
> [`router/index.js`](../datafriday-web/src/router/index.js) (seuls `requireAuth`, `requireOrganization`,
> `guestOnly` sont utilisés). Ce sont actuellement du **code mort**. Voir §15.

---

## 12. Frontend — cartographie page par page

Routes : [`src/router/index.js`](../datafriday-web/src/router/index.js).

### 12.1 Pages publiques (`guestOnly`)

| Route | Vue | Titre |
|-------|-----|-------|
| `/login` | `LoginView` | Connexion |
| `/signup` | `SignUpView` | Créer un compte |
| `/forgot-password` | `ForgotPasswordView` | Mot de passe oublié |
| `/reset-password` | `ResetPasswordView` | Réinitialiser le mot de passe (pas de `guestOnly`) |
| `/verify-email` | `VerifyEmailView` | Vérification email |
| `/auth/callback` | `AuthCallbackView` | Retour OAuth |

### 12.2 Onboarding (`requireAuth`)

| Route | Vue | Accès |
|-------|-----|-------|
| `/onboarding` | `OnboardingView` | Auth requise, sans organisation |

### 12.3 Pages applicatives (`requireOrganization` sur le parent `/dashboard`)

Toutes ces routes sont des **enfants de `/dashboard`** ; **seul le parent porte le guard**
`requireOrganization`. **Aucune route enfant n'a de guard de rôle.**

| Route | Vue | Domaine / Permission logique |
|-------|-----|------------------------------|
| `/spaces` | `SpaceListView` | Spaces (`nav.spaces`) |
| `/spaces-overview` | `SpacesOverviewView` | Spaces |
| `/spaces/:spaceId` | `AnalyseView` | Analytiques |
| `/spaces/:spaceId/builder` | `SpaceBuilderViewRoute` | Construction d'espace |
| `/spaces/:spaceId/predict` | `SpacePredictView` | Event Predict |
| `/spaces/:spaceId/inventory` | `SpaceInventoryView` | Inventaire |
| `/spaces/:spaceId/restock` | `SpaceRestockView` | Réarmement |
| `/events` | `EventsListView` | Events (`menu.events.manage`) |
| `/event-types` | `EventsTypeListView` | Events |
| `/event-categories` | `EventsCategorieListView` | Events |
| `/event-subcategories` | `EventsSubcategorieListView` | Events |
| `/suppliers` | `SuppliersListView` | F&B (`menu.fb.suppliers`) |
| `/market-prices` | `MarketPriceListView` | F&B (`menu.fb.marketPrices`) |
| `/components`, `/components/new`, `/components/edit/:id` | `componentListView` / `ComponentCreateView` | F&B (`menu.fb.components`) |
| `/space-menus`, `/space-menus/:spaceId/shops/:shopId` | `SpaceMenuView` / `ShopDetailView` | F&B (`menu.fb.spaceMenu`) |
| `/menu-items`, `/menu-items/create`, `/menu-items/edit/:id` | `MenuItemView` / `MenuItemCreateView` | F&B (`menu.fb.menuItems`) |
| `/product-categories` | `ProductCategoryList` | Configuration (`menu.config.manage`) |
| `/product-types` | `ProductTypeList` | Configuration |
| `/brand-names` | `BrandNameListView` | Configuration |
| `/data-integration/fb` | `DataIntegrationView` | Intégration (`menu.integration.fb`) |
| **`/users`** | `UserListView` | **Organisation (`org.users.view`)** |
| **`/users/create`** | `UserCreateView` | **Organisation (`org.users.manage`)** |
| **`/roles`** | `RoleListView` | **Organisation (`org.roles.manage`)** |
| **`/permissions`** | `PermissionListView` | **Organisation (`org.permissions.manage`)** |

### 12.4 Routes spéciales / sans auth

| Route | Vue | Note |
|-------|-----|------|
| `/predict-test` | `PredictTestView` | Harness de test, **sans auth** (données mock) |
| `/` | redirect → `/dashboard` | — |
| `/about` | `AboutView` | Legacy |
| `/:pathMatch(.*)*` | redirect → `/dashboard` | 404 catch-all |

### 12.5 Menu de navigation (`DashboardView.vue`)

Le menu latéral (drawer principal + drawer « Paramètres ») expose, **sans condition de rôle** :

- **Configuration** : Menu F&B (Fournisseurs, Prix marché, Composants, Articles, Menus d'espace),
  Events (+ types/catégories/sous-catégories), Configurations (Types/Catégories produits, Marques),
  Intégration de données.
- **Organisation** : Compte → **Utilisateurs**, Profil · Accès → **Rôles** (Permissions commenté/masqué).
- **Préférences** : thème, langue, etc.

> Le chip du rôle courant (`userRoleName`) est affiché dans le panneau profil, mais **aucune
> entrée de menu n'est masquée selon le rôle/permission**.

---

## 13. Frontend — gating de l'UI

**Constat majeur** : le frontend **charge** le rôle et les permissions (`/me` → `store.auth.permissions`)
et **expose** un getter `can(code)` parfaitement aligné sur le backend, **mais ne l'utilise nulle part**
pour masquer/désactiver des éléments d'interface.

- Recherche dans tout `datafriday-web/src` : le getter `can` **n'a aucun appelant** (seule occurrence
  du mot « can » = unité de mesure dans un drawer). Les codes de permission (`nav.spaces`, `org.users.*`…)
  ne sont **référencés nulle part** dans le front.
- Les seules conditions liées au rôle dans l'UI : affichage **informatif** du nom de rôle
  (`userRoleName`) dans `DashboardView`.
- Les guards de route `requireAdmin`/`requireManager` existent mais **ne sont pas branchés**.

➡️ **Conséquence** : tout utilisateur connecté voit l'intégralité du menu (y compris Utilisateurs/Rôles)
et peut **naviguer** vers `/users`, `/roles`, `/permissions`. La protection effective repose
**entièrement sur le backend**, qui renvoie alors `403` (intercepté → message « Accès interdit »).

### Surface API consommée par le front (modules Vuex)

| Store | Endpoints |
|-------|-----------|
| `users` | `GET/POST/PATCH/DELETE /users` ([`user.api.js`](../datafriday-web/src/api/endpoints/user.api.js)) |
| `roles` | `GET/POST/PATCH/DELETE /roles` ([`role.api.js`](../datafriday-web/src/api/endpoints/role.api.js)) |
| `permissions` | `GET/POST/PATCH/DELETE /permissions` ([`permission.api.js`](../datafriday-web/src/api/endpoints/permission.api.js)) |
| `auth` | `/onboarding/status`, `/onboarding`, `/onboarding/join-by-code`, `/me` |

---

## 14. Onboarding & cycle de vie utilisateur

[`onboarding.service.ts`](../api-datafriday-staging/src/features/onboarding/onboarding.service.ts)

```
Inscription Supabase (signup / Google)
        │
        ▼
GET /onboarding/status  ──►  exists? hasOrganization?
        │
   ┌────┴─────────────────────────────┐
   ▼                                   ▼
POST /onboarding                 POST /onboarding/join-by-code
(créer une organisation)         (rejoindre via code d'invitation)
   │                                   │
   ▼                                   ▼
• Tenant créé                    • User rattaché au tenant
• 4 rôles système clonés         • rôle = STAFF (isOwner=false)
  (cloneSystemRolesForTenant)
• User = ADMIN + isOwner=true
   │                                   │
   └─────────────► refreshSession() ◄──┘   (JWT embarque désormais tenant_id)
                          │
                          ▼
                  Accès à /dashboard
```

| Action | Rôle attribué | `isOwner` |
|--------|---------------|-----------|
| Créer une organisation | **ADMIN** | `true` |
| Rejoindre via code/slug | **STAFF** | `false` |
| Créé par un admin (`POST /users`) | selon `dto` | `false` |
| Invité (`POST /users/invite`) | selon `dto` | `false` |

Provisioning : la création/invitation crée d'abord le **compte Supabase Auth** (l'`id` devient
l'`id` du `User` DB), puis le profil DB ; en cas d'échec DB, le compte Supabase est **rollback**.

---

## 15. Écarts & observations de sécurité

> Ces points sont des **observations factuelles** issues de la lecture du code, à confirmer/arbitrer
> par l'équipe — ils ne sont pas nécessairement des bugs.

| # | Observation | Détail | Impact |
|---|-------------|--------|--------|
| 1 | **Gating UI absent** | Le getter `can()` et les permissions sont chargés mais **jamais utilisés** pour masquer l'UI. Tout le monde voit le menu Utilisateurs/Rôles. | Cosmétique/UX : un VIEWER voit des actions qu'il ne peut pas exécuter (403 au clic). Pas de fuite de données (backend protège). |
| 2 | **Guards front `requireAdmin`/`requireManager` non câblés** | Définis dans `guards.js` mais non importés dans `router/index.js`. | `/users`, `/roles`, `/permissions` sont navigables par tout rôle (mais l'API renvoie 403). |
| 3 | **Routes métier sans RBAC fin** | Suppliers, market-prices, menu-items, events, inventory, weezevent… n'ont **ni `@Roles` ni `@RequirePermissions`**. | Un **VIEWER** peut en théorie créer/modifier des fournisseurs, articles, événements via l'API (seulement borné par tenant). À aligner avec la matrice `menu.fb.*` / `menu.events.*` si une restriction est voulue. |
| 4 | **Webhook Weezevent non `@Public`** | `WebhookController` n'a pas `@Public()` → soumis au `JwtDatabaseGuard` global. La sécurité repose sur la **signature HMAC** (`x-weezevent-signature`) en interne. À vérifier que le guard global ne bloque pas les appels Weezevent (sinon ajouter `@Public`). | Fonctionnel/sécurité à confirmer. |
| 5 | **`/metrics` sans guard** | `MetricsController` n'a ni `@Public` ni `@UseGuards`. Sous le guard global, il exige donc un JWT — mais expose des métriques système (Redis/DB/queues). | À restreindre (ADMIN) ou exclure du scope public selon l'usage monitoring. |
| 6 | **`/tenants` = "super-admin" via rôle de tenant** | Les routes `/tenants` (lister/supprimer *tous* les tenants) sont gardées par `@Roles('ADMIN')` — mais « ADMIN » est un rôle **par tenant**, pas un super-admin global. | Un ADMIN de n'importe quel tenant satisfait `@Roles('ADMIN')`. Vérifier que le **service** filtre/contrôle le périmètre (sinon risque d'accès cross-tenant sur l'administration des tenants). |
| 7 | **Secrets en clair dans le repo** | `lib/supabase.js` embarque l'URL + **anon key** (normal pour un client public, mais à garder en tête). Le `.env` backend contient `DOCS_USER`/`DOCS_PASSWORD` (Swagger) en clair. | Anon key = public par design ; credentials docs à protéger/rotationner. |
| 8 | **Mode démo bypass auth** | `requireOrganization` est court-circuité par `?demo=1` ou `localStorage.analyse_demo='1'`. | Accès non authentifié à certains écrans (predict/analyse) — OK en dev, à neutraliser en prod. |

### Points forts du système

- ✅ **Lookup DB systématique** : le backend ne fait pas confiance aux claims du JWT pour les droits.
- ✅ **Fail-closed multi-tenant** (`TenantGuard` + auto-scoping Prisma + RLS Postgres).
- ✅ **Cache d'auth invalidé** sur changement de rôle/permission (cross-pod via Redis pub/sub).
- ✅ **Garde-fous métier** : pas d'auto-rétrogradation, protection du owner, ADMIN = toutes permissions.
- ✅ **RBAC dynamique extensible** (rôles & permissions custom par tenant) avec rétro-compat enum.

---

## 16. Annexes

### 16.1 Variables d'environnement clés

| Variable | Côté | Rôle |
|----------|------|------|
| `JWT_SECRET` | Backend | Secret de vérification du JWT Supabase |
| `JWT_EXPIRES_IN` | Backend | Durée de vie token (défaut `7d`) |
| `CORS_ORIGIN(S)` | Backend | Origines autorisées |
| `DOCS_USER` / `DOCS_PASSWORD` | Backend | Basic-auth de la doc Swagger |
| `VUE_APP_API_URL` | Frontend | Base URL de l'API (`…/api/v1`) |
| `supabaseUrl` / `supabaseAnonKey` | Frontend | Client Supabase (`lib/supabase.js`) |

### 16.2 Fichiers de référence

**Backend** ([`api-datafriday-staging/`](../api-datafriday-staging/))
- Catalogue RBAC : `src/core/rbac/permission-catalog.ts`
- Guards : `src/core/auth/guards/{jwt-db,tenant,roles,permissions}.guard.ts`
- Stratégies : `src/core/auth/strategies/{jwt-db-lookup,jwt-onboarding}.strategy.ts`
- Décorateurs : `src/core/auth/decorators/*.ts`
- Enregistrement global : `src/app.module.ts`
- Schéma : `prisma/schema.prisma`
- Services : `src/features/{users,roles,permissions,tenants,onboarding}/*.service.ts`
- Docs existantes : `docs/auth/{RBAC_SYSTEM,MULTI_TENANT,AUTH_TESTING_GUIDE}.md`

**Frontend** ([`datafriday-web/`](../datafriday-web/))
- Store auth : `src/store/modules/auth.js`
- Guards de route : `src/router/guards.js`
- Routes : `src/router/index.js`
- Client API/token : `src/api/client.js`
- Supabase : `src/lib/supabase.js`
- Stores RBAC : `src/store/modules/{users,roles,permissions}.js`
- Endpoints : `src/api/endpoints/{user,role,permission}.api.js`
- Menu/navigation : `src/views/DashboardView.vue`

### 16.3 Glossaire

| Terme | Définition |
|-------|------------|
| **Tenant** | Organisation cliente (isolation des données) |
| **systemKey** | Clé reliant un rôle dynamique à un rôle système (ADMIN/MANAGER/STAFF/VIEWER) |
| **isOwner** | Propriétaire d'une organisation (protégé contre suppression/rétrogradation) |
| **Permission code** | Identifiant `domaine.ressource.action` (ex : `org.users.manage`) |
| **CLS** | Continuation-Local Storage — propage le `tenantId` pour l'auto-scoping Prisma |
| **Auth payload** | Objet `request.user` reconstruit à chaque requête (mis en cache) |
```
