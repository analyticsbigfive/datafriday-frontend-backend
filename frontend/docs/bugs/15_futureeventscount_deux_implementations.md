# BUG-015 — futureEventsCount : deux implémentations divergentes

- **Statut** : 🟢 Corrigé (constaté le 2026-07-22)
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

2026-07-22 : constaté que l'implémentation store (`analyse.js:1512-1519` au moment du diagnostic)
n'existe déjà plus dans le code actuel — supprimée entre-temps par un commit antérieur non lié à
cette fiche (grep exhaustif de `futureEventsCount` : zéro occurrence dans `analyse.js`, zéro
appelant externe). Seule la version vivante `AnalyseView.vue:1227` subsiste désormais — c'est
exactement l'état cible visé par cette fiche, aucune action de code nécessaire.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #10
