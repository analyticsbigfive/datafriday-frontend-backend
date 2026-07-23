# RBAC System (Frontend) — Rôles, Permissions & Affichage dynamique

> **Statut** : design / cible — décrit l'état actuel (as-is) et l'architecture cible (to-be) du contrôle d'accès côté frontend : gestion des rôles/permissions par l'admin du tenant ("super admin"), et affichage conditionnel des menus/fonctionnalités selon le rôle/permissions de l'utilisateur connecté.
>
> Voir aussi : [api-datafriday-staging/docs/auth/RBAC_SYSTEM.md](../../api-datafriday-staging/docs/auth/RBAC_SYSTEM.md) (partie backend — modèle de données, endpoints, guards).

---

## 1. Principes directeurs

- **"Super admin" = Admin/Owner de l'organisation (tenant)** — pas de rôle plateforme séparé. C'est l'utilisateur avec `role.systemKey === 'ADMIN'` (ou `isOwner === true`) qui gère les pages *Organisation → Accès → Rôles / Permissions*.
- **Le menu et les fonctionnalités s'affichent/se masquent selon des codes de permission** (`can('org.users.view')`, etc.), pas selon le nom du rôle directement — un rôle custom créé par l'admin avec les bonnes permissions donnera accès aux mêmes écrans qu'un rôle prédéfini.
- **Le rôle ADMIN voit toujours tout** (bypass), pour cohérence avec la règle backend (§3.6 du doc backend) et pour éviter qu'un admin se masque des écrans à lui-même.
- L'UI de gestion des rôles/permissions (`RoleListView`, `PermissionListView`, `RoleFormDrawer`, `PermissionFormDrawer`) **existe déjà** sous `src/components/role/` et `src/components/permission/` — ce document décrit comment la connecter aux nouveaux endpoints backend et l'étendre (champs `isSystem`, `code`, `category`).

---

## 2. État actuel (as-is)

### 2.1 Store d'authentification

`src/store/modules/auth.js` :

- État : `userId`, `token`, `tenantId`, `tenantName`, `userRole` (string brute, ex. `"ADMIN"`)
- Getters : `isAdmin` (`userRole === 'ADMIN'`), `currentUser` (`{ id, role }`), `currentTenant`
  <!-- `isManager` (gating par nom de rôle) supprimé le 2026-07-22 — code mort incompatible avec les 6 rôles métier, cf. BUG-193. Gater sur `can('<code>')`, pas sur le nom de rôle. -->

- `fetchCurrentUser()` (lignes 358-378) → `GET /me`, alimente `tenantId`/`userRole` via la mutation `SET_TENANT`

→ **Aucune notion de permissions**, uniquement le nom du rôle (string).

### 2.2 Stores roles / permissions / users

| Store | Fichier | API | État |
|---|---|---|---|
| `roles` | `src/store/modules/roles.js` | `GET/POST/PATCH/DELETE /roles` | Cache 15 min, mais **endpoints backend inexistants** |
| `permissions` | `src/store/modules/permissions.js` | `GET/POST/PATCH/DELETE /permissions` | Idem |
| `users` | `src/store/modules/users.js` | `GET/POST/PATCH/DELETE /users` | Fonctionnel (backend existe) |

### 2.3 UI déjà développée (non branchée)

- `src/components/role/views/RoleListView.vue` : grille de cartes (nom, description, chips de permissions), bouton "Ajouter un rôle"
- `src/components/role/drawers/RoleFormDrawer.vue` : formulaire `{ name, description, permissionIds[] }` avec sélecteur de permissions (checklist + recherche)
- `src/components/role/dialogs/RoleDeleteDialog.vue`
- `src/components/permission/views/PermissionListView.vue` : table (nom, description, date de création)
- `src/components/permission/drawers/PermissionFormDrawer.vue` : formulaire `{ name, description }` — **pas de champ `code`/`category`**
- `src/components/permission/dialogs/PermissionDeleteDialog.vue`
- `src/components/user/views/UserListView.vue`, `UserCreateView.vue`, `src/components/user/drawers/UserEditDrawer.vue`

