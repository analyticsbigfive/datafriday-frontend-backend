# BUG-180 — (miroir) Moteur predict : N GET single event-timeline alors que le batch existait

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟠 Majeur/perf (chargement de la vue predict)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : les deux — **fiche canonique : `api-datafriday-staging/docs/bugs/10_n1_queries_toolbox_predict.md`**
- **Découvert le** : 2026-07-07 (backend BUG-010) ; fix front 2026-07-18
- **Fichiers** : `src/composables/usePredictiveTimeline.js` (`prefetchEventTimelinesBatch`, boucle `runWithConcurrency`)

## Symptôme

Le scoring predict fetchait la timeline de chaque event passé comparable (jusqu'à ~10) via le endpoint **single** `GET /spaces/:id/event-timeline/:eventId` (pool borné 5), alors que le batch `?eventIds=` (1 requête, ownership/shopIds résolus une fois, VALUES-CTE) existait déjà et était utilisé ailleurs (`useAnalyseItemRecords`).

## Cause racine

Le moteur a précédé le batch et n'a jamais migré.

## Correction

2026-07-18 : `prefetchEventTimelinesBatch(eventIds)` préchauffe `restTimelineCache` en **1 requête batch** avant la boucle (exclut les events servis par le granular local / le cache / un fetch en vol) ; la boucle single-event existante devient un no-op réseau (cache hit), et reste le **fallback** intact si le batch échoue. Mapping de normalisation factorisé (`mapRestTimelineRow`) — single et batch produisent la même forme. Prérequis réglé : nettoyage in-flight du batch sur rejet (fiche 173).

## Risque de régression / à surveiller

Le batch ne cache aussi les réponses vides `[]` que via ce prefetch (le single ne fige pas les vides) — acceptable : périmètre session, events passés immuables. Staging : onglet réseau = 1 requête timeline pour un event futur à 10 comparables (vs 10).

## Références

- `api-datafriday-staging/docs/bugs/10_n1_queries_toolbox_predict.md` (canonique), fiche 173
