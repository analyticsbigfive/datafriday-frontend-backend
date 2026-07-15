# BUG-022 — InventoryFilterDrawer/InventoryMenuCoverageDrawer montés mais inatteignables

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur (fonctionnalité invisible sur mobile)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `SpaceInventoryView.vue:683-684`

## Symptôme

Grep de `filterDrawerOpen`/`coverageDrawerOpen` = 2 occurrences chacun (déclaration + bind), aucun
setter — le bouton mobile censé les ouvrir a disparu.

## Cause racine

L'état d'ouverture des deux drawers n'est jamais basculé à `true` nulle part dans le code — les
composants sont montés mais aucun déclencheur ne les affiche.

## Correction

Aucune à ce jour — restaurer le bouton/déclencheur manquant.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #4
