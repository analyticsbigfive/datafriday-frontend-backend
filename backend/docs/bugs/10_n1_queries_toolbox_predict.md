# BUG-010 — Requêtes N+1 dans le toolbox Event Predict

- **Statut** : 🔴 Ouvert (analysé, non corrigé)
- **Sévérité** : 🟡 Mineur/perf
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-07

## Symptôme

Latence anormale sur le toolbox Event Predict.

## Cause racine

Deux patterns N+1 identifiés lors d'un audit statique :
- `event-timeline` interrogé par id unique en boucle au lieu d'un appel batch.
- `shopMenuItems` / `fetchForShop` refait un fetch granulaire dupliqué de données déjà chargées
  ailleurs.

## Correction

Aucune — audit statique seulement, pas de fix appliqué à ce jour.

## Risque de régression / à surveiller

—

## Références

- Audit perf toolbox Event Predict (analyse statique, 2026-07-07)
