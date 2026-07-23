# BUG-110 — `deriveSalesRaw` (Logistic) ne filtre pas `SalesTransaction.deletedAt`

- **Statut** : 🟢 Corrigé (2026-07-23)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock (Logistic) / Live events
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-23 (préparation du v2 du module Live, en note de marge de BUG-108) ; corrigé le même jour
- **Fichiers** : `src/features/logistics/logistics.service.ts:997-1033` (`deriveSalesRaw`)

## Symptôme

Une transaction Weezevent annulée après coup (webhook `delete`, `WebhookEventHandler.
handleTransactionEvent` → `markTransactionAsDeleted`) continue de décrémenter le stock affiché sur
l'écran Logistic — le stock courant par élément (`getStock`, `levels` + `consumption`) sous-estime
ce qui reste réellement en rayon.

## Cause racine

Même trou que BUG-108, dans un fichier différent : `deriveSalesRaw` (`logistics.service.ts:1008-1033`)
lit `WeezeventTransaction`/`WeezeventTransactionItem` en SQL brut, filtre `t."status" = 'V'` mais pas
`deletedAt`. Non couvert par le fix de BUG-108 (scopé à `getEventTimelineBatch` dans
`spaces.service.ts`) — trouvé en cherchant, pour la conception du v2 du module Live (Inventaire live,
question #22 du tracker front), si ce calcul pouvait être réutilisé tel quel.

## Correction

Ajouté `AND t."deletedAt" IS NULL` à la clause `WHERE` de `deriveSalesRaw`, au même niveau que
`AND t."status" = 'V'`. Docstring de la méthode mise à jour avec la référence croisée à BUG-108.

## Risque de régression / à surveiller

Aucun — resserre la requête vers le comportement déjà voulu ailleurs (event-timeline depuis
BUG-108, pipeline d'agrégation depuis BUG-028). Le stock affiché sur Logistic peut légèrement
remonter pour tout élément ayant eu une vente annulée depuis la dernière réconciliation — attendu,
pas une régression.

## Références

- BUG-108 (`docs/bugs/108_event_timeline_deletedat_non_filtre.md`) — même trou, sur
  `getEventTimelineBatch`
- BUG-028 (`docs/bugs/28_marktransactionasdeleted_no_op.md`) — soft-delete réel, jamais élargi à
  tous les lecteurs directs de `WeezeventTransaction`
- [`LIVE_API_GUIDE.md`](../api/LIVE_API_GUIDE.md) §3.1 — trouvé en évaluant la réutilisation de ce
  calcul pour le v2 du module Live
