# BUG-155 — Deux couches de cache timeline indépendantes (store vs module API)

- **Statut** : ⚪ Diagnostiqué (consolidation à planifier)
- **Sévérité** : 🟡 Mineur (mémoire ×2, risque d'incohérence de staleness)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/analyse.js` (`timelineCacheByEventId`, `loadTimelineForEvent`), `src/api/endpoints/space.api.js` (`_eventTimelineCache`), `src/composables/usePredictiveTimeline.js` (`restTimelineCache`)

## Symptôme

La même timeline minute d'un event peut vivre dans TROIS caches : le store (`timelineCacheByEventId`, via `loadTimelineForEvent` single-event), le module API (`_eventTimelineCache`, partagé single+batch) et le moteur predict (`restTimelineCache`, formes normalisées). Invalidation non coordonnée ; un event re-synchronisé côté backend peut être frais dans un cache et périmé dans un autre.

## Cause racine

Trois consommateurs arrivés à des époques différentes, chacun avec sa mémoïsation.

## Correction

Aucune cette session (risque de staleness subtile > gain, arbitrage ordre de dégradation de l'audit). Cible : faire du cache **module API** (`_eventTimelineCache`, qui porte déjà la dédup in-flight et sert single + batch) la seule couche réseau, et faire lire le store/predict à travers lui (leurs caches devenant de simples mémos de FORME, ou supprimés).

## Risque de régression / à surveiller

En attendant : toute invalidation de timeline doit penser aux trois couches.

## Références

- Fiches 150, 157