### 2.4 Routes

`src/router/index.js` (lignes 252-274) : `/permissions`, `/roles`, `/users`, `/users/create` existent déjà comme routes enfants de `/dashboard`, protégées uniquement par `requireOrganization` (aucun contrôle de rôle/permission).

### 2.5 Menu (navigation)

`src/views/DashboardView.vue` :

- **Drawer principal** (lignes 27-77) : "Spaces" + section "Analytiques" (F&B, Hospitality, Merch, Ticketing, Storage) — items statiques, sans navigation pour la plupart
- **Drawer "Settings"** (lignes 104-266) : sections *Configuration* (F&B Menu, Events, Configurations, Data integration) et *Organisation* (Account → Users/Profile, Access → Roles/Permissions)
- **100% statique**, codé en dur dans le template, **aucun `v-if`** lié au rôle ou aux permissions

### 2.6 Guards de routage

`src/router/guards.js` : `requireAuth`, `requireOrganization`, `guestOnly`, `requireAdmin` (`role === 'ADMIN'`), `requireManager` (`['ADMIN','MANAGER']`). Pas de guard basé sur des permissions/codes.

### 2.7 Écart constaté (gap analysis)

| Besoin | Existe ? |
|---|---|
| UI de gestion des rôles/permissions | ✅ (mais déconnectée — endpoints backend manquants) |
| Modèle `Role`/`Permission` avec `permissions[]` | ✅ côté formulaire frontend, ❌ côté backend |
| Récupération des permissions de l'utilisateur connecté | ❌ (`/me` ne renvoie que `role` en string) |
| Affichage conditionnel des menus selon permission | ❌ (menu 100% statique) |
| Garde de route basée sur permission | ❌ (seulement `requireAdmin`/`requireManager` par rôle) |

---

## 3. Architecture cible

### 3.1 Évolution du store `auth`

`GET /me` renverra (côté backend, voir doc backend §3.7) un objet utilisateur enrichi :

```json
{
  "id": "user_xxx",
  "email": "alice@example.com",
  "firstName": "Alice",
  "tenantId": "tenant_xxx",
  "isOwner": true,
  "role": {
    "id": "role_xxx",
    "name": "Manager Salle",
    "systemKey": "MANAGER",
    "isSystem": false,
    "permissions": ["menu.fb.suppliers", "menu.fb.menuItems", "org.users.view"]
  }
}
```

Adaptation de `src/store/modules/auth.js` :

```javascript
const state = {
  // ... champs existants
  roleId: null,
  roleSystemKey: null,   // 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER'
  userPermissions: [],   // codes de permission du rôle courant
  isOwner: false,
}

const getters = {
  // ... getters existants conservés pour compat
  roleSystemKey: (state) => state.roleSystemKey,
  isOwner: (state) => state.isOwner,
  isAdmin: (state) => state.roleSystemKey === 'ADMIN',
  // (isManager supprimé — BUG-193, gating par nom de rôle mort)
  // Nouveau : vérification de permission, ADMIN bypass toujours
  can: (state) => (code) =>
    state.roleSystemKey === 'ADMIN' || state.userPermissions.includes(code),
}

const mutations = {
  SET_TENANT(state, { tenantId, role, tenantName, roleId, roleSystemKey, userPermissions, isOwner }) {
    state.tenantId = tenantId
    state.userRole = role            // conservé (nom affiché, ex. "Manager Salle")
    state.roleId = roleId ?? null
    state.roleSystemKey = roleSystemKey ?? role // fallback si backend non migré
    state.userPermissions = userPermissions ?? []
    state.isOwner = !!isOwner
    if (tenantName !== undefined) state.tenantName = tenantName
  },
  // ...
}
```

> **Compatibilité** : si le backend n'envoie pas encore `role.permissions`/`systemKey` (avant migration backend), `roleSystemKey` retombe sur `role` (string legacy) et `userPermissions` reste vide → `can()` ne renvoie `true` que pour `roleSystemKey === 'ADMIN'`. Les pages protégées par permission doivent donc prévoir un comportement correct par défaut pour les non-admins (cf. §3.6).

