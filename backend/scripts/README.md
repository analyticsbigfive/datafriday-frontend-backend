# Scripts backend

Scripts conservés après le nettoyage du 2026-10-02 (plan de remédiation, P10). Les scripts
ponctuels supprimés restent dans l'historique git.

Règle commune : un script qui écrit en base est idempotent et tourne en aperçu par défaut
(`--apply` pour écrire). Il n'est jamais lancé contre la production sans demande explicite
(voir ADR 0002, migrations manuelles).

## Outils de qualité (CI)

| Script | Usage |
|---|---|
| `check-schema-indexes.mjs` | Index redondants et clés étrangères sans index dans `schema.prisma`. |
| `check-any-budget.mjs`, `any-budget.json` | Cliquet du typage : nombre de `any` explicites hors tests, ne peut que baisser. |
| `db-guard.cjs` | Refuse de lancer les tests contre une base qui n'est pas locale. |

## Documentation de l'API

| Script | Usage |
|---|---|
| `export-openapi.mjs` | Export du document OpenAPI. |
| `generate-api-reference.mjs` | Génère `docs/api/API_REFERENCE.md`. |

## Exploitation

| Script | Usage |
|---|---|
| `set-super-admin.ts` | Ajoute ou retire un super-administrateur plateforme. |
| `copy-config-menus.ts` | Recopie le menu d'une configuration vers d'autres configurations du même espace. |
| `repair-foreign-integration-aggs.ts` | Réparation BUG-384-02 : retire des agrégats les lignes d'intégrations non rattachées à l'espace. |
| `verify-event-analytics.ts` | Contrôle des chiffres de la page Analyse (BUG-135-01 et suivants). |
| `deploy-edge-functions.sh` | Déploie les fonctions Edge Supabase. |

## Migrations de données

| Script | Usage |
|---|---|
| `migrate-builder-v2.mjs` | Migration additive des configurations v1 vers le Builder v2 (voir ADR 0007). |
| `migrate-original-types.js` | Recopie `originalType` du JSON v1 vers les tables (chemin v1, à retirer avec l'ADR 0007). |
| `migrate-initial-dashboard-data.ts` | Données initiales du tableau de bord d'espace (routes non appelées par le frontend). |

## Backfills

Rattrapages liés à un correctif, idempotents. Statut d'exécution en production à confirmer avant
suppression.

| Script | Objet |
|---|---|
| `backfill-all-spaces-access.ts` | Drapeau `User.allSpacesAccess` après découplage accès et rôle. |
| `backfill-space-access.ts` | Accès par espace (phase 2). |
| `backfill-basket-agg.ts` | Paniers pré-agrégés de l'Analyse pour les espaces déjà agrégés. |
| `backfill-departments.ts`, `legacy-departments.seed.ts` | Départements et sous-types historiques du Builder v2. |
| `backfill-event-weezevent-link.ts` | BUG-331-02 : lien événement vers l'événement Weezevent. |
| `backfill-hr-department-labels.ts` | Codes de département RH à la place des libellés. |
| `backfill-hr-fnb-categories.ts` | Codes de catégorie F&B RH à la place des anciennes valeurs. |
| `backfill-sales-price-agg.ts` | BUG-337-02 : agrégat des prix de vente. |
| `backfill-spacemenuitem-orphans.ts` | BUG-051 : prix par espace orphelins d'un article supprimé. |
| `backfill-storage-types.ts` | Types de stockage historiques par tenant. |

## Architecture HEOS

| Script | Usage |
|---|---|
| `install-heos.sh`, `test-heos.sh` | Installation et tests de l'orchestrateur HEOS (ADR 0001). |
