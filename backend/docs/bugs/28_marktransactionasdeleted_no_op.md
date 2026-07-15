# BUG-028 — markTransactionAsDeleted ne fait rien de réel malgré son nom

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Faible
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `webhook-event.handler.ts` (méthode `markTransactionAsDeleted`)

## Symptôme

Les transactions supprimées côté Weezevent restent visibles côté Data Friday.

## Cause racine

La méthode `markTransactionAsDeleted` se contente de mettre à jour `syncedAt` — elle ne marque
réellement rien comme supprimé malgré son nom.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #4
