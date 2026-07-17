# BUG-096 — `SpaceSelectionDrawer.vue` : fichier orphelin de 361 lignes, jamais importé

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/SpaceSelectionDrawer.vue`

## Symptôme

Aucun symptôme visible côté utilisateur — piège potentiel pour un futur lecteur du dossier
`menu-items/drawers/`.

## Cause racine

`grep -rn "SpaceSelectionDrawer" src` ne retourne que sa propre déclaration `name:
'SpaceSelectionDrawer'` (ligne 108) — aucun import ailleurs. `MenuItemCreateView.vue` utilise
`SpaceGroupDrawer` en mode `selectable` pour le même besoin. `SpaceSelectionDrawer` semble être une
version antérieure abandonnée, avec en plus une gestion de `localPrices`/`setPrice` qui ne
correspond plus au modèle actuel (les prix par espace sont gérés séparément via
`form.spacePrices` dans `MenuItemCreateView.vue`, pas via ce drawer).

## Correction

Fichier supprimé. Aucun import à retirer ailleurs (déjà confirmé zéro consommateur).

## Risque de régression / à surveiller

Aucun — un fichier jamais importé ne peut pas casser un flux existant en le retirant.

## Références

- [[83_menu_items_formdrawer_orphelin_code_mort]] (même situation sur `MenuItemFormDrawer.vue`).
