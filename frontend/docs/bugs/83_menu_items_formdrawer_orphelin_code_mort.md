# BUG-083 — `MenuItemFormDrawer.vue` : fichier orphelin de 976 lignes, jamais importé

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemFormDrawer.vue`

## Symptôme

Aucun symptôme visible côté utilisateur — piège pour un futur lecteur/éditeur du dossier
`menu-items/drawers/`, qui pourrait croire que ce drawer est le formulaire réellement utilisé (son
nom est trompeusement proche de `MenuItemCreateView.vue`, le vrai formulaire routé).

## Cause racine

`grep -rn "MenuItemFormDrawer" src` ne retourne que sa propre déclaration `name:
'MenuItemFormDrawer'` (ligne 346) — aucun import ailleurs dans le repo. Vérifié également côté
routes (`router/index.js`) : `/menu-items/create` et `/menu-items/edit/:id` pointent toutes les
deux vers `MenuItemCreateView.vue`, jamais vers ce drawer.

Ce fichier semble être une version antérieure/parallèle du formulaire de création, jamais branchée
ou abandonnée après l'arrivée de `MenuItemCreateView.vue` — il contient d'ailleurs plusieurs bugs
qui n'existent plus dans la version vivante (ex. `spaces`/`spacePrices` jamais envoyés au backend,
colonne Storage toujours vide en édition, `numberOfPiecesRecipe` sans champ de saisie) : la preuve
que les deux fichiers ont divergé sans que ce drawer ne soit maintenu.

## Correction

Fichier supprimé. Aucun import à retirer ailleurs (déjà confirmé zéro consommateur).

## Risque de régression / à surveiller

Aucun — un fichier jamais importé ne peut pas casser un flux existant en le retirant. Si un besoin
de "drawer rapide de création" (plus léger que le formulaire complet `MenuItemCreateView.vue`)
émerge un jour, repartir de `MenuItemCreateView.vue` plutôt que de ce fichier obsolète.

## Références

- Aucune.
