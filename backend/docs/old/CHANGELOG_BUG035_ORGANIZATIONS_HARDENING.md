# Changelog — BUG-035 : durcissement cross-tenant de `OrganizationsController`

- **Date** : 2026-07-20
- **Auteur** : emmanuel
- **Bug** : [BUG-035](bugs/35_organizationscontroller_faille_cross_tenant.md) — 🔴 Critique → 🟡 Corrigé non déployé
- **Option retenue** : **C** (correctif minimal `SuperAdminGuard`), symétrique à `TenantsController` (P0-1)
- **Repo** : `api-datafriday-staging` (backend)

---

## 1. Le problème corrigé

`GET / PATCH / DELETE /api/v1/organizations/:id` étaient accessibles à **tout utilisateur
authentifié, de n'importe quel tenant, avec n'importe quel rôle**. Le contrôleur portait le seul
`JwtDatabaseGuard` (« qui es-tu », pas « as-tu le droit »), et le service opérait sur `prisma.tenant`
avec l'`id` fourni par l'appelant, sans jamais le comparer au tenant du JWT.

Point structurel : le modèle `Tenant` **n'a pas de `tenantId` scalaire**, il est donc **exclu de
l'auto-scoping Prisma** qui protège tous les autres modèles. `/organizations` et `/tenants` sont les
deux seules surfaces à devoir être protégées **manuellement** — `/tenants` l'avait été (P0-1),
`/organizations` non.

Impact : lecture de la fiche d'un concurrent, changement de son `plan` de facturation, et
suspension (`DELETE` → `status: SUSPENDED`) qui déconnecte tous ses utilisateurs.

## 2. Ce qui a été modifié

| Fichier | Modification |
|---|---|
| `src/features/organizations/organizations.controller.ts` | Ajout de `@AllowNoTenant()` + `@UseGuards(JwtDatabaseGuard, SuperAdminGuard)` au niveau classe, avec commentaire explicatif. Imports de `SuperAdminGuard` et `AllowNoTenant`. |
| `src/features/organizations/organizations.controller.spec.ts` | Bloc `describe('BUG-035 …')` : 2 tests vérifiant le câblage de `SuperAdminGuard` et de `@AllowNoTenant()` sur la classe. |
| `src/core/auth/guards/super-admin.guard.spec.ts` | **Nouveau.** Le guard n'avait aucun test. Prouve la décision d'accès : super-admin → OK ; ADMIN non super-admin / user sans flag / sans user → 403. |
| `src/core/database/tenant-isolation.integration.spec.ts` | Cas ajouté prouvant que `Tenant` n'est pas auto-scopé (écriture cross-tenant réussit en base) → justifie que le guard HTTP est l'unique défense. |
| `docs/bugs/35_organizationscontroller_faille_cross_tenant.md` | Statut 🔴 → 🟡 ; sections Correction / Tests / Risque de régression remplies. |
| `docs/bugs/00_INDEX.md` | Statut de la ligne 35 : 🔴 Ouvert → 🟡 Corrigé non déployé. |

Diff conceptuel du contrôleur :

```diff
  @Controller('organizations')
- @UseGuards(JwtDatabaseGuard)
+ @AllowNoTenant()
+ @UseGuards(JwtDatabaseGuard, SuperAdminGuard)
  export class OrganizationsController {
```

`SuperAdminGuard` rejette en **403** quiconque n'a pas `user.isSuperAdmin` (flag déjà en base
depuis la migration du 2026-06-25). `@AllowNoTenant()` évite que le `TenantGuard` global ne bloque
un super-admin plateforme sans tenant courant avant que le `SuperAdminGuard` ne s'exécute.

## 3. Pourquoi C, et pas A (suppression) ni un simple `@RequirePermissions`

- **Pas `@RequirePermissions` seul** : sur `Tenant` (non auto-scopé), l'`id` reste arbitraire. Une
  permission satisfaite laisserait un ADMIN du tenant A agir sur le tenant B. Insuffisant.
- **Pas A (suppression) maintenant** : les routes sont publiées dans `docs/api/API_REFERENCE.md` ;
  les retirer serait un **changement cassant** avec une inconnue « consommateur hors-repo »
  invisible depuis le monorepo. La suppression reste recommandée (contrôleur redondant avec
  `GET /me/tenant` + `TenantsController`), mais **à arbitrer par l'owner backend**.
- **C** ferme la faille immédiatement, sans retirer aucune route, de façon **réversible**, et alignée
  au correctif P0-1 déjà en place sur le jumeau `/tenants`.

## 4. Vérifications effectuées avant modification

- **Aucun impact frontend** : `datafriday-web` n'appelle nulle part `GET/PATCH/DELETE
  /organizations/:id`. Les 18 appels `/organizations/:orgId/integrations/**` relèvent d'un contrôleur
  **distinct** (`IntegrationsController`), non touché.
- **`IntegrationsController` déjà sûr** (dossier technique §5 bis, question restée ouverte) : chaque
  handler passe par `resolveTenantId(user, organizationId)` qui compare au `tenantId` du JWT
  (`ForbiddenException` sinon). Pas de faille IDOR ici.
- **Nuance sur le vecteur de suspension** : `UpdateOrganizationDto` n'expose pas `status` et
  `forbidNonWhitelisted: true` rejette les champs inconnus → `PATCH {status:...}` renvoyait déjà 400.
  La suspension passait par le `DELETE` (soft-delete). Désormais super-admin only dans les deux cas.
- **Isolation du module** : `OrganizationsModule` ne contient que ce contrôleur + son service ;
  aucun autre module n'injecte `OrganizationsService`.

## 5. Reste à faire avant 🟢 Corrigé (déployé)

1. **Build + tests** (non exécutés ici — `node_modules` absent, et build = côté dev) :
   ```bash
   pnpm install
   pnpm exec tsc --noEmit
   pnpm test -- organizations.controller super-admin.guard
   DATABASE_URL=… pnpm test -- tenant-isolation   # le cas root-cause nécessite une base
   ```
2. **Validation staging** : rejouer la reproduction du §2 du dossier technique avec un compte au
   rôle le plus faible → attendre 403 ; puis un super-admin → 200.
3. **PR vers `main`** (branche `fix/...`) — merge/déploiement par le lead (Ulrich, owner backend).
   Ce bug tombe dans le recouvrement d'ownership Emmanuel (Auth & RBAC) / Ulrich (backend) : à
   valider nommément avant merge.
4. **Option A** (suppression du contrôleur) proposée dans la PR comme nettoyage structurel de suite.

## 6. Références

- Plan de remédiation : `docs/PLAN_REMEDIATION_AUTH_PROD.md` (§1.1, §1.3 A/B/C)
- Précédents de fix cross-tenant : BUG-065 (`predict-versions`), BUG-066 (ownership taxonomie)
- Surface jumelle déjà durcie : `tenants.controller.ts:30-31` (P0-1)
