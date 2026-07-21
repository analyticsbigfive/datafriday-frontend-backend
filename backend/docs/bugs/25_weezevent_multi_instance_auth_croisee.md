# BUG-025 — Multi-instance Weezevent : l'auth OAuth utilise les credentials de la 1ère intégration active pour toutes

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🔴 Critique — sync silencieusement fausse/cassée dès 2 intégrations Weezevent actives
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `weezevent-auth.service.ts` (`getAccessToken`/`getWeezeventConfig`/cache),
  `weezevent-api.service.ts` (`get`/`post`/`put`/`delete`/`request`/`executeWithRetry`/`mapError`),
  `weezevent-client.service.ts` (15 méthodes), + 18 points d'appel dans 7 fichiers (services de
  sync, controllers, `spaces.service.ts`)

## Symptôme

Dès qu'un tenant a 2 intégrations Weezevent actives, l'authentification OAuth utilisée pour
synchroniser la 2ᵉ intégration est en réalité celle de la 1ère — sync silencieusement fausse ou
cassée pour toute intégration au-delà de la première.

**Vérifié en base le 2026-07-21 : ce n'était pas théorique.** 2 tenants réels ont aujourd'hui
respectivement 4 et 3 intégrations Weezevent actives simultanément (`WeezeventIntegration` groupé
par tenant, `enabled = true`).

## Cause racine

`WeezeventAuthService.getAccessToken(tenantId)` et son cache token étaient keyés par `tenantId`
seul. `getWeezeventConfig(tenantId)` lisait `Tenant.weezeventClientId/clientSecret` — un miroir du
**premier** `WeezeventIntegrationConfig` actif du tenant (`WeezeventIntegrationService.
mirrorActiveInstanceToTenant`, trié par `createdAt: asc`), maintenu uniquement "pour que les
services de sync/cron/webhook existants (qui lisent ces colonnes) continuent de fonctionner" — un
raccourci de migration jamais résolu. Résultat : peu importe l'`integrationId` réellement demandé,
le token OAuth résolu était toujours celui de la première intégration créée.

`organizationId`, lui, était déjà résolu correctement par intégration par tous les appelants (via
`WeezeventIntegrationConfig.organizationId`) — seul le token OAuth ne l'était pas. Un seul point
d'entrée HTTP existe (`WeezeventApiService.request`), un seul consommateur
(`WeezeventClientService`) : le rayon de correction était donc plus contenu qu'il n'y paraissait.

## Correction

- `WeezeventAuthService.getAccessToken(tenantId, integrationId)` : cache token keyé par
  `integrationId` (plus par `tenantId`). `getWeezeventConfig` lit directement
  `WeezeventIntegrationConfig` via `prisma.integration.findFirst({ id: integrationId, tenantId,
  provider: 'WEEZEVENT' })`, décrypte le secret sur place (`EncryptionService`, injecté), au lieu de
  passer par `OnboardingService`/`Tenant.weezeventClientId`. `clearToken(integrationId)` idem.
- `WeezeventApiService` : `get`/`post`/`put`/`delete`/`request`/`executeWithRetry`/`mapError`
  prennent maintenant `integrationId` en plus de `tenantId`, propagé jusqu'à
  `authService.getAccessToken(tenantId, integrationId)` et `authService.clearToken(integrationId)`
  (cas 401).
- `WeezeventClientService` : les 15 méthodes (`getTransactions`, `getTransaction`, `getWallet`,
  `getWallets`, `getUser`, `getEvent`, `getEvents`, `getProduct`, `getProducts`,
  `getProductVariants`, `getProductComponents`, `getProductMenuSteps`, `getOrders`, `getOrder`,
  `getPrices`, `getAttendees`, `getLocations`) prennent `integrationId` en 2ᵉ paramètre (après
  `tenantId`, avant `organizationId`).
- 18 points d'appel mis à jour dans 7 fichiers (`weezevent-collect-worker.service.ts`,
  `weezevent-incremental-sync.service.ts`, `queued-entity-sync.service.ts`,
  `catalog-sync.service.ts`, `transaction-sync.service.ts`, `weezevent.controller.ts`,
  `spaces.service.ts`) — dans chaque cas `integrationId` était déjà disponible dans le scope
  immédiat (résolu juste avant pour `organizationId`), confirmant que c'était bien une plomberie
  incomplète et non un problème de conception plus large.
- Tests : `weezevent-auth.service.spec.ts` et `weezevent-api.service.spec.ts` ont chacun un nouveau
  test explicite vérifiant qu'un token/credentials différent est résolu pour 2 `integrationId`
  distincts du même tenant (non-régression directe de ce bug). `weezevent-client.service.spec.ts`
  vérifie la propagation d'`integrationId`.

## Risque de régression / à surveiller

- Les tenants avec 2+ intégrations Weezevent actives (au moins 2 confirmés en base) doivent
  maintenant authentifier chaque intégration séparément — vérifier après déploiement que leurs
  prochaines syncs par intégration utilisent bien les bons credentials (logs
  `WeezeventAuthService` : "Requesting new access token for integration X", plus "for tenant X").
- `WeezeventIntegrationService.mirrorActiveInstanceToTenant` (le miroir vers `Tenant.
  weezeventClientId`) n'a pas été supprimé — il reste utilisé par d'autres lecteurs legacy des
  colonnes `Tenant.weezeventClientId/Secret` (cron `getWeezeventEnabledTenants`, webhook secret
  BUG-106) qui n'ont pas encore été migrés vers le modèle par-intégration. Ne pas le retirer sans
  vérifier ces usages.
- BUG-106 (nouveau ticket) documente un défaut de la même famille sur le secret de signature
  webhook, volontairement non corrigé (nécessite une nouvelle capacité de configuration, pas
  seulement un fix de plomberie).

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #1
- BUG-106 (`106_webhook_secret_tenant_global_pas_par_integration.md`) — même famille de défaut,
  trouvé en creusant celui-ci, volontairement non corrigé (capacité de configuration inexistante).
