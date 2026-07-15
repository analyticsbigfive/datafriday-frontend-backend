# BUG-018 — Props morts hérités du port React (Builder v1)

- **Statut** : 🔴 Ouvert
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

Aucune à ce jour — nettoyage de dette, pas de fonctionnalité manquante active.

## Risque de régression / à surveiller

Ne pas prendre ces props comme un contrat vivant si vous étendez ces composants.

## Références

- `docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #6
