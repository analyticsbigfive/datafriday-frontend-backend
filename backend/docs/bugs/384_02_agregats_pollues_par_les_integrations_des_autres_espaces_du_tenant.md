# BUG-384-02 : Agrégats pollués par les intégrations des AUTRES espaces du tenant (Le Mans-Brest : 112 k€ au lieu de 66 k€)

- **Statut** : 🟡 Corrigé non déployé (branche `fix/agg-scope-space-integrations`, 2026-09-15). Réparation data à lancer après déploiement.
- **Sévérité** : 🔴 Bloquant/impact business (CA faux sur 176 events du tenant Eat Is Family, 7,4 M€ de CA parasite dans les rollups ; bande KPI, Events Library, carte d'accueil)
- **Domaine** : Agrégation (module NestJS `aggregation`) / Analyse
- **Repo(s) concerné(s)** : `api-datafriday-staging` (aucun changement front)
- **Découvert le** : 2026-09-15 (ticket urgent, capture Le Mans FC : Analyse)
- **Fichiers** : `src/features/aggregation/event-aggregation-sql.ts` (`buildIntegrationClause`), `src/features/aggregation/aggregation.service.ts` (`executeProcessEvents`), `src/features/aggregation/event-rollup.service.ts`, `src/features/aggregation/live-minute-aggregation.service.ts`, `src/features/aggregation/space-integration-scope.service.ts` (nouveau), `scripts/repair-foreign-integration-aggs.ts` (nouveau)

## Symptôme

Sur l'Analyse Le Mans FC, le match Le Mans-Brest (22/08/2026) affiche 66 457 € dans le graphe "Event Revenue by shop" (survol de la barre) mais **112 438 €** dans la bande KPI dès qu'on sélectionne l'event, avec 10 006 transactions. Le Mans-Lens (13/09) est cohérent (83 665 € partout).

Les deux vues ne lisent pas la même source :

- graphe par PdV : item-level (`SpaceRevenueMinuteItemAgg`) lu par `getEventTimelineBatch` avec `shopScopeClause` = uniquement les `SpaceElement` de l'espace ;
- bande KPI event sélectionné : rollup `Event.revenue` (décision BUG-146-01, `AnalyseView.vue` `eventRollupTotals`), calculé par `EventRollupService.refresh` = somme brute de `SpaceRevenueMinuteAgg` par `weezeventEventId`, sans scope.

## Cause racine

En base (DB dev, mêmes chiffres que la capture), `SpaceRevenueMinuteAgg` porte pour l'event Le Mans-Brest deux intégrations :

| integrationId | Intégration | Fenêtre UTC | CA | Tx | Écrit le |
|---|---|---|---|---|---|
| `cmt01vzza…` | Le Mans FC Weez | 22/08 16:29 → 21:24 | 66 452,57 | 5 802 | 15/09 14:46 (wizard) |
| `cmt5my7za…` | **FC Nantes (Digifood)**, mappée à La Beaujoire | 22/08 11:58 → 16:20 | 45 985,76 | 4 204 | 08/09 17:37 (backfill BUG-352) |

66 452,57 + 45 985,76 = 112 438,33. C'est le match **Nantes-Rodez du même jour** écrit dans l'espace Le Mans (et symétriquement les ventes du Mans dans La Beaujoire : Nantes-Rodez affiche aussi 112 438,33).

Enchaînement :

1. `Le Mans-Brest` n'a ni `integrationId` ni `weezeventEventId` → fenêtre mode `range` (`event-window-resolver.service.ts`).
2. En mode `range`, `buildMatchClause` = `(t.eventId IS NULL OR t.eventId IN seasonContainerIds) AND fenêtre jour`. `seasonContainerIds` est **tenant-wide** (conteneurs de saison de toutes les intégrations + tous les sites Digifood).
3. Le seul filtre d'intégration était celui du **job** (`buildIntegrationClause`), optionnel. Le backfill BUG-352 du 08/09 (`scripts/logs/backfill-bug-352-20260908-164332.log`) a lancé `synchronize` par espace **sans integrationId** → clause vide → toutes les ventes du tenant du 22/08 rattachées à l'event Le Mans, `spaceId` = Le Mans, `integrationId` = FC Nantes.
4. Le 15/09, la re-agrégation depuis le wizard (integrationId Weez) a purgé et réécrit **uniquement** les lignes Weez (`deleteWhere.integrationId = integrationId`, BUG-317-02) : le résidu FC Nantes a survécu, le rollup l'a re-sommé.

Le lecteur item-level écartait ces lignes par effet de bord (leur `spaceElementId` appartient aux shops de La Beaujoire, hors `shopIds` du Mans), d'où deux CA différents. Le second writer (`space-aggregation.service.ts`) scope déjà par les intégrations mappées à l'espace ; `aggregation.service.ts` ne l'a jamais fait.

Ampleur mesurée (lignes dont l'intégration n'est pas mappée au `spaceId` de la ligne) : tenant Eat Is Family 176 events / 233 259 lignes / 7 396 489 € ; tenants Big Five Org (test) 31 + 1 events ; Eat is Family Test Import 4 ; Eait Is Family 3.

## Correction

Invariant posé : **le writer n'écrit jamais dans un espace une transaction d'une intégration qui ne lui est pas mappée** (`WeezeventLocationSpaceMapping`, étape 1 du wizard), quel que soit le mode de fenêtre. C'est la même liste que `SpacesService.resolveEventSalesScope` côté lecture.

1. `SpaceIntegrationScopeService` (nouveau) : `resolve(tenantId, spaceId)` → intégrations mappées ; `purgeForeignRows` → supprime dans les 3 tables d'agrégats les lignes de l'espace dont `integrationId NOT IN` cette liste (`NULL` non touché).
2. `buildIntegrationClause(jobIntegrationId, window, spaceIntegrationIds)` : `integration-range` → rien (la fenêtre porte l'intégration) ; integrationId de job → égalité (inchangé) ; sinon → `t."integrationId" = ANY(intégrations du space)` au lieu du tenant entier.
3. `isUnscopedRangeWindow` : mode `range` sans integrationId de job ET sans intégration mappée → l'event est refusé (résultat `error` explicite) plutôt qu'agrégé tenant-wide. Les modes `exact` / `container-range` (épinglés à un SalesEvent) restent traitables sans mapping (espaces historiques).
4. `executeProcessEvents` : résout la liste une fois par job, purge les lignes étrangères de l'espace au début de chaque job (à l'échelle de l'espace, la table jour par produit n'a pas de clé event), passe la liste à la clause et au rollup.
5. `EventRollupService.refresh(..., spaceIntegrationIds)` : somme restreinte aux intégrations mappées. Bande KPI et graphe par PdV alignés par construction.
6. `LiveMinuteAggregationService` : même clause et même scope de rollup (le live passe toujours un integrationId, mise en cohérence).
7. Réparation data : `scripts/repair-foreign-integration-aggs.ts` (dry-run par défaut, `--tenant`, `--apply`, rapport CSV avant/après par event). Purge des lignes étrangères + `EventRollupService.refresh` sur les events touchés + purge des caches Redis `spaces:evtimeline|baskets|unmapped`. Les lignes retirées existent déjà à l'identique dans l'espace de leur intégration : aucune vente réelle n'est perdue. Dry-run validé sur la DB dev : Le Mans-Brest 112 438,33 → 66 452,57 € / 5 802 tx.

## À savoir avant la réparation (à valider par Bertrand)

**18 events du tenant Eat Is Family n'ont aucune vente propre** : leur CA actuel est entièrement constitué de ventes d'autres clubs et passera à 0, ce qui est la réalité des données :

- matchs FC Nantes antérieurs au 23/08/2026 (création de l'intégration Digifood FC Nantes) : Lorient 63,6 k€, RC Lens 67,5 k€, OL 84,5 k€, AS Monaco 75,8 k€, LOSC, OGC Nice, PFC, Le Havre ;
- Salon du Mariage 14 et 15/02 (101,7 k€ et 206,7 k€), Yoka vs Okolie 126,3 k€, XG 106,9 k€ ;
- LMFC-Amiens, Boyz II Men, Joji, EDF, Wally Seck 2, Option PBB vs Cholet Demi 5.

Le CSV du dry-run (`scripts/logs/repair-bug-384-*.csv`) liste les 176 events avec rollup avant / après.

## Risque de régression / à surveiller

- Tests ajoutés : `aggregation.service.spec.ts` (bloc BUG-384-02 : clause `ANY` sans integrationId de job, égalité avec, purge des 3 tables, rollup scopé, refus du mode `range` sans mapping, mode `exact` sans mapping toujours agrégé) ; `live-minute-aggregation.service.spec.ts` (rollup scopé).
- Un espace sans mapping étape 1 dont les events sont en mode `range` ne s'agrège plus (résultat `error` par event, message "Aucune intégration mappée à l'espace"). Avant, il s'agrégeait avec tout le tenant : c'était faux, mais visible. À surveiller dans `AggregationJobLog.error` après déploiement.
- Ordre impératif : déployer le fix writer AVANT de lancer la réparation, sinon le prochain job non scopé re-pollue.
- Le backfill BUG-352 (non commité) ne doit plus être relancé sans `integrationId`, ou alors uniquement avec cette version du writer.

## Références

- BUG-317-02 / BUG-318-02 (purge scopée par intégration, qui préservait le résidu), BUG-146-01 (bande KPI depuis le rollup), BUG-368-02 (mode `integration-range`), BUG-352 (backfill du 08/09 à l'origine de la pollution).
- Log du backfill : `scripts/logs/backfill-bug-352-20260908-164332.log`.
