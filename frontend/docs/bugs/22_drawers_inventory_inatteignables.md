# BUG-022 — InventoryFilterDrawer/InventoryMenuCoverageDrawer montés mais inatteignables

- **Statut** : 🟢 Corrigé (2026-07-18)
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

2026-07-18 (`SpaceInventoryView.vue`) — la bottom-sheet `mobileActionsSheet` était elle-même
devenue orpheline (son déclencheur avait disparu avec l'ancien header gris). Restauré :

- bouton « ⋮ » (`mdi-dots-vertical`) dans le bandeau rouge, visible sur mobile → ouvre la sheet ;
- dans la sheet : boutons « Filtres » (→ `filterDrawerOpen`, clé `invFiltersBtn`) et « Vérifier
  stocks ↔ menus » (→ `coverageDrawerOpen`, clé `invVerifyCoverage`) ;
- entrée desktop pour la couverture : item « Vérifier stocks ↔ menus » ajouté au menu Print du
  bandeau (le drawer n'avait aucun déclencheur desktop non plus).

## Risque de régression / à surveiller

Vérifier sur mobile (<900px) : ouverture sheet → drawers ; et le rendu du bouton « ⋮ » dans le
bandeau (peu de place à côté de Print/Save).

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #4
