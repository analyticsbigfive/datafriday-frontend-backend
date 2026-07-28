# BUG-127 — SpaceMenuView/SpaceMenuItemView : nettoyages mineurs (code mort + recalcul O(P×S) non mémoïsé)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:195,205,273-281,294-302,304-307`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuItemView.vue:173-176`

## Symptôme / Cause racine

Deux petits points relevés lors de l'audit, sans lien de cause entre eux :

1. **Code mort dans `SpaceMenuView.vue`** : l'icône `Save` (import `lucide-vue-next` + enregistrement
   composant, `:195,205`) n'est référencée nulle part dans le template ; 3 `computed` —
   `selectedSpaceRaw` (`:273-281`), `selectedConfigRaw` (`:294-302`), `currentConfigName`
   (`:304-307`) — ne sont lus ni par le template ni par aucune méthode.
2. **`shopsWithMenuItem(menuItemId)` recalculée en O(P×S) à chaque rendu** (`SpaceMenuItemView.vue:173-176`) :
   une méthode (pas un `computed` mémoïsé) qui fait `this.shops.filter(...)`, appelée une fois par
   carte article pour le badge de compteur (`:73`) et deux fois de plus par shop quand une carte
   est dépliée (`:88,107`) — pour P articles × S shops, c'est un travail de filtrage O(P×S)
   potentiellement rejoué à chaque re-rendu déclenché par un toggle (`pendingToggles`/
   `menuAssignmentMap` réactifs).

## Correction

- Import/enregistrement de l'icône `Save` et les 3 `computed` inutilisés supprimés de
  `SpaceMenuView.vue`.
- `shopsWithMenuItem` remplacée par un `computed` `shopsByMenuItemId` (Map indexée une seule fois
  à partir de `menuAssignmentMap`/`shops`), consulté en O(1) par les 3 sites d'appel au lieu d'un
  filtre O(S) répété.

## Risque de régression / à surveiller

- Vérifier que le compteur "N/S shops" et la liste dépliée des shops par article restent corrects
  après un toggle (le `computed` doit rester réactif aux changements de `menuAssignmentMap`).

## Références

- Aucune.
