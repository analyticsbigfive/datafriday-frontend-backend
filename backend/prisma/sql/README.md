# Migrations SQL à appliquer à la main

État au **2026-07-31** (branche `feat/Hr`).

## Pourquoi à la main

`prisma/migrations/*` est gitignoré (`backend/.gitignore:47-48` — le dossier ne contient qu'un
`.gitkeep`). Le `startCommand` de Render (`render.yaml:7` et `:41`) lance
`npx prisma migrate deploy` : la commande ne trouve **aucun** dossier de migration et réussit.
C'est un **no-op silencieux** — la cause racine la plus fréquente des incidents de déploiement de ce
projet, documentée dans
[`../../docs/adr/0002_migrations_manuelles_jamais_plateforme.md`](../../docs/adr/0002_migrations_manuelles_jamais_plateforme.md).

Conséquence directe : **le schéma peut être déployé sans que la colonne existe**. Le client Prisma
généré depuis `schema.prisma` sélectionne la colonne, Postgres la refuse, et l'API renvoie un 500
(P2022). C'est exactement le bug
[248-01](../../../frontend/docs/bugs/248_01_stockreconciliation_meta_non_appliquee_prod.md).

⚠️ **Rien dans le dépôt ne trace ce qui a été appliqué, ni sur quelle base.** Le tableau ci-dessous
donne une requête de vérification par migration : c'est le seul moyen fiable de connaître l'état
réel d'un environnement. Compter une minute pour les passer toutes.

## Comment appliquer

Un DDL passe par la connexion **directe** (`DIRECT_URL`, port 5432), **jamais par le pooler**.

```bash
psql "$DIRECT_URL" -f backend/prisma/sql/<fichier>.sql
```

Depuis un Render Shell, `prisma db execute` résout la datasource `url` — c'est-à-dire
`DATABASE_URL`, le pooler. Il faut forcer l'URL directe :

```bash
npx prisma db execute --file prisma/sql/<fichier>.sql --url "$DIRECT_URL"
```

Ordre recommandé : **dev d'abord, prod ensuite**. Toutes les migrations marquées idempotentes sont
rejouables sans risque, donc en cas de doute sur l'état d'un environnement, rejouer est plus sûr que
supposer.

## Tableau des migrations

