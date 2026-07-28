# BUG-035 — OrganizationsController expose une faille cross-tenant (identique à P0-1, jamais corrigée ici)

- **Statut** : 🟡 Corrigé non déployé (Option C — durcissement `SuperAdminGuard`, 2026-07-20)
- **Sévérité** : 🔴 Critique — sécurité, accès cross-tenant
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 · **Corrigé le** : 2026-07-20 (emmanuel)
- **Fichiers** : `organizations.controller.ts:17-18`, `organizations.service.ts:16,47,80`

## Symptôme

Un utilisateur authentifié de N'IMPORTE quel tenant appelle `PATCH /api/v1/organizations/<id-d-un-autre-tenant>`
avec `{ plan: "ENTERPRISE" }` ou `DELETE .../organizations/<id>` → lit/modifie/suspend
l'organisation d'un tiers sans être super-admin ni membre de ce tenant.

## Cause racine

`OrganizationsController` ne vérifie pas que l'`id` ciblé correspond au tenant de l'appelant — même
classe de faille que le P0-1 déjà documenté ailleurs dans l'audit auth (`PLAN_REMEDIATION_AUTH_PROD.md`),
mais jamais corrigée sur ce contrôleur spécifique.

## Correction

**Option C retenue (correctif minimal, réversible, zéro route retirée)** — `SuperAdminGuard` posé
sur le contrôleur, symétriquement à `TenantsController` (P0-1) :

```ts
// organizations.controller.ts
@Controller('organizations')
@AllowNoTenant()
@UseGuards(JwtDatabaseGuard, SuperAdminGuard)
```

`SuperAdminGuard` (`super-admin.guard.ts`) rejette en 403 quiconque n'a pas `user.isSuperAdmin`.
`@AllowNoTenant()` est requis car un super-admin plateforme peut ne pas avoir de tenant courant
(sinon `TenantGuard` global le bloquerait avant d'atteindre le `SuperAdminGuard`). Aucune route
n'est supprimée, aucun contrat d'API modifié — seul l'accès est restreint.

**Pourquoi pas un simple `@RequirePermissions` ?** Le modèle `Tenant` n'a pas de `tenantId`
scalaire → il est exclu de l'auto-scoping Prisma. Une permission satisfaite laisserait l'`id`
arbitraire : un ADMIN du tenant A viserait toujours le tenant B. Seul un scope forcé
(`id = user.tenantId`) ou un guard super-admin ferme réellement la faille (cf.
`PLAN_REMEDIATION_AUTH_PROD.md §1.1/§1.3`).

**Vérifications préalables (2026-07-20)** :
- Frontend `datafriday-web` : **aucun** appel aux routes nues `GET/PATCH/DELETE /organizations/:id`
  (uniquement `/organizations/:orgId/integrations/**`, qui relèvent d'`IntegrationsController`, un
  module distinct déjà protégé par `resolveTenantId()`). Le durcissement ne casse aucun écran.
- `UpdateOrganizationDto` autorise `name`, `logo`, `plan` mais **pas** `status` ; avec
  `forbidNonWhitelisted: true`, un `PATCH {status:...}` renvoyait déjà 400. Le vecteur de suspension
  était le `DELETE` (soft-delete → `status: SUSPENDED`), désormais super-admin only.
- `IntegrationsController` (§5 bis du dossier technique frontend) : **PAS** vulnérable — chaque
  handler passe par `resolveTenantId(user, organizationId)` qui compare au `tenantId` du JWT.

**Suite recommandée (non bloquante)** : Option A (supprimer `OrganizationsModule`, redondant avec
`GET /me/tenant` + `TenantsController`) à arbitrer par l'owner backend après confirmation qu'aucun
consommateur hors-repo n'appelle `/organizations/:id` — la route est publiée dans
`docs/api/API_REFERENCE.md`, donc sa suppression serait un changement cassant.

## Tests

Trois couches, chacune testée à son bon niveau :

1. **Câblage (contrôleur)** — `organizations.controller.spec.ts` : `describe('BUG-035 …')` vérifie
   que `SuperAdminGuard` est bien attaché à la classe et que `@AllowNoTenant()` est présent. (Les
   tests unitaires n'exécutent pas les guards — service mocké ; ce sont ces métadonnées qui les
   appliquent en production.)
2. **Décision d'accès (guard)** — `super-admin.guard.spec.ts` (**nouveau** ; le guard n'avait aucun
   test) : super-admin → autorisé ; ADMIN d'organisation non super-admin → **403** ; user sans flag
   → 403 ; requête sans user → 403. C'est la preuve directe que la faille est fermée.
3. **Cause racine (base réelle)** — `tenant-isolation.integration.spec.ts` : cas
   `does NOT auto-scope the Tenant model (root cause of BUG-035)` prouvant qu'une écriture
   cross-tenant sur `Tenant` réussit au niveau DB (aucun scoping Prisma) — donc que le guard HTTP est
   l'unique défense. Nécessite `DATABASE_URL` (sinon `describe.skip`).

Preuve finale attendue avant 🟢 (hors tests automatisés) : repro manuelle staging du §2 du dossier
technique — rôle le plus faible → 403, super-admin → 200.

## Risque de régression / à surveiller

- **Consommateur hors-repo** : si un client externe (app mobile, script, autre service) appelait
  légitimement `/organizations/:id` avec un compte non super-admin, il reçoit désormais 403. Non
  détectable depuis le monorepo — à confirmer côté owner backend avant déploiement.
- **Passage 🟡 → 🟢** conditionné à : build vert, test d'intégration cross-tenant ajouté, et
  validation sur staging (repro §2 du dossier technique avec un compte au rôle le plus faible → 403).
- Historiquement **priorité de correction la plus haute de tout le lot** — faille d'isolation
  multi-tenant exploitable par n'importe quel compte authentifié.

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #1
- `docs/PLAN_REMEDIATION_AUTH_PROD.md`
