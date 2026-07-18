# 🔴 Faille cross-tenant `/organizations` — dossier technique

> **Destinataire** : équipe backend (`api-datafriday-staging`, owner Ulrich).
> **Rédigé le** : 2026-07-18 · **Auteur** : emmanuel · **Sévérité** : 🔴 Critique
> **Statut** : ouvert, non corrigé.
>
> ⚠️ **Portée de ce document.** Il est rédigé depuis le dépôt **frontend**, où le code backend n'est
> pas disponible. Tout ce qui suit est dérivé de
> [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md), établi le 2026-07-15 par lecture
> directe du code backend. **Les références `fichier:ligne` doivent être revérifiées avant
> correctif** — trois semaines de commits ont pu les décaler. Le raisonnement, lui, tient tant que
> la structure des guards n'a pas changé.
>
> Ce fichier a vocation à être **transféré dans `api-datafriday-staging/docs/`**, où il rejoindra le
> tracker de bugs backend. Il vit ici faute d'accès au dépôt concerné.

---

## 1. Résumé exécutif

**N'importe quel utilisateur authentifié, de n'importe quelle organisation, peut lire, modifier ou
suspendre l'organisation d'un autre client.** Il lui suffit d'en connaître l'identifiant.

Aucun privilège particulier n'est requis : un compte au rôle le plus faible suffit. Aucune trace
n'est laissée. Une seule requête HTTP suffit.

| | |
|---|---|
| **Surface** | `GET`, `PATCH`, `DELETE /api/v1/organizations/:id` |
| **Privilège requis** | Être authentifié, avec n'importe quel rôle, dans n'importe quel tenant |
| **Données exposées** | Nom, slug, plan, statut, code d'invitation, coordonnées de toute organisation |
| **Écriture possible** | Changement de forfait, renommage, **suspension** (déni de service), suppression |
| **Traçabilité** | Aucune — `AuditService` n'est appelé nulle part dans le backend |
| **Prérequis d'exploitation** | Connaître un `id` d'organisation (`cuid`) |

C'est la **même classe de faille que P0-1**, corrigée en juin sur `/tenants`, mais jamais appliquée
à son contrôleur jumeau.

---

## 2. Reproduction

Avec un compte ordinaire — rôle « Technicien Logistic » suffit, c'est le plus restreint du
catalogue (2 permissions) :

```http
PATCH /api/v1/organizations/<id-d-une-autre-organisation>
Authorization: Bearer <JWT valide de MON tenant>
Content-Type: application/json

{ "plan": "ENTERPRISE" }
```

→ **200 OK.** Le forfait de facturation d'un tiers est modifié.

Variantes du même appel :

```http
GET    /api/v1/organizations/<id>              → lecture complète de la fiche
PATCH  /api/v1/organizations/<id>  {"status":"SUSPENDED"}   → déni de service
DELETE /api/v1/organizations/<id>              → suppression
```

`status: SUSPENDED` mérite une mention particulière : d'après `jwt-db-lookup.strategy.ts`
(lignes 86-88, 98-100, 240-242), un tenant suspendu fait échouer l'authentification avec
`401 Organization is suspended` **à chaque palier du cache** — local, Redis, base. Suspendre un
concurrent le déconnecte donc intégralement, tous utilisateurs confondus, jusqu'à intervention
manuelle.

### Comment un attaquant obtient un `id`

Le `cuid` n'est pas devinable par force brute, mais il n'est pas secret pour autant :

- Un utilisateur ayant appartenu à une autre organisation en connaît l'identifiant.
- Un prestataire, un ancien salarié, un compte de test partagé.
- Toute fuite d'un `id` dans une URL, une capture d'écran, un export, un ticket de support.

**Traiter un identifiant comme un secret est un modèle de sécurité, pas une protection.** La
correction ne doit pas reposer sur la difficulté de deviner l'`id`.

---

## 3. Cause racine — trois défenses qui manquent toutes les trois

