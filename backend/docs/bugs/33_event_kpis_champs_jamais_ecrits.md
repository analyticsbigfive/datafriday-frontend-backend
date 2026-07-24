# BUG-033 — Event.revenue/transactionCount/avgSpendPerTx/perCapita/calculatedAt ne sont jamais écrits

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur — pipeline mort-à-la-source, pas de widget visible cassé aujourd'hui
- **Domaine** : Événements / Analyse
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `events.service.ts` (aucune écriture de ces champs), `analyse.service.ts:79-104`, `analyse.api.js:44-49` (0 appelant front)

## Symptôme

`GET /analyse/kpis/events` additionne ces champs en supposant qu'ils sont peuplés → retourne
structurellement `totalRevenue=0`/`avgRevenue=0`/`totalTransactions=0` pour tout tenant.

## Cause racine

`events.service.ts` n'écrit jamais `revenue`/`transactionCount`/`avgSpendPerTx`/`perCapita`/
`calculatedAt` sur `Event`. Nuance : zéro composant frontend n'appelle `getAnalyseKpisEvents` (grep
exhaustif) — ce n'est donc pas un widget visible cassé aujourd'hui, mais un pipeline mort-à-la-
source si jamais câblé côté front.

## Correction

**Correction appliquée** (2026-07-24) : `AggregationService.executeProcessEvents`
(`src/features/aggregation/aggregation.service.ts:358-374`) écrit désormais `Event.revenue`,
`Event.transactionCount` et `Event.calculatedAt` à chaque passage d'agrégation, juste après avoir
alimenté `SpaceRevenueMinuteAgg` pour l'event. Calcul : réutilisation telle quelle de l'agrégat déjà
prouvé correct ailleurs dans ce même service (`getEventStats`, `aggregation.service.ts:736-740`) —
`SUM(revenueHt)` / `SUM(transactionsCount)` sur `SpaceRevenueMinuteAgg` filtré par
`tenantId/spaceId/weezeventEventId`, sans nouvelle logique de calcul. `revenue`/`transactionCount`
sont écrits à `0` (pas `null`) quand l'event n'a aucune vente agrégée, pour rester cohérent avec la
sémantique "calculé" de `calculatedAt`.

`avgSpendPerTx` et `perCapita` restent **non écrits** — hors scope de cette correction : aucune
formule pour `perCapita` n'est établie ailleurs dans le code (dépendrait de `ticketsSold`/
`ticketsScanned`, non fiabilisés), donc non répliquée pour éviter d'inventer un calcul non prouvé.

Confirmation (re-vérifiée à la date de correction) : `grep -rn "getAnalyseKpisEvents" frontend/src`
ne retourne toujours aucun résultat — zéro composant frontend n'appelle
`GET /analyse/kpis/events` aujourd'hui. Cette correction ne change donc aucun comportement
observable actuellement ; elle rend correctes des données qui étaient jusqu'ici mortes-à-la-source.

Test : `src/features/aggregation/aggregation.service.spec.ts` — 2 nouveaux cas dans
`describe('executeProcessEvents')` : "écrit Event.revenue/transactionCount depuis le rollup
SpaceRevenueMinuteAgg (BUG-033)" et le cas `revenue=0`/`transactionCount=0` sans vente. Suite
complète : `npx jest src/features/aggregation/aggregation.service.spec.ts` → 41/41 passed.

## Risque de régression / à surveiller

Si un futur écran consomme cet endpoint sans le savoir, il affichera des zéros silencieux — vérifier
ce bug avant de câbler `getAnalyseKpisEvents` côté front.

## Références

- `datafriday-web/docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #2
