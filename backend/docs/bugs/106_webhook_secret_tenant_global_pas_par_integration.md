# BUG-106 — Secret de signature webhook Weezevent tenant-global, pas par intégration

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (latent au diagnostic — aucune capacité de configurer un secret distinct
  par intégration n'existait alors)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-21, en creusant BUG-025 (auth OAuth croisée multi-instance)
- **Corrigé le** : 2026-07-21
- **Fichiers** : `webhook.controller.ts` (`receiveWebhook`), `weezevent-integration.service.ts`
  (`getWebhookConfig`/`updateWebhookConfig`), `integrations.controller.ts` (routes `weezevent/
  instances/:instanceId/webhook`), `dto/weezevent-webhook-config.dto.ts`, `schema.prisma`
  (`WeezeventIntegrationConfig.webhookSecret`/`webhookEnabled`)

## Symptôme

Aucun aujourd'hui — trouvé par lecture de code, pas par un cas observé. `POST
/webhooks/weezevent/:tenantId/:integrationId` valide la signature HMAC du webhook contre
`Tenant.weezeventWebhookSecret` (un seul secret par tenant), alors que l'URL identifie déjà
l'intégration précise (`:integrationId`) — même famille de défaut que BUG-025 (credentials
partagés à tort entre intégrations d'un même tenant), mais sur le secret de signature webhook
plutôt que sur les credentials OAuth.

## Cause racine

`WebhookIntegrationService.updateConfig`/`getConfig` (configuration du secret) et
`WebhookController.receiveWebhook` (vérification à la réception) lisent/écrivent tous les deux
`Tenant.weezeventWebhookSecret`/`weezeventWebhookEnabled` — il n'existe **aucun champ ni capacité
de configuration** pour un secret distinct par intégration, contrairement aux credentials OAuth qui
ont déjà `WeezeventIntegrationConfig.clientId/clientSecret` (1-1 avec `Integration`, corrigé dans
BUG-025).

## Correction

**Décision produit prise par l'utilisateur le 2026-07-21** avant implémentation :
- Configuration : ajout backend seul (nouvelle colonne + API scopée par `instanceId`), pas de
  nouvel écran frontend construit cette session (hors scope `backend/`) — l'API est prête pour un
  futur écran, en miroir du pattern déjà utilisé pour `clientId`/`clientSecret` OAuth (BUG-025) et
  du pattern `DigifoodIntegrationConfig.webhookSecret` déjà existant.
- Rétrocompatibilité : repli automatique sur `Tenant.weezeventWebhookSecret`/
  `weezeventWebhookEnabled` si aucun secret par-intégration n'est configuré — zéro action requise
  pour les tenants existants.

Fait :
- `prisma/schema.prisma` : `WeezeventIntegrationConfig.webhookSecret String?` (chiffré,
  `EncryptionService`) + `webhookEnabled Boolean?`. Même migration manuelle que BUG-021
  (`prisma/migrations/20260721210000_event_weezevent_link_and_webhook_per_integration/migration.sql`,
  `prisma migrate dev` échoue sur cette base — `P3006`, cf. BUG-70) déployée via `prisma migrate
  deploy` (autorisation explicite utilisateur, [ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)).
- `WeezeventIntegrationService.getWebhookConfig`/`updateWebhookConfig(tenantId, instanceId, dto)`
  (nouveau) : chiffre le secret à l'écriture (`EncryptionService.encrypt`, jamais retourné en
  lecture — seuls `enabled`/`configured` sont exposés), même garde upsert que
  `updateInstance()` (répare une intégration historique sans ligne `weezevent`).
- Routes `GET`/`PATCH /organizations/:organizationId/weezevent/instances/:instanceId/webhook`
  (`integrations.controller.ts`), `UpdateWeezeventWebhookDto` (`dto/weezevent-webhook-config.dto.ts`).
- `WebhookController.receiveWebhook` (`webhook.controller.ts`) : lit désormais
  `Integration.weezevent.webhookEnabled`/`webhookSecret` (via `include`) en priorité — n'utilise le
  secret par-intégration que si `webhookEnabled === true` ET `webhookSecret` non vide
  (`perIntegrationConfigured`) ; sinon repli intégral sur `tenant.weezeventWebhookEnabled`/
  `weezeventWebhookSecret` (comportement historique inchangé). Le secret par-intégration est
  déchiffré (`EncryptionService.decrypt`) uniquement quand il est utilisé.
- Tests unitaires ajoutés/mis à jour : `webhook.controller.spec.ts` (secret par-intégration
  prioritaire, repli tenant, `webhookEnabled=false` ignoré même si un secret stale existe),
  `weezevent-integration.service.spec.ts` (`getWebhookConfig`/`updateWebhookConfig`),
  `integrations.controller.spec.ts` (nouvelles routes). `npx tsc --noEmit` propre, suite Jest
  complète : 740/751 passent (2 échecs pré-existants sans rapport, module `menu-items`).

## Risque de régression / à surveiller

Le repli tenant reste actif indéfiniment tant qu'aucun secret par-intégration n'est configuré —
comportement voulu (back-compat), mais signifie que deux intégrations Weezevent d'un même tenant
sans secret par-intégration configuré continueront de valider leurs webhooks contre le même secret
tenant (pas une régression : c'était déjà le seul comportement possible avant ce fix). À surveiller
si un tenant configure un secret par-intégration pour une seule de ses intégrations Weezevent :
les autres retombent alors sur le secret tenant, ce qui est le comportement attendu mais mérite
d'être documenté clairement le jour où un écran de configuration est construit côté frontend.

## Références

- BUG-025 (`25_weezevent_multi_instance_auth_croisee.md`) — même famille de défaut (credentials
  tenant-global au lieu de par-intégration), corrigé côté OAuth, trouvé en creusant BUG-025.
