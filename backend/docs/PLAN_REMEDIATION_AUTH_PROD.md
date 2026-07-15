# Plan de remédiation Auth/RBAC — Passage en production

> Audit approfondi du système d'authentification & d'autorisation (Frontend Vue + Backend NestJS),
> avec **constats vérifiés dans le code**, scénarios d'exploitation, correctifs concrets et checklist
> de mise en production.
>
> Document compagnon de [`SYSTEME_AUTH_COMPLET.md`](./SYSTEME_AUTH_COMPLET.md).
> Date : 2026-06-24 · Backend `api-datafriday-staging/` · Frontend `datafriday-web/`

---

## 0. Synthèse exécutive

| # | Constat | Sévérité | Type | Statut |
|---|---------|----------|------|--------|
| **P0-1** | Toute administration `/tenants` accessible à **n'importe quel ADMIN de tenant** → fuite + contrôle **cross-tenant** | 🔴 **CRITIQUE** | Sécurité / RGPD | ⛔ Bloquant |
| **P0-2** | Webhook Weezevent **bloqué par le guard global** (pas de `@Public`) → intégration cassée ; et signature **optionnelle** (spoofable) | 🔴 **CRITIQUE** | Fonctionnel + Sécurité | ⛔ Bloquant |
| **P0-3** | `weezeventClientSecret` **renvoyé dans les réponses** `/tenants` (et `/me`?) | 🔴 **CRITIQUE** | Fuite de secret | ⛔ Bloquant |
| **P1-4** | ~20 contrôleurs métier **sans RBAC fin** : un **VIEWER peut écrire** (créer/éditer/supprimer) | 🟠 Élevée | Sécurité | À corriger |
| **P1-5** | `/metrics` (infra Redis/DB/queues) exposé à **tout utilisateur authentifié** ; `/openapi.json` public | 🟠 Élevée | Exposition | À corriger |
| **P1-6** | **Aucun gating UI** côté front : menu et routes admin visibles/navigables par tous | 🟠 Élevée | UX / défense en profondeur | À corriger |
| **P2-7** | Guards front `requireAdmin`/`requireManager` = **code mort** | 🟡 Moyenne | Cohérence | À nettoyer |
| **P2-8** | **Bypass d'auth en mode démo** (`?demo=1` / `localStorage`) actif en prod | 🟡 Moyenne | Sécurité | À neutraliser |
| **P2-9** | Route `/predict-test` **sans auth** ; endpoint `POST /onboarding/join/:slug` déprécié | 🟡 Moyenne | Surface d'attaque | À retirer |
| **P2-10** | Migration RBAC inachevée (legacy `role` enum vs `roleId`) ; JWT 7 j ; nettoyages divers | 🟢 Faible | Dette | Backlog |

> **Recommandation** : ne pas mettre en production tant que **P0-1, P0-2, P0-3** ne sont pas corrigés.
> P1 fortement recommandés avant ouverture à des tenants tiers.

---

## 1. 🔴 P0-1 — Fuite & contrôle cross-tenant via `/tenants`

### 1.1 Constat (vérifié)

Le contrôleur [`tenants.controller.ts`](../api-datafriday-staging/src/features/tenants/tenants.controller.ts)
protège toutes ses routes par `@UseGuards(JwtDatabaseGuard, RolesGuard)` + `@Roles('ADMIN')`.

