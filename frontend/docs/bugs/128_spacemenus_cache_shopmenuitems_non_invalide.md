# BUG-128 — Cache Vuex `shopMenuItems` jamais invalidé après une écriture Space Menus (et jamais préchargé pour la recherche)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:349-361,636-679`,
  `src/store/modules/shopMenuItems.js:90-93`

## Symptôme

Après avoir activé/désactivé un menu item sur un shop depuis `/space-menus` (via
`ShopMenuItemsDrawer` ou `SpaceMenuItemView`), les autres écrans qui lisent le roster d'un shop via
`shopMenuItems/forShop` — `EventPredictView.vue` (dialogue de remap), `SpaceRestockView.vue`,
`useInventoryData.js` — continuent de servir la liste d'items **pré-édition** pendant jusqu'à 15
minutes (le TTL du cache). Symptôme concret : ajouter un item à un shop dans Space Menus, ouvrir
immédiatement le remap Event Predict pour ce même shop — l'item ajouté n'apparaît pas.

Séparément, la recherche "par nom d'article" de `SpaceMenuView.vue` (champ visible en vue "By
Shop") lit `this.$store.getters['shopMenuItems/forShop'](shop.id)` pour matcher le texte saisi
contre les noms d'articles — mais rien sur cet écran ne précharge ce cache pour les shops affichés
(seul `ShopMenuItemsDrawer` le peuple, et seulement pour un shop explicitement ouvert). Au premier
chargement de la page, cette recherche ne trouve donc jamais rien par nom d'article et retombe
silencieusement sur l'heuristique `shop.menuItemsCount > 0`, sans que l'utilisateur sache que sa
recherche textuelle n'a en réalité pas été appliquée.

## Cause racine

- `invalidateShopsCache()` (`SpaceMenuView.vue:636-644`), appelée par `onMenuItemsAttached`
  (`:646-661`) et `onMenuItemToggled` (`:663-679`) après chaque écriture, n'invalide que
  `spaceShops` (compteur d'items par shop) — jamais `shopMenuItems/invalidateForShop`
  (`store/modules/shopMenuItems.js:90-93`), le module qui porte réellement la liste détaillée
  d'items consommée par les autres écrans.
- Aucun appel à `shopMenuItems/fetchForShop` n'est déclenché pour les shops affichés en vue "By
  Shop" — seul un shop explicitement ouvert dans le drawer déclenche ce fetch.

## Correction

- Écriture : `invalidateShopMenuItemsCache(shopId)` (dispatch `shopMenuItems/invalidateForShop`)
  ajoutée en plus de `invalidateShopsCache()` dans `onMenuItemsAttached`/`onMenuItemToggled` —
  toute écriture Space Menus invalide désormais aussi le roster détaillé du shop, pas seulement
  son compteur.
- Lecture : la recherche par nom d'article sur la grille de shops n'a en réalité **aucune UI qui
  l'expose** — son champ (`menuItemQuery`) n'est visible qu'en vue "By Menu Item", où aucun shop
  n'est rendu (cf. [BUG-123](123_spacemenus_menuitemquery_filtre_residuel.md)). Plutôt que
  précharger un cache pour une fonctionnalité jamais réellement atteignable par un utilisateur, le
  filtre de `filteredShops` basé sur `shopMenuItems/forShop` a été retiré dans le cadre du fix
  BUG-123 — ce qui résout le gap de lecture en supprimant le code mort plutôt qu'en le rendant
  fonctionnel.

## Risque de régression / à surveiller

- Reproduire le scénario cross-écran : toggler un item dans Space Menus, vérifier que le remap
  Event Predict du même shop reflète immédiatement le changement (sans attendre le TTL).
- Vérifier que le préchargement pour la recherche ne déclenche pas une rafale de requêtes
  redondantes lors de la frappe (le registre `inflight` du store doit dédupliquer).

## Références

- Module `shopMenuItems.js` documenté dans `docs/modules/04_MENU_CATALOGUE.md:257-265` — son
  fonctionnement interne (cache `inflight`, clé `${shopId}::${configId}`) est correct et n'est pas
  en cause ici ; le défaut est côté appelant (`SpaceMenuView.vue`), qui n'invalide/précharge pas.
