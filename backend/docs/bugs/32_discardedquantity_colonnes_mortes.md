# BUG-032 — discardedQuantity/discardedReason (InventoryCount) : colonnes DB mortes de bout en bout

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Faible (code mort, pas de perte fonctionnelle puisque jamais utilisé)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `schema.prisma:2445-2446`, `create-inventory-count.dto.ts`, `types/inventoryCount.js`

## Symptôme

Aucun — un commentaire front affirme explicitement que ces champs ne sont jamais utilisés.

## Cause racine

`discardedQuantity`/`discardedReason` existent en base (`InventoryCount`) mais ne sont jamais dans
le DTO de création ni dans le type front — colonnes mortes depuis leur ajout.

## Correction

Aucune à ce jour — soit les câbler si le besoin (déchets/pertes) est toujours pertinent, soit les
retirer du schéma.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #6