| # | Fichier | Ce qu'elle fait | Idempotente | Vérification |
|---|---|---|---|---|
| 1 | `2026-06-25_market_price_decimal_units_and_purchase_packaging.sql` | `MarketPrice` : `packedUnits`/`numberOfUnits`/`unitsPerPurchase` en `double precision` (unités décimales), + colonne `purchasePackaging` | ✅ | `SELECT data_type FROM information_schema.columns WHERE table_name='MarketPrice' AND column_name='packedUnits';` → `double precision` |
| 2 | `2026-07-18_inventorycount_unique_nulls_not_distinct.sql` | Dédoublonne `InventoryCount` puis recrée l'index unique en `NULLS NOT DISTINCT` (Postgres 15+). **Sans elle, deux lignes identiques dont `eventId`/`shopId` est NULL ne violent pas la contrainte** | ⚠️ dédoublonnage destructif — relire le décompte avant | `SELECT indexdef FROM pg_indexes WHERE indexname='InventoryCount_tenantId_spaceId_eventId_shopId_itemId_key';` → contient `NULLS NOT DISTINCT` |
| 3 | `2026-07-18_perf_indexes_predict_inventory.sql` | 2 index de performance (`EventPredictVersion(tenantId,eventId)`, `InventoryCount(tenantId,spaceId,updatedAt DESC)`) | ✅ | `SELECT indexname FROM pg_indexes WHERE indexname IN ('EventPredictVersion_tenantId_eventId_idx','InventoryCount_tenantId_spaceId_updatedAt_idx');` → 2 lignes |
| 4 | `2026-07-20_inventorysnapshot_kind.sql` | `InventorySnapshot.kind` — discrimine le comptage d'avant-match de celui d'après | ✅ | `SELECT 1 FROM information_schema.columns WHERE table_name='InventorySnapshot' AND column_name='kind';` |
| 5 | `2026-07-20_stockreconciliation_kind_post_event.sql` | `StockReconciliation.kind` — sépare les documents post-event des resets logistiques | ✅ | `SELECT 1 FROM information_schema.columns WHERE table_name='StockReconciliation' AND column_name='kind';` |
| 6 | **`2026-07-24_stockreconciliation_meta.sql`** | `StockReconciliation.meta` — contexte de fabrication du document | ✅ | `SELECT 1 FROM information_schema.columns WHERE table_name='StockReconciliation' AND column_name='meta';` |
| 7 | `2026-07-29_hr_staffing_module.sql` | 6 tables RH : `HrSupplier`, `HrRole`, `HrRoleSupplier`, `HrPerson`, `HrRoleSpaceDefault`, `EventStaffLine` | ✅ (`CREATE TABLE IF NOT EXISTS`) | `SELECT to_regclass('"HrRole"'), to_regclass('"EventStaffLine"');` → non NULL |
| 8 | `2026-07-30_hr_settings_goals_ratios.sql` | 4 tables Settings RH : `HrGoal`, `HrGoalSpace`, `HrStaffRatio`, `HrStaffRatioSpace` | ✅ | `SELECT to_regclass('"HrGoal"'), to_regclass('"HrStaffRatio"');` → non NULL |
| 9 | `2026-07-30_event_is_simulated.sql` | `Event.isSimulated` + backfill heuristique sur le préfixe `[Simulé] ` | ✅ | `SELECT 1 FROM information_schema.columns WHERE table_name='Event' AND column_name='isSimulated';` |
| 10 | `2026-07-31_spaceelement_type_text_vers_enum.sql` | `SpaceElement.type` : `text` → enum `"ElementType"` (BUG-124-01 — 500 sur event-timeline / transaction-baskets / live-status). Garde-fou intégré si valeur hors enum | ✅ (no-op si déjà enum — l'ALTER échoue proprement sinon rien à refaire) | `SELECT udt_name FROM information_schema.columns WHERE table_name='SpaceElement' AND column_name='type';` → `ElementType` |

### Cas confirmés

- **#6 (`meta`) n'est PAS appliquée en production** — vérifié le 2026-07-30 par l'erreur runtime :
  `GET /api/v1/inventory/:spaceId/reconciliations` → 500, « The column `StockReconciliation.meta`
  does not exist in the current database ». Fiche
  [248-01](../../../frontend/docs/bugs/248_01_stockreconciliation_meta_non_appliquee_prod.md).
  **6 requêtes** touchent `meta` implicitement, dont le reset logistique et l'export Logistic.
- **#7 et #8 (RH) n'ont jamais été créées sur aucun environnement** — l'en-tête de
  `2026-07-30_hr_settings_goals_ratios.sql` le dit : le commit `56297d8` a ajouté les modèles dans
  `schema.prisma:542-591` sans script SQL joint. Symptôme : `POST /events/:id/staffing/generate` et
  les endpoints `/hr-settings/*` échouent (relation inexistante) alors que le code est déployé.
- **#9 n'est pas encore versionnée** (`git status` : `?? prisma/sql/2026-07-30_event_is_simulated.sql`).
  À committer avec le reste, sinon elle n'existera pas dans le build Render. Constaté aussi en local
  le 2026-07-30 : le client Prisma généré ignorait `Event.isSimulated`, ce qui empêchait la suite de
  tests backend de compiler (`npx prisma generate` corrige le côté local).

### Scripts qui ne sont PAS des migrations

À ne pas lancer par réflexe avec les autres :

| Fichier | Nature |
|---|---|
| `2026-07-30_audit_agg_perimes.sql` | **Lecture seule.** Liste les agrégats `SpaceRevenueMinuteAgg` en TTC sous un libellé HT. Ne corrige rien — le correctif est `POST /aggregation/process-events` **avec `integrationId`** (sans lui : double comptage). Cf. BUG-247-01 |
| `2026-07-24_cleanup_orphan_inventorycount_A_backup.sql` | Phase A d'un nettoyage : sauvegarde + décompte. **À exécuter seule**, lire `to_delete`, vérifier que le volume est plausible |
| `2026-07-24_cleanup_orphan_inventorycount_B_delete.sql` | Phase B : **suppression irréversible** de comptages orphelins. Exige la table de backup de la phase A ; le bloc `DO` avorte si elle est vide ou si le volume dépasse 5000 lignes. Ne jamais lancer avant d'avoir relu la phase A |
| `repair_data_integration_2026-06-28.sql` | Réparation ponctuelle « PDV / Menu Items démappés ». Sections DRY-RUN en lecture seule ; les sections REPAIR sont **commentées à dessein** — à décommenter délibérément, une seule fois |

## Après application

1. **`prisma generate` n'est PAS une étape sur Render.** Render construit depuis le dépôt, dont le
   schéma déclare déjà les colonnes : le client déployé les sélectionne — c'est précisément la cause
   du 500. La regénération n'est utile qu'**en local**, quand `node_modules/.prisma` date d'avant la
   colonne.
2. **Redémarrage backend : facultatif.** Une requête qui n'a jamais été préparée avec succès ne
   laisse pas de plan à purger. À ne faire que si la première requête post-migration échoue encore.
3. Vérifications fonctionnelles :
   - `GET /api/v1/inventory/:spaceId/reconciliations` → 200, section Réconciliation peuplée sur les
     écrans Pre-event **et** Post-event, bandeaux de provenance (`meta.baseline.source`,
     `meta.salesSource`) visibles sur les documents récents ;
   - `POST /events/:id/staffing/generate` → 200, plus d'erreur de relation ;
   - `GET /events?excludeSimulated=true` → les events `[Simulé]` disparaissent d'Analyse / Live /
     EventPredict.

## À faire pour que ça ne se reproduise pas

Le problème n'est pas une migration oubliée, c'est l'**absence de trace**. Trois pistes, par coût
croissant :

1. Tenir ce README à jour à chaque ajout de fichier SQL (coût nul, discipline pure).
2. Une table `_applied_sql_migrations (filename, appliedAt, appliedBy)` alimentée à la main après
   chaque exécution — l'état devient interrogeable au lieu d'être deviné.
3. Dé-gitignorer `prisma/migrations/` et laisser `migrate deploy` faire son travail. C'est la
   solution de fond, mais elle remet en cause ADR-0002 : à arbitrer, pas à décider seul.

---

JLH
