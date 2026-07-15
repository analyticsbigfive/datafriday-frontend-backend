# Conception cible — Système d'utilisateurs, rôles & accès

> Vision produit + analyse état actuel/cible + améliorations complémentaires.
> Compagnon de [`SYSTEME_AUTH_COMPLET.md`](./SYSTEME_AUTH_COMPLET.md) (référence) et
> [`PLAN_REMEDIATION_AUTH_PROD.md`](./PLAN_REMEDIATION_AUTH_PROD.md) (sécurité prod).
> Date : 2026-06-24.

---

## 1. La vision en un schéma : un modèle à 3 niveaux

```
┌──────────────────────────────────────────────────────────────────────┐
│ NIVEAU 0 — SUPER-ADMIN PLATEFORME (DataFriday)                         │
│ • Gère TOUTES les organisations (créer / suspendre / supprimer)        │
│ • Voit les stats globales, le support, l'impersonation éventuelle      │
│ • N'appartient pas à la logique « rôle de tenant »                     │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │ gère
        ┌────────────────────────┴────────────────────────┐
        ▼                                                  ▼
┌─────────────────────────────┐                  ┌─────────────────────────────┐
│ NIVEAU 1 — ADMIN D'ORGA     │                  │ NIVEAU 1 — ADMIN D'ORGA     │
│ (créateur = owner)          │   isolation      │ (autre organisation)        │
│ • Accès total à SON orga    │ ◄────────────►   │ • Accès total à SON orga    │
│ • Ajoute des utilisateurs   │   stricte        │                             │
│   avec rôle + accès espaces │                  │                             │
└──────────────┬──────────────┘                  └─────────────────────────────┘
               │ ajoute / gère
       ┌───────┼───────────────────┐
       ▼       ▼                   ▼
  ┌─────────┐ ┌─────────┐    ┌─────────┐   NIVEAU 2 — MEMBRES
  │ MANAGER │ │  STAFF  │    │ VIEWER  │   • Rôle org + accès à un sous-ensemble d'espaces
  └─────────┘ └─────────┘    └─────────┘   • Ne voient que ce que leur rôle + leurs espaces autorisent
```

**Règle d'or** : *« chaque utilisateur ne voit, sur chaque page, que les éléments autorisés par
son rôle ET son périmètre d'espaces, à l'intérieur de son organisation. »*

---

## 2. État actuel vs cible — synthèse

| Exigence | Existe aujourd'hui ? | Écart à combler |
|----------|----------------------|-----------------|
| **Super-admin plateforme** | ❌ Aucun (juste `@Roles('ADMIN')` = admin de tenant) | Créer le concept + guard + UI (cf. §3) |
| **Créateur d'orga = ADMIN/owner, accès total** | ✅ `onboarding` pose ADMIN + `isOwner=true` | OK (rien à faire) |
| **Admin ajoute des users avec un rôle** | ✅ `POST /users` + `roleId`/`role` ; UI `UserCreateView` | OK ; à enrichir (espaces) |
| **Admin assigne les espaces accessibles à un user** | ⚠️ Partiel : `grantSpaceAccess` existe **mais** pas dans la création, pas dans l'UI | Créer flux atomique user+rôle+espaces (cf. §4) |
| **Un user ne voit que ses espaces** | ❌ `spaces.findAll` filtre **seulement** par tenant → tout le monde voit tout | **Enforcement** de `UserSpaceAccess` (cf. §5) |
| **Visibilité des éléments par rôle/page** | ❌ Front : aucun gating ; getter `can()` inutilisé | Gating UI + cohérence back (cf. §6) |
| **Isolation entre organisations** | ✅ Auto-scoping Prisma (sauf modèle `Tenant`) | Corriger la faille `/tenants` (cf. remédiation P0-1) |
| **Traçabilité (qui a fait quoi)** | ❌ `AuditService` existe mais **jamais appelé** | Câbler l'audit (cf. §7.1) |
| **Quotas par plan (FREE=3 users…)** | ❌ Définis (`tenant.usage`) mais **non appliqués** | Enforcer à la création (cf. §7.2) |
| **Cycle de vie des invitations** | ⚠️ Invitation envoyée, mais pas de statut/révocation/expiration | Gérer (cf. §7.3) |

