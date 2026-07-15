# Auth & Onboarding — Utilisateurs, Organisations & RBAC

> Domaine cartographie : **Auth & onboarding**. Owner produit : Emmanuel.
> Écrans : `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-invite`,
> `/verify-email`, `/auth/callback`, `/onboarding`, `/profile`, `/users` (+`/users/create`),
> `/roles`, `/permissions`.
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma, chaque guard/stratégie
> d'authentification, chaque route des 7 contrôleurs backend du domaine, chaque store Vuex,
> chaque route/guard frontend et chaque client API a été localisé et lu directement dans le code
> — pas de citation recopiée d'un rapport tiers sans revérification. Objectif : qu'un dev ou un
> agent IA qui doit corriger un bug ici sache exactement où regarder et ce qu'il risque de casser
> ailleurs, sans relire le code.
>
> **Ce document remplace/complète cinq docs existants**, tous périmés à des degrés divers (détail
> section suivante) : `datafriday-web/docs/utiles/AUTHENTICATION_FLOW.md`,
> `datafriday-web/docs/utiles/RBAC_SYSTEM.md`, et trois docs backend très détaillés mais datés du
> **2026-06-24/25** (trois semaines avant cette passe) — `api-datafriday-staging/docs/
> SYSTEME_AUTH_COMPLET.md`, `.../PLAN_REMEDIATION_AUTH_PROD.md`, `.../CONCEPTION_CIBLE_AUTH.md`.
> Ces trois derniers restent d'excellentes archives de *pourquoi* certains choix ont été faits
> (à garder comme lecture historique), mais une partie de ce qu'ils décrivent comme
> "à faire"/"absent" est aujourd'hui **livré**, et une partie de ce qu'ils décrivent comme "4
> rôles système" est **obsolète**.

---

## Ce que cette passe a corrigé par rapport aux docs existants

1. **Catalogue RBAC obsolète dans les 3 docs backend ET dans `RBAC_SYSTEM.md` (frontend)** — les
   deux décrivent **4 rôles système (ADMIN/MANAGER/STAFF/VIEWER) et 19 permissions**. En relisant
   `permission-catalog.ts` (seule source de vérité, code ci-dessous) : c'est aujourd'hui **35
   permissions et 9 rôles** (ADMIN + **8 rôles métier nommés** : Analyste F&B, Logistic F&B,
   Technicien Logistic, PDV Superviseur, Directeur de site, Chef exécutif, Achat F&B, Chef).
   `MANAGER`/`STAFF`/`VIEWER` restent des valeurs de l'enum Prisma legacy `UserRole` mais **aucun
   rôle cloné par tenant ne porte plus ces `systemKey`** — seul `ADMIN` en a un. Le modèle à 4
   rôles est un vestige que les rôles métier ont remplacé fonctionnellement.
2. **"Gating UI absent" (P1-6, `SYSTEME_AUTH_COMPLET.md` §13 et `PLAN_REMEDIATION_AUTH_PROD.md`
   §6) — FAUX aujourd'hui.** Le getter `can()` est maintenant utilisé partout : le menu
   (`DashboardView.vue`, filtré via `src/constants/navigation.js`), le guard global de route
   (`router/index.js`, `meta.permission` + `router.beforeEach`), et `spaceEntryGuard`. C'est
   exactement l'architecture "cible" que `RBAC_SYSTEM.md` §3 proposait — elle est livrée, pas
   seulement planifiée.
3. **P0-1/P0-2/P0-3 du plan de remédiation (cross-tenant `/tenants`, webhook bloqué, secret
   exposé) — les trois sont CORRIGÉS**, vérifié dans le code (`SuperAdminGuard` sur
   `TenantsController`, `@Public()` + signature obligatoire sur le webhook, secrets retirés des
   `select`). **Mais la même faille cross-tenant que P0-1 a été retrouvée, non corrigée, sur un
   contrôleur différent** (`OrganizationsController`) qui n'existait pas encore ou n'avait pas été
   audité en juin — voir piège n°1 ci-dessous. C'est une découverte de cette passe, pas un report
   de l'ancien audit.
4. **"Accès aux espaces jamais filtré" (`CONCEPTION_CIBLE_AUTH.md` §2, ligne "❌") — corrigé depuis,
   vérifié dans le code** : `SpacesService.restrictedSpaceIds()` (`spaces.service.ts:52-57`) appelle
   bien `SpaceAccessService.getAccessibleSpaceIds()` pour scoper les listes d'espaces. Le doc de
   conception listait deux formulations légèrement différentes de la règle "accès complet" (§2 vs
   "Conséquences d'implémentation" en fin de document) ; le code tranche : **`hasFullAccess = isSuperAdmin
   OU isOwner OU allSpacesAccess`** (`space-access.service.ts:21-23`), pas la variante
   `systemKey===ADMIN OU spaces.viewAll` de l'autre paragraphe — cette dernière formulation semble
   être une version antérieure jamais retenue.
5. **Bug de multi-onglets "corrigé"** (mémoire projet) — seule la tolérance d'horloge JWT
   (`clockTolerance`, 10s) a été corrigée côté backend. La cause racine côté frontend
   (`onAuthStateChange` ne distingue pas un vrai logout d'un événement `SIGNED_OUT` diffusé par un
   autre onglet) est **toujours active** dans le code lu aujourd'hui — voir bugs actifs.

---

## Vue d'ensemble — comment les entités s'emboîtent

```
Tenant (l'organisation cliente)
  │  invitationCode/invitationEnabled = mécanisme d'auto-jonction (PAS un modèle Invite séparé)
  │
  ├──< Role (CLONÉ par tenant à l'onboarding — pas de rôle global partagé)
  │      │   9 rôles clonés : ADMIN (systemKey=ADMIN, toutes permissions, resync à chaque appel)
  │      │   + 8 rôles "métier" (systemKey=null, permissions figées à la création, jamais resync)
  │      └──< RolePermission >── Permission (35 codes système, tenantId=null + custom par tenant)
  │
  ├──< User ── tenantId FK directe (legacy, "kept for backward compatibility")
  │      │        + roleId FK vers Role (RBAC dynamique)
  │      │        + isSuperAdmin (plateforme, indépendant du rôle d'org)
  │      │        + allSpacesAccess (périmètre espaces, DÉCOUPLÉ du rôle)
  │      │
  │      ├──< UserTenant  (relation N-N réelle : un User PEUT appartenir à plusieurs Tenant,
  │      │                 bloqué applicativement aujourd'hui — voir zones grises)
  │      │                 isOwner=true = créateur de l'organisation, protégé
  │      │
  │      ├──< UserSpaceAccess  (périmètre d'espaces si pas d'accès complet — voir SpaceAccessService)
  │      └──< UserPinnedSpace  (favoris UI, sans rapport avec les droits)
  │
  └──< AuditLog (modèle + service prêts, JAMAIS appelés — voir code mort)
```

