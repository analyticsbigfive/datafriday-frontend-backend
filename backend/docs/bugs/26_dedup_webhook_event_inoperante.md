# BUG-026 — Dédup IntegrationWebhookEvent inopérante côté Weezevent

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Modéré — doublons d'audit + retraitement complet à chaque retry
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `webhook.controller.ts:105-114`, `schema.prisma:1233`

## Symptôme

Un webhook Weezevent retenté crée un doublon d'audit et déclenche un retraitement complet, au lieu
d'être détecté comme déjà traité.

## Cause racine

`externalDeliveryId` n'est jamais renseigné côté Weezevent lors de la création de
`IntegrationWebhookEvent`, alors que la dédup repose sur ce champ.

## Correction

Aucune à ce jour. Impact fonctionnel limité par l'idempotence en aval (le traitement lui-même ne
duplique pas les effets), mais l'audit reste pollué.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #2
