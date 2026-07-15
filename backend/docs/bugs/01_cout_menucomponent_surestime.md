# BUG-001 — Coût MenuComponent surestimé d'un facteur numberOfUnitsRecipe

- **Statut** : 🔴 Ouvert (documenté, non corrigé par choix — décision du 2026-07-15)
- **Sévérité** : 🔴 Bloquant/impact business (marge et coût faux)
- **Domaine** : Menu & recettes (Catalogue)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (fix), `datafriday-web` (affichage déjà correct)
- **Découvert le** : 2026-07-15
- **Fichiers** : `menu-components.service.ts:196-236` (`computeComponentUnitCost`), `menu-items.service.ts:1400-1409`

## Symptôme

Tout `MenuItem` utilisant un `MenuComponent` avec `numberOfUnitsRecipe > 1` (une recette qui
produit plusieurs unités) affiche un coût et une marge faux — surestimés d'un facteur
`numberOfUnitsRecipe`. Impact visible dans les fiches produit, les rapports de marge, et Analyse.

## Cause racine

`computeComponentUnitCost` (`menu-components.service.ts:196-236`) calcule
`Σ(unitCost_ligne × quantité_ligne)` sans diviser par `numberOfUnitsRecipe` : le `unitCost`
réellement persisté en base = coût de **toute la fournée**, pas le coût unitaire. Cette valeur
alimente ensuite directement `MenuItem.totalCost` (`menu-items.service.ts:1400-1409` :
`lineTotal = componentUnitCost × numberOfUnits`).

Piège supplémentaire : le formulaire live `ComponentCreateView.vue:560-578` calcule bien
`finalUnitCost = subItemsCost / numberOfUnitsRecipe` (division correcte, affichée à l'écran) —
mais cette valeur affichée ne correspond pas à ce qui est réellement stocké, puisque le backend
recalcule et écrase à la sauvegarde. Un vieil endpoint `repair()`
(`menu-components.service.ts:581-610`) fait, lui, la multiplication inverse mais sur un champ JSON
legacy (`subComponents`) quasi mort.

## Correction

Aucune à ce jour. Décision du 2026-07-15 (revue `datafriday-web/docs/modules`) : documenté mais non
corrigé dans l'immédiat, un chantier de correction dédié est à planifier séparément.

## Risque de régression / à surveiller

Corriger `computeComponentUnitCost` implique un **script de backfill** pour recalculer tous les
`MenuItem.totalCost` existants qui dépendent d'un `MenuComponent` à `numberOfUnitsRecipe > 1` —
sans ce backfill, le fix seul ne corrige pas les données déjà fausses en base.

## Références

- `datafriday-web/docs/modules/04_MENU_CATALOGUE.md` §"Bugs actifs confirmés"
- `datafriday-web/docs/modules/00_INDEX.md`