L'invariant structurant du domaine (voir `CONCEPTION_CIBLE_AUTH.md` §9, décision actée le
2026-06-25, **vérifiée vivante dans le code** ci-dessus) : **le rôle et le périmètre d'espaces sont
deux axes indépendants.** Le rôle (`User.roleId`) détermine les écrans/fonctions accessibles,
identiques sur tous les espaces de l'utilisateur. Les espaces accessibles (`UserSpaceAccess[]`, ou
accès complet via `isSuperAdmin`/`isOwner`/`allSpacesAccess`) déterminent *quels* espaces il voit.
Un "rôle par espace" a été envisagé puis explicitement écarté (sur-ingénierie pour un besoin qui
n'existe pas).

---

## ⚠️ Piège n°1 — `OrganizationsController` : la faille cross-tenant P0-1 corrigée sur `/tenants`, mais PAS sur `/organizations`

**Le plus important de ce domaine.** `TenantsController` (`/tenants`, 12 routes CRUD complètes sur
le modèle `Tenant`) a été durci en réponse à l'audit du 2026-06-24 : il porte désormais
`@AllowNoTenant() @UseGuards(JwtDatabaseGuard, SuperAdminGuard)` (`tenants.controller.ts:30-31`),
avec un commentaire explicite dans le code : *"Surface d'administration PLATEFORME (cross-tenant)…
cf. faille corrigée P0-1"*. `SuperAdminGuard` (`super-admin.guard.ts:22-34`) rejette quiconque n'a
pas `user.isSuperAdmin === true`. **Ce correctif est réel et vérifié** — un ADMIN de tenant
ordinaire ne peut plus atteindre `/tenants`.

**Mais `OrganizationsController` (`src/features/organizations/organizations.controller.ts`, lu en
entier) expose les mêmes opérations sur le **même modèle Prisma `Tenant`**, sans AUCUN de ces
garde-fous** :

```ts
// organizations.controller.ts:17-18 — TOUT le contrôleur
@Controller('organizations')
@UseGuards(JwtDatabaseGuard)          // ← ni SuperAdminGuard, ni @RequirePermissions
export class OrganizationsController {
  @Get(':id')    async getOrganization(@Param('id') id: string) { ... }
  @Patch(':id')  async updateOrganization(@Param('id') id: string, @Body() dto) { ... }
  @Delete(':id') async deleteOrganization(@Param('id') id: string) { ... }
}
```

`OrganizationsService` (lu en entier) interroge directement `prisma.tenant.findUnique/update` par
l'`id` **fourni par l'appelant dans l'URL**, sans jamais comparer à `request.user.tenantId`
(`organizations.service.ts:16,47,80`). Or `Tenant` est explicitement **exclu de l'auto-scoping
Prisma** (le middleware ne scope que les modèles ayant un `tenantId` scalaire requis — `Tenant`
*est* le tenant, il n'a pas ce champ). `TenantGuard` (guard global) vérifie seulement que
`request.user.tenantId` existe, **jamais qu'il correspond au `:id` demandé**. Aucun `@Roles`/
`@RequirePermissions` n'est posé, et il n'y a pas de paramètre `:spaceId` pour que
`SpaceAccessGuard` s'active.

**Résultat vérifié en code (pas seulement théorique)** : n'importe quel utilisateur authentifié
d'**importe quel tenant** (y compris un VIEWER) peut appeler `GET/PATCH/DELETE
/api/v1/organizations/{id-de-n-importe-quel-autre-tenant}` en devinant/énumérant un `cuid`, et lire,
modifier (`UpdateOrganizationDto` autorise même `plan` — changer le forfait de facturation d'un
tiers) ou suspendre (`status: SUSPENDED`) l'organisation d'un concurrent. C'est très exactement la
même classe de faille que P0-1, sur un contrôleur différent qui n'a jamais reçu le même correctif.
**Non corrigé au 2026-07-15.**

**Correctif recommandé** (symétrique à ce qui a déjà été fait sur `TenantsController`) : soit
supprimer `OrganizationsController` (redondant avec `/me/tenant` en lecture et
`TenantsController`/`SuperAdminGuard` en écriture), soit le réécrire en `PATCH /me/tenant`
self-service qui force `id = user.tenantId` côté service — jamais un `id` arbitraire en paramètre
(c'est exactement l'option B proposée par `PLAN_REMEDIATION_AUTH_PROD.md` §1.3 pour `/tenants`,
jamais appliquée ici).

---

## ⚠️ Piège n°2 — deux guards JWT pour deux moments du cycle de vie, à ne pas confondre

`JwtDatabaseGuard` et `JwtOnboardingGuard` sont tous deux des wrappers Passport (`AuthGuard`) mais
pointent vers des `Strategy` complètement différentes (`auth.module.ts:11`, stratégie par défaut
`'jwt-db'`) :

| | `JwtDatabaseGuard` (global, guard #2 de la chaîne) | `JwtOnboardingGuard` (local, `OnboardingController` seul) |
|---|---|---|
| Stratégie | `JwtDatabaseStrategy` (`jwt-db`) | `JwtOnboardingStrategy` (`jwt-onboarding`) |
| Fait un lookup DB ? | **Oui** — résout `User`+`tenant`+`roleRef.permissions`+`isOwner` via cache 3 niveaux (local 15s → Redis 300s → Prisma) | **Non** — lit uniquement les claims du JWT Supabase (`jwt-onboarding.strategy.ts:22-33`) |
| Exige un tenant résolu ? | Oui indirectement (sinon `TenantGuard` bloque juste après, 403) | Non — `payload.org_id` peut être absent, c'est le but (créer/rejoindre une orga AVANT d'en avoir une) |
| Utilisateur DB absent ? | Renvoie un utilisateur "anonyme" synthétique (`tenantId: null`, permissions vides) plutôt qu'un rejet — permet à `/me` de répondre "il faut onboarder" | N/A, ne fait pas de lookup |

`OnboardingController` porte `@Public() @UseGuards(JwtOnboardingGuard)`
(`onboarding.controller.ts:20-22`) : `@Public()` désactive les guards globaux (`JwtDatabaseGuard`,
`TenantGuard`, `SpaceAccessGuard`, qui vérifient tous `IS_PUBLIC_KEY`), et le
`@UseGuards(JwtOnboardingGuard)` explicite reprend la main pour exiger *quand même* un JWT Supabase
valide — juste sans tenant. **Si tu ajoutes une route qui doit fonctionner "authentifié mais pas
encore onboardé", elle doit suivre ce même patron** (`@Public()` + `JwtOnboardingGuard` explicite),
pas juste `@Public()` seul (qui désactiverait toute authentification) ni `JwtDatabaseGuard` seul
(qui échouera sans tenant résolu, `TenantGuard` bloquant juste après).

---

## ⚠️ Piège n°3 — `src/components/Login.vue` est un doublon mort de `LoginView.vue`

Vérifié par recherche exhaustive (`grep -rn "Login\.vue"` et `grep -rn "\bLogin\b"` sur tout
`datafriday-web/src`, hors sa propre définition) : **zéro importeur**. `router/index.js` monte
`../views/LoginView.vue` à `/login` (`index.js:11,56-59`), jamais `components/Login.vue`. Historique
git : `Login.vue` a un seul commit (`3a39240`, scaffold en masse du 16/12/2025, jamais retouché
depuis), quand `LoginView.vue` a reçu 5+ commits de travail réel. Le fichier mort est un simple
formulaire HTML avec `alert('Connexion réussie !')` en guise de soumission — aucune vraie logique.
**Ne jamais partir de ce fichier pour corriger un bug de connexion : `LoginView.vue` est le seul
écran vivant.**

---

## Modèles Prisma

### Tenant — l'organisation cliente

**Où vit le code** : `api-datafriday-staging/prisma/schema.prisma:131-220`.

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `slug` | Identifiant unique lisible, utilisé par le join legacy `join/:slug` (voir piège join déprécié). |
| `invitationCode` / `invitationEnabled` | Le mécanisme d'auto-jonction d'un tenant — **il n'existe pas de modèle `Invite`/`Invitation` séparé dans tout le schéma** (vérifié par grep exhaustif). Un code unique par tenant, activable/désactivable. |
| `plan` (`TenantPlan`: FREE/STARTER/PROFESSIONAL/ENTERPRISE) / `status` (`TenantStatus`: ACTIVE/SUSPENDED/TRIAL/CANCELLED) | `status === SUSPENDED` fait échouer l'authentification (`401 Organization is suspended`) à **chaque** palier du cache du lookup JWT (local/Redis/DB), pas seulement au premier login — vérifié 3 fois dans `jwt-db-lookup.strategy.ts` (lignes 86-88, 98-100, 240-242). |
| `weezeventClientId`/`weezeventClientSecret`/`weezeventWebhookSecret` | Secrets d'intégration. `weezeventClientSecret`/`weezeventClientId` sont **explicitement exclus** de tout `select` exposé par `TenantsController` depuis le correctif P0-3 (`tenants.service.ts:25-49`, commentaire *"⚠️ Sécurité (P0-3) : ne JAMAIS exposer…"*) — **mais `OrganizationsController` interroge le même modèle sans le même filtrage explicite** (son `select` ne demande pas ces champs donc ne les fuit pas non plus dans l'état actuel, mais ce n'est pas une garantie structurelle comme sur `TenantsController` — un futur `select: {...dto}` élargi y réintroduirait la fuite sans qu'aucun commentaire n'avertisse). |
| `numberOfEmployees`/`numberOfSpaces`/`plan` | Base de calcul de `tenant.usage` (quotas par plan) — **jamais appliqué** (voir zones grises). |

**Relations pertinentes pour ce domaine** : `users User[]` (legacy, 1-N direct), `userTenants
UserTenant[]` (N-N moderne), `roles Role[]`, `permissions Permission[]` (permissions custom du
tenant), `auditLogs AuditLog[]`.

### User — le compte applicatif

**Où vit le code** : `schema.prisma:309-343`.

```prisma
model User {
  id              String   @id @default(cuid())   // = l'id du compte Supabase Auth
  email           String
  firstName       String
  lastName        String
  fullName        String?
  phone           String?
  role            UserRole @default(VIEWER)  // Legacy — conservé pour compatibilité, voir roleRef
  roleId          String?                    // RBAC dynamique — FK vers Role (nullable pendant la transition)
  isSuperAdmin    Boolean  @default(false)    // Super-admin PLATEFORME, distinct du rôle ADMIN d'org
  allSpacesAccess Boolean  @default(false)    // Accès à TOUS les espaces, DÉCOUPLÉ du rôle
  tenantId        String                      // Keep for backward compatibility
  @@unique([email, tenantId])
}
```

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `id` | **N'est pas généré par Prisma en pratique** : `SupabaseAdminService.createUser()` documente explicitement que l'`id` retourné par Supabase "MUST be reused as the DB `User.id`" (`supabase-admin.service.ts:72-73`) — c'est le pont entre l'identité Supabase et la ligne applicative. Pas de colonne `supabaseId`/`authId` séparée : **le lien EST l'égalité des deux id**, vérifié par grep exhaustif (zéro champ Supabase-spécifique sur `User`). |
| `tenantId` | FK directe 1-tenant, commentée *"Keep for backward compatibility"*. C'est l'ancre "legacy" d'un utilisateur — l'appartenance multi-tenant réelle passe par `UserTenant` (voir plus bas), mais `tenantId` reste ce que la plupart du code (guards, services) lit en premier. |
| `isSuperAdmin` | Périmètre plateforme (cross-tenant), totalement indépendant du rôle d'organisation. Positionné uniquement en base (bootstrap/script), jamais via l'API applicative — pas de route qui l'écrit. |
| `allSpacesAccess` | Un des trois chemins vers "accès complet aux espaces" (`SpaceAccessService.hasFullAccess`, avec `isSuperAdmin`/`isOwner`). Positionnable par l'owner à la création/édition d'un utilisateur. |
| `role`/`roleId` | Double système en transition (voir section RBAC dynamique ci-dessous) : `role` est l'enum legacy à 4 valeurs, `roleId` la FK vers le `Role` dynamique cloné par tenant. |

**Pourquoi ce design** : la double appartenance (`tenantId` direct + `UserTenant[]`) permet en
théorie le multi-organisation par utilisateur sans casser tout le code qui suppose encore
"un user = un tenant" — voir zones grises pour le statut réel (modélisé, bloqué applicativement).

### UserTenant — l'appartenance N-N (le mécanisme réellement actif du multi-tenant)

**Où vit le code** : `schema.prisma:346-365`. `@@unique([userId, tenantId])`.

| Champ | Sens |
|---|---|
| `isOwner` | Le créateur de l'organisation. Protégé explicitement : ne peut pas être supprimé, ni rétrogradé hors ADMIN (`users.service.ts:527-529`, `407-409`). |
| `role`/`roleId` | Même dualité que sur `User` — les deux sont mis à jour ensemble par `changeRole()`. |

**Champs qui N'EXISTENT PAS** (vérifié par grep exhaustif sur tout le schéma, à corriger si un
autre doc les mentionne) : **aucun champ `status`/`invitedAt`/`lastSignInAt`/`phone` sur
`UserTenant`**. Le statut "invité vs actif" et `lastSignInAt` sont **calculés à la lecture**, pas
stockés :

```ts
// users.service.ts:892-909 (withAuthStatus) — pas de colonne, résolu via Supabase Admin API
```

`getAuthInfoByIds()` (`supabase-admin.service.ts`) interroge Supabase Auth en masse pour dériver
`lastSignInAt`/statut à chaque `GET /users`. `phone` **est** en revanche une vraie colonne, mais sur
`User` (`schema.prisma:315`), pas sur `UserTenant`.

### Role — cloné PAR TENANT, jamais global

**Où vit le code** : `schema.prisma:426-447`. `tenantId` est **requis** (non nullable) —
contrairement à `Permission.tenantId` qui est nullable. **Il n'existe donc aucun `Role` global
partagé entre tenants** : chaque tenant reçoit sa propre copie physique des 9 rôles système à sa
création.

| Champ | Sens |
|---|---|
| `systemKey` (`UserRole?`) | Pont vers l'enum legacy, renseigné **uniquement pour ADMIN** aujourd'hui (`systemKey: UserRole.ADMIN`). Les 8 rôles métier ont `systemKey: null` — ils sont identifiés par leur `name`, pas par un enum. |
| `isSystem` | `true` = rôle cloné depuis le catalogue système (`SYSTEM_ROLES`), non supprimable. Tous les 9 rôles clonés à l'onboarding sont `isSystem: true`, y compris les 8 rôles métier (contrairement à ce que "système" pourrait suggérer, ils **restent éditables** — seule la suppression est bloquée). |

### Permission — catalogue système global + custom par tenant

**Où vit le code** : `schema.prisma:406-424`. `tenantId` **nullable** : `null` = permission système
du catalogue global (`scope: SYSTEM`, `isSystem: true`, en lecture seule), sinon permission custom
d'un tenant (`scope: CUSTOM`, éditable par ses admins). `@@unique([tenantId, code])` — l'unicité
globale du `code` pour les lignes système (`tenantId=null`) n'est **pas garantie par une contrainte
DB** (le commentaire du champ le dit explicitement), elle repose sur le seed/service
(`ensureSystemPermissionCatalog`, idempotent par construction).

### RolePermission — la table de jointure, avec une règle de resynchronisation asymétrique

**Où vit le code** : `schema.prisma:449-458`. `@@id([roleId, permissionId])`.

**Le catalogue de 35 permissions et les 9 rôles système** (source de vérité unique,
`api-datafriday-staging/src/core/rbac/permission-catalog.ts`, lu en entier) :

| Catégorie | Codes |
|---|---|
| Navigation | `nav.spaces`, `nav.analytics.fb`/`hospitality`/`merch`/`ticketing`/`storage` (ces 5 derniers conservés pour compat, remplacés fonctionnellement par `front.fb.analyse`) |
| Spaces | `spaces.viewAll` — *"accès à TOUS les espaces… sans cette permission, l'utilisateur ne voit que les espaces qui lui sont explicitement accordés"*. **Décrite dans le catalogue mais listée comme "abandonnée/inerte" par `CONCEPTION_CIBLE_AUTH.md` §9 décision 2** : le code de `SpaceAccessService.hasFullAccess` (vérifié) ne teste PAS cette permission, seulement `isSuperAdmin`/`isOwner`/`allSpacesAccess`. La permission existe donc au catalogue, un rôle pourrait théoriquement la porter, mais **rien dans le code ne la lit** — un vrai champ mort fonctionnel, à distinguer d'un bug. |
| Edit Space | `space.edit` (CRUD spaces/floors/accès — voir `03_BUILDER_ESPACES.md`) |
| F&B Front (11 codes) | `front.fb.analyse`, `eventPredict`, `predict`, `spaceInventory`, `stockUp`, `live`, `shoppingList`, `restock`, `restockBoard`, `logistic`, `logisticReconcile` |
| Edit F&B Menu (5) | `menu.fb.suppliers`, `marketPrices`, `components`, `menuItems`, `spaceMenu` |
| F&B Back (2) | `back.fb.costTracking`, `back.fb.marginReport` |
| Edit Events | `menu.events.manage` |
| Edit HR | `menu.hr.manage` — *"catalogue seul, pas encore d'endpoint dédié"* (commentaire du code) |
| Configuration | `menu.config.manage` |
| Data Integration | `menu.integration.fb` |
| Users | `org.users.view`, `org.users.manage`, `org.users.changeRole` |
| Account | `org.roles.manage`, `org.permissions.manage` |

**Total : 35.**

**Les 9 rôles système clonés par tenant** (`SYSTEM_ROLES`) :

| Rôle | `systemKey` | Permissions |
|---|---|---|
| **ADMIN** | `ADMIN` | Les 35 — bypass en dur dans `PermissionsGuard` (`user.role?.systemKey === UserRole.ADMIN → true`, indépendant des lignes `RolePermission` réelles) |
| Analyste F&B | `null` | 10 (analyse, predict, cost/margin tracking) |
| Logistic F&B | `null` | 4 (`nav.spaces`, `spaceInventory`, `restock`, `logistic`) |
| Technicien Logistic | `null` | 2 (`nav.spaces`, `restockBoard`) |
| PDV Superviseur | `null` | 3 (`nav.spaces`, `spaceInventory`, `restockBoard`) |
| Directeur de site | `null` | 3 (`nav.spaces`, `logistic`, `logisticReconcile`) |
| Chef exécutif | `null` | 3 — **identiques à Directeur de site** (même trio de permissions ; les deux rôles ne sont distingués aujourd'hui que par leur nom/description, pas par leurs droits) |
| Achat F&B | `null` | 10 (suppliers, marketPrices + tout le bloc analyse front) |
| Chef | `null` | 4 (`nav.spaces`, `components`, `menuItems`, `spaceMenu`) |

**🟡 Gotcha confirmé — le clonage ne pose les permissions qu'À LA CRÉATION du rôle, sauf pour
ADMIN** (`cloneSystemRolesForTenant`, `permission-catalog.ts:262-318`, commentaire verbatim
lignes 250-253) :

```ts
if (existing) {
  await prisma.role.update({ where: { id: existing.id },
    data: { description: roleDef.description, systemKey: roleDef.systemKey, isSystem: true } });
  // ADMIN : resync complet du catalogue (invariant). Les autres rôles gardent leurs perms.
  if (roleDef.systemKey === UserRole.ADMIN) {
    await prisma.rolePermission.deleteMany({ where: { roleId: existing.id } });
    await prisma.rolePermission.createMany({ data: permissionIds.map(...) });
  }
  roleId = existing.id;
} else {
  const created = await prisma.role.create({ data: { ..., permissions: { create: permissionIds.map(...) } } });
}
```

**Conséquence pratique** : si tu ajoutes un nouveau code de permission au catalogue et veux
l'attribuer par défaut à "Chef" par exemple, modifier `SYSTEM_ROLES` dans `permission-catalog.ts`
**ne suffit pas** pour les tenants déjà existants — leur rôle "Chef" a déjà été créé, donc son
`RolePermission` ne sera plus jamais resynchronisé automatiquement (c'est volontaire : préserver
les personnalisations qu'un admin aurait faites sur ce rôle). Il faut soit un script de backfill
ciblé, soit accepter que seuls les nouveaux tenants aient la nouvelle permission par défaut. **Seul
ADMIN échappe à cette règle** — son jeu de permissions est un invariant forcé à chaque appel, jamais
personnalisable.

### UserSpaceAccess — le périmètre d'espaces, DÉCOUPLÉ du rôle

**Où vit le code** : `schema.prisma:380-393`. `@@unique([userId, spaceId])`. Backend :
`src/core/auth/space-access.service.ts` (lu en entier).

```ts
// space-access.service.ts:21-23
hasFullAccess(user): boolean {
  return !!(user?.isSuperAdmin || user?.isOwner || user?.allSpacesAccess);
}
```

**Décision produit actée** (`CONCEPTION_CIBLE_AUTH.md` §9, 2026-06-25, "raffinée" selon le
commentaire du code) : l'accès complet aux espaces ne dépend **plus du rôle** (un ADMIN/MANAGER non-
owner PEUT être restreint) — seulement de trois signaux indépendants du rôle : super-admin
plateforme, owner de l'organisation, ou flag `allSpacesAccess` positionné par l'owner. Sinon,
périmètre = `UserSpaceAccess.spaceId[]` explicite.

**Où c'est réellement branché (vérifié, pas juste modélisé)** :
- `SpacesService.restrictedSpaceIds()` (`spaces.service.ts:52-57`) appelle
  `SpaceAccessService.getAccessibleSpaceIds()` pour filtrer les listes — retourne `null` (aucun
  filtre, cache tenant-wide permis) ou la liste d'ids restreinte.
- `SpaceAccessGuard` (guard global #6, `space-access.guard.ts:30-58`) protège l'accès direct : si
  la route porte un paramètre `:spaceId` (ou celui désigné par `@SpaceIdParam('...')`), vérifie
  `SpaceAccessService.canAccessSpace()` et lève `403` sinon. Court-circuite à zéro coût DB pour les
  utilisateurs à accès complet.

**Champ ignoré** : `UserSpaceAccess.role` existe en colonne (un `UserRole` legacy par espace) mais
est **explicitement documenté comme ignoré** par la conception cible — le rôle effectif sur un
espace est toujours le rôle d'organisation, jamais un rôle par-espace (piste envisagée puis
écartée, voir zones grises pour le détail de cette décision).

### UserPinnedSpace — favoris UI, sans lien avec les droits

**Où vit le code** : `schema.prisma:367-378`. `@@unique([userId, spaceId])`. N'intervient dans
aucune logique d'autorisation — c'est un simple marque-page pour l'ordre d'affichage/l'accès rapide.

### AuditLog — modélisé, jamais alimenté

**Où vit le code** : `schema.prisma:2233-2249`. `userId` est un **`String` simple, pas une vraie
relation Prisma** vers `User` (pas d'`onDelete`, juste un index) — les entrées ne sont pas protégées
contre l'orphelinage si l'utilisateur est supprimé.

`AuditService` (`src/core/audit/audit.service.ts`) implémente `.log()`/`.findByEntity()`/
`.findByTenant()` — **mais grep exhaustif de `AuditService` sur tout `src/`** : aucune injection,
aucun appel, nulle part dans l'application (pas seulement ce domaine). Changement de rôle,
suppression d'utilisateur, suspension de tenant, octroi/révocation d'accès espace : tout passe par
`Logger.log()` (logs applicatifs classiques), **aucune trace requêtable**. Voir code mort.

---

## Backend — chaîne d'authentification & guards

### Ordre des guards globaux (vérifié `app.module.ts:174-192`)

```ts
{ provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },  // pousse tenantId en CLS
{ provide: APP_GUARD, useClass: TenantThrottlerGuard },   // 1 — rate-limit par tenant
{ provide: APP_GUARD, useClass: JwtDatabaseGuard },       // 2 — JWT + lookup DB
{ provide: APP_GUARD, useClass: TenantGuard },            // 3 — fail-closed si pas de tenant
{ provide: APP_GUARD, useClass: RolesGuard },             // 4 — @Roles()
{ provide: APP_GUARD, useClass: PermissionsGuard },       // 5 — @RequirePermissions()
{ provide: APP_GUARD, useClass: SpaceAccessGuard },       // 6 — UserSpaceAccess si :spaceId présent
```

**Nest exécute les `APP_GUARD` strictement dans l'ordre de déclaration** — c'est explicitement
commenté et numéroté dans le code lui-même. `SuperAdminGuard` et `JwtOnboardingGuard` ne sont
**pas** globaux : posés localement via `@UseGuards()` sur les contrôleurs qui en ont besoin.

**Important pour tout nouveau contrôleur** : `RolesGuard`/`PermissionsGuard` sont globaux mais
**permissifs par défaut** — un handler sans `@Roles(...)` ni `@RequirePermissions(...)` est
accessible à **tout utilisateur authentifié ayant un tenant résolu**, quel que soit son rôle. Ce
n'est un "deny by default" qu'à partir du moment où tu poses explicitement le décorateur. C'est
exactement le mécanisme qui a permis la faille du piège n°1 (aucun décorateur = aucune restriction).

### Supabase Auth : émetteur du JWT, jamais source de vérité des droits

`JwtPayload.sub` = l'id utilisateur **Supabase** (`jwt-db-lookup.strategy.ts:15`, commentaire
verbatim). Vérification de signature centralisée dans `jwt-secret.provider.ts` : HS256 via
`JWT_SECRET` partagé par défaut, ou RS256/ES256 via le JWKS Supabase si `JWT_USE_JWKS=true`
(cache 10 min). **`clockTolerance` par défaut = 10s** (`jwt-secret.provider.ts:26`) pour absorber
le décalage d'horloge avec Supabase — c'est le correctif dont parle la mémoire projet, toujours en
place.

`JwtDatabaseStrategy.validate()` (`jwt-db-lookup.strategy.ts:77-119`) ne se contente **pas** de
vérifier la signature : elle reconstruit `request.user` complet — `User` (role/isSuperAdmin/
allSpacesAccess/tenantId), `tenant` (id/name/slug/plan/status), `roleRef.permissions[]` (résolu
`Role → RolePermission → Permission.code`), `isOwner` (dérivé de `UserTenant`) — via un cache à 3
paliers (Map locale 15s → Redis 300s → Prisma), invalidé cluster-wide via Redis pub/sub
(`auth:invalidate`) à chaque mutation impactant les droits (changement de rôle, édition des
permissions d'un rôle, suspension du tenant, MAJ profil). Si aucun `User` DB n'existe encore pour
ce `sub` Supabase, la strategy renvoie un utilisateur "anonyme" synthétique (`tenantId: null`)
plutôt qu'un rejet — c'est ce qui permet à `GET /me`/`GET /onboarding/status` de répondre "il faut
onboarder" au lieu de `401`.

### Isolation multi-tenant Prisma — automatique, pas manuelle

`nestjs-cls` (`ClsModule.forRoot({ global: true, ... })`, `app.module.ts:125-128`) +
`TenantContextInterceptor` (copie `request.user.tenantId` en CLS) + un middleware Prisma
(`PrismaService`, constructeur) qui, pour **tout modèle ayant un `tenantId` scalaire requis**
(calculé depuis le DMMF), injecte automatiquement `tenantId` dans `where`/`data` de chaque requête
(`applyTenantScope`, `tenant-scope.util.ts:61-111`) — sans jamais écraser un filtre déjà posé.
Vérifié par un test d'intégration dédié (`tenant-isolation.integration.spec.ts`).

**C'est précisément ce mécanisme qui NE protège PAS `Tenant` lui-même** (il n'a pas de `tenantId`
scalaire — il *est* le tenant), d'où le piège n°1 : `/organizations` et l'ancien `/tenants` avant
correctif sont les deux seules surfaces du domaine qui échappent à l'auto-scoping et doivent donc
être protégées manuellement par un guard explicite.

**Code mort trouvé en creusant ce mécanisme** : un second `TenantInterceptor` (différent, non lié)
existe à `src/core/database/tenant.interceptor.ts` — jamais enregistré comme `APP_INTERCEPTOR`,
jamais monté. `CurrentTenant`'s fallback `|| request.tenantId` (`current-tenant.decorator.ts:10`)
qui dépendait de cet ancien mécanisme est donc inatteignable en pratique.

### Décorateurs

| Décorateur | Effet |
|---|---|
| `@Public()` | Désactive `JwtDatabaseGuard`/`TenantGuard`/`SpaceAccessGuard` pour la route |
| `@AllowNoTenant()` | Auth requise mais tenant optionnel (`/me`, `/onboarding`, `/tenants`, `/metrics`) |
| `@Roles(...)` | Restreint par `systemKey` (`RolesGuard`, OR sur les valeurs) |
| `@RequirePermissions(...)` | Exige ≥1 des codes listés (`PermissionsGuard`, OR) — ADMIN bypass toujours |
| `@SpaceIdParam(name)` | Indique à `SpaceAccessGuard` quel paramètre de route porte le `spaceId` (défaut `'spaceId'`) |
| `@CurrentUser()` / `@CurrentTenant()` | Injectent `request.user` / `request.user.tenantId` |

### `SuperAdminGuard` — la vraie séparation plateforme / organisation

`super-admin.guard.ts:22-34` : vérifie `request.user.isSuperAdmin` (colonne `User.isSuperAdmin`),
lève `ForbiddenException('Réservé aux administrateurs plateforme.')` sinon. **Usages confirmés
(grep exhaustif, hors specs)** : `TenantsController` (administration cross-tenant, avec le
commentaire "faille corrigée P0-1") et `MetricsController` (`/metrics`, infra Redis/DB/queues,
commentaire "Sécurité (P1-5)"). **`OrganizationsController` n'en fait PAS partie** — voir piège n°1.
Pas de spec dédiée (`super-admin.guard.spec.ts` n'existe pas).

### Provisioning Supabase — `SupabaseAdminService`

Client Supabase service-role global (`supabase-admin.service.ts`), utilisé par
`UsersService` pour deux opérations :
- `createUser()` (création directe avec mot de passe, `POST /users`) — doc du code : *"Returns the
  Supabase user whose `id` MUST be reused as the DB `User.id`."*
- `inviteUserByEmail()` (`POST /users/invite`) — envoie réellement l'email d'invitation via l'API
  Admin Supabase.

Si la transaction DB échoue après la création du compte Supabase, celui-ci est **rollback**
(supprimé) pour éviter un compte orphelin (`users.service.ts:618-623`).

---

## Backend — cartographie route par route (7 contrôleurs, 41 routes)

### `/onboarding` — `@Public()` + `JwtOnboardingGuard` (JWT requis, tenant optionnel)

| Route | Description |
|---|---|
| `GET /onboarding/status` | `getUserStatus()` — l'utilisateur a-t-il une ligne `User` en DB ? un tenant ? Source de vérité unique pour distinguer "jamais onboardé" de "onboardé". |
| `POST /onboarding` | `createOrganization()` — crée `Tenant` (plan `FREE`, status `TRIAL`) + clone les 9 rôles (`cloneSystemRolesForTenant`) + crée l'utilisateur `ADMIN` + `isOwner=true` + `allSpacesAccess=true`. **409** si l'appelant a déjà un `tenantId` ou une ligne `UserTenant`. |
| `POST /onboarding/join-by-code` | `joinByInvitationCode()` — cherche `Tenant` par `invitationCode` + `invitationEnabled` + `status != SUSPENDED`. Crée l'utilisateur avec `role: 'VIEWER'`, **`roleId: null` volontairement** (commentaire : "moindre privilège, l'admin attribuera un rôle métier ensuite"). **409** si l'appelant a déjà une ligne `User`. |
| `POST /onboarding/join/:slug` | `@deprecated` — même effet que join-by-code mais recherche `Tenant` par `slug`, **sans aucune vérification de code d'invitation**. Encore vivant (voir bugs actifs). |

### `/users` (12 routes, toutes derrière les guards globaux + `@RequirePermissions` explicite sauf `/me`)

| Route | Permission | Description |
|---|---|---|
| `POST /users` | `org.users.manage` | Création directe (mot de passe fourni), provisionne le compte Supabase |
| `GET /users` | `org.users.view` | Liste paginée, `status`/`lastSignInAt` calculés via Supabase Admin API |
| `GET /users/statistics` | `org.users.view` | Comptages par rôle |
| `GET /users/me` | — (auth seule) | Alias de `/me`, déclaré **avant** `:id` pour ne pas être capturé |
| `GET /users/:id` | `org.users.view` | Détail |
| `PATCH /users/:id` | `org.users.manage` | Mise à jour profil/flags |
| `DELETE /users/:id` | `org.users.manage` | Suppression — bloquée sur soi-même et sur l'owner ; compte Supabase détruit seulement si plus aucune `UserTenant` |
| `POST /users/invite` | `org.users.manage` | Invite par email (Supabase Admin) ou rattache un compte Supabase déjà existant (`attachExistingAccountToTenant`) |
| `POST /users/:id/reinvite` | `org.users.manage` | **Tear-down + recreate**, pas un simple renvoi — voir détail ci-dessous |
| `PATCH /users/:id/role` | `org.users.changeRole` | Changement de rôle avec 3 garde-fous métier (voir ci-dessous) |
| `POST /users/:id/spaces/:spaceId/access` | `org.users.manage` + `SpaceAccessGuard` | `upsert` sur `UserSpaceAccess` |
| `DELETE /users/:id/spaces/:spaceId/access` | `org.users.manage` + `SpaceAccessGuard` | `deleteMany` sur `UserSpaceAccess` |

**`changeRole()` — garde-fous vérifiés** (`users.service.ts:475-559`) :
1. Impossible de changer son propre rôle (`id === currentUserId` → 403).
2. Le `roleId` cible est résolu **scopé au tenant de l'appelant** (`where: { id, tenantId }`) — impossible d'assigner un rôle d'un autre tenant.
3. Promotion vers ADMIN réservée à un ADMIN (`resolvedRole === ADMIN && currentUserRole !== ADMIN` → 403).
4. Impossible de rétrograder l'owner hors ADMIN.
5. Invalide le cache d'auth de la cible après écriture.

**`reinvite()` — ce que ça fait réellement** (`users.service.ts:642-701`, pas un simple resend) :
409 si l'utilisateur s'est déjà connecté au moins une fois (`last_sign_in_at`, "reinvite inutile,
utiliser mot de passe oublié"), 409 si multi-organisation (recréer l'id casserait l'autre
adhésion). Sinon : capture `role`/`roleId`/`allSpacesAccess`/`UserSpaceAccess[]`, **supprime**
le compte Supabase et la ligne `User` (cascade `UserTenant`/`UserSpaceAccess`/pins), puis rappelle
`invite()` avec le rôle/périmètre préservés — un vrai "détruire et recréer sous un id Supabase
neuf", pas un renvoi d'email sur le même compte (Supabase refuse d'inviter deux fois le même
compte, d'où ce contournement).

### `/roles` (5 routes)

| Route | Permission | Description |
|---|---|---|
| `GET /roles`, `GET /roles/:id` | auth seule | Liste/détail des rôles du tenant |
| `POST /roles` | `org.roles.manage` | Créer un rôle custom (`name`, `description?`, `permissionIds[]`) |
| `PATCH /roles/:id` | `org.roles.manage` | Modifier — remplace `RolePermission` en bloc (`deleteMany` + `createMany`) |
| `DELETE /roles/:id` | `org.roles.manage` | Supprimer — refusé si `isSystem` ou si des `User`/`UserTenant` l'utilisent encore |

**Pas de fonctionnalité "dupliquer un rôle" dans l'UI ni l'API** (`grep clone|duplicate` sur
`roles.controller.ts`/`roles.service.ts`/`RoleFormDrawer.vue` : zéro résultat) — le seul mécanisme
de clonage du système est `cloneSystemRolesForTenant`, qui clone le **catalogue statique**
`SYSTEM_ROLES` vers un tenant à l'onboarding, pas un rôle existant vers un nouveau rôle au sein du
même tenant.

### `/permissions` (4 routes)

`GET /permissions` (`permissionsService.findAll`) est **dynamique par tenant**, pas un simple
retour du fichier statique : `WHERE tenantId IS NULL OR tenantId = <tenant appelant>` — catalogue
système + permissions custom de CE tenant seulement (jamais celles d'un autre tenant, vérifié via
`findOneOrFail` qui 404 sur un `tenantId` étranger). `POST`/`PATCH`/`DELETE` réservés
`org.permissions.manage`, les entrées système (`isSystem: true`) sont en lecture seule.

### `/tenants` — 12 routes, `SuperAdminGuard` exclusivement (voir infra)

CRUD complet + `upgrade`/`usage`/`suspend`/`reactivate`. Tout est verrouillé au super-admin
plateforme depuis le correctif P0-1 — **non concerné par le piège n°1** (c'est sa jumelle
`/organizations` qui l'est).

### `/me` — `@AllowNoTenant()`, auth seule

| Route | Description |
|---|---|
| `GET /me` | Profil résolu par la stratégie JWT-DB. `404` si `!user.tenantId` (pas encore onboardé). |
| `PATCH /me` | MAJ de **son propre** profil — `firstName`/`lastName`/`phone`/`avatar` uniquement, jamais le rôle/tenant (`UpdateMeDto` ne les expose pas). Invalide le cache d'auth après écriture. |
| `GET /me/tenant` | Détail du tenant courant. |

### `/organizations` — 3 routes, voir piège n°1 (faille cross-tenant active)

---

## Frontend — routes & permissions

Vérifié `router/index.js` (455 lignes, lu en entier) et `router/guards.js` (242 lignes, lu en
entier).

| Route | Composant | Guard `beforeEnter` | `meta.permission` |
|---|---|---|---|
| `/login` | `views/LoginView.vue` | `guestOnly` | — |
| `/signup` | `views/SignUpView.vue` | `guestOnly` | — |
| `/forgot-password` | `views/ForgotPasswordView.vue` | `guestOnly` | — |
| `/reset-password` | `views/ResetPasswordView.vue` | *(aucun)* | — |
| `/accept-invite` | `views/AcceptInviteView.vue` | *(aucun)* | — |
| `/verify-email` | `views/VerifyEmailView.vue` | *(aucun)* | — |
| `/auth/callback` | `views/AuthCallbackView.vue` | *(aucun)* | — |
| `/onboarding` | `views/OnboardingView.vue` | `onboardingGuard` | — |
| `/dashboard` (parent) | `views/DashboardView.vue` | `requireOrganization` | — |
| `/permissions` (enfant) | `components/permission/views/PermissionListView.vue` | *(hérite du parent)* | `org.permissions.manage` |
| `/roles` (enfant) | `components/role/views/RoleListView.vue` | *(hérite du parent)* | `org.roles.manage` |
| `/users` (enfant) | `components/user/views/UserListView.vue` | *(hérite du parent)* | `org.users.view` |
| `/users/create` (enfant) | `components/user/views/UserCreateView.vue` | *(hérite du parent)* | `org.users.manage` |
| `/profile` (enfant) | `components/user/views/ProfileView.vue` | *(hérite du parent)* | — (ouvert à tout membre) |

**Mécanisme de gating réel** — un `router.beforeEach` global (`index.js:415-432`, quoté
intégralement) :

```js
router.beforeEach(async (to, _from, next) => {
  const permission = to.meta?.permission
  if (!permission) return next()
  if (!store.getters['auth/isInitialized']) await store.dispatch('auth/initialize')
  if (!store.getters['auth/isAuthenticated']) return next({ path: '/login', query: { redirect: to.fullPath } })
  if (!store.getters['auth/hasOrganization']) return next('/onboarding')
  const can = store.getters['auth/can']
  const allowed = Array.isArray(permission) ? permission.some(can) : can(permission)
  return allowed ? next() : next('/spaces')
})
```

C'est ce hook — pas les guards individuels de `guards.js` — qui gate réellement `/users`, `/roles`,
`/permissions` : il tourne sur **chaque** navigation, après le `beforeEnter` de la route (et de ses
ancêtres pour une route enfant). Les routes espace (`SpaceBuilder`, `SpaceBuilder2`, `space-predict`,
`space-inventory`, `space-logistic`, `space-restock`) portent le même `meta.permission` et passent
par le même hook.

### Le menu latéral — filtré par le même `can()`, plus statique

`src/constants/navigation.js` définit `MAIN_NAVIGATION`/`SETTINGS_NAVIGATION` avec un champ
`permission` par entrée ; `DashboardView.vue:480,489,491` filtre ces tableaux via
`section.items.filter(i => !i.permission || this.can(i.permission))`. C'est exactement
l'architecture "cible" que `RBAC_SYSTEM.md` §3 décrivait — **livrée**, contrairement à ce que les
docs backend de juin (`SYSTEME_AUTH_COMPLET.md` §13, `PLAN_REMEDIATION_AUTH_PROD.md` P1-6)
affirmaient encore ("le getter `can` n'a aucun appelant").

### `guards.js` — 9 exports, 4 vivants, 4 morts, 1 utilitaire de données

| Export | Utilisé comme `beforeEnter` quelque part ? | Statut |
|---|---|---|
| `requireOrganization` | Oui (`/dashboard`) | **Vivant** — inclut le bypass démo (`?demo=1`/`localStorage.analyse_demo`), sans garde de build (voir bugs actifs) |
| `onboardingGuard` | Oui (`/onboarding`) | **Vivant** |
| `guestOnly` | Oui (`/login`, `/signup`, `/forgot-password`) | **Vivant** |
| `spaceEntryGuard` | Oui (`/spaces/:spaceId`) | **Vivant** — redirige vers le premier écran de `SPACE_SCREENS` que le rôle autorise |
| `requireAuth` | **Non** (importé dans `index.js` mais jamais attaché à une route) | **Mort** |
| `requireAdmin` | **Non** | **Mort** |
| `requireManager` | **Non** | **Mort** |
| `requirePermission(code)` | **Non** — superseded par le `meta.permission` + `beforeEach` global | **Mort** |
| `SPACE_SCREENS` | — | Donnée utilisée uniquement par `spaceEntryGuard` |

Les 4 guards morts sont documentés comme "code mort" dans `PLAN_REMEDIATION_AUTH_PROD.md` P2-7 —
**toujours vrai aujourd'hui**, malgré le fait que le mécanisme qu'ils étaient censés introduire
(`requirePermission`) a bien été implémenté, mais **directement dans `router/index.js` via
`meta.permission`**, pas en réutilisant cette fonction exportée.

---

## Frontend — stores Vuex

### `store/modules/auth.js` (755 lignes, lu en entier) — le store central

**State** : `userId, token, refreshToken, email, firstName, lastName, fullName, phone, avatar,
tenantId, tenantName, userRole, roleId, roleSystemKey, userPermissions[], isOwner, isSuperAdmin,
loading, error, initialized`.

**Le getter `can` — le seul point de vérité RBAC côté front, aligné sur le backend** :

```js
// auth.js:58-59
can: (state) => (code) =>
  !code || state.roleSystemKey === 'ADMIN' || state.userPermissions.includes(code),
```

`!code` court-circuite à `true` pour un code falsy/null — un menu item sans `permission` est donc
toujours visible ; c'était un bug documenté dans une mémoire projet antérieure ("permission:null ne
court-circuite pas"), **corrigé dans la version actuelle du getter**.

**Piège d'import** : `auth.js` importe `api` depuis `@/lib/api` en **default import** — c'est
l'instance Axios brute (`@/api/client.js`'s `export default apiClient`), pas le wrapper nommé
`{ api }` qui déballe automatiquement `.data`. Conséquence directe : `checkOnboardingStatus()`,
`createOrganization()`, `fetchCurrentUser()` appellent `/onboarding/status`, `/onboarding`,
`/onboarding/join-by-code`, `/me` **directement en dur**, sans passer par
`src/api/endpoints/onboarding.js` — voir client API plus bas.

**`onAuthStateChange` — le bug multi-onglets toujours actif** (`auth.js:570-599`, dans l'action
`initialize`) :

```js
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
    // ... commit SET_AUTH, éventuellement re-fetch onboarding/me si user différent
  } else {
    commit('CLEAR_AUTH')
    setAccessToken(null)
  }
})
```

Le callback **ignore délibérément `_event`** (préfixe underscore = paramètre non utilisé) et ne
branche que sur `session` truthy/falsy. Un événement `SIGNED_OUT` diffusé par Supabase dans un
**autre onglet** (broadcast cross-tab standard du SDK, notamment lors du renouvellement à usage
unique du refresh token) déclenche exactement le même `CLEAR_AUTH` qu'une vraie déconnexion
volontaire — aucune distinction entre `TOKEN_REFRESHED`/`SIGNED_OUT` propre à cet onglet vs. un
événement relayé d'un autre onglet. Voir bugs actifs.

### `store/modules/users.js` / `roles.js` / `permissions.js` — cache TTL 15 min, N'importent qu'UNE fonction chacun

Les trois stores suivent le même patron (liste cachée 15 min, `fetching` anti-doublon, mutateurs
locaux `add/update/remove` sans appel API — appelés par les vues après qu'elles ont fait
l'appel API elles-mêmes via `user.api.js`/`role.api.js`/`permission.api.js` directement) :

| Store | Importe de `api/endpoints/` | Nuance |
|---|---|---|
| `users.js` | `{ getUsers }` de `user.api.js` **seulement** | Les 8 autres fonctions de `user.api.js` (`inviteUser`, `changeUserRole`, `reinviteUser`...) sont appelées directement par les vues (`UserCreateView.vue`, `UserEditDrawer.vue`), pas via le store. |
| `roles.js` | `{ getRoles }` de `role.api.js` **seulement** | `fetchRoles` ne commit **pas** `SET_ROLES` (donc pas de cache posé) si le résultat normalisé est vide — évite de mettre en cache 15 min un résultat transitoire vide (token pas prêt, etc.). `permissions.js` n'a pas cette garde. |
| `permissions.js` | `{ getPermissions }` de `permission.api.js` **seulement** | — |

---

## Client API — qui appelle quoi

| Fichier | Statut | Consommateurs confirmés |
|---|---|---|
| `src/api/endpoints/user.api.js` (10 fonctions) | **Vivant** | `store/modules/users.js` (`getUsers` seul), `UserListView.vue` (`reinviteUser`), `UserCreateView.vue` (`createUser`/`createUsersBulk`/`inviteUser`/`inviteUsersBulk`), `UserEditDrawer.vue` (`updateUser`/`changeUserRole`/`getUser`), `UserDeleteDialog.vue` (`deleteUser`) |
| `src/api/endpoints/role.api.js` (4 fonctions) | **Vivant** | `store/modules/roles.js` (`getRoles`), `RoleFormDrawer.vue` (`createRole`/`updateRole`), `RoleDeleteDialog.vue` (`deleteRole`) |
| `src/api/endpoints/permission.api.js` (4 fonctions) | **Vivant** | `store/modules/permissions.js` (`getPermissions`), `PermissionFormDrawer.vue` (`createPermission`/`updatePermission`), `PermissionDeleteDialog.vue` (`deletePermission`) |
| `src/api/endpoints/onboarding.js` (3 fonctions : `getOnboardingStatus`, `completeOnboarding`, `joinOrganization`) | **MORT — zéro appelant**, voir piège dédié ci-dessous | — |
| `src/utils/api.js` (monolithe legacy) | Sans rapport avec ce domaine | `getUserPreferences`/`saveUserPreferences` (préférences d'affichage UI, pas identité/RBAC) sont les 2 seules fonctions "user-ish" du fichier, vivantes (`ConsolidatedAccountView.vue`) mais parlant à un **backend complètement différent** (Edge Function Supabase legacy `make-server-eb31619c`, pas l'API NestJS) — pas de piège "double client" auth ici, juste un fichier hors sujet. |

### Piège n°4 — `src/api/endpoints/onboarding.js` est un fichier client API mort, entièrement doublé en dur dans le store

`onboarding.js` expose `getOnboardingStatus()`, `completeOnboarding(data)`, `joinOrganization(code)`
— une API bien formée, mais **recherche exhaustive de ses 3 exports dans tout `datafriday-web/src`,
hors sa propre définition : zéro appelant.** `store/modules/auth.js` réimplémente les 3 mêmes
appels en dur sur l'instance Axios brute (`api.get('/onboarding/status')`,
`api.post('/onboarding', ...)`, `api.post('/onboarding/join-by-code', ...)`), sans jamais passer
par ce fichier. **Si tu dois modifier le comportement d'onboarding côté front, édite
`store/modules/auth.js` directement — `onboarding.js` ne sert à rien tant qu'il n'est pas
rebranché.**

---

## Récapitulatif — bugs actifs confirmés (2026-07-15, non corrigés)

| # | Bug | Sévérité | Fichiers | Repro |
|---|---|---|---|---|
| 1 | **`OrganizationsController` expose une faille cross-tenant identique à P0-1, jamais corrigée sur ce contrôleur** | 🔴 Critique | `organizations.controller.ts:17-18`, `organizations.service.ts:16,47,80` | Un utilisateur authentifié de N'IMPORTE quel tenant appelle `PATCH /api/v1/organizations/<id-d-un-autre-tenant>` avec `{ plan: "ENTERPRISE" }` ou `DELETE .../organizations/<id>` → lit/modifie/suspend l'organisation d'un tiers sans être super-admin ni membre de ce tenant. |
| 2 | **Bug multi-onglets non corrigé** — seule la tolérance d'horloge JWT (10s) a été traitée, pas la cause racine | 🟠 Élevée | `store/modules/auth.js:570-599` (`onAuthStateChange`) | Ouvrir l'app dans 2 onglets connectés ; toute rotation de refresh token à usage unique dans un onglet peut diffuser `SIGNED_OUT` vers l'autre onglet, qui exécute `CLEAR_AUTH` bien que sa propre session soit valide — déconnexion intempestive en pleine édition. |
| 3 | `POST /onboarding/join/:slug` déprécié mais toujours actif, sans vérification de code | 🟡 Moyenne | `onboarding.controller.ts:182-201`, `onboarding.service.ts:100-173` | Connaître/deviner le `slug` (souvent dérivé du nom de l'orga) suffit pour rejoindre un tenant en `VIEWER` sans invitation ni code. |
| 4 | Bypass démo (`?demo=1` / `localStorage.analyse_demo`) actif sans distinction dev/prod | 🟡 Moyenne | `router/guards.js:32-44` | Naviguer avec `?demo=1` sur `/dashboard` contourne entièrement `requireOrganization` en production. |
| 5 | `/predict-test` monté sans aucun guard d'authentification | 🟡 Moyenne | `router/index.js:373-379` | Accès direct à l'URL en prod, données mock mais surface non authentifiée exposée. |
| 6 | JWT `expiresIn` = 7 jours | 🟢 Faible | `auth.module.ts:18` | Une révocation de droits (changement de rôle, suspension) met jusqu'à 7 jours à expirer *le token lui-même* — mitigé par l'invalidation du cache d'auth (Redis pub/sub), mais le JWT brut reste valide côté signature pendant toute sa durée de vie. |
| 7 | Clé anonyme Supabase codée en dur (pas de fuite — la clé anon est publique par design, mais hygiène) | 🟢 Faible | `src/lib/supabase.js:6-7` | — |
| 8 | Clonage de rôle métier ne resynchronise jamais les permissions après la création (ADMIN excepté) | 🟢 Faible (comportement voulu, pas un bug, mais piégeux si non documenté) | `permission-catalog.ts:250-296` | Ajouter une permission au catalogue et l'attribuer à "Chef" dans `SYSTEM_ROLES` ne la propage à AUCUN tenant existant — seulement aux tenants créés après ce changement. |

---

## Code mort de ce domaine (preuve : zéro référence externe trouvée)

- **`src/components/Login.vue`** — orphelin, un seul commit de scaffold, jamais routé ni importé.
  `LoginView.vue` est le seul écran vivant. Voir piège n°3.
- **`src/api/endpoints/onboarding.js`** (3 fonctions) — zéro appelant, doublé en dur dans
  `store/modules/auth.js`. Voir piège n°4.
- **`requireAuth`, `requireAdmin`, `requireManager`, `requirePermission`** (`router/guards.js`) —
  exportés, jamais attachés à une route (`requireAuth` est même importé dans `router/index.js`
  sans être utilisé). Le mécanisme qu'ils anticipaient existe, mais réimplémenté ailleurs
  (`meta.permission` + `beforeEach` global).
- **`src/core/database/tenant.interceptor.ts` (`TenantInterceptor`)** — classe complète avec sa
  propre spec passante, jamais enregistrée comme `APP_INTERCEPTOR`, jamais montée dans
  `app.module.ts`. Superseded par `TenantContextInterceptor`. Le fallback `request.tenantId` du
  décorateur `@CurrentTenant()` en dépendait — inatteignable en pratique.
- **`AuditLog`/`AuditService`** — modèle Prisma et service applicatif complets et fonctionnels,
  **zéro point d'injection ou d'appel trouvé dans TOUT le backend** (pas seulement ce domaine).
  Aucune action sensible (changement de rôle, suppression d'utilisateur, suspension de tenant,
  invitation) n'est actuellement tracée de façon requêtable.
- **Fonctionnalité "cloner un rôle"** — n'existe nulle part dans l'UI (`RoleFormDrawer.vue` ne
  propose que créer/éditer) ni dans l'API (`roles.controller.ts` n'a pas de route clone/duplicate).
  À ne pas confondre avec `cloneSystemRolesForTenant`, qui clone le catalogue statique vers un
  nouveau tenant, pas un rôle existant vers un nouveau au sein du même tenant.
- **`UsageBadges`-like duplication** : non trouvée dans ce domaine (contrairement au Builder) —
  aucun composant dupliqué détecté dans `components/user/`, `components/role/`,
  `components/permission/`, tous les 11 fichiers de ces 3 dossiers sont vivants.

---

## Zones grises restantes (points réellement non tranchés, pas des angles morts)

Chaque point ci-dessous a été activement vérifié dans le code ; ce sont des décisions produit non
encore prises ou des chantiers explicitement différés, pas des questions laissées sans réponse.

- **Multi-organisation par utilisateur** : `UserTenant` modélise déjà la relation N-N (un `User`
  pourrait appartenir à plusieurs `Tenant`), et le code le sait — `users.service.ts` refuse
  explicitement ce cas ("l'utilisateur est déjà rattaché à une autre organisation", 409) plutôt que
  de le permettre. `CONCEPTION_CIBLE_AUTH.md` §7.6 le liste comme chantier futur ("exposer un
  sélecteur d'organisation"). La modélisation est prête, l'exposition applicative est un choix
  produit non tranché.
- **Quotas par plan (`FREE=3 users/1 space`, etc.)** : `Tenant.plan`/`numberOfEmployees`/
  `numberOfSpaces` existent, `getUsage()` (`TenantsController`) calcule un `tenant.usage`, mais
  aucun `create`/`invite` n'est bloqué quand la limite est atteinte — vérifié : `UsersService.create`/
  `.invite()` ne consultent jamais `getUsage()`. Chantier explicitement différé (`CONCEPTION_CIBLE_
  AUTH.md` §7.2), pas un oubli silencieux.
- **Désactiver ≠ supprimer** : `DELETE /users/:id` est destructif — pas d'état "désactivé"
  intermédiaire qui couperait l'accès tout en conservant l'historique. Décision non prise (§7.4).
- **Transfert d'ownership** : `isOwner` est protégé (non supprimable/rétrogradable) mais aucune
  route ne permet de le transférer à un autre utilisateur — si l'owner quitte l'organisation sans
  successeur désigné, blocage (§7.5, aucun `POST /users/:id/transfer-ownership` n'existe).
- **`spaces.viewAll` (permission du catalogue) n'est lue par aucun code** — voir section
  `RolePermission` ci-dessus. Ni un bug ni du code mort au sens strict (la permission peut être
  attribuée à un rôle custom sans erreur), simplement un champ du catalogue devenu inerte après la
  décision "accès complet découplé du rôle" du 2026-06-25. Décision non prise : la retirer du
  catalogue ou la rebrancher.
- **MFA/2FA, vérification email obligatoire avant tout accès applicatif, rate-limit dédié au login**
  : supportés par Supabase au niveau plateforme mais non activés/imposés côté application
  (`CONCEPTION_CIBLE_AUTH.md` §7.7). Non vérifié plus avant dans cette passe (dépend de la
  configuration du projet Supabase, hors du code applicatif lu ici).
- **Migration RBAC legacy inachevée** : `User.role`/`UserTenant.role` (enum `UserRole`) coexistent
  avec `roleId` indéfiniment — pas de date ni de critère documenté pour figer le fallback legacy et
  rendre `roleId` obligatoire (`PLAN_REMEDIATION_AUTH_PROD.md` P2-10b, toujours vrai).
- **RGPD / export des données utilisateur / droit à l'oubli** : non implémenté, non commencé au
  niveau du code (§7.9) — simple constat, pas d'ambiguïté sur l'état actuel.
