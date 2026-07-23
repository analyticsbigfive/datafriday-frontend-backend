# BUG-026 — Dédup IntegrationWebhookEvent inopérante côté Weezevent

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🟠 Modéré — doublons d'audit + retraitement complet à chaque retry
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `webhook.controller.ts:100-135`, `schema.prisma` (`IntegrationWebhookEvent`)

## Symptôme

Un webhook Weezevent retenté crée un doublon d'audit et déclenche un retraitement complet, au lieu
d'être détecté comme déjà traité.

## Cause racine

`externalDeliveryId` n'est jamais renseigné côté Weezevent lors de la création de
`IntegrationWebhookEvent`, alors que la dédup (contrainte `@@unique([integrationId,
externalDeliveryId])`) repose sur ce champ. Contrairement à Digifood, le payload Weezevent
(`WeezeventWebhookPayloadDto`) ne contient aucun UUID de livraison stable à réutiliser.

## Correction

Réutilisé la **signature HMAC** (`x-weezevent-signature`, déjà reçue, déjà stockée dans
`signature`) comme `externalDeliveryId`. Elle est déterministe sur le corps exact du payload
(`WebhookSignatureService` : `HMAC-SHA256(secret, JSON.stringify(payload))`) — un retry Weezevent
renvoie le même corps, donc la même signature, sans qu'aucune nouvelle donnée n'ait besoin d'être
extraite du payload. `receiveWebhook` fait maintenant un `findUnique` sur `{integrationId,
externalDeliveryId: signature}` avant `create` (même pattern que `digifood-webhook.controller.ts`)
et retourne immédiatement `{ received: true, eventId }` sans recréer ni retraiter si déjà vu.

## Risque de régression / à surveiller

Tests ajoutés (`webhook.controller.spec.ts`) : le cas nominal vérifie que `externalDeliveryId` est
bien passé à `create`, et un nouveau test dédié vérifie qu'un retry (même signature, `findUnique`
retourne un event existant) ne recrée pas de ligne et ne redéclenche pas `processEvent`.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #2