L'intérêt de ce bug est qu'aucune des trois lignes de défense habituelles n'opère. Comprendre
pourquoi est ce qui évite de le reproduire ailleurs.

### 3.1 Aucun guard de privilège sur le contrôleur

```ts
// organizations.controller.ts:17-18 — TOUT le contrôleur
@Controller('organizations')
@UseGuards(JwtDatabaseGuard)          // ← ni SuperAdminGuard, ni @RequirePermissions
export class OrganizationsController {
  @Get(':id')    async getOrganization(@Param('id') id: string) { … }
  @Patch(':id')  async updateOrganization(@Param('id') id: string, @Body() dto) { … }
  @Delete(':id') async deleteOrganization(@Param('id') id: string) { … }
}
```

`JwtDatabaseGuard` vérifie **qui vous êtes**, pas **ce que vous avez le droit de faire**.

### 3.2 Le service fait confiance à l'`id` de l'URL

`OrganizationsService` interroge `prisma.tenant.findUnique` / `update` avec l'`id` **fourni par
l'appelant** (`organizations.service.ts:16,47,80`), sans jamais le comparer à
`request.user.tenantId`.

### 3.3 L'auto-scoping Prisma ne protège pas `Tenant` — par construction

C'est le point le plus important, et le moins intuitif.

Le backend dispose d'un middleware Prisma solide : pour **tout modèle possédant un `tenantId`
scalaire requis** (calculé depuis le DMMF), il injecte automatiquement le `tenantId` du contexte
dans le `where` et le `data` de chaque requête (`applyTenantScope`, `tenant-scope.util.ts:61-111`),
alimenté par `nestjs-cls` et `TenantContextInterceptor`. Un test d'intégration dédié le couvre.

**Or `Tenant` n'a pas de champ `tenantId` — il *est* le tenant.** Il est donc exclu du mécanisme.

Conséquence structurelle : `Tenant` et `/organizations` sont les seules surfaces du domaine qui
échappent à la protection automatique, et qui doivent donc être protégées **manuellement**. Le
filet de sécurité qui rattrape toutes les autres erreurs de scoping ne rattrape pas celle-ci.

### 3.4 Et `TenantGuard` ne comble pas le trou

`TenantGuard` (guard global n°3) vérifie que `request.user.tenantId` **existe**. Il ne vérifie
jamais qu'il **correspond** au `:id` demandé. Il n'y a pas non plus de paramètre `:spaceId`, donc
`SpaceAccessGuard` (guard n°6) ne s'active pas.

### 3.5 La cause permissive de fond

Les six guards globaux s'exécutent dans l'ordre déclaré (`app.module.ts:174-192`) :

```
TenantThrottlerGuard → JwtDatabaseGuard → TenantGuard → RolesGuard → PermissionsGuard → SpaceAccessGuard
```

`RolesGuard` et `PermissionsGuard` sont globaux mais **permissifs par défaut** : un handler sans
`@Roles(...)` ni `@RequirePermissions(...)` est accessible à **tout utilisateur authentifié ayant un
tenant résolu**.

Autrement dit : **l'absence de décorateur ne produit pas une erreur, elle produit une route
ouverte.** C'est exactement ce qui s'est passé ici, et c'est ce qui se reproduira à la prochaine
route oubliée.

---

## 4. Pourquoi `/tenants` est protégé et pas `/organizations`

Les deux contrôleurs exposent des opérations équivalentes **sur le même modèle Prisma `Tenant`**.

`TenantsController` a été durci en réponse à l'audit du 2026-06-24 :

```ts
// tenants.controller.ts:30-31
@AllowNoTenant()
@UseGuards(JwtDatabaseGuard, SuperAdminGuard)
// commentaire du code : "Surface d'administration PLATEFORME (cross-tenant)… cf. faille corrigée P0-1"
```

