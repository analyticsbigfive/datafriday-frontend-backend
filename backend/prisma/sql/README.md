# Migrations SQL à appliquer à la main

État au **2026-08-04** (ajout de #11 `RestockPlan` et #12 `Season`/`SeasonSpace`, non encore appliquées).

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
| 10 | `2026-07-31_spaceelement_type_text_vers_enum.sql` | ⚠️ **SUPERSEDED — NE PAS EXÉCUTER**. `SpaceElement.type` : `text` → enum `"ElementType"` (BUG-124-01). Diagnostic initial erroné : la conversion inverse (enum→text) a été faite délibérément le même jour par CFG-2 Étape 2 (`rh-consolidation-backend`) ; exécuter ce fichier annulerait ce travail. Voir fiche 124-01, section "Correction du 2026-07-31" | ❌ Ne pas lancer | — |
| 11 | `2026-08-04_restockplan.sql` | Table `RestockPlan` — historique des plans de réapprovisionnement nommés (scope espace), avec photo figée des lignes (`stockLines`/`restockLines`/`shoppingGroups`/`recipeCoeffs`) + 2 index. **À appliquer AVANT de déployer le module backend `restock-plans`** | ✅ (`CREATE TABLE/INDEX IF NOT EXISTS`) | `SELECT to_regclass('"RestockPlan"');` → non NULL |
| 12 | `2026-08-04_seasons.sql` | 2 tables Rapport Saison : `Season` (périodes personnalisées nommées, dates absolues, allSpaces) + `SeasonSpace` (jointure saison ↔ espaces). Chevauchements autorisés. **À appliquer AVANT de déployer le module backend `seasons`** | ✅ (`CREATE TABLE/INDEX IF NOT EXISTS`) | `SELECT to_regclass('"Season"'), to_regclass('"SeasonSpace"');` → non NULL |

### Cas confirmés

- **2026-07-31, vérification complète des #1-#9 sur `datafriday-dev` (`alsgdtewqeldrrquypdy`, base
  utilisée par `datafriday-api.onrender.com`)** via les requêtes de vérification ci-dessus :
  - #1, #4, #5, #7, #8, #9 : déjà appliquées (les modèles Prisma RH #7/#8, un temps absents — voir
    historique ci-dessous —, existent désormais : `HrRole`, `EventStaffLine`, `HrGoal`,
    `HrStaffRatio` tous non NULL. `Event.isSimulated` présent et versionné.)
  - #2, #3, #6 : **manquantes, appliquées ce jour**. Dry-run de #2 avant application : 0 ligne
    dupliquée sur 152 lignes `InventoryCount` (dédoublonnage no-op, seule la recréation d'index a eu
    un effet). #3 et #6 : additives, sans risque. Vérifiées après coup (index `NULLS NOT DISTINCT`
    présent, 2 index de perf présents, colonne `meta` présente).
  - #10 (BUG-124-01) : **volontairement non appliquée** — superseded, cf. plus haut.
- Historique (2026-07-30, avant résolution) : #6 avait été constatée absente en prod par une erreur
  runtime (`GET /api/v1/inventory/:spaceId/reconciliations` → 500, fiche
  [248-01](../../../frontend/docs/bugs/248_01_stockreconciliation_meta_non_appliquee_prod.md)), et
  #7/#8 avaient été signalées jamais créées (modèles ajoutés à `schema.prisma` sans script SQL
  joint, commit `56297d8`). Les deux ont depuis été résolues (migrations Prisma formelles pour
  #7/#8, script manuel pour #6 le 2026-07-31).

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
