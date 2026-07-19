# BUG-162 — MarketPrice : `selectedTypeId`/`selectedCategoryId` résolus par nom, pas par la FK chargée

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels (Configurations — Good Types/Categories)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/components/menu-fb/views/market-prices/drawers/MarketPriceEditDrawer.vue:371-376`
  - `src/components/menu-fb/views/market-prices/drawers/MarketPriceCreateDrawer.vue:852-855`

## Symptôme

`selectedTypeId`/`selectedCategoryId` sont recalculés à chaque rendu en cherchant, dans la liste
mise en cache du store, l'entrée dont le `name` correspond au texte affiché (`this.form.goodType`/
`category`) — jamais en réutilisant le `marketPriceTypeId`/`marketPriceCategoryId` initialement
chargé depuis l'API. La valeur ainsi résolue est ensuite envoyée telle quelle à la sauvegarde
(`MarketPriceEditDrawer.vue:589-592`, `MarketPriceCreateDrawer.vue:1296-1299`).

## Cause racine

Exactement le pattern déjà diagnostiqué et corrigé ailleurs dans ce domaine :
[BUG-62](62_component_taxonomie_fk_resolution_fragile_par_nom.md) (`ComponentCreateView.vue`) et
[BUG-81](81_menu_items_fk_taxonomie_resolue_par_nom.md) (`MenuItemCreateView.vue`) — deux entrées
homonymes dans la taxonomie du tenant (ou un cache périmé/dupliqué) peuvent faire résoudre le
mauvais id au moment de la sauvegarde. Jamais corrigé sur les drawers MarketPrice.

## Correction

Reste à faire : appliquer le même correctif que BUG-62/81 — capturer et réutiliser le FK
initialement chargé (`raw.marketPriceTypeId`/`marketPriceCategoryId`) plutôt que de le re-résoudre
par nom à chaque rendu.

## Risque de régression / à surveiller

Voir le "Risque de régression" des fiches BUG-62/81 — même classe de risque (deux entrées de
taxonomie au même nom dans le même tenant).

## Références

- [BUG-62](62_component_taxonomie_fk_resolution_fragile_par_nom.md)
- [BUG-81](81_menu_items_fk_taxonomie_resolue_par_nom.md)
- [`backend/docs/bugs/83_marketprice_goodtype_category_desync_rename_delete.md`](../../../backend/docs/bugs/83_marketprice_goodtype_category_desync_rename_delete.md) — cause racine côté backend qui rend ce pattern par nom particulièrement fragile (le texte peut désynchroniser de la taxonomie active).
