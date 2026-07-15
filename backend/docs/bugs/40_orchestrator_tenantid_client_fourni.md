# BUG-040 — Orchestrator fait confiance à un tenantId fourni par le client

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Défaut d'autorisation, impact limité (pas de fuite de données confirmée)
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `orchestrator.controller.ts:26-48`, `dto/invalidate-cache.dto.ts:6-7`, `dto/get-strategy-query.dto.ts:19-21`

## Symptôme

Un utilisateur peut, via `POST /orchestrator/invalidate-cache` ou `GET /orchestrator/strategy`,
cibler un `tenantId` qui n'est pas le sien.

## Cause racine

Ces deux routes acceptent un `tenantId` fourni par le client dans le body/query au lieu d'utiliser
`@CurrentTenant()` (le tenant réellement authentifié).

## Correction

Aucune à ce jour — remplacer le `tenantId` client par `@CurrentTenant()`.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #2
