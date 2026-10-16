# ADR : agrégation multi-source par évènement (POS + Weezevent / Digifood)

- **Statut** : Accepté par Ulrich le 2026-10-16 (Q-A oui, Q-B non, Q-C oui). Historique : proposé, (spike du lot L4, aucun code écrit ; révision générique du 2026-10-16 après exigence d'évolutivité d'Ulrich).
- **Date** : 2026-10-16
- **Auteur** : agent Backend C (étude en lecture seule du code, sans requête base, sans test lancé).
- **Contexte** : `PLAN.md` décision 1 (sources mélangées dès la V1), piège 1 (agrégation mono-source), section 4 (SalesEvent POS par évènement avec `externalId = Event.id`, SalesLocation POS par PdV, LocationSpaceMapping espace <-> intégration POS), lot L4.

Légende. **[V]** = vérifié en lisant le fichier cité. **[S]** = supposition ou connaissance générale non vérifiée dans ce dépôt (à confirmer). Les numéros de ligne sont ceux de la branche `feat/pos-mvp` au 2026-10-16 (chemins relatifs à `backend/src/` sauf mention).

Sources documentaires lues : fiches `frontend/docs/bugs/` 365-02, 370-02, 376-02, 339-02 (en entier ou en grande partie). Les fiches 384-02 et 379-02 n'existent pas dans `docs/bugs/` : je me suis appuyé sur les commentaires du code qui les citent. Les fichiers `docs/bugs/136_`, `144_`, `146_`, `147_` sont des fiches front sans rapport (liste d'évènements, CSV) : les « BUG-136-01 / 144-01 / 146-01 / fiche 147-01 » du back sont des références de commentaires de code, lues là. Les fiches 317, 318, 368, 372 n'ont pas été relues en entier (leur règle est reprise des commentaires de `aggregation.service.ts`).

---

## Résumé en clair (pour un lecteur non technique)

