# BUG-033 — Event.revenue/transactionCount/avgSpendPerTx/perCapita/calculatedAt ne sont jamais écrits

- **Statut** : 🔴 Ouvert
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

Aucune à ce jour.

## Risque de régression / à surveiller

Si un futur écran consomme cet endpoint sans le savoir, il affichera des zéros silencieux — vérifier
ce bug avant de câbler `getAnalyseKpisEvents` côté front.

## Références

- `datafriday-web/docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #2
