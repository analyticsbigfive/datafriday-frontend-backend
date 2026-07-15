# BUG-015 — futureEventsCount : deux implémentations divergentes

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `analyse.js:1512-1519` (store, mort) vs `AnalyseView.vue:1126-1133` (composant, vivant)

## Symptôme

Un event ayant lieu le jour même de la consultation peut être compté différemment selon
l'implémentation consultée (`>` vs `>=`).

## Cause racine

Deux implémentations de `futureEventsCount` existent — une dans le store (a priori mort), une dans
le composant vivant — avec des conditions légèrement différentes.

## Correction

Aucune à ce jour — supprimer l'implémentation store si confirmée morte, garder une seule source.

## Risque de régression / à surveiller

Vérifier que le store est bien mort avant suppression (grep des appelants).

## Références

- `docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #10
