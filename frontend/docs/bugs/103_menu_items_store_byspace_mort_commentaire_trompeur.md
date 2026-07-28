# BUG-103 — `menuItems.js` : cache `bySpace`/`fetchMenuItemsForSpace` entièrement mort, commentaire trompeur

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/store/modules/menuItems.js:13-16,23-27,48-61,97-115`

## Symptôme

Le commentaire du fichier affirme explicitement : *"utilisé par SpaceMenuView pour éviter de
charger tout le catalogue"*. C'est faux, et induit en erreur tout dev futur qui chercherait un
consommateur inexistant.

## Cause racine

`grep -rn "fetchMenuItemsForSpace" src` ne retourne que la définition. `grep -rn
"menuItems.bySpace\|menuItems/forSpace\|menuItems/isSpaceCacheValid" src` : zéro résultat.
Vérification directe de `SpaceMenuView.vue` : elle lit ses menu items via un autre endpoint
(`space-menus.controller.ts`), pas via ce store. Toute la logique `bySpace`/`SET_SPACE_ROWS`/
`SET_SPACE_FETCHING`/`INVALIDATE_SPACE`/`forSpace`/`isSpaceCacheValid` (~30 lignes) est du code
mort, probablement une fonctionnalité prévue puis remplacée par l'endpoint dédié
`space-menus.controller.ts` sans que ce bloc ne soit retiré.

## Correction

Bloc `bySpace` (state, 2 getters, 3 mutations, 1 action) supprimé du module.

## Risque de régression / à surveiller

Aucun — zéro consommateur confirmé par grep avant suppression.

## Références

- Aucune.
