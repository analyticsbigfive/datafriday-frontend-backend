# BUG-005 — "Freezer" vs Frozen — valeur de formulaire invalide

- **Statut** : 🟡 Corrigé non déployé (2026-07-22)
- **Sévérité** : 🔴 Majeur (écriture DB probablement rejetée)
- **Domaine** : Menu & recettes (Catalogue)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `MenuItemCreateView.vue:504` (seul fichier live désormais —
  `MenuItemFormDrawer.vue`, qui contenait aussi cette occurrence, supprimé le 2026-07-17 en tant
  que fichier orphelin jamais importé, voir [[83_menu_items_formdrawer_orphelin_code_mort]])

## Symptôme

Cocher la case de stockage "Freezer" dans le formulaire MenuItem puis sauvegarder envoie la string
`"Freezer"` dans une colonne enum Postgres qui n'accepte que `Cold/Dry/Frozen` → écriture
probablement rejetée en base.

## Cause racine

Les deux formulaires live utilisent une checkbox `value="Freezer"` au lieu de `"Frozen"`
(`StorageType.Frozen`, `schema.prisma:47-51`). Les fonctions d'affichage (`getStorageColor`)
utilisent, elles, correctement `"Frozen"` — seule la saisie est fautive.

## Correction

2026-07-22 : `value="Freezer"` → `value="Frozen"` dans `MenuItemCreateView.vue:504` (seul fichier
live restant, confirmé — `MenuItemFormDrawer.vue` déjà supprimé, voir
[[83_menu_items_formdrawer_orphelin_code_mort]]). **Effet de bord détecté et traité en même
temps** : `mapStorageType` (`utils/inventoryUtils.js:786-791`) faisait correspondre
`case 'Freezer': return 'belowzero'` — cette fonction traduit `MenuItem.storageType` (enum Prisma
`Cold/Dry/Frozen`, confirmé `backend/prisma/schema.prisma:1871`) vers la nomenclature des Storage
elements du builder. Renommer la checkbox seule aurait cassé ce mapping pour tout menu item déjà
enregistré avec l'ancienne valeur `'Freezer'` (si une telle ligne existe malgré le rejet probable
de l'enum côté DB) : `mapStorageType` accepte désormais les deux valeurs (`'Frozen'` la correcte,
`'Freezer'` en legacy), `'Frozen'` seule est écrite pour toute nouvelle sauvegarde. Même principe de
compatibilité que le fix BUG-020 (`'Material'` → `'material'`).

## Risque de régression / à surveiller

Vérifier en base si des lignes `MenuItem.storageType` portent déjà une valeur invalide (`'Freezer'`
rejetée par l'enum Postgres à l'écriture, donc improbable, mais pas vérifié directement — pas
d'accès DB pendant ce fix) ; le mapping `inventoryUtils.js` reste rétrocompatible dans les deux cas.
Tester : cocher "Freezer" dans le formulaire MenuItem, sauvegarder, vérifier que l'écriture réussit
(elle échouait probablement avant) et que l'item apparaît bien dans la carte Storage "belowzero" de
l'Inventory.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"Bugs actifs confirmés"
- `docs/modules/00_INDEX.md`
