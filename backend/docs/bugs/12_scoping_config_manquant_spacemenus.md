# BUG-012 — Scoping config manquant sur perf/staff/inventory Space Menus

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (données d'une config affichées pour une autre)
- **Domaine** : Espaces & builder / Menu & recettes
- **Repo(s) concerné(s)** : les deux (FE+BE à déployer ensemble)
- **Découvert le** : 2026-07-04

## Symptôme

Les endpoints perf/staff/inventory d'un Space Menu n'étaient pas filtrés par `configId` — changer
de configuration active pouvait faire apparaître des données appartenant à une autre configuration
du même espace.

## Cause racine

`configId` manquant sur `MenuAssignment`, donc absent des requêtes `ElementPerformance`,
`ElementStaff` et `ElementInventory` qui en découlent — scoping incomplet.

## Correction

`configId` ajouté sur `MenuAssignment` + backfill, puis propagé aux requêtes
`ElementPerformance`/`Staff`/`Inventory`. Migration et déploiement backend+frontend effectués
(voir `datafriday-web/docs/bugs/07_scoping_config_manquant_spacemenus_front.md`).

## Risque de régression / à surveiller

Déployer le backend seul sans le front (ou l'inverse) peut casser l'affichage perf/staff/inventory
si les contrats ne sont pas synchronisés — **déployer FE+BE ensemble**, migration en premier.

## Références

- `datafriday-web/docs/bugs/07_scoping_config_manquant_spacemenus_front.md`
