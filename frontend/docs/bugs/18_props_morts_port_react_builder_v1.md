# BUG-018 — Props morts hérités du port React (Builder v1)

- **Statut** : 🟢 Corrigé (2026-07-22 — devenu sans objet : le frontend builder v1 entier a été
  retiré le même jour, voir [ADR-0002](../adr/0002_builder_v2_relationnel_seul.md))
- **Sévérité** : 🟢 Faible (code mort, pas de défaut fonctionnel)
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `SpaceBuilderViewRoute.vue` (data + template), `PropertiesPanelView.vue:1222-1223`, `ElevationBuilderView.vue:421-431,686`

## Symptôme

Aucun — props/callbacks jamais réellement branchés, no-op silencieux.

## Cause racine

Résidus du portage React (v1) : `menuItems`/`inventoryItems` (data toujours `[]`),
`allShopMenuItems`/`allMerchShopItems` (props jamais liées), `onHighlightElements`/
`onSearchQueryChange` (callbacks jamais fournis).

## Correction

2026-07-22 : supprimés — `allShopMenuItems`/`allMerchShopItems` (bindings dans
`SpaceBuilderViewRoute.vue` + déclarations de props dans `PropertiesPanelView.vue` et
`ElevationBuilderView.vue`, confirmées non lues ailleurs par grep exhaustif) et
`onHighlightElements` (prop + son appel guardé `this.onHighlightElements && ...` dans
`ElevationBuilderView.vue` — `this.highlightedElementIds = matchingIds` conservé, c'est le
mécanisme réel de surbrillance locale) et `onSearchQueryChange` (prop, zéro usage interne).
`onShowSearchResults` (prop voisine, non citée dans cette fiche) laissée en l'état — semble avoir le
même profil (zéro usage interne trouvé) mais hors du périmètre vérifié ici, à auditer séparément si
besoin. `inventoryItems`/`menuItems` (data `SpaceBuilderViewRoute.vue`) conservés tels quels : ils
alimentent aussi `available-menu-items`/`inventory-items`/`menu-items`, des props réellement
consommées (ex. `availableMenuItems` dans `PropertiesPanelView.vue`, utilisée dans
`buildConsolidatedInventory` et plusieurs `v-if`) — leur défaut (toujours `[]`, jamais peuplées) est
un bug fonctionnel distinct, non couvert par cette fiche.

## Risque de régression / à surveiller

Ne pas prendre ces props comme un contrat vivant si vous étendez ces composants.

## Références

- `docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #6
