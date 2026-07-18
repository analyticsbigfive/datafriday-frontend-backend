# BUG-159 — Scoring predict entièrement client-side : 3-8s de calcul, incompatible avec un rendu < 300ms

- **Statut** : ⚪ Diagnostiqué (limitation d'architecture documentée ; mitigations en place)
- **Sévérité** : 🟡 Mineur (UX de calcul, pas de perte de données)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18 (formalisation)
- **Fichiers** : `src/composables/usePredictiveTimeline.js` (+ `src/utils/predictiveAnalytics*.js`), `src/store/modules/analyse.js:2007-2152` (`regeneratePredictions`)

## Symptôme

Le scoring/agrégation de prévision tourne dans le navigateur : 3-8s sur un espace réel (mesuré, commentaire en code), avec yield périodique du main thread (`await setTimeout(0)`) pour ne pas geler l'UI. L'objectif « contenu initial < 300ms » ne peut pas couvrir le PREMIER calcul d'une prévision.

## Cause racine

Choix d'architecture : moteur 100% front (aucun backend de scoring).

## Correction

Aucune cette session — mitigations déjà en place et renforcées par l'audit : mémo du résultat complet (`resultMemo`, revenir sur un event = restitution instantanée), mémo du scoring seul (`scoredEventsMemo`), cache timeline session + **batch prefetch** (fiche 157) qui supprime la part réseau du premier calcul. Pistes futures (non engagées) : Web Worker pour sortir le scoring du main thread ; persistance des `predictedRecords` par version (déjà en DB) comme affichage cache-first pendant le recalcul.

## Risque de régression / à surveiller

Les clés de mémo portent toutes les entrées qui changent le résultat — toute nouvelle entrée de calcul doit y être ajoutée sous peine de résultats périmés.

## Références

- Fiche 157 ; commentaires `[perf]` dans `analyse.js:2150`
