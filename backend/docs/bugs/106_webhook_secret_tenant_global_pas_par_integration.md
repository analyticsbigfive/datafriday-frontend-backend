# BUG-106 — Secret de signature webhook Weezevent tenant-global, pas par intégration

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix volontairement non implémenté maintenant)
- **Sévérité** : 🟡 Mineur (latent — aucune capacité de configurer un secret distinct par
  intégration n'existe aujourd'hui, donc aucun cas réel possible actuellement)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-21, en creusant BUG-025 (auth OAuth croisée multi-instance)
- **Fichiers** : `webhook.controller.ts:67-100`, `webhook-integration.service.ts` (`updateConfig`/
  `getConfig`), `schema.prisma` (`Tenant.weezeventWebhookSecret`/`weezeventWebhookEnabled`,
  `WeezeventIntegrationConfig`)

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

**Volontairement non implémentée maintenant** — contrairement à BUG-025, ce n'est pas la
correction d'une plomberie existante mais l'ajout d'une fonctionnalité qui n'existe pas encore
(configurer un secret par intégration), ce qui suppose une décision produit/UX : où et comment
l'utilisateur configurerait-il un secret par intégration (aujourd'hui il n'y a qu'un seul écran de
paramétrage webhook, au niveau tenant) ? Tant que cette capacité de configuration n'existe pas,
**tous les webhooks Weezevent d'un même tenant utilisent nécessairement le même secret côté
Weezevent aussi** (puisque DataFriday ne peut en communiquer qu'un seul) — donc aucune divergence
n'est possible aujourd'hui, à la différence de BUG-025 où 2 tenants avaient déjà réellement 2
credentials OAuth différents par intégration en base.

Piste de fix si un besoin réel apparaît : ajouter `webhookSecret String?` (chiffré) +
`webhookEnabled Boolean?` sur `WeezeventIntegrationConfig`, faire lire
`WebhookController.receiveWebhook` sur cette colonne avec repli sur `Tenant.weezeventWebhookSecret`
si absente (back-compat automatique, zéro action requise pour les tenants existants), et exposer un
écran de configuration par intégration plutôt que le seul écran tenant actuel.

## Risque de régression / à surveiller

Aucun aujourd'hui (aucune capacité de configuration existante ne peut diverger). À surveiller si un
besoin de secrets webhook distincts par intégration Weezevent est exprimé.

## Références

- BUG-025 (`25_weezevent_multi_instance_auth_croisee.md`) — même famille de défaut (credentials
  tenant-global au lieu de par-intégration), corrigé côté OAuth, trouvé en creusant BUG-025.