### 3.2 Composable `usePermissions()`

Nouveau fichier `src/composables/usePermissions.js` :

```javascript
import { computed } from 'vue'
import store from '@/store'

export function usePermissions() {
  const can = (code) => !code || store.getters['auth/can'](code)
  const canAny = (codes = []) => codes.length === 0 || codes.some(can)
  const canAll = (codes = []) => codes.every(can)

  return {
    can,
    canAny,
    canAll,
    isAdmin: computed(() => store.getters['auth/isAdmin']),
    isOwner: computed(() => store.getters['auth/isOwner']),
    roleName: computed(() => store.getters['auth/userRole']),
  }
}
```

`can(undefined)` / `can(null)` renvoie `true` → un item de menu sans `permission` définie reste **toujours visible** (ex: "Profil").

### 3.3 Directive `v-can`

Nouveau fichier `src/plugins/permissions.js` :

```javascript
import store from '@/store'

function evaluate(binding) {
  const codes = Array.isArray(binding.value) ? binding.value : [binding.value]
  const can = store.getters['auth/can']
  return binding.modifiers.all ? codes.every(can) : codes.some(can)
}

export const canDirective = {
  mounted(el, binding) {
    if (!evaluate(binding)) {
      el.style.display = 'none'
      el.setAttribute('data-can-hidden', 'true')
    }
  },
  updated(el, binding) {
    const allowed = evaluate(binding)
    el.style.display = allowed ? '' : 'none'
  },
}
```

Enregistrement dans `src/main.js` :

```javascript
import { canDirective } from '@/plugins/permissions'
app.directive('can', canDirective)
```

Usage dans un template :

```html
<v-btn v-can="'org.roles.manage'" @click="openCreateDrawer">Ajouter un rôle</v-btn>

<!-- plusieurs codes : visible si AU MOINS UN est présent -->
<v-list-item v-can="['menu.fb.suppliers', 'menu.fb.marketPrices']">...</v-list-item>

<!-- modificateur .all : visible seulement si TOUS sont présents -->
<v-btn v-can.all="['org.users.manage', 'org.users.changeRole']">...</v-btn>
```

### 3.4 Menu piloté par configuration

Le menu (`DashboardView.vue`) passe d'un template 100% statique à un rendu basé sur une **configuration déclarative**, filtrée par `can()`.

Nouveau fichier `src/constants/navigation.js` (extrait — structure complète à dériver du menu actuel, voir mapping §4) :

```javascript
export const SETTINGS_NAVIGATION = [
  {
    section: 'navConfiguration',
    groups: [
      {
        key: 'settings-fb',
        icon: 'UtensilsCrossed',
        title: 'navMenuFB',
        items: [
          { title: 'suppliers', route: '/suppliers', permission: 'menu.fb.suppliers' },
          { title: 'navMarketPricesList', route: '/market-prices', permission: 'menu.fb.marketPrices' },
          { title: 'navComponents', route: '/components', permission: 'menu.fb.components' },
          { title: 'navMenuItems', route: '/menu-items', permission: 'menu.fb.menuItems' },
          { title: 'navSpaceMenu', route: '/space-menus', permission: 'menu.fb.spaceMenu' },
        ],
      },
      {
        key: 'settings-events',
        icon: 'CalendarCheck',
        title: 'navEvents',
        items: [
          { title: 'navEvents', route: '/events', permission: 'menu.events.manage' },
          { title: 'navEventTypes', route: '/event-types', permission: 'menu.events.manage' },
          { title: 'navEventCategories', route: '/event-categories', permission: 'menu.events.manage' },
          { title: 'navEventSubcategories', route: '/event-subcategories', permission: 'menu.events.manage' },
        ],
      },
      {
        key: 'settings-configurations',
        icon: 'Layers',
        title: 'navConfigurations',
        items: [
          { title: 'navProductTypes', route: '/product-types', permission: 'menu.config.manage' },
          { title: 'navProductCategories', route: '/product-categories', permission: 'menu.config.manage' },
          { title: 'navBrandNames', route: '/brand-names', permission: 'menu.config.manage' },
        ],
      },
    ],
    standalone: [
      { title: 'navDataIntegration', icon: 'Plug', route: { name: 'data-integration-fb' }, permission: 'menu.integration.fb' },
    ],
  },
  {
    section: 'navOrganisation',
    groups: [
      {
        key: 'settings-account',
        icon: 'UserCog',
        title: 'navAccount',
        items: [
          { title: 'navUsers', route: '/users', permission: 'org.users.view' },
          { title: 'navProfile', route: '/profile', permission: null }, // toujours visible
        ],
      },
      {
        key: 'settings-access',
        icon: 'Shield',
        title: 'navAccess',
        items: [
          { title: 'navRoles', route: '/roles', permission: 'org.roles.manage' },
          { title: 'navPermissions', route: '/permissions', permission: 'org.permissions.manage' },
        ],
      },
    ],
  },
]
```

