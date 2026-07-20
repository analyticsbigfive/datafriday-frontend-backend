# BUG-177 — Hydration des recettes : N fetchs détail `/menu-components/:id` en phase 2

- **Statut** : ⚪ Diagnostiqué (borné + arrière-plan ; vrai fix = dénormalisation backend)
- **Sévérité** : 🟡 Mineur/perf
- **Domaine** : Analyse & agrégation / Menu
- **Repo(s) concerné(s)** : les deux (fix cible côté backend)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/composables/useSpaceData.js:220-287`

## Symptôme

La LISTE `/menu-components` ne renvoie pas `subComponents` (seul le détail `/menu-components/:id` les porte). Pour la décomposition composant→ingrédients (Space Inventory / Restock, F6), la phase 2 fait donc **un fetch détail par composant** sans recette (borné `runWithConcurrency` 5, échec toléré).

## Cause racine

API liste non dénormalisée — déjà documenté (`docs/dejaFaits/menuItems.api.md`) ; le N+1 front est la compensation.

## Correction

Aucune cette session : le fan-out est en **arrière-plan** (ne bloque pas le premier rendu — objectif 300ms tenu sans y toucher), borné, et mémoïsé au niveau réponse. Vrai fix = le backend expose `subComponents` (ou un batch `?ids=`) sur la liste — à prioriser si le volume de composants croît.

## Risque de régression / à surveiller

Si le backend dénormalise un jour : retirer ce bloc d'hydration, pas le rustiner.

## Références

- `docs/dejaFaits/menuItems.api.md`, fiche 175 (même zone de code)
