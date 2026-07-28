# BUG-021 — Filtre storage `'merch'` (Inventory) : aucun filtre, agrégat unique

- **Statut** : 🟢 Corrigé (2026-07-18)
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

2026-07-18 (`useInventoryData.js`) : `merchWithInventory` produit désormais **une carte par
Storage typé `'merch'`**, scopée à ses merchshops (`attributes.selectedShops` ; vide = tous —
même convention que `buildStorageInventory` côté F&B). L'agrégat unique « Merch Aggregate » est
conservé **en repli** quand aucun Storage `'merch'` n'existe dans la config (comportement
historique). Les Storages typés *uniquement* `'merch'` sont exclus de `storagesWithInventory`
(pas de doublon de carte F&B vide).

## Risque de régression / à surveiller

Espaces avec Storage(s) 'merch' existants : la carte passe de « Merch Aggregate » à une carte par
Storage — vérifier l'affichage et le comptage. Un Storage mixte (`['merch','dry']`) apparaît des
deux côtés (carte F&B pour dry + carte merch scopée) : voulu.

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #3