Dans `DashboardView.vue`, remplacement du template statique par un rendu dérivé, filtré côté `computed` :

```javascript
import { SETTINGS_NAVIGATION } from '@/constants/navigation'
import { usePermissions } from '@/composables/usePermissions'

setup() {
  const { can } = usePermissions()
  return { can }
}

computed: {
  visibleSettingsNavigation() {
    return SETTINGS_NAVIGATION
      .map((section) => ({
        ...section,
        groups: (section.groups || [])
          .map((group) => ({ ...group, items: group.items.filter((i) => this.can(i.permission)) }))
          .filter((group) => group.items.length > 0),
        standalone: (section.standalone || []).filter((i) => this.can(i.permission)),
      }))
      .filter((section) => section.groups.length > 0 || section.standalone.length > 0)
  },
}
```

Le template itère ensuite sur `visibleSettingsNavigation` avec `v-for` (sections → `v-list-group` → items), au lieu des blocs `<v-list-group>` codés en dur. **Un groupe entier disparaît automatiquement si tous ses items sont masqués** (ex: un VIEWER sans `menu.fb.*` ne verra pas du tout le groupe "F&B Menu").

> Cette refonte de `DashboardView.vue` est une étape distincte du plan de migration (§5, étape 3) — ce document décrit le pattern cible, pas une réécriture complète immédiate du fichier (700+ lignes).

### 3.5 Gardes de routage par permission

Ajout dans `src/router/guards.js` :

```javascript
export function requirePermission(code) {
  return async (to, from, next) => {
    if (!store.getters['auth/isInitialized']) {
      await store.dispatch('auth/initialize')
    }
    if (!store.getters['auth/isAuthenticated']) {
      return next({ path: '/login', query: { redirect: to.fullPath } })
    }
    if (!store.getters['auth/can'](code)) {
      return next('/dashboard')
    }
    next()
  }
}
```

Application sur les routes sensibles (`src/router/index.js`) :

```javascript
{
  path: '/roles',
  name: 'roles',
  component: RoleListView,
  beforeEnter: requirePermission('org.roles.manage'),
  meta: { title: 'Liste des rôles', permission: 'org.roles.manage' },
},
{
  path: '/permissions',
  name: 'permissions',
  component: PermissionListView,
  beforeEnter: requirePermission('org.permissions.manage'),
  meta: { title: 'Liste des permissions', permission: 'org.permissions.manage' },
},
{
  path: '/users',
  name: 'users',
  component: UserListView,
  beforeEnter: requirePermission('org.users.view'),
  meta: { title: 'Utilisateurs', permission: 'org.users.view' },
},
```

`requireAdmin`/`requireManager` (basés sur `roleSystemKey`) sont **conservés** pour les actions hiérarchiques critiques (ex: futurs écrans de facturation/abonnement du tenant), en complément de `requirePermission` pour les écrans fonctionnels.

### 3.6 Adaptation de l'UI de gestion Rôles/Permissions existante

