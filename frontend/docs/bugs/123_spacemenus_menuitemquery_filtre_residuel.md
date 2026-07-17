# BUG-123 — SpaceMenuView.vue : la recherche "par article" continue de filtrer les shops après retour en vue "By Shop"

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:328-364`

## Symptôme

Basculer sur la vue "By Menu Item", taper "pizza" dans la recherche, puis rebasculer sur "By Shop" :
la grille des shops reste filtrée aux shops vendant de la pizza, alors que la barre de recherche
"By Shop" (vide, différente du champ précédent) ne montre aucun texte saisi. Résultat confus, avec
un nombre de shops réduit sans cause visible — seul le bouton clear (X) laisse deviner qu'un filtre
est encore actif.

## Cause racine

`filteredShops` (`:328-364`) applique inconditionnellement **les deux** filtres de recherche —
`searchQuery` (`:339-346`) et `menuItemQuery` (`:348-361`) — quel que soit `viewMode`, alors que
seul l'un des deux `<input>` est affiché à la fois selon le mode (`:83-95`). Le champ inactif garde
sa valeur en mémoire et continue de filtrer silencieusement.

## Correction

Le filtre par `menuItemQuery` est retiré de `filteredShops`. Ce computed (grille de shops + badge
"N shops" de la barre de recherche) reste piloté uniquement par `searchQuery` — le seul champ
visible en vue "By Shop". `menuItemQuery` n'a de sens que côté "By Menu Item" (filtrage des
articles eux-mêmes, géré séparément par `menuItemsForSpace`) et n'avait aucune raison de continuer
à influencer l'affichage des shops.

## Risque de régression / à surveiller

- Reproduire exactement le scénario : recherche par article en vue "By Menu Item", retour en vue
  "By Shop" — la liste complète des shops (filtrée uniquement par le statut ouvert/fermé et la
  recherche shop) doit réapparaître.

## Références

- Aucune.
