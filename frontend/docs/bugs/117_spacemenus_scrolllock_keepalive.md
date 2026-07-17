# BUG-117 — Fuite du verrou de scroll body en quittant /space-menus (keep-alive) avec un drawer ouvert

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/drawers/ShopMenuItemsDrawer.vue:180-207`,
  `src/components/menu-fb/views/space-menus/drawers/SpaceMenuEditShopDrawer.vue:151-178`,
  `src/router/index.js:249`, `src/views/DashboardView.vue:288-301`

## Symptôme

Ouvrir un shop (`ShopMenuItemsDrawer`) ou cliquer Éditer (`SpaceMenuEditShopDrawer`) sur
`/space-menus`, puis naviguer ailleurs dans l'app (menu latéral) **sans refermer le tiroir** :
la page de destination reste bloquée en scroll (`body { overflow: hidden }` appliqué en permanence),
jusqu'à ce que l'utilisateur retourne manuellement sur `/space-menus` et referme le tiroir, ou
recharge la page. Reproductible à 100% en usage normal (pas besoin de scénario tordu).

## Cause racine

Les deux tiroirs verrouillent le scroll via `document.body.style.overflow = isOpen ? 'hidden' : ''`
dans un `watch: modelValue`, et ne le libèrent qu'au hook `beforeUnmount()`
(`ShopMenuItemsDrawer.vue:180-182`, `SpaceMenuEditShopDrawer.vue:151-153`). Or leur parent,
`SpaceMenuView.vue`, est déclaré `meta: { keepAlive: true }` (`router/index.js:249`) et rendu dans
un `<keep-alive>` (`DashboardView.vue:288-301`). Sur une route keep-alive, Vue déclenche
`deactivated()` à la navigation — **pas** `beforeUnmount()`, qui ne se déclenche jamais. Aucun des
deux tiroirs n'implémente `deactivated()`. Le verrou posé au `watch` n'est donc jamais retiré par
la navigation.

`ShopDetailEditDrawer.vue` (le 3ᵉ tiroir du feature) n'est **pas** concerné : son hôte
(`ShopDetailView.vue`, route `shop-detail`) n'a pas `keepAlive` dans ses meta, donc
`beforeUnmount()` s'y déclenche normalement.

## Correction

Les deux tiroirs concernés reçoivent un hook `deactivated()` qui relâche le verrou exactement comme
`beforeUnmount()` (`document.body.style.overflow = ''`), pour couvrir le cas keep-alive en plus du
cas démontage normal.

## Risque de régression / à surveiller

- Reproduire le scénario exact : ouvrir Space Menus, ouvrir un tiroir (shop ou édition), naviguer
  vers un autre écran sans fermer le tiroir — vérifier que le scroll fonctionne normalement sur
  l'écran de destination.
- Revenir sur `/space-menus` (le composant est réactivé) : vérifier que le tiroir garde son état
  correct (ouvert ou fermé selon ce qui a été laissé) sans double-verrouillage.

## Références

- Pattern déjà documenté ailleurs dans ce domaine (fiche `95_menu_items_spacegroupdrawer_scroll_lock_sans_compteur.md`,
  côté `/menu-items`) : verrou de scroll body sans compteur de référence, même famille de risque —
  ici aggravée par le keep-alive plutôt que par l'empilement de tiroirs.
