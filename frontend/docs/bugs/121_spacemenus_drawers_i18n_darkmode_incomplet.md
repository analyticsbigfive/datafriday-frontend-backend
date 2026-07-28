# BUG-121 — Tiroirs Space Menus : i18n contourné et dark mode incomplet

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/drawers/ShopMenuItemsDrawer.vue:120,139`,
  `src/components/menu-fb/views/space-menus/drawers/ShopDetailEditDrawer.vue` (fichier entier),
  `src/components/menu-fb/views/space-menus/views/ShopDetailView.vue:208-213`

## Symptôme

- `ShopMenuItemsDrawer.vue:139` : le bouton "Annuler" est codé en dur en français au milieu d'un
  fichier qui utilise `t()` partout ailleurs — un utilisateur en locale EN le voit malgré tout.
- `ShopMenuItemsDrawer.vue:120` : prix affiché `` `$${Number(item.price).toFixed(2)}` `` — format
  USD codé en dur au lieu du formatter EUR partagé (`useFormatters.js`).
- `ShopDetailEditDrawer.vue` : **aucun** `useI18n()`/`t()` dans tout le fichier — tous les textes
  sont en dur, mélangeant FR ("Modifier le shop") et EN ("Shop Image", "Cancel", "Save Changes")
  dans le même panneau.
- `ShopDetailEditDrawer.vue` accepte une prop `isDark` avec un bloc CSS `.sde-panel--dark` complet,
  mais son unique appelant (`ShopDetailView.vue:208-213`) ne lui passe jamais `:is-dark` — le
  tiroir rend toujours en clair, même en thème sombre. Une fois ce câblage ajouté, deux zones
  n'ont aucun override dark : la liste "Available in Configurations" (texte quasi-noir sur fond
  sombre) et la bannière d'erreur `.sde-error`. `SpaceMenuEditShopDrawer.vue` a le même trou sur
  sa carte `.smed-config-card`.

## Correction

- `ShopMenuItemsDrawer.vue` : "Annuler" passé par `t('cancel')` ; prix reformaté via
  `formatCurrency` (`useFormatters.js`).
- `ShopDetailEditDrawer.vue` : tous les textes en dur remplacés par `useI18n()`/`t()`.
- `ShopDetailView.vue` passe désormais `:is-dark="isDark"` à `ShopDetailEditDrawer` (nécessite
  d'abord le fix dark-mode de BUG-115 sur `ShopDetailView.vue` lui-même, qui introduit `isDark`).
- Overrides dark ajoutés pour `.sde-config-list`/`.sde-config-item__name`, `.sde-error` et
  `.smed-config-card`.

## Risque de régression / à surveiller

- Vérifier `ShopDetailEditDrawer` en thème clair ET sombre, notamment la section "Available in
  Configurations" et l'affichage d'une erreur de sauvegarde.

## Références

- [BUG-115](115_spacemenus_shopdetailview_dette_diverse.md) — dark mode/i18n de `ShopDetailView.vue`
  lui-même, prérequis pour que `:is-dark` soit disponible à passer au tiroir.