| Composant | Changement |
|---|---|
| `RoleListView.vue` | Afficher un chip **"Système"** si `role.isSystem`. Masquer le bouton supprimer (`v-if="!role.isSystem"`) pour les 4 rôles de base |
| `RoleFormDrawer.vue` | Si `isSystem` : champ `name` en lecture seule (`readonly`/`disabled`). Si `role.systemKey === 'ADMIN'` : afficher la liste de permissions **toutes cochées et désactivées**, avec note *"Le rôle Admin dispose toujours de toutes les permissions."* |
| `PermissionListView.vue` | Ajouter colonne **"Type"** (`Système` / `Personnalisée` selon `permission.isSystem`/`scope`). Masquer édition/suppression si `isSystem` |
| `PermissionFormDrawer.vue` | Ajouter les champs **`code`** (texte, ex. `custom.export.pdf`, validation regex `^[a-z0-9_.]+$`) et **`category`** (select libre ou liste des catégories existantes). Le champ `code` est obligatoire à la création, immuable en édition |
| `RoleListView.vue` / `PermissionListView.vue` | Bouton "Ajouter un rôle" / "Ajouter une permission" enveloppé dans `v-can="'org.roles.manage'"` / `v-can="'org.permissions.manage'"` (défense en profondeur, en plus du guard de route) |
| `UserEditDrawer.vue` | Le sélecteur de rôle (actuellement enum statique `ADMIN/MANAGER/STAFF/VIEWER`) devient une liste dynamique chargée via `roles/fetchRoles` (`GET /roles`) ; soumission envoie `roleId` (cf. `PATCH /users/:id/role`, doc backend §3.4) |

### 3.7 Mise à jour des stores `roles` / `permissions`

Aligner les champs consommés/retournés sur la forme backend (`isSystem`, `systemKey`, `scope`, `category`, `code`) :

- `src/store/modules/roles.js` : aucun changement structurel (cache 15 min déjà en place), juste s'assurer que les objets `role` retournés par `GET /roles` incluent bien `permissions: [{id, code, name}]`, `isSystem`, `systemKey`
- `src/store/modules/permissions.js` : idem, objets `permission` incluent `code`, `category`, `isSystem`, `scope`

Aucune modification d'API du store nécessaire (les actions `fetchRoles`/`fetchPermissions`/etc. existent déjà et fonctionneront dès que le backend exposera les routes).

---

## 4. Catalogue de permissions ↔ menus