`SuperAdminGuard` (`super-admin.guard.ts:22-34`) rejette quiconque n'a pas `user.isSuperAdmin`.
Ce correctif est réel et vérifié. Ses seuls usages confirmés sont `TenantsController` et
`MetricsController`.

**`OrganizationsController` n'a jamais reçu le même traitement.** L'audit de juin ne l'a pas couvert
— soit qu'il n'existait pas encore, soit qu'il soit passé au travers. La correction a été appliquée
à une surface, pas à une classe de problème.

C'est le mécanisme classique du correctif ponctuel : on ferme la porte par laquelle on est entré,
pas les autres portes du même modèle.

### Un risque latent supplémentaire

Le correctif P0-3 a retiré `weezeventClientId` / `weezeventClientSecret` des `select` exposés par
`TenantsController` (`tenants.service.ts:25-49`, commentaire « ⚠️ Sécurité (P0-3) : ne JAMAIS
exposer… »).

`OrganizationsController` interroge le même modèle **sans cette garantie structurelle**. Son `select`
actuel ne demande pas ces champs, donc il ne les fuit pas aujourd'hui — mais rien ne l'empêche : un
futur élargissement du `select`, ou un `select: {...dto}`, réintroduirait la fuite **sans qu'aucun
commentaire n'avertisse**. Les secrets d'intégration Weezevent d'un tiers deviendraient alors
lisibles par la même requête.

---

## 5. Correctifs possibles

### Option A — Supprimer le contrôleur ✅ recommandé

`/organizations` est **redondant** :

| Besoin | Déjà couvert par |
|---|---|
| Lire son organisation | `GET /me/tenant` |
| Administration cross-tenant | `TenantsController` + `SuperAdminGuard` |

Supprimer la surface, c'est supprimer la faille — et il n'y a pas de risque qu'un futur
développeur y réintroduise le problème.

**Avant de supprimer** : vérifier que le frontend ne l'appelle pas. Contrôle effectué le
2026-07-18 sur `datafriday-web/src` — **aucun appel aux routes `GET`/`PATCH`/`DELETE
/organizations/:id`**. `auth.js` passe par `/onboarding` et `/me`, et il n'existe aucun client API
`organization.api.js`.

> ⚠️ **Mais attention au préfixe partagé.** Le frontend appelle massivement
> `/organizations/:orgId/integrations/**` (18 occurrences dans `api/endpoints/aggregation.api.js` :
> instances Weezevent et Digifood, tests de connexion, import CSV). Ces routes appartiennent à
> **`IntegrationsModule`**, un contrôleur *différent* monté sous le même préfixe d'URL.
>
> Supprimer `OrganizationsController` ne doit **pas** emporter ces routes-là, sous peine de casser
> tout le wizard `/data-integration/fb`. Vérifier le découpage réel des contrôleurs avant de
> toucher au routage.

### Option B — Réécrire en self-service `PATCH /me/tenant`

Si une écriture par l'organisation elle-même est nécessaire, la seule forme sûre est celle qui
**ne prend pas d'`id` en paramètre** :

```ts
@Patch('/me/tenant')
async updateMyTenant(@CurrentUser() user, @Body() dto: UpdateMyTenantDto) {
  // id FORCÉ côté service — jamais fourni par l'appelant
  return this.service.update(user.tenantId, dto)
}
```

Deux conditions indissociables :

1. **`id` forcé à `user.tenantId` dans le service**, jamais lu depuis l'URL ou le corps.
2. **DTO restreint.** `UpdateOrganizationDto` autorise aujourd'hui `plan` — un champ de
   **facturation**, qu'un client ne doit jamais pouvoir modifier lui-même, fût-ce sur sa propre
   organisation. Idem pour `status`. Le DTO self-service doit se limiter aux champs descriptifs
   (nom, coordonnées), et exiger une permission (`org.settings.manage` ou équivalent).

C'est l'option B proposée par `PLAN_REMEDIATION_AUTH_PROD.md` §1.3 pour `/tenants`, jamais
appliquée ici.

