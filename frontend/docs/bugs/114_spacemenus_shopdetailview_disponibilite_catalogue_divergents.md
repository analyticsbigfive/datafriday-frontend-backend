# BUG-114 — ShopDetailView.vue : disponibilité et chargement catalogue divergents du reste du feature

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/ShopDetailView.vue:421-465, 540-573`

## Symptôme

Sur `/space-menus/:spaceId/shops/:shopId`, les onglets "Available"/"Not Available" reposent sur un
calcul de disponibilité différent — et potentiellement contradictoire — de celui affiché ailleurs
dans le même feature (drawer `ShopMenuItemsDrawer`, vue "By Menu Item"). Un article peut apparaître
disponible ici et indisponible dans le drawer, ou l'inverse. La liste des items sélectionnables
inclut aussi des articles d'espaces totalement différents de celui du shop consulté.

## Cause racine

Deux écarts dans `ShopDetailView.vue` :

1. `loadAllMenuItems()` (`:540-573`) appelle `getAllMenuItems()` **sans `spaceId`** —
   `getAllMenuItems(spaceId = null)` (`src/api/endpoints/menu-item.api.js:36-64`) documente
   explicitement : *« Si fourni, ne charge que les articles vendus dans cet espace... sans ce
   filtre, on paginait sur l'intégralité du catalogue tenant avant de filtrer côté client »*.
   `ShopDetailView.vue` fait exactement ce que ce commentaire déconseille.
2. `normalizeMenuItem()` (`:421-465`) calcule `available` avec une règle ad-hoc :
   `item?.readyForSale === "Yes" || item?.available === true || item?.isAvailable === true` —
   sur des données brutes du catalogue tenant (`getAllMenuItems`), sans aucun calcul serveur
   d'ingrédients/fournisseur/espace. `SpaceMenuItemView.vue:159-161` (même feature) utilise
   `item?.available === true` sourcé de `getSpaceMenuItemsWithAvailability` — le calcul serveur
   réel (ingrédients actifs + fournisseur résolu + fournisseur livrant l'espace), avec un
   commentaire rejetant explicitement « l'ancien calcul local » pour incohérence.

## Correction

`ShopDetailView.vue` réutilise désormais le même client que `ShopMenuItemsDrawer.vue` pour charger
les items disponibles pour CE shop — `getShopAvailableMenuItems(shopId, configId)`
(`menu.api.js`), qui renvoie déjà la disponibilité calculée côté serveur (mêmes règles que le
drawer) et exclut nativement les items d'autres espaces. `getAllMenuItems()`
(catalogue tenant complet non scopé) n'est plus utilisé sur cet écran. `attachedMenuItems`/
`allAvailableMenuItems` dérivent désormais du même contrat `{ id, name, category, price, image,
available, enabled, missingIngredients }` que le drawer.

## Risque de régression / à surveiller

- Vérifier qu'un item disponible/indisponible affiché dans `ShopMenuItemsDrawer` pour un shop
  s'affiche de façon identique sur `ShopDetailView.vue` pour le même shop.
- Vérifier qu'aucun item d'un autre espace n'apparaît plus dans la liste "disponibles".

## Références

- [BUG-113](113_spacemenus_shopdetailview_orpheline_attach_factice.md) — même fichier, action
  "Attacher" non fonctionnelle.
