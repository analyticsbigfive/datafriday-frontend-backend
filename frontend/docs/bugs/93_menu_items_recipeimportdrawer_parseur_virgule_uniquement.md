# BUG-093 — RecipeImportDrawer : parseur CSV virgule uniquement, message "CSV vide" trompeur

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/RecipeImportDrawer.vue:191-219,182,204`

## Symptôme

Un CSV exporté par Excel FR (délimiteur `;`, format très courant) produit des lignes à une seule
colonne ; aucun header ne matche `plat`/`ingredient`/etc., donc `rows` est vide et l'utilisateur
voit "CSV vide ou colonnes inattendues" alors que le fichier contient bien des données.

## Cause racine

`split()` ne teste que `c === ','` (ligne 204) — aucune détection/support du `;`.

## Correction

Détection automatique du délimiteur (comptage `,` vs `;` sur la ligne d'en-tête, le plus fréquent
gagne), avec support des deux. Le message d'erreur distingue désormais explicitement "fichier
vide" de "colonnes non reconnues" plutôt qu'un message générique unique.

## Risque de régression / à surveiller

Tester avec un CSV FR export Excel (`;`) et un CSV export Google Sheets (`,`) pour confirmer que
les deux sont bien reconnus après le fix.

## Références

- [[84_menu_items_csv_parsing_casse_guillemets]] (bug de parsing CSV jumeau sur
  `MenuItemCsvImportDrawer.vue`).