**Or `ADMIN` est un rôle _par tenant_, pas un rôle plateforme.** Il n'existe **aucun concept de
super-admin** dans le code (seule trace : une *chaîne Swagger* « Réservé aux super-admins » à la
[ligne 39](../api-datafriday-staging/src/features/tenants/tenants.controller.ts#L39), sans aucune
implémentation).

Le service ne filtre **jamais** par le tenant de l'appelant :

```ts
// tenants.service.ts:90-126 — findAll : aucun filtre sur le tenant courant
async findAll(query: QueryTenantDto) {
  const where = {};                       // ⚠️ seulement search/plan/status
  const tenants = await this.prisma.tenant.findMany({ where, select: this.selectFields, ... });
  // → renvoie TOUS les tenants de la plateforme
}
async findOne(id)    { return this.prisma.tenant.findUnique({ where: { id } }); }  // n'importe quel id
async update(id, …)  { … }   // modifie n'importe quel tenant
async remove(id)     { … }   // soft-delete n'importe quel tenant
async hardDelete(id) { … }   // SUPPRESSION DÉFINITIVE de n'importe quel tenant
async suspend(id) / reactivate(id) / getUsage(id) / getStatistics()   // idem, non bornés
```

**Pourquoi l'auto-scoping Prisma ne protège pas ici** : le scoping automatique ne s'applique
qu'aux modèles ayant un champ **`tenantId` scalaire requis**
([`tenant-scope.util.ts:24-38`](../api-datafriday-staging/src/core/database/tenant-scope.util.ts#L24-L38)).
Le modèle `Tenant` **n'a pas** de `tenantId` (il *est* le tenant) → il est **exclu** de l'isolation
automatique. Le garde-fou multi-tenant ne s'applique donc **pas du tout** à cette surface.

### 1.2 Scénario d'exploitation

Un client légitime crée une organisation (il devient `ADMIN` + `isOwner` de **son** tenant). Avec
ce simple rôle, il peut :

1. `GET /api/v1/tenants` → **lister toutes les organisations** de la plateforme : nom, SIRET,
   adresse, email, téléphone, plan, **`weezeventClientSecret` (chiffré)**, `weezeventClientId`…
2. `GET /api/v1/tenants/:id` / `:id/usage` → consulter n'importe quelle organisation.
3. `PATCH /api/v1/tenants/:id` → modifier une organisation concurrente.
4. `POST /api/v1/tenants/:id/suspend` → **couper le service** d'un concurrent.
5. `DELETE /api/v1/tenants/:id/permanent` → **détruire définitivement** ses données.

➡️ Compromission complète de l'isolation multi-tenant + **violation de données personnelles (RGPD)**.

### 1.3 Correctif

Deux étapes : (A) introduire un vrai super-admin plateforme, (B) séparer le self-service.

#### A. Concept de super-admin + guard dédié

**Option recommandée** : allowlist d'IDs/emails via variable d'environnement (simple, auditable,
pas de migration). Alternative plus robuste : colonne `User.isSuperAdmin Boolean @default(false)`.

```ts
// src/core/auth/super-admin.config.ts
export const SUPER_ADMIN_IDS = (process.env.SUPER_ADMIN_USER_IDS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
```

```ts
// src/core/auth/guards/super-admin.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SUPER_ADMIN_IDS } from '../super-admin.config';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest()?.user;
    if (!user?.id || !SUPER_ADMIN_IDS.includes(user.id)) {
      throw new ForbiddenException('Réservé aux administrateurs plateforme.');
    }
    return true;
  }
}
```

```ts
// tenants.controller.ts — remplacer RolesGuard/@Roles par le SuperAdminGuard
@Controller('tenants')
@UseGuards(JwtDatabaseGuard, SuperAdminGuard)   // ← plus de @Roles('ADMIN')
export class TenantsController { … }
```

> ⚠️ `SuperAdminGuard` s'exécute après le `TenantGuard` global. Les super-admins doivent avoir un
> tenant, **ou** marquer le contrôleur `@AllowNoTenant()` si l'administration plateforme doit
> fonctionner sans tenant courant.

#### B. Self-service « ma propre organisation »

Les ADMIN de tenant ont des besoins légitimes (voir/éditer **leur** orga). À router via une surface
**scopée au tenant courant**, pas via `/tenants/:id` :

- Lecture : `GET /me/tenant` existe déjà ✅.
- Édition : ajouter `PATCH /me/tenant` (ADMIN, `org.*` ou nouveau code `org.tenant.manage`) qui force
  `id = user.tenantId` côté service — jamais d'`id` arbitraire en paramètre.

#### C. Ne plus exposer les secrets (voir aussi P0-3)

Retirer `weezeventClientSecret` (et idéalement `weezeventClientId`) de `selectFields`
([`tenants.service.ts:25-51`](../api-datafriday-staging/src/features/tenants/tenants.service.ts#L25-L51)).

#### Correctif minimal d'urgence (si pas le temps de A+B avant un déploiement)

Désactiver entièrement la surface en retirant `TenantsController`/`TenantsModule` des imports de
[`app.module.ts`](../api-datafriday-staging/src/app.module.ts) et gérer les tenants par script DB.
**Moins bon** (perte de fonctionnalité) mais supprime la faille immédiatement.

### 1.4 Tests d'acceptation
- Un ADMIN du tenant A reçoit `403` sur `GET /tenants`, `GET/PATCH/DELETE /tenants/<B>`.
- Un super-admin (id dans l'allowlist) peut lister/administrer.
- Aucune réponse `/tenants*` ne contient `weezeventClientSecret`.

---

## 2. 🔴 P0-2 — Webhook Weezevent : bloqué + signature optionnelle

### 2.1 Constat (vérifié)

[`webhook.controller.ts`](../api-datafriday-staging/src/features/weezevent/webhook.controller.ts)
**n'a pas `@Public()`**. Tous les guards globaux s'appliquent, dont `JwtDatabaseGuard`. Weezevent
appelle sans JWT Supabase → la requête est rejetée en **401 avant d'atteindre le handler**.
➡️ **L'intégration webhook est non fonctionnelle dès qu'on est derrière les guards globaux.**

Second problème : même rendu public, la **signature n'est vérifiée que si**
`tenant.weezeventWebhookSecret` est renseigné ([lignes 75-92](../api-datafriday-staging/src/features/weezevent/webhook.controller.ts#L75-L92)).
Si le secret n'est pas configuré, **aucune authentification** → n'importe qui peut injecter de faux
événements (`POST /webhooks/weezevent/:tenantId/:integrationId`).

> ✅ Bon point : rendre la route publique est **sûr vis-à-vis du multi-tenant** — le scoping Prisma
> est *désactivé hors contexte tenant* ([`prisma.service.ts:101`](../api-datafriday-staging/src/core/database/prisma.service.ts#L101)),
> et le handler vérifie déjà `integration.tenantId === tenantId`.

### 2.2 Correctif

```ts
// webhook.controller.ts
import { Public } from '../../core/auth/decorators/public.decorator';

@ApiTags('Weezevent Webhooks')
@Controller('webhooks/weezevent')
@Public()                                  // ← auth = signature HMAC, pas JWT
export class WebhookController { … }
```

Et **rendre la signature obligatoire** (fail-closed) :

```ts
// Remplacer "if (tenant.weezeventWebhookSecret) { … }" par :
if (!tenant.weezeventWebhookSecret) {
  throw new UnauthorizedException('Webhook secret not configured for this tenant');
}
if (!signature) throw new UnauthorizedException('Signature header missing');
const isValid = this.signatureService.validateSignature(payload, signature, tenant.weezeventWebhookSecret);
if (!isValid) throw new UnauthorizedException('Invalid signature');
```

> Vérifier que `validateSignature` utilise bien une **comparaison à temps constant** (`timingSafeEqual`).

### 2.3 Tests
- `POST /webhooks/weezevent/<t>/<i>` sans JWT mais avec signature valide → `200`.
- Sans signature ou signature invalide → `401`.
- Tenant sans secret configuré → `401` (plus de bypass).

---

## 3. 🔴 P0-3 — Secret d'intégration exposé

### 3.1 Constat
`weezeventClientSecret` est listé dans `selectFields`
([`tenants.service.ts:48`](../api-datafriday-staging/src/features/tenants/tenants.service.ts#L48),
commentaire « Attention: sera retourné chiffré ») → renvoyé par `findAll`, `findOne`, `findBySlug`,
`update`. Combiné à **P0-1**, ces secrets (même chiffrés) fuitent vers tout ADMIN de tenant.

### 3.2 Correctif
- Retirer `weezeventClientSecret` et `weezeventClientId` de tout `select` exposé par l'API.
- Auditer les autres endpoints renvoyant des `WeezeventIntegration` / `Tenant` complets (ex.
  `integrations.controller`) pour s'assurer que `clientSecret` n'est jamais sérialisé.
- Vérifier la robustesse du chiffrement (algorithme, rotation de clé) du `clientSecret` stocké.

---

## 4. 🟠 P1-4 — Routes métier sans RBAC fin (VIEWER peut écrire)

### 4.1 Constat (vérifié)

~20 contrôleurs n'ont **ni `@Roles` ni `@RequirePermissions`** sur leurs méthodes → accessibles à
**tout utilisateur authentifié ayant un tenant**, y compris `VIEWER`. Or beaucoup exposent des
**écritures** (POST/PATCH/PUT/DELETE) :

| Contrôleur | Écritures (POST/PATCH/PUT/DELETE) | Permission proposée |
|------------|:---:|---------------------|
| `suppliers` | 4 | `menu.fb.suppliers` |
| `market-prices` | 8 | `menu.fb.marketPrices` |
| `menu-components` | 6 | `menu.fb.components` |
| `menu-items` | 13 | `menu.fb.menuItems` |
| `ingredients` | 3 | `menu.fb.menuItems` *(à valider)* |
| `packaging` | 3 | `menu.fb.menuItems` *(à valider)* |
| `product-types` / `product-categories` | (dans menu-items) | `menu.config.manage` |
| `brands` | 3 | `menu.config.manage` |
| `display-names` | 2 | `menu.config.manage` |
| `events` (+ types/catégories/sous-cat.) | 12 | `menu.events.manage` |
| `predict-versions` | écrit | `menu.events.manage` *(à valider)* |
| `space-menus` | 1 | `menu.fb.spaceMenu` |
| `mappings` | 10 | `menu.integration.fb` |
| `integrations` | 7 | `menu.integration.fb` |
| `weezevent` | 7 | `menu.integration.fb` |
| `aggregation` | 3 | `menu.integration.fb` |
| `inventory` / `inventory-counts` | 2 | ⚠️ **aucun code existant** (cf. 4.3) |
| `restock-state` | 2 | ⚠️ **aucun code existant** (cf. 4.3) |
| `kv` | 1 (PUT) | restreindre (interne) |
| `organizations` | 2 | `org.users.manage` *(à valider)* |
| `dashboard` (spaces) | 2 (POST) | `nav.analytics.*` |
| `analyse` | 0 (lecture) | `nav.analytics.*` (lecture) |

> Les `@Roles`/`@RequirePermissions` fonctionnent **sans** ajouter de `@UseGuards` : `RolesGuard` et
> `PermissionsGuard` sont déjà des guards **globaux**. Il suffit donc d'ajouter les décorateurs.

### 4.2 Correctif (motif recommandé : lecture ouverte, écriture gardée)

```ts
// Exemple : suppliers.controller.ts
@RequirePermissions('menu.fb.suppliers')      // ← sur chaque POST/PATCH/DELETE
@Post()  create(...) { … }

// Les GET peuvent rester accessibles à tout membre du tenant,
// ou être gardés par la même permission selon la politique souhaitée.
```

Pour éviter la répétition, créer un **décorateur composite** par domaine :

```ts
// src/core/auth/decorators/can-manage-fb.decorator.ts
import { applyDecorators } from '@nestjs/common';
import { RequirePermissions } from './permissions.decorator';
export const CanManageSuppliers = () => applyDecorators(RequirePermissions('menu.fb.suppliers'));
```

### 4.3 Lacunes de catalogue à arbitrer
`inventory`, `restock-state`, `kv` n'ont **aucune permission correspondante** dans le catalogue
([`permission-catalog.ts`](../api-datafriday-staging/src/core/rbac/permission-catalog.ts)). Décider :
- soit **ajouter** des codes (`menu.inventory.manage`, `menu.restock.manage`) + les attribuer aux rôles ;
- soit les rattacher à un code existant (ex. `nav.analytics.storage`) ;
- `kv` (key-value interne) devrait être **réservé ADMIN** voire retiré de l'API publique.

> Toute permission ajoutée au catalogue doit être **réattribuée aux rôles système** dans `SYSTEM_ROLES`
> et **re-seedée** (`ensureSystemPermissionCatalog` est idempotent ; relancer le seed / un script de
> backfill `cloneSystemRolesForTenant` pour les tenants existants).

---

## 5. 🟠 P1-5 — `/metrics` et `/openapi.json`

### 5.1 Constat
- `MetricsController` ([`metrics.controller.ts`](../api-datafriday-staging/src/health/metrics.controller.ts))
  n'a ni `@Public` ni `@UseGuards` ni `@Roles` → **tout utilisateur authentifié de n'importe quel
  tenant** peut lire des métriques **plateforme** (Redis, DB, files BullMQ).
- `GET /api/v1/openapi.json` est exposé **publiquement** sans auth
  ([`main.ts:213-217`](../api-datafriday-staging/src/main.ts#L213-L217)) → divulgue toute la surface API.
- `/docs` est protégé par Basic Auth **uniquement si** `DOCS_USER`/`DOCS_PASSWORD` sont définis (sinon
  public en prod, avec simple `console.warn`).

### 5.2 Correctif
- Restreindre `/metrics` au super-admin (`SuperAdminGuard`) ou au minimum `@Roles('ADMIN')` + filtrage,
  **ou** le sortir de l'API publique (endpoint interne / réseau privé / scrape Prometheus protégé).
- Protéger ou restreindre `/api/v1/openapi.json` (Basic Auth comme `/docs`, ou IP-allowlist).
- **Rendre `DOCS_USER`/`DOCS_PASSWORD` obligatoires en prod** (échec au démarrage si absents, plutôt
  qu'un simple warning) et **rotationner** les identifiants présents dans le `.env`
  (`DOCS_USER="adm1n"`, `DOCS_PASSWORD="datafriday-docs-2026"`).

---

## 6. 🟠 P1-6 — Frontend : gating UI absent

### 6.1 Constat (vérifié)
Le store charge `permissions` et expose un getter `can(code)` **aligné sur le backend**
([`auth.js:40-41`](../datafriday-web/src/store/modules/auth.js#L40-L41)), mais :
- `can()` **n'est appelé nulle part** ; aucun code de permission (`nav.*`, `org.*`…) n'est référencé
  dans le front.
- Le menu de `DashboardView.vue` affiche **toutes** les entrées (Utilisateurs, Rôles…) sans condition.
- Les routes enfants de `/dashboard` n'ont **aucun guard de rôle** ; `requireAdmin`/`requireManager`
  ne sont pas branchés (cf. P2-7).

➡️ Un `VIEWER` voit et clique « Utilisateurs / Rôles », déclenche des appels qui renvoient `403`
(intercepté → toast « Accès interdit »). Pas de fuite de données (backend protège), mais **UX
trompeuse** et défense en profondeur absente.

### 6.2 Correctif

**a) Gating du menu** — ajouter `v-if="can('…')"` sur les entrées sensibles de `DashboardView.vue` :

```vue
<v-list-item v-if="can('org.users.view')"  :title="t('navUsers')"  @click="goToUsersFromSettings" />
<v-list-group v-if="can('org.roles.manage')"> … Rôles … </v-list-group>
<v-list-item v-if="can('menu.integration.fb')" :title="t('navDataIntegration')" … />
```
avec `...mapGetters('auth', ['can'])` dans le composant.

**b) Guard de route générique par permission** — remplacer les guards admin/manager morts :

```js
// src/router/guards.js
export function requirePermission(code) {
  return async (to, from, next) => {
    if (!store.getters['auth/isInitialized']) await store.dispatch('auth/initialize')
    if (!store.getters['auth/isAuthenticated']) return next({ path: '/login', query: { redirect: to.fullPath } })
    if (!store.getters['auth/hasOrganization']) return next('/onboarding')
    return store.getters['auth/can'](code) ? next() : next('/spaces')
  }
}
```

```js
// router/index.js — exemples
{ path: '/users',       beforeEnter: requirePermission('org.users.view'),    … }
{ path: '/users/create',beforeEnter: requirePermission('org.users.manage'),  … }
{ path: '/roles',       beforeEnter: requirePermission('org.roles.manage'),  … }
{ path: '/permissions', beforeEnter: requirePermission('org.permissions.manage'), … }
```

> Les enfants de `/dashboard` n'héritent pas du `beforeEnter` parent dans vue-router : appliquer le
> guard **sur chaque route enfant** concernée.

**c) Table de correspondance menu/route → permission** (à câbler) :

| Élément UI / route | Permission |
|--------------------|-----------|
| Fournisseurs, Prix marché, Articles, Menus d'espace | `menu.fb.*` correspondant |
| Composants | `menu.fb.components` |
| Events (+ types/cat.) | `menu.events.manage` |
| Types/Catégories produits, Marques | `menu.config.manage` |
| Intégration de données | `menu.integration.fb` |
| Utilisateurs | `org.users.view` |
| Rôles | `org.roles.manage` |
| Permissions | `org.permissions.manage` |

---

## 7. 🟡 P2 — Durcissements

| # | Constat | Correctif |
|---|---------|-----------|
| **P2-7** | `requireAdmin`/`requireManager` jamais importés ([`router/index.js:2`](../datafriday-web/src/router/index.js#L2)) | Supprimer ou remplacer par `requirePermission` (cf. 6.2). |
| **P2-8** | Bypass auth démo : `?demo=1` / `localStorage.analyse_demo` ([`guards.js:32-44`](../datafriday-web/src/router/guards.js#L32-L44)) | Conditionner au build : `if (import.meta.env.DEV && demo) …` — **désactivé en prod**. |
| **P2-9a** | `/predict-test` route **sans auth** ([`router/index.js:285-290`](../datafriday-web/src/router/index.js#L285-L290)) | Retirer du build prod ou ajouter `requireAuth`. |
| **P2-9b** | `POST /onboarding/join/:slug` déprécié (join sans code) | Supprimer l'endpoint (risque : rejoindre une orga en devinant le slug). |
| **P2-10a** | JWT `expiresIn` 7 j ([`auth.module.ts:18`](../api-datafriday-staging/src/core/auth/auth.module.ts#L18)) | Réduire (ex. 1 h) + s'appuyer sur le refresh Supabase déjà géré côté front. |
| **P2-10b** | Migration RBAC inachevée : `User.role`/`UserTenant.role` (enum legacy) coexistent avec `roleId` | Backfill `roleId` pour tous les users, puis rendre `roleId` obligatoire ; figer le fallback legacy. |
| **P2-10c** | Anon key Supabase **en dur** dans `lib/supabase.js` | Déplacer vers `import.meta.env` (hygiène ; la clé anon reste publique par design). |
| **P2-10d** | `@UseGuards(JwtDatabaseGuard)` redondant sur la plupart des contrôleurs (déjà global) | Nettoyage cosmétique (optionnel). |
| **P2-10e** | `GET /users/me` non gardé alors que le contrôleur impose ADMIN/MANAGER ailleurs | OK (intentionnel), mais documenter — c'est un alias de `/me`. |

---

## 8. Plan d'exécution proposé

### Sprint 1 — Bloquants production (P0)
1. **P0-1** : `SuperAdminGuard` + bascule `TenantsController` + `PATCH /me/tenant` self-service.
2. **P0-2** : `@Public()` sur le webhook + signature obligatoire.
3. **P0-3** : purge des secrets des `select` exposés.
4. Tests d'intégration cross-tenant + webhook + non-régression `/me`, onboarding.

### Sprint 2 — RBAC fin & exposition (P1)
5. **P1-4** : ajouter `@RequirePermissions` à tous les contrôleurs métier (+ décider inventory/restock/kv).
6. **P1-5** : restreindre `/metrics` + `/openapi.json` ; rendre les creds docs obligatoires + rotation.
7. **P1-6** : gating menu (`v-if="can()"`) + `requirePermission` sur les routes sensibles.

### Sprint 3 — Durcissement (P2)
8. Démo/predict-test/join-slug ; JWT TTL ; backfill RBAC ; nettoyages.

---

## 9. Checklist « Go / No-Go » production

**Sécurité (No-Go si une case ❌)**
- [ ] Un ADMIN de tenant A ne peut ni lister ni lire ni modifier le tenant B (`403`).
- [ ] Le super-admin plateforme est défini hors-DB (env) et testé.
- [ ] Aucune réponse API ne contient `weezeventClientSecret`/`clientId`.
- [ ] Webhook Weezevent : signature **obligatoire**, comparaison à temps constant, route `@Public`.
- [ ] `/metrics` et `/openapi.json` non accessibles à un utilisateur lambda / anonyme.
- [ ] `DOCS_USER`/`DOCS_PASSWORD` définis (échec au boot sinon) et **rotationnés**.
- [ ] Un `VIEWER` ne peut créer/modifier/supprimer aucune ressource métier (`403`).
- [ ] Bypass démo et `/predict-test` désactivés dans le build prod.
- [ ] `POST /onboarding/join/:slug` supprimé.

**Configuration**
- [ ] `CORS_ORIGIN(S)` renseigné avec les domaines de prod (sinon fallback localhost).
- [ ] `JWT_SECRET` = secret de signature Supabase (prod), rotation documentée.
- [ ] `NODE_ENV=production` (active CORS strict, HSTS, masque les logs de requêtes).
- [ ] Migrations appliquées : **`npm run prisma:migrate:deploy`** (lit `.env`) en staging,
      `make prod-migrate` (`.env.production`) en prod. ⚠️ Prisma `migrate` utilise `DIRECT_URL`
      (`db.<ref>.supabase.co`) — depuis un sandbox/CI sans accès, forcer le pooler `DATABASE_URL`.

**Cohérence Front/Back**
- [ ] Menu et routes front gatés selon la même matrice que le backend.
- [ ] Les `403` backend ne sont plus atteignables par simple navigation (défense en profondeur).
- [ ] `permissions`/`role` rechargés après changement de rôle (cache d'auth invalidé — déjà en place).

**Tests automatisés à ajouter**
- [ ] e2e : matrice rôle × endpoint (ADMIN/MANAGER/STAFF/VIEWER) sur un échantillon représentatif.
- [ ] e2e : isolation cross-tenant (A ne voit pas B) sur les ressources métier **et** `/tenants`.
- [ ] e2e : webhook signé/non signé.

---

## 10. Récapitulatif des fichiers à modifier

**Backend**
- `src/features/tenants/tenants.controller.ts` — guard super-admin (P0-1)
- `src/features/tenants/tenants.service.ts` — retrait secrets + self-service scopé (P0-1/P0-3)
- `src/core/auth/guards/super-admin.guard.ts` *(nouveau)* + `super-admin.config.ts` *(nouveau)* (P0-1)
- `src/features/weezevent/webhook.controller.ts` — `@Public` + signature obligatoire (P0-2)
- `src/features/me/me.controller.ts` — `PATCH /me/tenant` self-service (P0-1)
- `src/health/metrics.controller.ts` + `src/main.ts` — restreindre metrics/openapi/docs (P1-5)
- Tous les contrôleurs métier listés §4.1 — `@RequirePermissions` (P1-4)
- `src/core/rbac/permission-catalog.ts` — éventuels nouveaux codes inventory/restock (P1-4)
- `src/core/auth/auth.module.ts` — TTL JWT (P2)

**Frontend**
- `src/views/DashboardView.vue` — `v-if="can(...)"` sur le menu (P1-6)
- `src/router/guards.js` — `requirePermission()` + retrait/refonte admin/manager + démo prod (P1-6/P2)
- `src/router/index.js` — `beforeEnter` par permission + retrait `/predict-test` prod (P1-6/P2)
- `src/lib/supabase.js` — clés via env (P2)
```
