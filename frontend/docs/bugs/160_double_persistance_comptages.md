# BUG-160 — Inventaire : chaque comptage écrit deux fois (POST par item + snapshot blob)

- **Statut** : ⚪ Diagnostiqué (décision d'architecture → Bertrand)
- **Sévérité** : 🟡 Mineur (redondance ; incohérences possibles entre les deux tables)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : les deux (canonique ici ; miroir `api-datafriday-staging/docs/bugs/85_double_persistance_counts_miroir.md`)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/inventory.js` (`upsertCount:168-216`, `saveInventory:219-251`)

## Symptôme

Pendant un comptage : `upsertCount` POSTe **chaque item** vers `/inventory-counts` (fire-and-forget, erreurs → toast) ; au « Save », `saveInventory` POSTe **tout le blob** vers `/inventory` (snapshot append-only). Chaque valeur vit donc dans `InventoryCount` ET `InventorySnapshot`, et la lecture arbitre par fraîcheur (`getLatestBySpace`) — source des classes de bugs 81/82 côté backend.

## Cause racine

Deux générations de persistance empilées (snapshot d'abord, granulaire ensuite) jamais réconciliées. Nota : le snapshot porte des champs que le DTO granulaire refuse (`discardedQuantity`, `storageLocation`… — commentaire `:187-190`), donc AUCUNE des deux tables n'est aujourd'hui complète seule.

## Correction

Aucune cette session — choisir le chemin canonique est une décision produit/architecture (le snapshot est-il un historique voulu ? le granulaire doit-il porter tous les champs ?) → question posée dans `docs/QUESTIONS_A_BERTRAND.md`. Rien n'a été débranché ; les fixes 81/82 (backend) rendent l'arbitrage de lecture au moins correct.

## Risque de régression / à surveiller

Tant que non tranché : toute évolution du modèle de comptage doit être répliquée dans LES DEUX chemins d'écriture.

## Références

- Backend BUG-81, BUG-82, miroir 85
