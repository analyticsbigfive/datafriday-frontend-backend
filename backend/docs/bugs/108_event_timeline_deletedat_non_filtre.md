# BUG-108 — `getEventTimelineBatch` ne filtre pas `SalesTransaction.deletedAt`

- **Statut** : 🟢 Corrigé (2026-07-23)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation / Live events
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-23 (audit préparatoire du module Live, voir `LIVE_API_GUIDE.md`) ; corrigé le même jour
- **Fichiers** : `src/features/spaces/spaces.service.ts:1140-1189` (`getEventTimelineBatch`)

## Symptôme

Une transaction Weezevent annulée après coup (webhook `delete`, `WebhookEventHandler.
handleTransactionEvent` → `markTransactionAsDeleted`) continue d'apparaître dans la timeline
item-level de `GET /spaces/:id/event-timeline` — revenue et quantités surestimés tant qu'une
re-agrégation périodique ne vient pas corriger la vue shop-level.

## Cause racine

`markTransactionAsDeleted` (`webhook-event.handler.ts:150-165`) horodate bien
`SalesTransaction.deletedAt` (soft-delete réel depuis BUG-028). Mais la requête SQL brute de
`getEventTimelineBatch` (`spaces.service.ts:1160-1189`) ne filtre que
`t.status = 'V'` sur la table `WeezeventTransaction` (mappée sur le modèle `SalesTransaction`) —
`deletedAt` n'apparaît nulle part dans le fichier (`grep -n "deletedAt" spaces.service.ts` → aucun
résultat). BUG-028 avait exclu `deletedAt` uniquement du pipeline d'agrégation périodique
(`executeProcessEvents`, `aggregation.service.ts`), pas de cette route qui lit directement
`WeezeventTransaction` en SQL brut sans passer par ce pipeline.

## Correction

Ajouté `AND t."deletedAt" IS NULL` à la clause `INNER JOIN "WeezeventTransaction" t` de
`getEventTimelineBatch` (`spaces.service.ts:1161-1167`), au même niveau que `AND t.status = 'V'`.

**Pourquoi c'est bloquant pour le module Live** (`LIVE_API_GUIDE.md` §2) : la définition tranchée
de « event live » (question #20 du tracker) réutilise explicitement *la même logique de jointure
que `event-timeline`* — sans ce filtre, une transaction annulée après un simple retry Weezevent
pourrait faire passer un espace à tort en « live » (le scénario que la définition de #20 cherchait
justement à éviter côté `IntegrationWebhookEvent.createdAt`, ici réintroduit par un angle différent
sur les données métier elles-mêmes). Corriger avant d'implémenter le signal live.

## Risque de régression / à surveiller

Aucun — le filtre resserre la requête vers le comportement déjà voulu ailleurs dans le code
(shop-details RPC, pipeline d'agrégation). Vérifier après fix que les compteurs de la timeline
baissent uniquement sur les events ayant eu une transaction annulée (pas de baisse générale).

## Références

- `datafriday-web/docs/QUESTIONS_A_BERTRAND.md` question #20 (définition « event live »)
- [`LIVE_API_GUIDE.md`](../api/LIVE_API_GUIDE.md) §2
- BUG-028 (`docs/bugs/28_marktransactionasdeleted_no_op.md`) — soft-delete réel, mais scope limité
  au pipeline d'agrégation, pas à cette route
