# BUG-020 — Filtre storage `'material'` (Inventory) : jamais aucun article ne matche

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur (fonctionnalité invisible pour l'utilisateur qui la configure)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `utils/inventoryUtils.js:895-935`

## Symptôme

Un storage configuré avec le sous-type `'material'` (option réelle du builder) affiche une carte
toujours vide.

## Cause racine

Le filtre storage pour `'material'` dans `inventoryUtils.js` ne matche jamais aucun article
réellement présent.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #2
