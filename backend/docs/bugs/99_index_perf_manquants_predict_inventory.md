# BUG-99 — Index manquants : EventPredictVersion (tenantId,eventId) et InventoryCount (tenantId,spaceId,updatedAt)

- **Statut** : 🟡 Corrigé non déployé (schema + script SQL ; **script à exécuter au déploiement**)
- **Sévérité** : 🟡 Mineur/perf
- **Domaine** : Prévision + Stock (Inventory)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `prisma/schema.prisma`, `prisma/sql/2026-07-18_perf_indexes_predict_inventory.sql`

## Symptôme

1. `findAll` des versions predict (`predict-versions.service.ts`) filtre `{eventId, tenantId}` : seuls des index mono-colonne existaient.
2. `getLatestBySpace` (`inventory.service.ts:66`) fait `findFirst({where:{tenantId,spaceId}, orderBy:{updatedAt:desc}})` : aucun index ne mène par tenantId ni ne porte `updatedAt` → scan + tri à chaque affichage inventaire/restock.

## Cause racine

Index conçus pour d'autres accès ; ces deux chemins de lecture chauds n'étaient pas couverts.

## Correction

2026-07-18 : `@@index([tenantId, eventId])` sur `EventPredictVersion` et `@@index([tenantId, spaceId, updatedAt(sort: Desc)])` sur `InventoryCount` (schema), + script SQL rejouable `CREATE INDEX IF NOT EXISTS` (`prisma/sql/2026-07-18_perf_indexes_predict_inventory.sql`). Additif, aucun impact données.

**2026-07-20 (revue pré-merge)** : script passé en `CREATE INDEX CONCURRENTLY IF NOT EXISTS` pour
éviter le verrou `SHARE` (bloquant les écritures) le temps de la construction — à exécuter hors
transaction (comportement par défaut, tant qu'aucun `BEGIN` n'est ajouté autour du script).

## Risque de régression / à surveiller

Aucun (index additifs). Vérifier au déploiement que les deux requêtes disparaissent du slow-query log Prisma.

## Références

- Fiche 93 (autre changement d'index InventoryCount, distinct)
