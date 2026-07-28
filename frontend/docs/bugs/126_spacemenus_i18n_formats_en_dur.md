# BUG-126 — i18n contourné et formats en dur sur SpaceMenuItemView/SpaceMenuShopView/SpaceMenuView

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuItemView.vue:26-27,67,82,206`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuShopView.vue:90`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:389`

## Symptôme

Plusieurs textes en dur (en français) subsistent dans des fichiers qui utilisent `t()` partout
ailleurs :
- `SpaceMenuItemView.vue:26-27` : « Aucun menu item » / « Aucun menu item n'est rattaché à cet
  espace. » ;
- `SpaceMenuItemView.vue:82` : « Aucun shop disponible » ;
- `SpaceMenuItemView.vue:206` : fallback d'erreur `'Erreur lors de la mise à jour'`, non passé
  par `t()` ;
- `SpaceMenuShopView.vue:90` : « Shops par page : » ;
- `SpaceMenuView.vue:389` : fallback de catégorie `'Sans catégorie'`.

De plus, `SpaceMenuItemView.vue:67` affiche les prix en `` `${{ Number(...).toFixed(2) }}` `` —
format `$` à 2 décimales, incohérent avec le formatter EUR partagé (`useFormatters.js`) utilisé
ailleurs dans le domaine `menu-fb`.

## Correction

Les 5 chaînes en dur remplacées par `t()` avec des clés `spaceMenu.*` (créées si absentes du
dictionnaire). Le prix de `SpaceMenuItemView.vue:67` reformaté via `formatCurrency`
(`useFormatters.js`), cohérent avec le reste du feature.

## Risque de régression / à surveiller

- Vérifier l'affichage en FR et EN des états vides de `SpaceMenuItemView`/`SpaceMenuShopView`.

## Références

- [BUG-115](115_spacemenus_shopdetailview_dette_diverse.md), [BUG-121](121_spacemenus_drawers_i18n_darkmode_incomplet.md) — même famille de dette (i18n/formatage) sur les autres fichiers du feature.