Mapping entre les éléments de menu/fonctionnalités actuels et les codes de permission proposés (catalogue système, seedé côté backend — voir [doc backend §3.2](../../api-datafriday-staging/docs/auth/RBAC_SYSTEM.md#32-catalogue-de-permissions-système-seed)). Les colonnes ADMIN/MANAGER/STAFF/VIEWER indiquent les **valeurs par défaut** assignées aux 4 rôles système clonés à la création d'un tenant — librement modifiables ensuite par le super admin (sauf ADMIN, toujours tout coché).

| Code | Élément de menu / fonctionnalité | Catégorie | ADMIN | MANAGER | STAFF | VIEWER |
|---|---|---|:---:|:---:|:---:|:---:|
| `nav.spaces` | Drawer principal → Spaces | Navigation | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.fb` | Analytiques → F&B | Navigation | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.hospitality` | Analytiques → Hospitality | Navigation | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.merch` | Analytiques → Merch | Navigation | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.ticketing` | Analytiques → Ticketing | Navigation | ✅ | ✅ | ✅ | ✅ |
| `nav.analytics.storage` | Analytiques → Storage | Navigation | ✅ | ✅ | ✅ | ✅ |
| `menu.fb.suppliers` | Configuration → F&B Menu → Fournisseurs (`/suppliers`) | F&B | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.marketPrices` | Configuration → F&B Menu → Prix du marché (`/market-prices`) | F&B | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.components` | Configuration → F&B Menu → Composants (`/components`) | F&B | ✅ | ✅ | ❌ | ❌ |
| `menu.fb.menuItems` | Configuration → F&B Menu → Articles de menu (`/menu-items`) | F&B | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.spaceMenu` | Configuration → F&B Menu → Menu par espace (`/space-menus`) | F&B | ✅ | ✅ | ✅ | ❌ |
| `menu.events.manage` | Configuration → Events (4 sous-pages) | Events | ✅ | ✅ | ❌ | ❌ |
| `menu.config.manage` | Configuration → Configurations (types/catégories produits, marques) | Configuration | ✅ | ✅ | ❌ | ❌ |
| `menu.integration.fb` | Configuration → Intégration de données F&B (`/data-integration/fb`) | Intégration | ✅ | ✅ | ❌ | ❌ |
| `org.users.view` | Organisation → Account → Utilisateurs (`/users`) | Organisation | ✅ | ✅ | ❌ | ❌ |
| `org.users.manage` | Création/édition/suppression d'utilisateurs, invitation (`/users/create`, actions CRUD) | Organisation | ✅ | ✅ | ❌ | ❌ |
| `org.users.changeRole` | Changement de rôle d'un utilisateur | Organisation | ✅ | ❌ | ❌ | ❌ |
| `org.roles.manage` | Organisation → Access → Rôles (`/roles`) | Organisation | ✅ | ❌ | ❌ | ❌ |
| `org.permissions.manage` | Organisation → Access → Permissions (`/permissions`) | Organisation | ✅ | ❌ | ❌ | ❌ |
| *(aucun)* | Organisation → Account → Profil (`/profile`) | Organisation | ✅ | ✅ | ✅ | ✅ |

> Les items `nav.analytics.*` correspondent à des entrées actuellement statiques (sans navigation câblée) dans `DashboardView.vue` — les codes sont prévus pour quand ces sections seront connectées à de vraies routes/fonctionnalités.

---

## 5. Plan de migration (phases)

| Phase | Contenu | Dépendance |
|---|---|---|
| 1 | Adapter `auth.js` (state/getters/mutations) pour consommer `role.{id,systemKey,isSystem,permissions}` et `isOwner` depuis `GET /me`, avec fallback legacy si absent | Backend §3.7 (peut être développé en parallèle, fallback géré) |
| 2 | Créer `usePermissions()` + directive `v-can`, enregistrement dans `main.js` | Phase 1 |
| 3 | Extraire `src/constants/navigation.js`, refactorer `DashboardView.vue` pour rendre le menu depuis la config + `can()` | Phase 2 |
| 4 | Ajouter `requirePermission()` dans `guards.js`, l'appliquer aux routes `/roles`, `/permissions`, `/users`, `/users/create` | Phase 1 |
| 5 | Adapter `RoleListView/RoleFormDrawer/PermissionListView/PermissionFormDrawer` (`isSystem`, `code`, `category`, badges, restrictions ADMIN) | Backend §3.4 (endpoints `/roles`, `/permissions` disponibles) |
| 6 | Adapter `UserEditDrawer.vue` : sélecteur de rôle dynamique (`GET /roles`) + soumission `roleId` | Backend §3.4 (`PATCH /users/:id/role` accepte `roleId`) |
| 7 | QA croisée : se connecter avec chacun des 4 rôles système + un rôle custom (ex. "Caissier" avec uniquement `menu.fb.spaceMenu`) et vérifier la cohérence menu ↔ catalogue (§4) | Phases 1-6 |

---

## 6. Flux de bout en bout (séquence)

```
1. Login (Supabase) ──► 2. GET /me
                              │
                              ▼
                    { role: { systemKey, isSystem, permissions[] }, isOwner }
                              │
                              ▼
                  auth.js → SET_TENANT (roleSystemKey, userPermissions, isOwner)
                              │
              ┌───────────────┼────────────────────┐
              ▼                                     ▼
   DashboardView (menu)                   Router guards (requirePermission)
   filtré via can(item.permission)        bloque/autorise navigation directe
              │
              ▼
   Si l'utilisateur a `org.roles.manage` :
   ouvre /roles → RoleListView → GET /roles
   → "Ajouter un rôle" (super admin) → RoleFormDrawer
   → POST /roles { name, description, permissionIds[] }
   → nouveau rôle assignable via UserEditDrawer (PATCH /users/:id/role { roleId })
   → l'utilisateur concerné voit son menu changer au prochain GET /me
     (ou après invalidation du cache, voir doc backend §3.7)
```
