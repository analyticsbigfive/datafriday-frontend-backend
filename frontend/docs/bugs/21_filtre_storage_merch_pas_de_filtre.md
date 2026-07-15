# BUG-021 — Filtre storage `'merch'` (Inventory) : aucun filtre, agrégat unique

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `utils/inventoryUtils.js:1033-1073`, `useInventoryData.js:386-396`

## Symptôme

Toujours un seul agrégat "Merch Aggregate" affiché, jamais scopé par storage individuel.

## Cause racine

Le filtre storage pour `'merch'` n'applique en réalité aucun filtre — tous les storages `'merch'`
sont fusionnés dans un agrégat fixe unique.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #3
