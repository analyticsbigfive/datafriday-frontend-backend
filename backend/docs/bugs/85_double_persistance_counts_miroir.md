# BUG-85 — (miroir) Double persistance des comptages : POST par item + snapshot blob

- **Statut** : ⚪ Diagnostiqué (décision d'architecture à prendre)
- **Sévérité** : 🟡 Mineur (redondance, incohérences potentielles entre les 2 tables)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : les deux — **fiche canonique : `datafriday-web/docs/bugs/160_double_persistance_comptages.md`**
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/inventory/inventory.service.ts` (`saveInventoryCounts` + `upsertInventory`)

## Symptôme

Chaque comptage est écrit **deux fois** : `POST /inventory-counts` par item (fire-and-forget, table `InventoryCount`) puis `POST /inventory` (snapshot Json complet, table `InventorySnapshot`, append-only). Les lectures arbitrent entre les deux par fraîcheur.

## Cause racine / Correction / Risque

Voir fiche canonique front 160. Choix du chemin d'écriture canonique = décision d'architecture liée à BUG-81/82 → `docs/QUESTIONS_A_BERTRAND.md`. Rien n'a été débranché dans cette session.

## Références

- `datafriday-web/docs/bugs/160_double_persistance_comptages.md`, BUG-81, BUG-82
