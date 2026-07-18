# BUG-020 — Filtre storage `'material'` (Inventory) : jamais aucun article ne matche

- **Statut** : 🟢 Corrigé (2026-07-18)
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

2026-07-18 : `getItemStorageTypes` (`inventoryUtils.js`, dans `buildStorageInventory`) reconnaît
désormais `'material'` : branche composant (`component.storageType === 'material'` →
`['material']`, même convention que le prédicat `isPackaging` du même fichier) + cas
`'Material' → 'material'` dans `mapStorageType` (côté menu item, par symétrie). Le défaut
`['dry']` est inchangé.

## Risque de régression / à surveiller

Les items packaging/matériel qui retombaient dans `['dry']` par défaut peuvent changer de carte :
ils apparaissent maintenant dans les Storages filtrés `'material'` et plus dans les Storages
`'dry'` (si leur `storageType` composant est renseigné `'material'`). Vérifier un espace avec un
Storage 'dry' + un Storage 'material'.

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #2