1. Aujourd'hui, le système sait rattacher les ventes d'un match à UNE seule caisse logicielle (Weezevent ou Digifood). La caisse Data Friday (POS) doit pouvoir fonctionner sur le même match, en même temps.
2. Pour cela, chaque match aura une liste explicite de « sources de ventes » (d'où viennent ses ventes). La caisse Data Friday n'est qu'une ligne de cette liste, comme Weezevent ou Digifood.
3. Demain, ajouter un 2e Weezevent, une autre caisse ou mélanger Digifood et Weezevent sur un match se fera en ajoutant une ligne à la liste, sans réécrire le calcul des chiffres.
4. Chaque source est calculée séparément, avec sa propre période de ventes, puis les totaux sont additionnés. Une source ne peut jamais effacer ni fausser les chiffres d'une autre.
5. Pour tous les matchs et espaces actuels (100 % Weezevent ou 100 % Digifood), rien ne change : mêmes calculs, mêmes chiffres. On le prouve par des tests écrits AVANT toute modification.
6. La liste de sources se déduit des informations déjà présentes sur chaque match. Aucune réécriture massive de la base n'est nécessaire.
7. Le direct (écran Live) suit : une vente caisse déclenche son propre petit calcul, qui n'attend pas celui de Weezevent.
8. Les stocks et la réconciliation continuent de compter les ventes de toutes les sources, sans changement.
9. Risques maîtrisés : suppression croisée des chiffres, double comptage, retard au direct. Chacun a une parade prévue et testée.
10. Il reste trois questions métier, en fin de document, auxquelles on répond par oui ou non.

---

## 1. Décision en une page

Un évènement possède une **liste de sources de ventes** (table proposée `EventSalesSource`). Le calcul des agrégats est écrit une seule fois, pour « une source », sans cas particulier par logiciel de caisse. Le POS est une ligne de cette liste.

- **Un job par couple (évènement, source)**, toujours mono-intégration (BUG-365 respecté à la lettre).
- **Une fenêtre de rattachement par source** (résolveur générique, section 4.2).
- **Une règle unique de suppression** : un job n'efface jamais les lignes d'agrégats appartenant à une autre source déclarée du même évènement (section 3.2).
- **Un watermark par source**, des groupes Live par (espace, intégration) construits depuis la liste.
- **Sources dérivées** : tant qu'un évènement n'a aucune ligne, sa source historique est déduite de `weezeventEventId`, `integrationId` et des mappings d'espace, avec exactement le SQL et les clés actuels (section 4.1).
- Les lecteurs bruts reçoivent une liste générique de SalesEvent supplémentaires, pas un cas POS.

Option retenue : **A générique** (section 4). Options écartées : B (fenêtre multi-sources dans un seul job) et C (OR POS dans la clause existante). La première rédaction de cet ADR traitait le POS comme un cas particulier ; elle est remplacée par la présente version, conformément au principe 3 de `PLAN.md` section 1 bis.

## 2. Inventaire exhaustif

### 2.1 Écrivains d'agrégats (qui écrit ou efface `SpaceRevenueMinuteAgg`, `ItemAgg`, `SpaceProductRevenueDailyAgg`, `SpaceBasketMinuteAgg`, `Event.revenue`)

| # | Fichier:ligne | Rôle | Hypothèse « une source par évènement » | Casse avec une 2e source ? |
|---|---|---|---|---|
| W1 | `features/aggregation/event-window-resolver.service.ts:80-97` `resolveEventWindow` | Choisit UNE fenêtre : `exact` (86-89), `integration-range` (91-93), `container-range` (94-95), `range` (96) [V] | Oui, retourne un seul `EventWindow` par évènement | **Oui** : aucune façon d'exprimer « Weezevent ET POS ». Un évènement lié à un SalesEvent Weezevent n'atteint jamais les transactions POS (`eventId` différent) |
| W2 | `features/aggregation/event-window-resolver.service.ts:52-74` `computeSeasonContainerEventIds` | Détecte les conteneurs de saison : span observé > 2 j (55-57), span déclaré (59-65), tous les SalesEvent Digifood (67-71) [V] | Suppose que tout SalesEvent est un match ou un conteneur Weezevent/Digifood | **Oui, indirect** : le SalesEvent POS (L1 lui pose `startDate`/`endDate`, `pos-source.service.ts:101-121`) est classé conteneur dès que ses ventes de test s'étalent sur plus de 2 jours, ou que l'évènement est multi-jours. Un conteneur est repêché par les évènements en mode `range` (voir W3) |
| W3 | `features/aggregation/event-aggregation.queries.ts:20-34` `buildMatchClause` | Clause de rattachement transaction -> évènement [V] | `range` : `eventId IS NULL OR eventId IN conteneurs` + fenêtre (22-23, 32) | **Oui** : si le SalesEvent POS est vu comme conteneur, ses transactions entrent dans la fenêtre de tout évènement `range` voisin |
| W4 | `features/aggregation/event-aggregation.queries.ts:45-55` `buildIntegrationClause` | Filtre d'intégration du job ; repli `integrationId = ANY(spaceIntegrationIds)` (52-54) [V] | Les intégrations mappées à l'espace sont toutes des sources « primaires » | **Oui, risque de double comptage** : quand le job n'a pas d'`integrationId`, le repli inclut l'intégration POS (mappée à l'espace par L1, `pos-source.service.ts:75-77`) et un job primaire en mode `range` lirait aussi les ventes POS, déjà écrites par le job POS |
| W5 | `features/aggregation/event-aggregation.queries.ts:89-132`, `135-184`, `199-268`, `271-301` | 4 INSERT, `MAX(t."integrationId")` (104, 152, 213, 281) [V] | Une ligne de groupe = une intégration (le groupe contient `locationId`) | Non (une location appartient à une intégration, donc le groupe ne mélange pas les sources) |
| W6 | Clés d'unicité des 4 tables : `prisma/schema.prisma:2975` (minute), `3049` (item), `3074` (daily), `3017` (panier) [V] | `ON CONFLICT` des INSERT (124, 175, 259, 294) | `weezeventMerchantId` et `spaceElementId` sont nullables [V]. Dans PostgreSQL deux lignes dont une colonne de la clé est NULL ne sont jamais « en conflit » [S, connaissance générale] | **Oui, point d'attention** : une ligne POS (pas de merchant) ne déclenche jamais `ON CONFLICT`. Sa déduplication repose UNIQUEMENT sur le delete préalable. Un delete manqué = ligne en double |
| W7 | `features/aggregation/aggregation.service.ts:113-386` `executeProcessEvents` | Rebuild complet d'un lot d'évènements | Une fenêtre, un delete, un INSERT par évènement (206, 213, 231-256) | **Oui**, voir 3 ci-dessous |
| W7a | `aggregation.service.ts:162-172` | Vérifie que l'`integrationId` du job est mappée à CET espace (`findFirst` puis comparaison d'espace) | Une intégration = un espace | Compatible : L1 crée UNE intégration POS PAR ESPACE (`pos-source.service.ts:56-80`, `pos.contracts.ts` commentaire sur `POS_INTEGRATION_NAME`), car `LocationSpaceMapping` est unique sur `(tenantId, salesLocationId)` (`schema.prisma:2904`) [V] |
| W7b | `aggregation.service.ts:206-207` | `resolveEventWindow` + refus si `range` sans intégration mappée | Une fenêtre | **Oui** : un évènement 100 % POS sans lien ni `Event.integrationId` tombe en `range`, et avec seule l'intégration POS mappée... `isUnscopedRangeWindow` ne le refuse pas (la liste n'est pas vide) et l'agrège via le repli W4 |
| W7c | `aggregation.service.ts:231-232` `deleteWhere` | Efface les lignes de l'évènement avant ré-écriture : scopé par l'intégration du job SAUF en mode `integration-range`, où il n'est pas scopé du tout (BUG-376-02) [V] | **Hypothèse centrale** : « toute ligne d'une AUTRE intégration pour ce même `weezeventEventId` est un résidu » | **Oui, c'est le risque n°1.** Un job primaire (Weezevent, mode `integration-range`) efface les lignes POS de l'évènement. Un job primaire en mode `exact`/`range` SANS `integrationId` (233 absent) les efface aussi. Test qui fige le comportement : `aggregation.service.spec.ts:427-439` (delete non scopé quand pas d'`integrationId`) et `921-939` (BUG-376-02) |
| W7d | `aggregation.service.ts:256`, `261`, `264` | Paniers (`basketAgg.replaceForEvent`, même `deleteWhere`), rollup, watermark `liveWatermarkKey(event.id)` | Un watermark par évènement | **Oui** : un rebuild POS réinitialiserait le watermark des ventes Weezevent (et inversement). Voir W8 |
| W7e | `aggregation.service.ts:342-373` | Après le lot, met en file une synchro des présences Weezevent pour `r.integrationId` (272) | `r.integrationId` est toujours une intégration Weezevent | **Oui** : pour un job POS, `queueWeezeventSyncType(tenantId, 'attendees', <id POS>, ...)` (365) partirait sur une intégration qui n'est pas Weezevent. À exclure |
| W8 | `features/aggregation/live-minute-aggregation.service.ts:111-163` `aggregateEventMinutes` | Job live incrémental par minutes touchées | Idem W7 : un watermark par évènement (140-141, 159, 165-169), delete scopé comme W7c (146-149) | **Oui.** Le watermark est la dernière valeur `updatedAt` agrégée. Avec deux jobs par évènement qui partagent la même clé, le job qui finit en premier avance le watermark au-delà des ventes de l'autre source non encore agrégées : elles ne sont ré-agrégées qu'à la réconciliation (30 min). De plus le repli `Event.calculatedAt` (165-169) est mis à jour par CHAQUE rollup (156), donc pas fiable comme référence d'une source |
| W9 | `features/aggregation/event-rollup.service.ts:20-46` | `Event.revenue/transactionCount/avgSpendPerTx/perCapita` = SUM des lignes de l'évènement, filtrées sur `integrationId IN intégrations mappées à l'espace` (26-27) [V] | Somme de toutes les lignes de l'évènement | **Non, c'est déjà multi-source** à condition que l'intégration POS soit dans `LocationSpaceMapping` (L1 le fait). Idempotent : le dernier job à finir écrit la somme complète si la queue est séquentielle [S, voir question 6] |
| W10 | `features/aggregation/basket-aggregation.service.ts:34-37` `replaceForEvent` | Delete par `deleteWhere` reçu, puis INSERT | Dépend de l'appelant | Non en soi |
| W10a | `basket-aggregation.service.ts:39-78` `backfillSpace` | Remplissage initial des paniers : `replaceForEvent({ tenantId, spaceId, weezeventEventId }, ...)` ligne 71, sans `integrationId` [V] | Une fenêtre primaire par évènement (56) | **Oui** : le delete non scopé (71) efface les paniers POS de l'évènement, puis seul le primaire est ré-écrit |
| W11 | `features/aggregation/space-integration-scope.service.ts:19-25`, `33-46` | `resolve` : intégrations mappées à l'espace. `purgeForeignRows` : supprime les lignes dont `integrationId NOT IN` cette liste, sur les 4 tables, à chaque job (aggregation.service.ts:177) | La liste = les sources légitimes | Compatible **si** l'intégration POS est bien dans `LocationSpaceMapping`. Si elle est retirée du mapping, toutes les lignes POS de l'espace sont purgées au job suivant (comportement voulu, à documenter) |
| W12 | `features/aggregation/sync-stale-rows.service.ts:37-78` `purge` | Balayage de fin de resynchronisation : lignes `updatedAt < début du run`, scopé par `integrationId` SI fourni (44-49) [V] | Le run a réécrit toutes les lignes qu'il doit garder | **Oui** : `synchronize` SANS `integrationId` ne réécrit que le primaire, puis balaie TOUT (y compris POS, non réécrit donc « périmé »). Avec `integrationId` fourni, le balayage est isolé par source (bon) |
| W13 | `aggregation.service.ts:59-99` `processEvents`, `392-422` `synchronize`, `aggregation.controller.ts:87-92`, `120` | Points d'entrée manuels (wizard step 4), `integrationId` optionnel | Le front passe l'intégration du wizard (BUG-370-02) | Un clic « Agréger » ne rafraîchit pas la source POS (aucun job POS créé) |
| W14 | `features/events/events.service.ts:442-449` (spaceId -> null), `513-520` (`resolveWeezeventLink`, « Démapper ») | `deleteMany` des 3 tables sur `{tenantId, spaceId, weezeventEventId}` sans `integrationId` [V] | Le lien Weezevent est la seule source | **Oui** pour 513-520 : « Démapper » un lien Weezevent efface aussi les lignes POS de l'évènement. 442-449 (l'évènement quitte l'espace) peut rester non scopé |
| W15 | `features/logistics/services/sales-simulation.service.ts:224-284`, `296-327`, `425-453` | Simulation QA : crée un SalesEvent `SIM-EVT-*` par intégration, lie l'Event, déclenche `process-events` avec l'`integrationId` de la location (319-326) | Intégrations Weezevent/Digifood | Non (non touché par POS, mais ce sera le modèle de `PosSaleService`, L3) |
| W16 | `features/events/services/event-weezevent-link.service.ts:23-38` + `event-weezevent-link.queries.ts:14-21` | Auto-lie un Event non lié à LE SalesEvent qui commence le même jour, s'il y en a exactement un (24-29), sans filtre de provider [V] | Les SalesEvent du jour sont tous Weezevent ou Digifood | **Oui** : le SalesEvent POS a un `startDate` (`pos-source.service.ts:102,112`). Sur un jour avec 1 SalesEvent Weezevent + 1 SalesEvent POS, `weezeventCandidates.length !== 1` (28) : **l'auto-lien Weezevent n'a plus lieu**. Sur un jour sans Weezevent, l'Event serait lié au SalesEvent POS (mode `exact` sur le POS, doublon avec le job POS) |

### 2.2 Déclencheurs et planification Live

| # | Fichier:ligne | Rôle | Hypothèse | Casse ? |
|---|---|---|---|---|
| L1 | `features/weezevent/services/live/live-event-window.service.ts:6-16`, `78` `LiveEvent.integrationId` | Une seule intégration par évènement : `Event.integrationId ?? weezeventEvent.integrationId ?? null` [V] | Une source | **Oui** |
| L2 | `live-event-window.service.ts:89-103` `groupBySpaceAndIntegration` | Un groupe par (espace, intégration), « BUG-365-02, jamais un job multi-intégrations » [V] | Chaque évènement appartient à exactement un groupe | **Oui** : l'évènement mixte devrait être dans deux groupes |
| L3 | `live-event-window.service.ts:110-125` `findLiveIntegrationIds` | Un évènement sans intégration connue met en direct TOUTES les intégrations Weezevent du tenant (113-123) | `integrationId null` = inconnue | **Oui** : un évènement 100 % POS, avec `integrationId null`, mettrait en live toutes les intégrations Weezevent du tenant (polling à cadence live inutile, charge API Weezevent) |
| L4 | `weezevent/services/live/live-aggregation-trigger.service.ts:29-49` `queueMinuteAggregation` | Job minute coalescé par clé `livePendingKey(spaceId, integrationId)` (`shared/constants/live-aggregation.ts:13-14`) | Une clé par (espace, intégration) | **Non** : deux sources donnent deux clés, coalescence indépendante, c'est déjà adapté |
| L5 | `live-aggregation-trigger.service.ts:52-65` `queueFullRebuild` | Rebuild d'un groupe ; pose `liveFullRebuildKey(eventId)` par évènement (63) | Une clé par évènement | Mineur : `isDue` (`live-reconciliation-cron.service.ts:50-57`) lit cette clé. Si le groupe POS échoue à être mis en file mais pas le primaire, la clé est posée et la réconciliation POS saute 30 min |
| L6 | `weezevent/jobs/live-reconciliation-cron.service.ts:34-48` | Toutes les 5 min, rebuild des groupes dus | `groupBy` donne tous les groupes à reconstruire | Suit automatiquement L2 une fois corrigé |
| L7 | `weezevent/jobs/live-sync-scheduler.service.ts:158-171`, `218` | Après une synchro Weezevent qui a écrit des ventes, déclenche les groupes des évènements de CETTE intégration ; ne boucle que sur `provider: 'WEEZEVENT'` | Les groupes d'une intégration = ses propres évènements | Il ne déclenchera pas POS (voulu : POS n'a pas de polling) ; mais `groupBySpaceAndIntegration(own)` créera aussi le groupe POS si on ne filtre pas (voir S6, section 5) |
| L8 | `weezevent/services/webhook-event.handler.ts:166-178` | Après un webhook, `findLiveEvents()` NON caché (168) filtré sur `e.integrationId === integrationId \|\| !e.integrationId`, puis tous les groupes | Idem L7 | Idem L7, plus : une requête `findLiveEvents` de plus par webhook si on y ajoute la résolution POS |
| L9 | `aggregation/jobs/aggregation.processor.ts:19-20`, `68-88` | Une file `AGGREGATION`, pas d'option de concurrence ni de priorité visible [V] ; publish SSE `liveSpaceChannel` à la fin de chaque job `process-events`/`process-event-minutes` (78-87) | Un job par cycle live | Deux jobs = deux publish SSE par cycle (acceptable). **Latence** : un job minute POS peut attendre derrière un rebuild long (lockDuration 10 min, commentaire 16-17). Critère de recette n°5 (moins de 30 s) en dépend [S : concurrence réelle du worker non vérifiée] |
| L10 | `core/queue/queue.service.ts:115-128` | `queueAggregationJob`, options `removeOnComplete/removeOnFail` seulement | - | Pas de `priority` aujourd'hui |

### 2.3 Lecteurs des agrégats (pré-agrégés)

| # | Fichier:ligne | Ce que lit le lecteur | Casse ? |
|---|---|---|---|
| R1 | `features/spaces/event-timeline-window.sql.ts:25-67` (CTE `win` et `dedup`), appelée par `spaces/services/space-event-timeline.service.ts:77-142` (summary) et `180-228` (minute) | `SpaceRevenueMinuteItemAgg` joint par FENÊTRE de minutes, plus, si `tagId` non null, `weezeventEventId IN (eventId, tagId)` (46). Aucun filtre d'intégration [V]. `dedup` fait `MAX` par `(eventId, minute, spaceElementId, locationId, locationName, merchantId, productId)` (50-67) | **Non**, à condition que les lignes POS soient taguées `weezeventEventId = Event.id` (c'est ce que fait le writer, `eventId: event.id`). Le `MAX` de `dedup` ne fusionne pas POS et Weezevent car `locationId` et `productId` diffèrent. Les deux sources s'additionnent ensuite au niveau affichage (commentaire 172-177) |
| R2 | `spaces/basket-agg-read.sql.ts:19-101` | `SpaceBasketMinuteAgg` par `weezeventEventId IN (...)` (36), sans filtre d'intégration ; libellés via `WeezeventProductMapping` | **Non** si les `ProductMapping` POS sont posés (L1) |
| R3 | `features/aggregation/event-aggregate-read.service.ts:19-83`, `88-119`, `125-152` | Sommes `SpaceRevenueMinuteAgg` par `weezeventEventId` sans filtre d'intégration | **Non**, additif. `SpaceProductRevenueDailyAgg` lu par jour (41) : clé `(spaceId, day, productId)` sans évènement (`schema.prisma:3074`), deux évènements le même jour dans un espace s'écrasent déjà aujourd'hui, POS n'aggrave pas ce défaut préexistant |
| R4 | `spaces/services/space-revenue-summary.queries.ts:14-27` | `SUM` par espace de toutes les lignes minute | **Non**, additif |
| R5 | `features/aggregation/aggregation-status.service.ts:41-45`, `63-72` | `dataPoints` = nombre de lignes par évènement ; « dernier job de l'évènement » (le plus récent par `startedAt`, indépendamment de l'intégration) | Mineur : avec deux jobs par évènement, le statut affiché est celui du dernier job, qui peut être celui de l'autre source |
| R6 | `features/mappings/services/mapping-progress.service.ts:112`, `185` | `count`/`groupBy` des lignes minute | Non (comptage) |
| R7 | `backend/supabase/migrations/20260921190000_shop_details_rpc_single_pass.sql` (RPC `get_space_shop_details`) : `_space_event_ids` lignes 93-101, `_gran` 109-124, `events` 202-239 [V] | La liste d'évènements est construite à partir des SalesEvent portés par les transactions des PdV de l'espace (`INNER JOIN WeezeventEvent we ON we.id = t.eventId`, 95-99) ; le CA vient de `_gran` (agrégats) | **Probable** : le SalesEvent POS sort comme un évènement de plus dans `events` (nom = nom de l'Event, `ev_df` introuvable car `Event.weezeventEventId` ne pointe pas sur le SalesEvent POS), avec `total` +1. Le CA de l'Analyse reste correct (il passe par le tag `Event.id`). **[S]** : le rendu exact côté front n'a pas été testé. Cette RPC vit dans `supabase/migrations/`, pas dans les migrations Prisma |

### 2.4 Lecteurs directs de transactions

| # | Fichier:ligne | Rattachement utilisé | Casse ? |
|---|---|---|---|
| T1 | `spaces/services/space-sales-scope.service.ts:77-238` `resolveEventSalesScope` | Fenêtres par évènement (170-206) ; `integrationClause = ANY(mapped)` (213-215) ; `tagId` et `eventIntegrationId` poussés dans `valuesSql` (232-235) | Le périmètre d'intégrations inclut POS automatiquement (mapping). Mais voir T2 |
| T2 | `spaces/services/space-analyse-batch.service.ts:174-189` (repli brut des paniers), `312-322` (non mappé, TOUJOURS brut) | Deux prédicats : `(eventIntegrationId IS NOT NULL OR tagId IS NULL OR t.eventId = tagId)` (184, 319) et `(eventIntegrationId IS NULL OR t.integrationId = eventIntegrationId)` (187, 320) | **Oui, exclut POS** : pour un évènement avec `Event.integrationId` posé, le deuxième prédicat écarte toute transaction d'une autre intégration, donc POS. Pour un évènement lié par `weezeventEventId` seul, le premier prédicat exige `t.eventId = tagId`, POS a un autre `eventId`. Le bandeau « non mappé » et le repli panier ignoreraient les ventes POS |
| T3 | `spaces/services/space-shops.service.ts:199-211` (`getLiveStatus`) et `238-252` (`firstValidSaleByElementSince`) | `locationSpaceMapping.findFirst({ tenantId, spaceId })` SANS `orderBy` puis `integrationId = <une seule>` (200, 208-211, 239, 246-249) [V] | **Oui** : avec deux intégrations mappées à l'espace, une seule est lue, au hasard. L'état « live » de l'espace et surtout l'arrêt de l'inventaire pré-event à la première vente (décision 11, `guest-pin-access/jobs/inventory-cycle.cron.ts:229`) peuvent ignorer les ventes POS (ou les ventes Weezevent) |
| T4 | `logistics/logistics.queries.ts:6-30` `salesByElementSince` (appelée par `recipe-explosion.service.ts:425-430`, `stock-level.service.ts:62-67`) | Aucun filtre d'évènement ni d'intégration : jointure `LocationShopMapping` + `ProductMapping` sur `status='V'`, `deletedAt IS NULL` | **Non** : les ventes POS décomptent le stock dès que `LocationShopMapping` et `ProductMapping` POS existent (L1). Jointure interne sur `WeezeventLocation` (16) : `locationId` POS doit être posé |
| T5 | `logistics/logistics.queries.ts:32-70` `eventSalesByElement`, appelée par `logistics/services/stock-level.service.ts:379-463` `deriveEventConsumption` (consommateurs : `inventory/post-event-draft.service.ts:175`, `inventory/services/inventory-baseline.service.ts:31`, `inventory/services/inventory-logistic-push.service.ts:135`) | Fenêtre `eventDate -> eventEndDate + 1 j` (399-401), `integrationClause IN (intégrations mappées)` (422-425), PAS par évènement | **Non** : POS inclus par le mapping. Limite préexistante (deux évènements le même jour dans un espace se mélangent) inchangée |
| T6 | `analyse/analyse.queries.ts:72-117` `eventMinuteTimeline`, `analyse.service.ts:127-171` `getTimeline` | `t.eventId = <SalesEvent id>` (102), garde-fou « eventId = WeezeventEvent.id » | Hors périmètre : par construction un SalesEvent = une source. On peut lui passer l'id du SalesEvent POS pour lire les ventes POS seules |
| T7 | `analyse/analyse.queries.ts:43-67` `eventTotals` | `SUM(Event.revenue)` | Non, additif via W9 |
| T8 | Event Predict, Restock (réarmement), écran Live front | Lisent les endpoints précédents (`event-timeline`, `liveDelta.api.js:9`) | **[S] non audité en détail** : pas de lecture directe de transactions repérée côté back (`grep predict` ne renvoie que catalogue de permissions et `space-*` ci-dessus) |

### 2.5 Ce qui n'est pas concerné (vérifié)

`SalesPriceAgg` (prix de référence, delta à l'ingestion), `aggregation-status` du step 4 hors statut, `integration-transaction-stats.*` (par intégration), `mapping-progress`. Aucun n'agrège par évènement.

---

## 3. Lignes d'agrégats : `integrationId` et purges

### 3.1 Colonne et clé

Les 4 tables portent `integrationId String?` (`schema.prisma:2965`, `3007`, `3040`, `3065`), **hors des contraintes d'unicité** (2975, 3017, 3049, 3074), avec le commentaire « sert uniquement à scoper les deleteMany ». C'est donc un tag de scope, pas une clé. Les INSERT l'écrivent par `MAX(t."integrationId")` (event-aggregation.queries.ts:104, 152, 213, 281). Comme chaque `locationId` appartient à une intégration, une ligne ne mélange pas deux sources.

### 3.2 Qui efface quoi (matrice de risque d'effacement croisé)

Hypothèse de lecture : évènement mixte, source primaire P (Weezevent) et secondaire S (POS), lignes des deux déjà écrites.

| Chemin | Filtre d'intégration du delete | Efface S ? | Efface P quand c'est S qui tourne ? |
|---|---|---|---|
| Rebuild P, évènement `integration-range` (`aggregation.service.ts:231-232`) | aucun (BUG-376-02, voulu pour nettoyer le résidu) | **Oui** | n/a |
| Rebuild P, évènement `exact`/`container-range`/`range`, job SANS `integrationId` | aucun | **Oui** | n/a |
| Rebuild P, mêmes modes, job AVEC `integrationId` = P | `integrationId = P` (232) | Non | n/a |
| Live minutes P (`live-minute-aggregation.service.ts:146-149`) | idem rebuild, restreint aux minutes touchées | Oui (aux minutes touchées) dans les mêmes cas | n/a |
| Rebuild/live S (à écrire) | doit être `integrationId = S` TOUJOURS | n/a | Non, si scopé |
| `purgeForeignRows` (`space-integration-scope.service.ts:39`) | `NOT IN mapped` | Non si S est mappée à l'espace ; Oui si on la retire | Idem |
| `SyncStaleRowsService.purge` (sync-stale-rows.service.ts:44-49) | `integrationId` du job si fourni | Oui si job sans `integrationId` (S non réécrite = « périmée ») | Non si le job S est scopé |
| `basketAgg.backfillSpace` (basket-aggregation.service.ts:71) | aucun | **Oui** | n/a |
| « Démapper » (`events.service.ts:513-520`) | aucun | **Oui** | n/a |
| `skipEvent` (`aggregation.service.ts:578-580`) | aucun, mais ne touche que la table minute | Oui (voulu : l'évènement est exclu) | n/a |
| Sortie d'espace (`events.service.ts:442-449`) | aucun | Oui (voulu) | n/a |

Conclusion : **cinq chemins non scopés effaceraient les lignes POS** (rebuild/live primaire, sweep sans `integrationId`, backfill des paniers, Démapper). Aucun ne doit rester sans garde-fou le jour où POS écrit des agrégats. Le garde-fou générique est « un job n'efface jamais les lignes dont `integrationId` appartient à une autre source déclarée du même évènement » (section 4.3), actif uniquement s'il existe une autre source déclarée (non-régression, section 5). Dans cette section 2, « POS » désigne le premier cas d'une source explicite.

### 3.3 Cas des lignes `integrationId NULL`

Lignes antérieures à la colonne. `NOT IN` ne les touche pas (space-integration-scope.service.ts:31). Tout filtre « sauf POS » doit donc s'écrire `integrationId IS NULL OR integrationId NOT IN (...)` pour garder le comportement actuel (un delete non scopé les supprime aujourd'hui).

---

## 4. Conception retenue : sources de ventes génériques (option A générique)

### 4.0 Modèle (proposition, aucune migration écrite)

`EventSalesSource` (nom proposé), une ligne par source d'un évènement :

| Champ | Rôle |
|---|---|
| `tenantId`, `eventId` | Évènement Data Friday concerné |
| `integrationId` | Intégration qui porte les ventes. Identité du job et tag `integrationId` des lignes d'agrégats |
| `salesEventId` (nullable) | SalesEvent de rattachement exact ; nul pour les modes par intégration ou par dates |
| `windowMode` | `sales-event` (par `eventId` seul), `sales-event-range` (par `eventId` + fenêtre de dates), `integration-range` (par intégration + fenêtre), `date-range` (fenêtre seule, bornée aux intégrations mappées) |
| `origin` | `auto` (déduite ou matérialisée depuis les champs historiques), `pos` (posée par le POS), `manual` (ajoutée par un utilisateur) |
| `active` | Source retirée : lignes d'agrégats conservées (décision du central), plus recalculées |
| Unicité | `(eventId, integrationId)` : une source active par intégration et par évènement. Raison : les lignes d'agrégats ne portent pas le `salesEventId`, la propriété d'une ligne se décide par `integrationId`. Deux SalesEvent d'une même intégration sur un même évènement ne sont pas supportés en V1 (extension possible par une colonne liste) |

Invariant : l'intégration d'une source est mappée à l'espace de l'évènement (`LocationSpaceMapping`, BUG-384-02) ; sinon la source est ignorée et signalée.

### 4.1 Remplissage de la liste sans casser l'existant (recommandation : sources DÉRIVÉES, sans backfill)

Liste effective d'un évènement = lignes actives de `EventSalesSource` + **source historique dérivée** tant qu'aucune ligne `origin = 'auto'` ne la remplace. La source dérivée est calculée par l'adaptateur de compatibilité, qui encapsule le code actuel de `resolveEventWindow` (`event-window-resolver.service.ts:80-97`) sans en changer une ligne de logique.

Pourquoi dérivée plutôt que backfill :
1. **Zéro écriture sur la production** pour les espaces existants : aucune migration de données à rejouer, aucun risque de divergence entre la ligne et les champs historiques que l'interface continue d'éditer (`Event.weezeventEventId`, `Event.integrationId`, « Démapper », relink automatique, `events.service.ts:189-194`, `513-520`).
2. **La preuve de non-régression est triviale** : la source dérivée appelle le même code, donc produit le même SQL, les mêmes `deleteMany`, les mêmes clés Redis (tests S0).
3. **Un backfill reste possible plus tard**, par script rejouable, une fois que les tests de caractérisation prouvent que ligne matérialisée et source dérivée produisent les mêmes agrégats. Une ligne `origin = 'auto'` prend alors le pas sur la dérivation. Le changement est réversible (supprimer la ligne).
4. Un backfill immédiat obligerait à maintenir deux sources de vérité synchronisées (champs historiques et table) sans bénéfice fonctionnel.

Les lignes `origin = 'pos'` sont écrites par L1 dans la même transaction que le SalesEvent POS (`PosSourceService.ensureSalesEvent`, `pos-source.service.ts:101`), mode `sales-event-range`. Les lignes `manual` viendront d'une future interface, sans code d'agrégation nouveau.

Règles d'interaction avec les champs historiques :
- Un SalesEvent déclaré comme source non `auto` est **exclu** de l'auto-lien (`event-weezevent-link.queries.ts:14-21`) et du calcul des conteneurs de saison (`event-window-resolver.service.ts:52-74`). Règle générique, pas de test sur le provider.
- Si `Event.weezeventEventId` pointe sur un SalesEvent déjà déclaré source d'un autre rôle, la dérivation l'ignore (garde de cohérence, évite le double job).

### 4.2 Résolveur générique : une fenêtre par source

`resolveEventSources(event, ...)` renvoie une liste de `ResolvedSource { integrationId, window, origin }`. `EventWindow` garde ses 4 formes actuelles (`event-aggregation.queries.ts:10-14`) : aucune forme nouvelle, la source POS réutilise `sales-event-range`.

| Mode historique | Devient (source dérivée) | Clause de rattachement | Changement de SQL |
|---|---|---|---|
| `exact` (`event-window-resolver.service.ts:86-89`) | `sales-event` | `t.eventId = salesEventId` | Aucun |
| `container-range` (94-95) | `sales-event-range` | `t.eventId = salesEventId` + fenêtre | Aucun |
| `integration-range` (91-93) | `integration-range` | `t.integrationId = I` + fenêtre | Aucun |
| `range` (96) | `date-range` | `eventId IS NULL OR conteneur` + fenêtre, bornée par les intégrations mappées | Aucun, sauf que les intégrations qui sont des sources explicites de CET évènement sortent du repli `ANY(...)` (sinon double comptage) |
| Source explicite (POS, manuelle) | `sales-event-range` ou `sales-event` selon la ligne | comme ci-dessus, **avec** garde `t.integrationId = source.integrationId` (toujours présente pour une ligne explicite, jamais pour une dérivée, pour garder le SQL historique identique) | Nouveau pour les lignes seulement |

Routage d'un job (clé = `integrationId` du job) :
- le job vise une intégration qui est une **source explicite** de l'évènement : il exécute cette source et elle seule ;
- sinon (job sans intégration, ou intégration étrangère) : il exécute la **source dérivée historique**, comme aujourd'hui (comportement BUG-370-02 conservé : en `integration-range` l'intégration de l'évènement est autoritaire).
Un évènement dont l'unique source est explicite (100 % POS) est ignoré sans erreur par les jobs « historiques » (résultat `no-source`), au lieu de lever « aucune intégration mappée ».

Le choix du moteur ne dépend jamais du nom d'un logiciel : seulement de `windowMode` et de `integrationId`.

### 4.3 Suppressions (règle unique, remplace les protections « POS »)

Pour un job de source `S` sur l'évènement `E` :
- `deleteWhere` = lignes de `E` **moins** celles dont `integrationId` appartient à une autre source déclarée de `E`.
- Écriture : `OR [{ integrationId: null }, { integrationId: { notIn: autresSources } }]`, appliquée **seulement si `autresSources` n'est pas vide**. Sinon l'objet est strictement celui d'aujourd'hui (test `aggregation.service.spec.ts:427-439`).
- Une source explicite supprime en plus avec `integrationId = S` (pas de nettoyage de résidu hors de son périmètre).
- La branche BUG-376-02 (suppression non scopée en `integration-range`) reste telle quelle pour une évènement sans autre source : son but (résidu d'un ancien pipeline) est préservé.
- Mêmes règles pour `replaceForEvent` (paniers, `backfillSpace` ligne 71), `SyncStaleRowsService.purge` (balayage : exclure les intégrations d'autres sources déclarées de l'espace quand le job n'a pas d'`integrationId`) et « Démapper » (`events.service.ts:513-520` : n'efface pas les lignes des sources non `auto`, décision du central). Un helper unique `protectedAggregateWhere(...)` centralise la règle ; un test garde-fou recense les sites `deleteMany` sur les 4 tables.

### 4.4 Live

- `LiveEvent` porte `sourceIntegrationIds[]` (dérivée + lignes actives) au lieu d'une seule `integrationId`. `groupBySpaceAndIntegration` met l'évènement dans un groupe par source ; sans ligne explicite la sortie est identique à aujourd'hui (S0).
- Un évènement sans source historique connue mais avec source explicite n'est plus « sans intégration » : `findLiveIntegrationIds` (`live-event-window.service.ts:110-125`) ne met plus toutes les intégrations Weezevent du tenant en direct.
- Le déclencheur est extrait hors du module Weezevent (même code) et devient le point d'entrée de TOUTE source (`triggerSource(eventIds, integrationId, trigger)`). Le POS (L3) l'appelle avec son `integrationId` ; un futur logiciel de caisse fera pareil. Pas de nouveau cas.
- Watermark : `liveWatermarkKey(eventId, integrationId?)`. Les sources `auto` gardent la clé historique `live:agg:watermark:{eventId}` ; toute autre source reçoit un suffixe. Pour une source explicite, repli = recalcul complet de ses minutes (bornées par `eventId`), jamais `Event.calculatedAt`, car chaque rollup le met à jour (`live-minute-aggregation.service.ts:156`). Même règle pour `liveFullRebuildKey`.
- Priorité BullMQ plus haute pour `process-event-minutes` (`queue.service.ts:115-122`), pas de nouvelle file (décision du central).
- Publish SSE : un par job, acceptable.

### 4.5 Lecteurs

- Pré-agrégés (R1 à R4) : déjà additifs, aucun changement (clé `locationId`/`productId` distinctes, tag commun `Event.id`).
- Lecteurs bruts (T2) : `resolveEventSalesScope` ajoute à chaque fenêtre `extraSalesEventIds text[]` (SalesEvent des sources explicites, vide sinon) ; les prédicats `space-analyse-batch.service.ts:184,187,319,320` reçoivent `OR t."eventId" = ANY(ev."extraSalesEventIds")`. Liste générique, pas de colonne « pos ». Pour un évènement sans source explicite, l'`OR` est faux : même résultat, texte SQL de test à comparer.
- `space-shops.service.ts:199-211, 238-252` : `findFirst` remplacé par `findMany` + `ANY`.
- RPC `get_space_shop_details` : exclure de `_space_event_ids` les SalesEvent déclarés sources non `auto`, par migration **Prisma** (`CREATE OR REPLACE FUNCTION`), décision du central. EXPLAIN obligatoire (réglage du 2026-09-21).
- Logistic, consommation d'évènement, post-event, réconciliation Live et post-event : aucun changement (périmètre = mapping d'espace, toute source mappée est comptée).
- Event Predict, Restock : non audités au-delà des endpoints back (supposé inchangé).

### 4.6 Options écartées

**B : fenêtre « liste de sources » dans un seul job** (`(A) OR (B)` dans chaque clause). Viole BUG-365 (un job lit plusieurs intégrations, risque de contamination décrit dans la fiche 365-02), `OR` entre index différents (précédent : seq scan de 2 M de lignes, 22 s, `event-window-resolver.service.ts:12-16`), latence POS couplée au job Weezevent. Écartée.

**C : `OR t.eventId = <POS>` dans la clause existante.** C'est le cas particulier que le principe 3 interdit ; latence POS = latence du job primaire (22 à 45 s mesurés, `live-minute-aggregation.service.ts:26-29`) ; ne gère pas l'évènement 100 % POS. Écartée.

**A particulier (première rédaction).** « Une intégration POS exécute le chemin POS » : chaque nouvelle caisse demanderait un nouveau chemin. Remplacée par A générique.

| Critère | A générique | B | C |
|---|---|---|---|
| BUG-365 | Respecté | Violé | Contourné |
| Nouveau logiciel de caisse ou 2e Weezevent | Une ligne en base | Code | Code |
| Effacement croisé | Règle unique 4.3 | À protéger aussi | À protéger aussi |
| Latence d'une vente | Job de la source seul | Job complet | Job primaire complet |
| Risque SQL | Faible (`eventId` exact) | Élevé | Élevé |
| Espace sans source ajoutée | Identique (source dérivée) | Modifié | Modifié |

---

## 5. Plan de mise en oeuvre

Principe directeur : **tout code nouveau est derrière « l'évènement a une source explicite »**. Sans elle, les objets Prisma, le SQL, les clés Redis et les groupes Live sont identiques. Seuls ajouts visibles : une lecture de `EventSalesSource` par job (à ajouter aux doubles de test sans changer leurs assertions).

### S0. Tests de caractérisation AVANT toute modification (premier commit, code actuel)
Fichier proposé `features/aggregation/aggregation.baseline.spec.ts` + cas dans `live-minute-aggregation.service.spec.ts` et `live-event-window.service.spec.ts`. Espace 100 % Weezevent et espace 100 % Digifood, matrice {`exact`, `integration-range`, `container-range`, `range`} x {job avec/sans `integrationId`} x {rebuild, minutes} : (1) suite ordonnée des `where` de `deleteMany` (4 tables), (2) texte SQL normalisé et paramètres des 4 `$executeRaw` et de `touchedMinutes`, (3) `where` du rollup et valeurs écrites, (4) clés Redis, (5) sortie de `groupBySpaceAndIntegration`. Tests existants à garder verts sans toucher aux assertions : `aggregation.service.spec.ts:427-439, 446-499, 838-939, 1213+`, `live-minute-aggregation.service.spec.ts:74-129`, `live-event-window.service.spec.ts:47-62`.

### S1. Table et dérivation (sans effet sur l'existant)
Migration Prisma `EventSalesSource` (additive) ; adaptateur « source dérivée » qui enveloppe `resolveEventWindow` ; `resolveEventSources` ; `SpaceIntegrationScopeService.resolveSources`. Tests : pour chaque mode historique, la source dérivée produit les mêmes `Prisma.Sql` (comparaison `strings` et `values`) ; évènement avec ligne explicite : liste = dérivée + ligne.

### S2. Barrières anti-pollution (livrables avant POS)
Auto-lien et conteneurs excluent les SalesEvent déclarés sources non `auto` ; garde « `weezeventEventId` ne pointe pas sur une source déclarée » ; `space-shops.service.ts` en `findMany` ; repli legacy de `space-weezevent-event.service.ts:46-49` préfère une intégration source `auto`. Tests : jour avec un SalesEvent Weezevent et un SalesEvent source explicite, l'auto-lien Weezevent fonctionne toujours.

### S3. Rebuild (`aggregation.service.ts`)
Boucle sur `resolveEventSources` filtrée par le routage 4.2 ; suppression 4.3 ; clause d'intégration de repli sans les intégrations d'autres sources de l'évènement ; pas de synchro des présences pour une source hors Weezevent (`aggregation.service.ts:342-373`, lister les types de source qui l'autorisent par donnée, pas par nom) ; entrées `processEvents`/`synchronize` : si le lot a des sources explicites, un job supplémentaire par intégration (réponse : `jobId` historique + `extraJobIds`). Tests : un job d'une source n'appelle jamais `deleteMany` sans protéger les autres ; évènement sans source explicite identique à S0 ; 100 % source explicite sans erreur du job historique ; deux sources Weezevent (deux intégrations) sur un évènement ne s'effacent pas.

### S4. Jobs minute et watermarks (`live-minute-aggregation.service.ts`, `shared/constants/live-aggregation.ts`)
Même boucle ; clés par source (4.4). Tests : watermarks indépendants, clé historique inchangée, une vente d'une source antérieure au watermark de l'autre est ré-agrégée.

### S5. Autres suppressions
`basket-aggregation.service.ts:71` (+ passe par source dans `backfillSpace`), `sync-stale-rows.service.ts`, `events.service.ts:513-520`, helper `protectedAggregateWhere` et test garde-fou.

### S6. Live
`LiveEvent.sourceIntegrationIds`, groupes, filtres webhook et scheduler (`live-sync-scheduler.service.ts:158-171`, `webhook-event.handler.ts:166-178`) limités à la source qui vient d'écrire, extraction du déclencheur, priorité BullMQ. Tests : groupes (sans source explicite identique ; deux sources = deux groupes ; 100 % explicite sans intégrations Weezevent en direct), coalescence indépendante.

### S7. Lecteurs bruts
`extraSalesEventIds` dans `space-sales-scope.service.ts:232-235` et les 3 CTE `ev(...)` (`space-analyse-batch.service.ts:151, 303`, `event-timeline-window.sql.ts:25`). Test : texte SQL, équivalence quand la liste est vide.

### S8. RPC par migration Prisma
Exclusion des SalesEvent sources non `auto` de `_space_event_ids` (`supabase/migrations/20260921190000_shop_details_rpc_single_pass.sql:93-101` en référence), EXPLAIN avant/après.

### S9. Statut du step 4
`aggregation-status.service.ts:63-72` : dernier job par (évènement, intégration). Facultatif V1. L'intégration POS reste masquée du wizard d'intégration (décision technique, 7.1).

### S10. Recette L9 (hors spike)
Match mixte Weezevent + POS sur la base de dev ; deux Weezevent sur un match ; rebuild de chaque source (l'autre n'est jamais effacée) ; Démapper ; resynchronisation avec et sans `integrationId`. Non-régression en données : empreinte (`md5` d'une agrégation ordonnée) des 4 tables sur un espace 100 % Weezevent et un 100 % Digifood de la base DEV, avant et après ré-agrégation.

Ordre : S0, S1, S2, S3, S4, S5, S6, S7, S8, S9. Jest uniquement via `scripts/test-serial.sh`, un fichier à la fois.

### Perf : EXPLAIN à faire (avec `begin read only`, jamais de `SET` de session sur le pooleur)
Index vérifiés (`schema.prisma:1541-1558`) : `(tenantId, eventId, status)`, `(eventId, transactionDate)`, `(tenantId, status, transactionDate)`, `(tenantId, integrationId, transactionDate)`, `(tenantId, locationId, transactionDate)` et l'index couvrant des paniers. À EXPLAINer : (1) les 4 INSERT en mode `sales-event-range` avec garde d'intégration ; (2) `touchedMinutes` avec `updatedAt > since` ; (3) les requêtes brutes de `space-analyse-batch.service.ts` après l'`OR` sur `extraSalesEventIds` (le chemin d'accès actuel est la fenêtre de dates) ; (4) la lecture de `EventSalesSource` par `eventId IN (...)` (petite table, index à créer sur `eventId`) ; (5) la RPC modifiée ; (6) `findLiveEvents` appelé à chaque webhook (`webhook-event.handler.ts:168`, non caché). `observedEventSpans` (`event-window.queries.ts:8-20`) n'est volontairement pas modifiée.

---

## 6. Risques principaux

1. **Effacement croisé des lignes d'une source par un job d'une autre** (3.2) : cinq chemins non scopés aujourd'hui ; la clé d'unicité ne protège pas (colonnes nullables) ; parade = règle unique 4.3 + test garde-fou.
2. **Double comptage ou mauvais rattachement** : repli `ANY(spaceIntegrationIds)` incluant une source explicite, SalesEvent de source vu comme conteneur, auto-lien vers un SalesEvent de source (W2, W4, W16), et à l'inverse lecteurs bruts qui excluent une source (T2).
3. **Fraîcheur Live** : watermark partagé, file unique (parade : priorité BullMQ), état « live » et arrêt pré-event qui ne lisent qu'UNE intégration (T3).

---

## 7. Décisions techniques tranchées et questions restantes

### 7.1 Les 10 questions de la première version, traduites

| # | Question initiale | Tranchée par | Décision et raison |
|---|---|---|---|
| 1 | Fenêtre POS : ventes avant minuit exclues du CA ? | Question métier (Q-A ci-dessous) | Défaut proposé : même règle pour toutes les sources (fiche 147-01, déjà validée). Reste un oui/non car l'effet sur le CA est visible |
| 2 | Évènement 100 % POS : `Event.integrationId` ? | Technique, tranchée | On ne le pose pas. La liste de sources porte la source ; `Event.integrationId` reste réservé à la source historique. Raison : un seul rôle par champ, pas de déplacement à faire si une 2e source arrive |
| 3 | Une intégration POS par espace ; visible dans le wizard ? | Central + technique | Une par espace (central). Masquée du wizard d'intégration (ce n'est pas une intégration à configurer) ; ses sources apparaissent en lecture seule sur l'évènement. Raison : `getSpaceIntegrations` (`space-weezevent-event.service.ts:111-127`) listerait sinon un objet non configurable |
| 4 | Latence, concurrence du worker | Central | Priorité BullMQ plus haute pour les jobs minute, pas de nouvelle file |
| 5 | Pas de dédoublonnage Weezevent/POS sur un même PdV | Déjà décidé (`PLAN.md` piège 2) | Les sources s'additionnent, règle d'exploitation seule |
| 6 | Concurrence des jobs et `Event.revenue` | Technique, tranchée | Le rollup est une somme complète recalculée par chaque job : correct quel que soit l'ordre d'arrivée, tant que le dernier job à finir voit les écritures des autres. À contrôler en recette (configuration du worker), pas une décision métier |
| 7 | Retrait d'une source : agrégats ? | Central | Conservés, plus recalculés (`active = false`) |
| 8 | « Démapper » Weezevent | Central | N'efface pas les lignes des autres sources |
| 9 | RPC `get_space_shop_details` | Central | Migration Prisma (`CREATE OR REPLACE FUNCTION`) |
| 10 | Deux évènements le même jour dans un espace | Question métier (Q-C) | Limite déjà présente pour Weezevent (stock et post-event lus par fenêtre de dates), reconduite pour toutes les sources : oui/non |

### 7.2 Questions pour Ulrich (oui ou non)

- **Q-A.** Les ventes de test faites avec la caisse AVANT le jour du match (la veille par exemple) doivent-elles rester HORS du chiffre d'affaires du match ? Proposition : oui, hors du chiffre d'affaires, mais elles continuent de baisser le stock.
- **Q-B.** Doit-on prévoir dès la première version un écran permettant à un utilisateur d'ajouter lui-même une deuxième source de ventes à un match (par exemple un deuxième Weezevent) ? Proposition : non, la base et le calcul le permettent, l'écran viendra plus tard.
- **Q-C.** Pour deux matchs le même jour dans le même espace, acceptez-vous que le stock et l'inventaire d'après-match les traitent ensemble, comme c'est déjà le cas aujourd'hui avec Weezevent ? Proposition : oui.

---

## 8. Ce qui reste supposé (non vérifié)

- Comportement NULL des index uniques PostgreSQL (connaissance générale, non testé ici).
- Concurrence réelle du worker d'agrégation et options BullMQ `priority` (API connue, non vérifiée dans ce dépôt).
- Rendu front d'un évènement « fantôme » issu de la RPC, et lecture exacte faite par Event Predict, Restock et l'écran Live (non audités au-delà des endpoints back).
- `scripts/backfill-basket-agg.ts` (appelant de `backfillSpace`) non relu.
- Aucun EXPLAIN exécuté (aucune requête base autorisée pendant ce spike).


---

## Décision d'Ulrich (2026-10-16)

ADR accepté. Q-A : oui (ventes de test d'avant le jour du match hors CA, stock décrémenté).
Q-B : non (pas d'écran d'ajout manuel de source en V1 ; Weezevent + POS sur un même match marche
automatiquement, la source POS étant ajoutée au démarrage de la caisse). Q-C : oui (deux matchs le
même jour dans le même espace traités ensemble par le stock et l'inventaire, comme aujourd'hui).
