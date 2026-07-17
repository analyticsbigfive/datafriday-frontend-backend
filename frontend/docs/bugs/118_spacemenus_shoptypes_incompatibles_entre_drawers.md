# BUG-118 — Deux tiroirs éditent les "types de shop" avec des noms de champ incompatibles → écrasement silencieux

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/drawers/SpaceMenuEditShopDrawer.vue:159-166,172-173,205-209`,
  `src/components/menu-fb/views/space-menus/drawers/ShopDetailEditDrawer.vue:178-186,221-226`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:445-470` (`normalizeShop`)

## Symptôme

Ouvrir le tiroir d'édition d'un shop depuis `SpaceMenuView.vue` (icône crayon sur la carte shop,
`SpaceMenuEditShopDrawer`) et cliquer "Save Changes" **sans toucher aux pills de type** écrase
silencieusement les types réels du shop (ex. `Beer`, `GP Premium`) par la valeur par défaut
`['food', 'beverages']`. L'utilisateur qui venait juste changer l'image perd la configuration de
type du shop sans aucun avertissement.

## Cause racine

`SpaceMenuEditShopDrawer.vue:172-173` lit `this.shop.selectedTypes` pour initialiser le formulaire :
```js
this.form = { ...this.shop, selectedTypes: this.shop.selectedTypes || ['food', 'beverages'] };
```
Mais `normalizeShop()` (`SpaceMenuView.vue:445-470`) — la seule fonction qui construit les objets
`shop` passés à ce tiroir — ne définit **jamais** de champ `selectedTypes` (seulement
`id/name/image/location/address/city/country/type/isOpen/menuItemsCount/_raw`). `shop.selectedTypes`
est donc toujours `undefined`, et le tiroir retombe **systématiquement** sur le défaut codé en dur,
quel que soit le type réel du shop. Le `save()` (`:200-216`) PATCHe ensuite ce défaut vers le
backend.

En parallèle, `ShopDetailEditDrawer.vue` édite le *même concept* sous un nom de champ et des
valeurs différents : `subTypes` avec les valeurs `Food/Beverages/Beer/GP Premium/Temporary/Drinkee`
(casse capitalisée), contre `selectedTypes` avec `food/beverages/beer/gp_premium/temporary/drinkee`
(minuscules/snake_case) côté `SpaceMenuEditShopDrawer`. Les deux tiroirs ne peuvent jamais lire ce
que l'autre a écrit — la duplication de code entre les deux (~70% identique, cf. BUG-121) a laissé
diverger leurs contrats de données sans que personne ne s'en aperçoive.

## Correction

`SpaceMenuEditShopDrawer.vue` aligné sur le contrat réel du backend/du shop (`subTypes`, valeurs
capitalisées `Food/Beverages/Beer/GP Premium/Temporary/Drinkee`, identique à
`ShopDetailEditDrawer.vue`) : le formulaire lit et écrit désormais `shop.subTypes` au lieu de
`shop.selectedTypes`, sans valeur par défaut arbitraire qui écraserait un type existant non lu.

## Risque de régression / à surveiller

- Vérifier qu'un shop avec un type existant (`Beer`, `Temporary`, etc.) garde bien ce type après un
  save "sans y toucher" depuis `SpaceMenuEditShopDrawer`.
- Vérifier que les types édités depuis `SpaceMenuEditShopDrawer` sont bien lus/affichés
  correctement par `ShopDetailEditDrawer` sur le même shop, et réciproquement.

## Références

- [BUG-121](121_spacemenus_drawers_i18n_darkmode_incomplet.md) — dette de duplication entre les 2 tiroirs, cause racine de cette divergence.