### Option C — Poser `SuperAdminGuard` ⚠️ correctif minimal

```ts
@Controller('organizations')
@UseGuards(JwtDatabaseGuard, SuperAdminGuard)
```

Ferme la faille en une ligne, symétriquement à `/tenants`. **Mais** ça laisse en place un
contrôleur redondant, que quelqu'un pourra « rouvrir » plus tard en croyant corriger une régression
d'accès. À réserver au cas où une correction immédiate est nécessaire avant d'arbitrer entre A et B.

### Recommandation

**A** si le frontend ne l'appelle pas — ce qui est le cas au 2026-07-18.
**C** immédiatement si l'arbitrage A/B doit attendre : la faille est active pendant ce temps.

---

## 5 bis. 🔍 À vérifier en priorité — `IntegrationsController` a-t-il la même faille ?

**Découvert en instruisant ce dossier, non vérifié faute d'accès au code backend. À traiter avant
le correctif principal si la réponse est oui.**

`IntegrationsModule` expose (d'après [`CARTOGRAPHIE_MODULES.md`](CARTOGRAPHIE_MODULES.md)) :

```
organizations/:orgId/integrations
  GET    /                                          liste des intégrations
  POST   weezevent/test                             test de connexion
  POST   weezevent/instances                        création d'instance
  GET    weezevent/instances/:id
  PATCH  weezevent/instances/:id
  GET    digifood/instances
  POST   digifood/instances
  POST   digifood/instances/:id/import-csv
```

**Ces routes prennent elles aussi un `:orgId` dans l'URL.** Si le service fait confiance à ce
paramètre sans le comparer à `request.user.tenantId` — exactement le défaut du §3.2 — alors la
surface exposée est **bien plus grave** que celle de `/organizations/:id` :

| Conséquence potentielle | Gravité |
|---|---|
| Lecture des intégrations d'un concurrent (fournisseur de billetterie, instances configurées) | 🔴 |
| Exposition des **identifiants Weezevent** d'un tiers, si le `select` les remonte | 🔴 Critique |
| Création d'une instance d'intégration sur l'organisation d'un tiers | 🔴 |
| Injection de ventes via `import-csv` dans les données d'un tiers | 🔴 |

Rappel du §4 : le correctif P0-3 a explicitement retiré `weezeventClientId` /
`weezeventClientSecret` des `select` de `TenantsController`. Il faut vérifier que le même soin a
été pris ici.

**Trois questions à trancher par lecture du code** :

1. `IntegrationsController` porte-t-il un `@RequirePermissions(...)` ou un guard de scoping ?
2. Le service compare-t-il `orgId` à `user.tenantId`, ou fait-il confiance à l'URL ?
3. Les modèles manipulés (`Integration`, `WeezeventIntegrationConfig`, `CsvMapping`) ont-ils un
   `tenantId` scalaire requis — donc bénéficient-ils de l'auto-scoping Prisma du §3.3 ?

La question 3 est décisive. Si ces modèles portent un `tenantId`, le middleware Prisma les protège
automatiquement et le risque retombe. **`Tenant` était l'exception précisément parce qu'il n'a pas
ce champ.** C'est le premier point à vérifier — il peut clore le sujet en une minute.

---

## 6. Le correctif structurel — le vrai sujet

Aucune des trois options n'empêche **la prochaine occurrence**. La cause de fond est §3.5 : une
route sans décorateur est ouverte.

**Inverser le défaut : deny-by-default.** Exiger une permission explicite, et rendre l'ouverture
explicite via `@Public()`. Une route oubliée devient alors une erreur détectable au démarrage ou en
test, au lieu d'une faille silencieuse.

Coût : un audit de toutes les routes existantes pour poser les décorateurs manquants. C'est un
chantier réel, mais c'est la seule mesure qui transforme cette classe de bug en classe d'erreur.

Suivi côté frontend en [A9](AMELIORATIONS_AUTHENTIFICATION.md).

**Mesure complémentaire — brancher `AuditService`.** Le modèle `AuditLog` et le service existent,
complets et fonctionnels, et **ne sont appelés nulle part dans tout le backend**. Conséquence
directe sur ce dossier : *il est impossible de savoir si la faille a été exploitée.* Aucune trace
requêtable d'un changement de plan, d'une suspension ou d'une suppression d'organisation. Toute
investigation devrait passer par les logs applicatifs bruts et les horodatages en base.

---

## 7. Vérification attendue après correctif

**Tests d'intégration à ajouter** — ce sont eux qui empêcheront la réintroduction :

1. Un utilisateur du tenant A appelant `GET /organizations/<id-tenant-B>` → **403 ou 404**.
2. Idem en `PATCH` et `DELETE` → **403 ou 404**.
3. Un super-admin y accède (si l'option C est retenue).
4. Un utilisateur peut lire sa **propre** organisation par le chemin prévu.
5. `plan` et `status` ne sont modifiables par **aucune** route self-service.

Préférer **404 à 403** en réponse : un 403 confirme l'existence de l'organisation ciblée, un 404
n'apprend rien à l'attaquant.

**Contrôle manuel** : rejouer la reproduction du §2 avec un compte au rôle le plus faible.

**Vérification de non-régression frontend** : aucun écran n'appelle `/organizations` ; le parcours
d'onboarding (`/onboarding`, `/me`) doit rester intact. Les tests du domaine auth côté front
(32 cas) ne couvrent pas cette route.

---

## 8. Ce que ce document n'établit pas

Par honnêteté sur son niveau de preuve :

- **Je n'ai pas lu le code backend.** Il n'est pas présent dans ce dépôt. Tout provient de
  `modules/08_AUTH_ONBOARDING.md`, vérifié contre le code le 2026-07-15 par une lecture directe.
- **Les numéros de ligne sont à revérifier.** Trois semaines de commits ont pu les décaler.
- **La faille n'a pas été exploitée en conditions réelles** pour ce document. La reproduction du §2
  est déduite de la lecture des guards, pas d'un appel effectué. **À confirmer sur un environnement
  de test avant de conclure** — et surtout pas en production.
- **Il n'est pas établi que la faille a ou n'a pas été exploitée.** Faute d'audit trail (§6), la
  question ne peut pas être tranchée par les données.

Si l'un de ces points est infirmé à la relecture du code, ce document doit être corrigé plutôt que
laissé tel quel : une doc de sécurité fausse est pire qu'une absence de doc.

---

## 9. Références

- [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) — « Piège n°1 », source de ce
  dossier, avec le détail des 7 contrôleurs et 41 routes du domaine
- [`MODULE_AUTHENTIFICATION.md`](MODULE_AUTHENTIFICATION.md) — synthèse du domaine, bug n°1
- [`AMELIORATIONS_AUTHENTIFICATION.md`](AMELIORATIONS_AUTHENTIFICATION.md) — A9 (deny-by-default),
  A10 (audit trail), A11 (durée de vie du JWT)
- Côté backend, à relire avant correctif : `PLAN_REMEDIATION_AUTH_PROD.md` (§1.3, option B),
  `SYSTEME_AUTH_COMPLET.md`, `CONCEPTION_CIBLE_AUTH.md` — archives du 2026-06-24/25, partiellement
  périmées mais utiles sur le *pourquoi* des choix

## 10. Note d'attribution

La cartographie attribue « tout le backend » à Ulrich, tandis que modules/08 et son index donnent
Emmanuel comme owner du domaine Auth & RBAC. **Ce bug tombe exactement dans ce recouvrement.**

Ce n'est pas un détail administratif : une tâche que deux personnes peuvent légitimement croire
attribuée à l'autre est une tâche qui n'est prise par personne — ce qui est cohérent avec le fait
que le correctif P0-1 ait été appliqué à `/tenants` et jamais à son jumeau.

**À assigner nommément avant toute autre discussion.**
