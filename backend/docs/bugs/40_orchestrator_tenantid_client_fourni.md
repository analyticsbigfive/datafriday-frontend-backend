# BUG-040 — Orchestrator fait confiance à un tenantId fourni par le client

- **Statut** : 🟢 Corrigé
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

**Correction appliquée** — `orchestrator.controller.ts` : les deux endpoints reçoivent désormais
`@CurrentTenant() tenantId: string` et l'utilisent à la place de la valeur du body/query :
- `POST /orchestrator/invalidate-cache` : `invalidateCache(tenantId, body.spaceId)` (le champ
  `tenantId` a été retiré de `InvalidateCacheDto`, aucun appelant connu — front ni back — n'en
  dépendait).
- `GET /orchestrator/strategy` : `decideStrategy({ tenantId, ... })` (le champ `tenantId` a été
  retiré de `GetStrategyQueryDto` et de son `@ApiQuery`).

Tests ajoutés dans `orchestrator.controller.spec.ts` confirmant qu'un `tenantId` fourni dans le
body/la query par le client est ignoré au profit du tenant authentifié.

## Risque de régression / à surveiller

Un `tenantId` toujours envoyé par un client existant (body/query) sera désormais silencieusement
ignoré plutôt que rejeté — vérifier qu'aucun appelant interne ne dépendait de la valeur envoyée
(recherche effectuée : aucun appelant dans `backend/` ni `frontend/`).

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #2
