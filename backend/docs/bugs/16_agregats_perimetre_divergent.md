# BUG-016 — SpaceProductRevenueDailyAgg et SpaceRevenueMinuteAgg divergent en périmètre

- **Statut** : 🟢 Corrigé par ricochet (2026-07-21)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; refermé le 2026-07-21
- **Fichiers** : `aggregation.service.ts:284-348`

## Symptôme

Sommer les deux tables pour le même event/tenant sur un espace avec des ventes non mappées à un
MenuItem donne deux totaux différents.

## Cause racine

`SpaceProductRevenueDailyAgg` inclut les ventes de produits non mappés à un `MenuItem`,
`SpaceRevenueMinuteAgg` les exclut (INNER JOIN) — deux tables censées décrire le même historique
divergent en périmètre sans que ce soit documenté ni intentionnel.

## Correction

Refermé par ricochet du fix BUG-014 (2026-07-20, même session) : la JOIN INNER vers
`WeezeventProductMapping` qui excluait les ventes non mappées de `SpaceRevenueMinuteAgg` a été
remplacée par un LEFT JOIN vers `WeezeventLocationShopMapping` (la vraie source du
`spaceElementId`). Conséquence directe, non recherchée à l'époque mais vérifiée le 2026-07-21 :
plus aucune exclusion silencieuse dans `SpaceRevenueMinuteAgg` — les deux tables incluent
désormais systématiquement toutes les ventes, mappées ou non. Le "flag non mappé" envisagé comme
correction existe déjà de facto : `spaceElementId IS NULL` sur `SpaceRevenueMinuteAgg` signale une
vente non mappée à un shop.

**Reste un écart mineur, mais structurel et volontaire** : `SpaceProductRevenueDailyAgg` exclut
les lignes `ti."productId" IS NULL"` (elle est indexée par produit — une ligne sans produit ne peut
être rattachée à aucun bucket produit/jour), alors que `SpaceRevenueMinuteAgg` (indexée par
shop/minute) n'a pas ce problème et les inclut. Ce n'est pas une réintroduction du bug d'origine
(aucune exclusion liée au *mapping* produit↔MenuItem) — juste une contrainte de granularité,
documentée ici pour éviter de la redécouvrir plus tard.

## Risque de régression / à surveiller

- Un écran qui croise les deux tables peut désormais légitimement diverger de quelques lignes sur
  le sous-ensemble `productId IS NULL` (rare — transactions sans article identifié). À documenter
  si un export/dashboard croisé y est un jour sensible.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #3
- BUG-014 (`14_aggregation_colonnes_mal_ecrites.md`) — fix dont ce ticket est un effet de bord.
