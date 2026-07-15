# BUG-017 — useIsoProjection.js dupliqué dans IsoView.vue

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Faible (duplication de code, pas de défaut fonctionnel observé)
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `IsoView.vue:556-657` vs `useIsoProjection.js:120-194`

## Symptôme

Aucun défaut fonctionnel observé — c'est une dette de duplication.

## Cause racine

Les fonctions de dessin (`drawBox` et consorts) sont réimplémentées inline dans `IsoView.vue` au
lieu de réutiliser `boxFaces()` du composable `useIsoProjection.js` — deux copies à maintenir en
parallèle.

## Correction

Aucune à ce jour — factoriser `IsoView.vue` pour réutiliser le composable.

## Risque de régression / à surveiller

Toute correction de rendu isométrique doit être appliquée aux deux endroits tant que la
duplication n'est pas résolue.

## Références

- `docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #5