> Les points ❌ sécurité (super-admin, `/tenants`, gating) sont déjà détaillés dans le plan de
> remédiation. Ce document se concentre sur la **conception fonctionnelle cible**.

---

## 3. Super-admin plateforme

**Mécanisme** (à trancher — cf. §9) : flag DB `User.isSuperAdmin` **ou** allowlist d'IDs via env.

**Surface dédiée** (séparée de l'admin d'orga) :
- `GET /admin/tenants` — lister/rechercher toutes les orgas (sans les secrets d'intégration).
- `POST /admin/tenants/:id/suspend|reactivate|delete` — cycle de vie.
- `GET /admin/stats` — métriques plateforme (remplace l'usage abusif de `/tenants` + `/metrics`).
- (Option support) **Impersonation** : générer un contexte lecture seule « voir comme tenant X ».

**Garde** : `SuperAdminGuard` (cf. plan P0-1). Tout le reste de l'app reste gouverné par le RBAC de
tenant — un super-admin n'a **pas** automatiquement accès aux données métier d'un tenant sans passer
par l'impersonation tracée.

**UI** : un espace `/super-admin` côté front, visible uniquement si `me.isSuperAdmin === true`.

---

## 4. CRUD utilisateur enrichi (user + rôle + espaces, en une fois)

### 4.1 Cible fonctionnelle
Dans « Ajouter un utilisateur », l'admin saisit en **un seul formulaire** :
1. Identité : prénom, nom, email (+ mot de passe ou invitation par email).
2. **Rôle d'organisation** : ADMIN / MANAGER / STAFF / VIEWER (ou rôle custom).
3. **Périmètre d'espaces** : « tous les espaces » **ou** une sélection ; avec option d'un
   **rôle par espace** (cf. décision §9).

### 4.2 Backend — création atomique
Étendre `CreateUserDto` / `InviteUserDto` :

```ts
// create-user.dto.ts (ajouts)
@IsOptional() @IsBoolean()
allSpaces?: boolean;                       // true = accès à tous les espaces du tenant

@IsOptional() @IsArray()
spaceAccess?: Array<{ spaceId: string; role?: UserRole }>;  // sinon, sélection explicite
```

`UsersService.create()` / `invite()` : englober la création User + UserTenant **+ les
`UserSpaceAccess`** dans **une transaction** (`prisma.$transaction`) — aujourd'hui ces écritures sont
séparées et non transactionnelles. Valider que chaque `spaceId` appartient bien au tenant.

### 4.3 Frontend — `UserCreateView`
Ajouter au formulaire (déjà : firstName/lastName/email/roleId) :
- un toggle « Accès à tous les espaces » ;
- sinon un multi-select des espaces (depuis `store/spaces`), avec éventuellement un rôle par espace.
À l'enregistrement : un seul appel `POST /users` portant `spaceAccess`/`allSpaces` (création atomique),
au lieu d'enchaîner `POST /users` puis N `POST /users/:id/spaces/:spaceId/access`.

### 4.4 Édition
`PATCH /users/:id` : permettre la mise à jour du périmètre d'espaces (diff add/remove sur
`UserSpaceAccess`) en plus du rôle (`PATCH /users/:id/role` existant).

---

## 5. Contrôle d'accès au niveau espace (le chantier central)

### 5.1 Constat
`UserSpaceAccess` est **écrit** (`grant/revoke`) mais **jamais lu** pour filtrer. Résultat : un STAFF
voit et ouvre **tous** les espaces du tenant.

### 5.2 Sémantique cible (à trancher — cf. §9)
Recommandation : **ADMIN/MANAGER voient tous les espaces** du tenant ; **STAFF/VIEWER sont limités
aux espaces qui leur sont accordés** via `UserSpaceAccess`. (Variante : tout le monde est restreint,
y compris MANAGER.)

### 5.3 Enforcement backend (centralisé, pas page par page)
1. **Helper de périmètre** : `resolveAccessibleSpaceIds(user): 'ALL' | string[]`
   - ADMIN/MANAGER → `'ALL'`
   - sinon → `SELECT spaceId FROM UserSpaceAccess WHERE userId = …`
2. **Filtrer les listes** : injecter `where.id ∈ accessibleSpaceIds` dans `spaces.findAll`,
   `getPinned`, dashboards, analyse, inventory, restock… (tout ce qui est indexé par `spaceId`).
3. **Filtrer l'accès direct** : un `SpaceAccessGuard` (ou une vérif service) sur les routes
   `/(spaces|dashboard|inventory|restock-state|space-menu)/:spaceId/...` → `403/404` si l'espace
   n'est pas dans le périmètre de l'utilisateur.
4. **Rôle effectif par espace** (si retenu) : `effectiveRole(space) = UserSpaceAccess.role ?? rôle org`.

> ⚠️ Penser au **cache** : la liste des espaces est cachée Redis 60s par tenant — il faudra soit
> cacher par `(tenant,user-scope)`, soit ne pas servir la liste cachée « tenant-wide » aux utilisateurs
> restreints.

### 5.4 Enforcement frontend
- Le store ne charge que les espaces du périmètre (l'API filtrant déjà).
- Masquer les actions d'écriture sur un espace selon le rôle effectif (`can()` + rôle espace).

---

## 5bis. Rôle par espace — envisagé puis ÉCARTÉ ✂️

> Décision finale 2026-06-25 : **un utilisateur a UN seul rôle, identique sur tous ses espaces.**
> « Marie garde son même rôle pour tous ses espaces. »

On avait un instant envisagé un **rôle différent par espace** (Marie MANAGER sur Stade A, VIEWER sur
Stade B). **Abandonné** car :
- trop complexe (résolution des permissions par espace, payload `/me` alourdi, double migration, UI à
  matrice) pour un besoin qui n'existe pas ;
- le modèle simple couvre 99 % des cas et est **déjà livré, testé, backfillé** (Phase 2).

**Modèle retenu (le plus simple et solide)** — deux axes **indépendants** :

| Axe | Porté par | Détermine |
|-----|-----------|-----------|
| **Le rôle** (un seul) | `User.roleId` | Les **écrans/fonctions** accessibles (permissions RBAC), **identiques sur tous ses espaces** |
| **Les espaces** | `UserSpaceAccess[]` | **Quels** espaces l'utilisateur voit (un / plusieurs / tous) |

Exemple : Marie = **STAFF** (un seul rôle → écrans STAFF) + espaces **[Stade A, Stade B]**.
Elle a les **mêmes droits STAFF** sur A et sur B, et ne voit pas les autres espaces.

➡️ **Rien à ajouter côté backend** : `POST /users` (`roleId` + `allSpaces`/`spaceIds`), filtrage des
listes et `SpaceAccessGuard` sont déjà en place (Phase 2). **Seul le front reste à faire** (dropdown
espaces à la création + gating — cf. handoff).

---

## 6. Visibilité des éléments par rôle & par page

Trois niveaux complémentaires (défense en profondeur) :

1. **Menu / navigation** : `v-if="can('<code>')"` (cf. remédiation P1-6 — table menu→permission).
2. **Routes** : `beforeEnter: requirePermission('<code>')` sur les routes sensibles.
3. **Éléments intra-page** : boutons « Créer / Éditer / Supprimer » conditionnés par `can()` et,
   pour les espaces, par le **rôle effectif sur l'espace**.

**Principe** : le **front masque** (UX), le **back refuse** (sécurité). On ne se repose jamais sur
le seul masquage front.

**Composant utilitaire suggéré** : une directive/`<Can permission="…">…</Can>` pour standardiser le
gating intra-page sans dupliquer la logique.

---

## 7. Améliorations complémentaires (points non listés)

### 7.1 🔎 Activer la traçabilité (audit) — *fortement recommandé*
`AuditLog` (modèle) et `AuditService` existent mais **ne sont jamais appelés**. Câbler l'audit sur les
actions sensibles : création/suppression user, changement de rôle, octroi/révocation d'accès espace,
création/suspension de tenant, login admin. → réponds à « tout ça appartient à l'admin » (qui a fait
quoi, quand) et c'est souvent une exigence de conformité.

### 7.2 📊 Appliquer les quotas par plan
`planLimits` (FREE=3 users/1 space, STARTER=10/5…) est calculé dans `tenant.usage` mais **jamais
appliqué**. Bloquer `create`/`invite` user et `create` space quand la limite du plan est atteinte
(message clair + invitation à upgrader). Sinon le modèle commercial n'est pas tenu.

### 7.3 ✉️ Cycle de vie des invitations
Aujourd'hui une invitation crée un `User` « Invited User » sans statut. Ajouter :
- un **statut** (`INVITED` / `ACTIVE` / `DISABLED`) sur la membership ;
- l'écran **« invitations en attente »** avec **renvoyer** / **révoquer** ;
- une **expiration** du lien d'invitation.

### 7.4 🚫 Désactiver ≠ supprimer
Le `DELETE /users/:id` est destructif (supprime la ligne + compte Supabase si plus de membership).
Ajouter un **état désactivé** (coupe l'accès, conserve l'historique/audit) ; réserver la suppression
définitive à un cas explicite (RGPD).

### 7.5 👑 Transfert de propriété (owner)
L'owner est protégé (non supprimable/rétrogradable) mais **aucun moyen de transférer** l'ownership.
Si l'owner quitte l'entreprise → blocage. Ajouter `POST /users/:id/transfer-ownership` (ADMIN→ADMIN,
réservé à l'owner actuel ou au super-admin).

### 7.6 🏢 Multi-organisation (déjà modélisé, désactivé)
`UserTenant` permet à un user d'appartenir à plusieurs orgas, mais le code le **refuse explicitement**
(« Multi-organization per user isn't exposed yet »). Décider : exposer un **sélecteur d'organisation**
(switch de tenant) — utile pour les prestataires/groupes.

### 7.7 🔐 Renforcements d'authentification
- **MFA/2FA** (supporté par Supabase) — au moins optionnel pour les ADMIN/super-admin.
- **Vérification email obligatoire** avant tout accès applicatif.
- **TTL JWT** court (cf. P2) pour une révocation effective rapide après changement de rôle.
- **Rate-limit/brute-force** sur le login (vérifier la couverture Supabase + throttler).

### 7.8 🧩 UI d'administration des rôles & permissions custom
Le backend supporte déjà les **rôles et permissions custom par tenant** (`/roles`, `/permissions`),
mais l'UI ne les exploite pas pleinement (entrée « Permissions » commentée dans le menu). Offrir un
**éditeur de matrice rôle × permission** pour que l'admin compose ses propres rôles.

### 7.9 🧾 RGPD / conformité
Export des données d'un utilisateur, droit à l'oubli, journal des consentements — souvent requis pour
des clients européens.

### 7.10 🧹 Finitions techniques
- Terminer la **migration RBAC** (backfill `roleId`, figer le fallback `role` enum).
- **Transactions** sur les flux multi-écritures (création user + membership + accès espaces).
- Tests **e2e matrice rôle × endpoint** et **isolation cross-tenant** (filet de sécurité).

---

## 8. Feuille de route proposée (sécurité d'abord)

| Phase | Contenu | Pourquoi d'abord |
|-------|---------|------------------|
| **Phase 0 — Sécurité (bloquant prod)** | P0-1 super-admin + `/tenants`, P0-2 webhook, P0-3 secrets (cf. plan remédiation) | Failles critiques, sinon prod risquée |
| **Phase 1 — RBAC fin & gating** | ✅ backend livré — `@RequirePermissions` sur routes métier ; gating front (handoff) | Donne la « visibilité par rôle » demandée |
| **Phase 2 — Accès par espace** | ✅ backend livré — enforcement `UserSpaceAccess` (§5) + CRUD user (espaces) (§4). **Un rôle, le même sur tous les espaces de l'utilisateur.** | Cœur de la demande « espaces accessibles » |
| ~~Phase 2b — Rôle par espace~~ | ❌ **abandonnée** — sur-ingénierie. Marie garde le même rôle partout → rien à ajouter côté backend. | — |
| **Phase 3 — Robustesse produit** | Audit (§7.1), quotas plan (§7.2), invitations (§7.3), désactivation (§7.4), ownership (§7.5) | Solidité opérationnelle & commerciale |
| **Phase 4 — Confort & conformité** | Multi-org (§7.6), MFA (§7.7), UI rôles custom (§7.8), RGPD (§7.9) | Différenciation, conformité |

---

## 9. Décisions structurantes — ✅ ACTÉES (2026-06-24)

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | **Mécanisme super-admin** | **Flag `User.isSuperAdmin` en base** (+ UI de gestion). Nécessite migration + garde-fou sur l'écriture du flag. |
| 2 | **Modèle d'accès aux espaces** | ⚠️ **RÉVISÉ 2026-06-25 (final) — DÉCOUPLÉ DU RÔLE.** « Voit tous les espaces » n'est plus lié au rôle (c'était trop rigide : impossible de restreindre un admin/manager). Désormais : `hasFullAccess = super-admin OU owner OU flag User.allSpacesAccess`. L'**owner** (créateur) et le super-admin voient toujours tout ; **tout autre utilisateur** (ADMIN/MANAGER/STAFF/VIEWER/custom) a un **périmètre par utilisateur** choisi par l'owner : « tous » (flag, présents+futurs) ou une sélection (`UserSpaceAccess`). Le rôle ne dicte plus rien côté espaces. La permission `spaces.viewAll` est **abandonnée/inerte** (laissée au catalogue). Les rôles custom sont gérés naturellement. |
| 3 | **Rôle par espace** | **NON — un seul rôle d'organisation, le même sur tous les espaces de l'utilisateur** (décision finale 2026-06-25). « Marie garde son même rôle pour tous ses espaces. » Le rôle = les écrans ; les `UserSpaceAccess` = la liste des espaces accessibles. _(La piste « rôle par espace » a été envisagée puis **écartée** car trop complexe pour le besoin. Modèle déjà livré en Phase 2.)_ |
| 4 | **Ordre de mise en œuvre** | **Sécurité d'abord** (Phase 0) puis features (Phases 1→4). |
| 5 | **Granularité permissions création user** | **Deux axes séparés** : à la création, on choisit **un rôle** (= les écrans, identique partout) **+** les espaces accessibles (un / plusieurs / tous via `allSpaces`/`spaceIds`). Pas de rôle ni de permission différents par espace. C'est le modèle le plus simple et le plus solide ; **backend déjà en place (Phase 2)**. |

### Conséquences d'implémentation
- **Data** : ajouter `User.isSuperAdmin Boolean @default(false)`. Migration appliquée via
  **`npm run prisma:migrate:deploy`** (lit `.env`) ; `make prod-migrate` = uniquement la prod
  (`.env.production`). ✅ Déjà appliquée le 2026-06-25 + super-admin `ulrich@bigfiveabidjan.com` désigné.
- **Périmètre espaces** : `resolveAccessibleSpaceIds(user)` → `'ALL'` si `isSuperAdmin` **ou**
  `systemKey === ADMIN` **ou** `permissions.includes('spaces.viewAll')` ; sinon `UserSpaceAccess.spaceId[]`.
  La colonne `UserSpaceAccess.role` est conservée mais **ignorée** (rôle effectif sur un espace = rôle d'org).
- **Nouvelle permission** `spaces.viewAll` à ajouter au catalogue + aux rôles ADMIN/MANAGER, avec
  **backfill** des rôles existants (le clone ne re-sync pas les permissions des rôles déjà créés).
- **Backfill `UserSpaceAccess`** à l'activation : accorder à chaque STAFF/VIEWER **sans** `spaces.viewAll`
  l'accès à tous les espaces actuels de son tenant (aujourd'hui : **1 seul utilisateur** concerné).
- **/me** : exposer `isSuperAdmin` dans le payload d'auth (pour l'UI front).
- **Super-admin** : `SuperAdminGuard` lit `user.isSuperAdmin`; écriture du flag réservée à un super-admin
  existant (bootstrap initial via script/seed).
```
