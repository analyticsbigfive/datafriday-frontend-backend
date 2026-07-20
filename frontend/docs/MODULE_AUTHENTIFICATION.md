# Module Authentification — synthèse opérationnelle

> Dérivé de [`CARTOGRAPHIE_MODULES.md`](CARTOGRAPHIE_MODULES.md) (domaines *Auth & onboarding* et
> *RBAC*), recoupé avec [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) et vérifié
> contre le code réel de `src/` le 2026-07-18.
>
> **Ce document est une porte d'entrée**, pas une source de vérité. La source de vérité du domaine
> reste [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) (823 lignes, citations
> `fichier:ligne` côté backend inclus). Ici : ce qu'il faut avoir en tête **avant** d'ouvrir un
> fichier, avec les chemins pour aller vite.
>
> Owner produit : **Emmanuel**. Backend associé : `api-datafriday-staging` (modules Onboarding, Me,
> Organizations, Tenants, Users, Roles, Permissions).

---

## 1. Ce que couvre le module

| Sous-domaine | Écrans | Modules backend | Modèles Prisma |
|---|---|---|---|
| **Auth & onboarding** | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/verify-email`, `/auth/callback`, `/onboarding`, `/profile` | Onboarding, Me, Organizations, Tenants | `Tenant`, `User`, `UserTenant` |
| **RBAC** | `/users`, `/users/create`, `/roles`, `/permissions` | Users, Roles, Permissions | `User`, `Role`, `Permission`, `RolePermission`, `UserSpaceAccess` |

13 écrans au total — c'est le plus gros bloc d'écrans du produit après le menu F&B, et la
**fondation** dont dépendent tous les autres domaines (aucune route applicative n'est atteignable
sans que ce module ait résolu identité + tenant + permissions).

---

## 2. Le modèle mental en une image

```
Tenant (l'organisation cliente)
  │  invitationCode + invitationEnabled  ← le SEUL mécanisme d'invitation
  │                                        (il n'existe aucun modèle `Invite` séparé)
  │
  ├──< Role   ── CLONÉ par tenant à l'onboarding (jamais de rôle global partagé)
  │      │        9 rôles : ADMIN + 8 rôles métier
  │      └──< RolePermission >── Permission (35 codes système + custom par tenant)
  │
  └──< User
         ├── roleId          → CE QU'IL PEUT FAIRE   (écrans, fonctions)
         ├── allSpacesAccess ┐
         ├── isSuperAdmin    ├→ OÙ IL PEUT LE FAIRE  (périmètre d'espaces)
         └──< UserSpaceAccess┘
```

**L'invariant à ne jamais perdre de vue : le rôle et le périmètre d'espaces sont deux axes
indépendants.** Un ADMIN peut être restreint à 2 espaces ; un « Technicien Logistic » peut avoir
accès à tous. La règle exacte, côté backend (`space-access.service.ts:21-23`) :

```
hasFullAccess = isSuperAdmin || isOwner || allSpacesAccess
```

Le rôle n'entre **pas** dans cette formule. Un « rôle par espace » a été envisagé puis explicitement
écarté. La permission `spaces.viewAll` existe au catalogue mais **n'est lue par aucun code** —
vestige de la décision du 2026-06-25, ni bug ni code mort au sens strict.

---

## 3. Le catalogue RBAC réel

⚠️ **Attention aux docs périmées** : [`utiles/RBAC_SYSTEM.md`](utiles/RBAC_SYSTEM.md) et trois docs
backend de juin décrivent **4 rôles / 19 permissions**. C'est faux depuis. La seule source de vérité
est `api-datafriday-staging/src/core/rbac/permission-catalog.ts` : **35 permissions, 9 rôles**.

**Les 9 rôles clonés par tenant** :

| Rôle | `systemKey` | Nb perms |
|---|---|---|
| **ADMIN** | `ADMIN` | 35 (bypass en dur dans `PermissionsGuard`) |
| Analyste F&B | `null` | 10 |
| Achat F&B | `null` | 10 |
| Logistic F&B | `null` | 4 |
| Chef | `null` | 4 |
| PDV Superviseur | `null` | 3 |
| Directeur de site | `null` | 3 |
| Chef exécutif | `null` | 3 — **droits identiques à Directeur de site** |
| Technicien Logistic | `null` | 2 |

`MANAGER`/`STAFF`/`VIEWER` restent des valeurs de l'enum Prisma legacy `UserRole`, mais **aucun rôle
cloné ne porte plus ces `systemKey`**. Le modèle à 4 rôles est un vestige.

**Les 35 permissions, par catégorie** : Navigation (6), Spaces (1, inerte), Edit Space (1),
F&B Front (11 : `front.fb.analyse|eventPredict|predict|spaceInventory|stockUp|live|shoppingList|restock|restockBoard|logistic|logisticReconcile`),
Edit F&B Menu (5), F&B Back (2), Edit Events (1), Edit HR (1, catalogue seul), Configuration (1),
Data Integration (1), Users (3), Account (2).

### 🟡 Le piège du clonage — permissions figées à la création

`cloneSystemRolesForTenant` ne pose les `RolePermission` **qu'à la création du rôle**, sauf pour
ADMIN qui est resynchronisé à chaque appel. Conséquence :

> Ajouter une permission au catalogue et l'attribuer à « Chef » dans `SYSTEM_ROLES` **ne la propage
> à aucun tenant existant** — seulement aux tenants créés après. Il faut un script de backfill ciblé.

C'est volontaire (préserver les personnalisations d'un admin), mais piégeux si on l'ignore.

---

## 4. Comment ça marche côté front

### La chaîne du token

```
Supabase (lib/supabase.js)         ← source unique, persistSession: true → localStorage
   ↓ onAuthStateChange / getSession
store/modules/auth.js  state.token ← miroir Vuex, NON persisté, reconstruit au boot par initialize()
   ↓ mutation SET_AUTH → setAccessToken()
api/client.js  accessToken (var module) → header Authorization: Bearer
```

Trois copies du même token, synchronisées par convention. Points à connaître :

- **Il n'y a pas de vrai refresh applicatif.** Sur 401, `client.js:103-131` relit la session
  (`getSessionOnce()`) et rejoue la requête ; c'est Supabase qui refresh de son côté
  (`autoRefreshToken: true`). Anti-boucle via le flag `_retry`.
- Après `createOrganization` et `joinOrganization`, `auth.js` force un `supabase.auth.refreshSession()`
  — sans ça le JWT ne porte pas encore le `tenant_id` et l'appel suivant part en 401.
- L'URL et la clé anon Supabase sont **en dur** dans `src/lib/supabase.js:6-7`, contrairement à
  `VUE_APP_API_URL` qui passe par l'env. (La clé anon est publique par design — c'est de l'hygiène,
  pas une fuite. Fiche [BUG-029](bugs/29_cle_anon_supabase_codee_en_dur.md).)

### Le gating des routes

Le mécanisme réel **n'est pas** dans `guards.js` — c'est un `router.beforeEach` global,
[`router/index.js:415-433`](../src/router/index.js) :

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

Toute nouvelle route protégée se déclare avec `meta: { permission: 'code' }` — **jamais** avec une
vérification inline dans le composant, ni en réactivant `requirePermission` (mort, voir §6).

`guards.js` ne garde que 4 guards vivants : `requireOrganization` (`/dashboard` et tous ses
enfants), `onboardingGuard`, `guestOnly`, `spaceEntryGuard`.

### Le getter `can` — le seul point de vérité RBAC côté front

```js
// store/modules/auth.js:58-59
can: (state) => (code) =>
  !code || state.roleSystemKey === 'ADMIN' || state.userPermissions.includes(code),
```

Aligné sur le backend (même bypass ADMIN). `!code` court-circuite à `true` : une entrée de menu sans
`permission` est toujours visible — c'est voulu.

**Trois surfaces consomment ce getter**, ce qui est une duplication à ne pas aggraver :

| Surface | Fichier | Consommateurs |
|---|---|---|
| Getter `auth/can` | `store/modules/auth.js:58` | Le `beforeEach` global, `DashboardView.vue` (filtrage du menu via `constants/navigation.js`) |
| Composable `usePermissions` | `composables/usePermissions.js` (21 l.) | **1 seul** : `components/MainNav.vue` |
| Directive `v-can` | `plugins/permissions.js` (20 l.) | **2 seuls** : `RoleListView.vue`, `PermissionListView.vue` |

Pour un nouveau besoin : utiliser le getter via `useStore()`, ou `usePermissions` si on est déjà en
Composition API. Ne pas créer une 4ᵉ surface.

---

## 5. Les fichiers du module

### Vues (`src/views/`)

| Vue | Lignes | Style |
|---|---|---|
| `LoginView.vue` | 453 | Options API |
| `SignUpView.vue` | 438 | Options API |
| `OnboardingView.vue` | 450 | **`<script setup>`** — seule du lot |
| `VerifyEmailView.vue` | 362 | Options API |
| `AcceptInviteView.vue` | 349 | Options API |
| `ResetPasswordView.vue` | 327 | Options API |
| `ForgotPasswordView.vue` | 306 | Options API |
| `AuthCallbackView.vue` | 74 | Options API |

### Composants RBAC (`src/components/`)

`user/` : `UserListView.vue` (536), `UserCreateView.vue` (684), `drawers/UserEditDrawer.vue` (521),
`dialogs/UserDeleteDialog.vue` (129), `views/ProfileView.vue` (690).
`role/` : `RoleListView.vue` (637), `drawers/RoleFormDrawer.vue` (592), `dialogs/RoleDeleteDialog.vue` (204).
`permission/` : `PermissionListView.vue` (337), `drawers/PermissionFormDrawer.vue` (342), `dialogs/PermissionDeleteDialog.vue` (81).

Les 11 fichiers de ces trois dossiers sont **tous vivants** — aucun doublon détecté, contrairement au
Builder.

### Stores

`auth.js` (755 l.) — le seul module Vuex du projet consommé en **Options API** (`mapGetters`/
`mapActions`, 15 fichiers). C'est une exception historique documentée : **ne pas la reproduire**.
`users.js` (83), `roles.js` (95), `permissions.js` (84) — trois copies quasi identiques du gabarit
standard (cache TTL 15 min, `isCacheValid`, `INVALIDATE`).

Nuance utile : `roles.js` ne commit pas `SET_ROLES` si le résultat normalisé est vide — évite de
cacher 15 min un résultat transitoire (token pas prêt). `permissions.js` n'a pas cette garde.

### Clients API

`user.api.js` (10 fonctions), `role.api.js` (4), `permission.api.js` (4) — vivants. Nuance : les
stores n'importent qu'**une** fonction chacun (`getUsers`/`getRoles`/`getPermissions`) ; les 9 autres
fonctions de `user.api.js` sont appelées **directement par les vues**, hors chaîne store.

---

## 6. Code mort — ne pas partir de là

| Fichier | Preuve |
|---|---|
| **`src/components/Login.vue`** | Zéro importeur. Un seul commit (scaffold du 16/12/2025), soumission = `alert('Connexion réussie !')`. `LoginView.vue` est le seul écran vivant. |
| **`src/api/endpoints/onboarding.js`** (3 fonctions) | Zéro appelant — `auth.js` réimplémente les 3 appels en dur sur l'instance Axios brute. Pour modifier l'onboarding, éditer `store/modules/auth.js`. |
| `guards.js` : `requireAuth`, `requireAdmin`, `requireManager`, `requirePermission` | 4 exports sur 8 jamais attachés à une route (`requireAuth` est même importé dans `index.js` sans être utilisé). |
| `src/lib/api.js` | Shim déprécié qui ré-exporte `@/api/client`. 2 importeurs restants : `store/modules/auth.js`, `ProfileView.vue`. |
| Backend : `AuditLog` / `AuditService` | Modèle + service complets, **zéro appel dans tout le backend**. Aucune action sensible n'est tracée de façon requêtable. |
| Backend : `core/database/tenant.interceptor.ts` | Jamais enregistré comme `APP_INTERCEPTOR`. Superseded par `TenantContextInterceptor`. |

---

## 7. Bugs actifs — à lire avant de toucher au module

| # | Bug | Sévérité |
|---|---|---|
| 1 | ~~**`OrganizationsController` — faille cross-tenant.**~~ **Corrigé le 2026-07-20** — 📄 Dossier technique complet : [`SECURITE_ORGANIZATIONS_CROSS_TENANT.md`](SECURITE_ORGANIZATIONS_CROSS_TENANT.md), voir aussi [BUG-035](../../backend/docs/bugs/35_organizationscontroller_faille_cross_tenant.md). `OrganizationsController` porte désormais `SuperAdminGuard` + `@AllowNoTenant()`, même pattern que `/tenants`. | 🟢 Corrigé |
| 2 | ~~**Déconnexion multi-onglets.**~~ **Corrigé** — voir [BUG-190](bugs/190_auth_signed_out_rotation_deconnexion_multi_onglets.md). La décision est désormais une fonction pure testée (`utils/authSessionEvent.js`), qui distingue l'artefact de rotation du refresh token d'une vraie déconnexion, sans casser la propagation volontaire entre onglets. Vérifié au navigateur le 2026-07-18. | 🟢 Corrigé |
| 3 | `POST /onboarding/join/:slug` déprécié mais actif, **sans code d'invitation** — deviner le slug suffit pour rejoindre un tenant en VIEWER. | 🟡 Moyenne |
| 4 | ~~Bypass démo `?demo=1` / `localStorage.analyse_demo`.~~ **Corrigé** — [BUG-027](bugs/27_bypass_demo_actif_sans_distinction_env.md). Retiré, et non restreint au dev : le mode démo est déjà débranché (`isDemoMode()` faux en dur), le flag n'accordait plus qu'un accès non authentifié. | 🟢 Corrigé |
| 5 | ~~`/predict-test` monté sans guard.~~ **Corrigé** — [BUG-028](bugs/28_predict_test_sans_guard_auth.md). Route non montée en production, accès libre conservé hors production. | 🟢 Corrigé |
| 6 | JWT `expiresIn` = 7 jours — une révocation de droits met jusqu'à 7 jours à expirer le token lui-même (mitigé par l'invalidation Redis pub/sub du cache d'auth). | 🟢 Faible |
| 7 | ~~`console.log` du JWT en clair.~~ **Corrigé** — voir [BUG-191](bugs/191_auth_console_log_jwt_en_clair.md). | 🟢 Corrigé |

**Ordre de traitement recommandé** : le n°1 d'abord (exploitable en une requête HTTP), puis le n°2
(perte de travail utilisateur en pleine édition), puis 3-4-5 qui sont trois surfaces non
authentifiées de la même famille.

---

## 8. Règles pratiques

1. **Nouvelle route protégée** → `meta: { permission: 'code' }` dans `router/index.js`. Jamais de
   check inline dans le composant, jamais de nouveau guard `beforeEnter` pour du RBAC.
2. **Nouvelle route « authentifié mais pas encore onboardé »** (backend) → patron
   `@Public()` + `@UseGuards(JwtOnboardingGuard)`. Ni `@Public()` seul (aucune auth), ni
   `JwtDatabaseGuard` seul (`TenantGuard` bloque juste après).
3. **Nouveau contrôleur backend** → `RolesGuard`/`PermissionsGuard` sont globaux mais **permissifs
   par défaut**. Un handler sans `@RequirePermissions(...)` est ouvert à tout utilisateur
   authentifié ayant un tenant. C'est exactement ce qui a produit la faille n°1.
4. **Nouveau modèle Prisma** → l'auto-scoping tenant ne s'applique qu'aux modèles ayant un
   `tenantId` scalaire requis. `Tenant` en est exclu par construction : toute surface qui le
   manipule doit être protégée manuellement.
5. **Ne pas reproduire** `mapGetters`/`mapActions` (exception `auth.js`) dans un nouveau composant —
   la norme est `useStore()`.
6. **Ambiguïté métier** → [`QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md), pas d'arbitrage
   solo.

---

## 9. Zones grises — décisions non prises

Ce ne sont pas des oublis : chaque point a été vérifié dans le code et correspond à un chantier
explicitement différé.

- **Multi-organisation par utilisateur** — `UserTenant` modélise déjà le N-N, mais `users.service.ts`
  refuse le cas (409). Modélisation prête, exposition applicative non tranchée.
- **Quotas par plan** — `getUsage()` calcule, aucun `create`/`invite` ne bloque.
- **Désactiver ≠ supprimer** — `DELETE /users/:id` est destructif, pas d'état intermédiaire.
- **Transfert d'ownership** — `isOwner` est protégé mais aucune route ne le transfère. Si l'owner
  part sans successeur : blocage.
- **`spaces.viewAll`** — au catalogue, lue par personne. La retirer ou la rebrancher ?
- **MFA/2FA, email obligatoire, rate-limit login** — supportés par Supabase, non activés côté app.
- **Migration RBAC legacy** — `User.role` (enum) coexiste avec `roleId` sans date ni critère de fin.
- **RGPD / droit à l'oubli** — non commencé.

---

## Références

- [`JOURNAL_AUTHENTIFICATION.md`](JOURNAL_AUTHENTIFICATION.md) — **journal des changements** du
  module (auteur, date, heure, description) — à compléter à chaque intervention
- [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) — **la source de vérité**, détail
  route par route (7 contrôleurs, 41 routes), chaîne des 6 guards globaux, cache d'auth 3 paliers.
- [`CARTOGRAPHIE_MODULES.md`](CARTOGRAPHIE_MODULES.md) — vue d'ensemble front + back.
- [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — conventions à respecter.
- [`bugs/00_INDEX.md`](bugs/00_INDEX.md) — fiches BUG-027, BUG-028, BUG-029.
- [`utiles/AUTHENTICATION_FLOW.md`](utiles/AUTHENTICATION_FLOW.md) et
  [`utiles/RBAC_SYSTEM.md`](utiles/RBAC_SYSTEM.md) — ⚠️ **périmés** (4 rôles / 19 permissions,
  gating UI décrit comme absent alors qu'il est livré). À lire comme archive du *pourquoi*, pas
  comme description de l'existant.
