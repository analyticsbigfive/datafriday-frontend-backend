# BUG-81 — `saveInventoryCounts` : TOCTOU + contrainte unique inopérante quand eventId/shopId est NULL

- **Statut** : 🟡 Corrigé non déployé (code + script SQL ; **script à exécuter au déploiement**)
- **Sévérité** : 🟠 Majeur (doublons de comptage réels possibles)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/inventory/inventory.service.ts:133-171` (avant fix), `prisma/schema.prisma` (`uniq_inventory_count`), `prisma/sql/2026-07-18_inventorycount_unique_nulls_not_distinct.sql`

## Symptôme

Deux saves concurrents du même comptage (double-clic, deux onglets, retry réseau) créent **deux lignes** `InventoryCount` pour la même clé logique dès que `eventId` ou `shopId` est NULL. Les lectures (`findFirst`) en servent une arbitrairement → valeurs de comptage qui « clignotent ».

## Cause racine

1. **TOCTOU** : `findFirst` puis `create`/`update` (pas d'upsert — Prisma ne sait pas faire d'upsert sur clé composée nullable, commentaire `:130` exact) : les deux requêtes concurrentes voient `existing=null` et créent chacune.
2. **Contrainte inopérante** : `@@unique([tenantId, spaceId, eventId, shopId, itemId])` est créé par Postgres en NULLS DISTINCT (défaut) → deux lignes avec `eventId` NULL identiques ne violent PAS l'index.

## Correction

2026-07-18 :
- **SQL** (`prisma/sql/2026-07-18_inventorycount_unique_nulls_not_distinct.sql`, rejouable) : (1) dédoublonnage préalable (garde `updatedAt` max), (2) recréation de l'index unique en `NULLS NOT DISTINCT` (PG 15+ ; local = postgres:16).
- **Code** : le perdant de la course rattrape la violation `P2002` et retombe sur l'update de la ligne gagnante (plus de doublon, plus de 500).
- Specs : `inventory.service.spec.ts` (course P2002 → update ; erreur non-P2002 propagée).

⚠️ **Non appliqué en prod pendant la session.** Au déploiement : exécuter le script SQL (le dédoublonnage est destructif-par-conception : il supprime les doublons en gardant la ligne la plus récente — à valider). **Drift Prisma assumé** : `prisma db push` recréera l'index au défaut NULLS DISTINCT → rejouer le script après tout db push touchant `InventoryCount`.

## Risque de régression / à surveiller

Après migration : vérifier qu'un double-clic « compter » ne crée qu'une ligne (contrainte le garantit désormais). Lié à la décision d'architecture double-persistance (fiche front 160 / miroir 85).

## Références

- Fiche 85 (double persistance, ⚪), fiche front 160
