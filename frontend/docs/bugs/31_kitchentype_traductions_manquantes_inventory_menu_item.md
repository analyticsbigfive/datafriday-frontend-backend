# BUG-031 — Traductions "Kitchen Type" manquantes + design incohérent sur la carte Inventory Information (Menu Item)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (affichage)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue`, `src/i18n/translations.js`

## Symptôme

Sur `/menu-items/edit/:id`, avec `Ready for Sale = Yes`, la carte "Inventory Information"
affichait le label brut `menuItemCreate.kitchenType` au lieu d'un texte traduit, et le dropdown
associé apparaissait vide (aucune option visible au clic). Par ailleurs, le design de cette carte
(trois champs empilés Packaging Type / Number of Units / Kitchen Type) divergeait du format
utilisé pour la même notion "Inventory Information" ailleurs dans l'app (Market Prices, Component
Library), qui utilise un format "phrase" (ex. « X is stored in [packaging] of [qty] [unit]. »).

## Cause racine

`t()` (`src/i18n/translations.js`) normalise une clé pointée `menuItemCreate.kitchenType` en
`menuItemCreateKitchenType` (concaténation camelCase) avant de chercher une correspondance. Seules
des clés **non namespacées** `kitchenType` / `kitchenCentral` / `kitchenLocal` existaient (utilisées
ailleurs) — pas les clés `menuItemCreateKitchenType` / `KitchenCentral` / `KitchenLocal` attendues
par ce composant (`MenuItemCreateView.vue:757-761`, `kitchenTypeOptions`). Faute de correspondance,
`t()` retombe sur la clé brute, d'où l'affichage littéral et les options de select vides.

Par ailleurs, `packagingCategoryOptions` dérivait sa liste de `productCategories` filtrés par nom
contenant "packag", avec repli sur une liste statique (`['Bottle','Box',...]`) — au lieu de la
liste dynamique du store Vuex `packingTypes` déjà utilisée par Market Prices et Component Library,
ce qui produisait des valeurs différentes/incomplètes entre écrans pour le même référentiel de
packaging.

## Correction

- Ajout des clés `menuItemCreateKitchenType` / `menuItemCreateKitchenCentral` /
  `menuItemCreateKitchenLocal` (EN/FR) dans `translations.js`. Label renommé "Central or Local
  Kitchen" / "Cuisine Centrale ou Locale" (au lieu de "Kitchen"/"Cuisine") pour lever l'ambiguïté
  sur ce que représente le champ.
- Redesign de la carte "Inventory Information" (`MenuItemCreateView.vue`) au format phrase, aligné
  visuellement sur `MarketPriceEditSupplierDrawer.vue` : « {name} is stored in [Packaging ▾] of
  [Qty] [Kg/L/Pc ▾]. » + champ Kitchen conservé séparément en dessous (donnée réelle, sauvegardée
  côté backend sur `MenuItem.kitchenType`).
- `packagingCategoryOptions` lit désormais `$store.getters['packingTypes/packingTypes']` (même
  source que Market Prices / Component Library), avec repli sur l'ancienne logique si le store est
  vide.
- Ajout d'une option "+ Add Packaging" dans le select, ouvrant une popup dédiée
  (`src/components/menu-fb/views/menu-items/dialogs/CreatePackingTypeDialog.vue`, nouveau fichier),
  sur le même modèle que les popups Create Type / Create Category déjà présentes sur cette page.
- Le champ Unité (Kg/L/Pc) ajouté dans la phrase (`form.inventoryUnit`) est **volontairement
  frontend only** : `MenuItem` n'a pas de colonne backend équivalente (contrairement à
  `MenuComponent.unit` ou `MarketPrice.unit`) — décision prise avec l'utilisateur pour ne pas
  engager de migration Prisma dans le cadre de ce fix. Cette valeur n'est ni persistée, ni envoyée
  dans le payload create/update.

## Risque de régression / à surveiller

- Vérifier que `form.kitchenType`, `form.inventoryPackagingType` et `form.inventoryNumberOfUnits`
  se sauvegardent toujours correctement (comportement de sauvegarde inchangé, seul l'habillage
  visuel a changé).
- `form.inventoryUnit` n'est pas persisté : si un besoin métier de stocker réellement l'unité
  d'inventaire du Menu Item apparaît, prévoir une vraie colonne Prisma (ex. `inventoryUnit`) + DTO
  + migration côté `api-datafriday-staging` — actuellement purement cosmétique.
- Pas de test automatisé sur ce composant (pas de suite existante sur `MenuItemCreateView.vue`) —
  vérification faite manuellement via captures d'écran utilisateur, à re-tester après déploiement.

## Références

- Design de référence copié :
  `src/components/menu-fb/views/market-prices/drawers/MarketPriceEditSupplierDrawer.vue` et
  `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`.
- Bug voisin (même famille "Inventory Information") : [30](30_good_category_ecrase_watcher_race_market_price.md).
