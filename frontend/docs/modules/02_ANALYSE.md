# Analyse & agrégation

> Domaine cartographie : **Analyse & agrégation**. Owner produit : Jean-Luc (écran Analyse) /
> Ulrich (wizard Data Integration, mêmes modèles backend). Écrans : `/spaces/:id` (onglet Analyse,
> route par défaut d'un espace), portions de `/data-integration/fb` (étapes 4-5 du wizard :
> traitement des événements et synchronisation).
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma, chaque contrôleur backend (`Analyse`,
> `Aggregation`, `Mappings`, **et** `DashboardController`/`SpaceAggregationService` — un 3e module
> non listé dans la cartographie mais qui écrit dans les mêmes tables), chaque fonction RPC
> Postgres, le store Vuex `analyse.js` (2273 lignes) et ses composables, chaque composant Vue de
> `components/analyse/` et chaque client API ont été lus directement, avec citations fichier:ligne.
>
> ⚠️ **Ce document corrige et dépasse largement le brouillon précédent du même nom** (qui décrivait
> le domaine comme « backend Analyse (dashboard, kpis, timeline, cost-breakdown) + Aggregation +
> Mappings », sans vérifier si ces routes étaient réellement appelées). Le fait le plus important
> découvert dans cette passe — **absent de toute doc antérieure** — est que trois implémentations
> backend distinctes écrivent ou seraient censées écrire les mêmes tables d'agrégats
> (`SpaceRevenueMinuteAgg`/`SpaceProductRevenueDailyAgg`), avec des formules différentes, et
> qu'une seule des trois est réellement branchée à un écran (voir Piège n°1).

---

## Vue d'ensemble — trois pipelines qui alimentent (ou n'alimentent pas) le même écran

```
                                   ┌─────────────────────────────────────────────┐
                                   │  Weezevent (raw)                             │
                                   │  WeezeventTransaction / TransactionItem      │
                                   │  WeezeventEvent / Location / Merchant/Product│
                                   └───────────────┬───────────────┬─────────────┘
                                                    │               │
                     ┌──────────────────────────────┘               └───────────────────────┐
                     │ (A) PRÉ-AGRÉGATION — nécessite une action manuelle dans le wizard      │
                     ▼                                                                        │
   ┌───────────────────────────────────────────┐   ┌─────────────────────────────────────┐    │
   │ AggregationService (features/aggregation/) │   │ SpaceAggregationService              │    │
   │ POST /aggregation/process-events|synchronize│  │ (features/spaces/services/)          │    │
   │ Bull queue, appelé par le WIZARD Step4/5    │   │ POST /spaces/:id/dashboard/rebuild   │    │
   │ ⚠️ ALIVE — seul chemin réellement exécuté   │   │ ⚠️ MORT — 0 appelant frontend         │    │
   │ TVA OK depuis 2026-07-21, agrégats périmés  │   │ formule AVEC conversion TVA (correcte)│   │
   └───────────────────┬───────────────────────┘   └───────────────┬───────────────────────┘    │
                        │ écrit                                     │ écrirait (si appelé)        │
                        ▼                                           ▼                             │
              ┌──────────────────────────────────────────────────────────────┐                   │
              │ SpaceRevenueMinuteAgg / SpaceProductRevenueDailyAgg /          │                   │
              │ AggregationJobLog / SpaceDashboardVersion / UnmappedDataMetrics│                   │
              └───────────────────────────┬─────────────────────────────────┘                    │
                                           │ lu par                                                │
                                           ▼                                                       │
              RPC Postgres get_space_shop_details(spaceId, tenantId, page, limit, granular)         │
              (Spaces module) → GET /spaces/:id/shop-details(?granular=1)                          │
                                           │                                                        │
                     ┌─────────────────────┘                                                       │
                     │ (B) LECTURE TEMPS RÉEL — indépendante de (A), pas de pré-agrégat            │
                     ▼                                                                             │
   GET /spaces/:id/event-timeline(/:eventId) → spaces.service.ts getEventTimelineBatch()  ◄──────────┘
   JOIN live sur WeezeventTransaction/Item + ProductMapping + MenuItem + ProductType/Category
   (formule AVEC conversion TVA, item-level — menuItemId/Type/Category réels)
                     │
                     ▼
        Frontend : store/modules/analyse.js → shopGranularData (state)
        (utils/analyseReconciliation.js enrichit dimensions, sentinelle UNATTACHED_*)
                     │
                     ▼
        components/analyse/AnalyseView.vue + composables (useMetricsCalculator,
        useShopPerformance, useAnalyseTimeline, useAnalyseItemRecords)
                     │
                     ▼
              KPIs / donuts / tableaux / timeline affichés à l'écran

   (C) BACKEND « Analyse » dédié (features/analyse/) — GET /analyse/dashboard|kpis/menu|
       kpis/events|cost-breakdown|timeline/:eventId — EXISTE, DOCUMENTÉ SWAGGER, TESTÉ (spec),
       mais 100% ORPHELIN : le seul code frontend qui l'appelle (action `loadSpaceLightweight`,
       analyse.js:2170-2206) n'est jamais dispatché. Voir Piège n°2.
```

**Ce qu'il faut retenir avant de toucher au code** : l'écran Analyse (`/spaces/:id`) ne lit **ni**
le module backend `Analyse` (C, mort) **ni**, pour l'essentiel, les tables pré-agrégées via la
voie « correcte » (B lit `SpaceRevenueMinuteAgg` uniquement côté « shops list » de la RPC, pas côté
item-level). La donnée item-level qu'on voit réellement à l'écran (donuts par article, tableau «
Menu items by shop », KPI cards) provient à la fois de (A) via la RPC `granular=1` pour le
shop-level et de (B) en direct pour le drill-down par event. Un bug dans le pipeline (A) — voir
Piège n°1 — peut donc fausser silencieusement le CA par shop affiché sans jamais fausser le CA par
article (puisque (B) recalcule tout en live).

---

## ⚠️ Piège n°1 : deux moteurs d'agrégation backend écrivent les mêmes tables, avec des formules différentes — seul le moins fiable des deux est réellement branché

C'est le piège architectural central du domaine, absent de toute documentation antérieure.

| | `AggregationService` (vivant) | `SpaceAggregationService` (mort) |
|---|---|---|
| Fichier | `api-datafriday-staging/src/features/aggregation/aggregation.service.ts` | `api-datafriday-staging/src/features/spaces/services/space-aggregation.service.ts` |
| Déclenché par | `POST /aggregation/process-events` et `/synchronize`, appelés depuis le wizard Data Integration étape 4/5 (`useTimelineProcessing.js:130,161`, `useSynchronization.js:34`) | `POST /spaces/:spaceId/dashboard/rebuild` (`dashboard.controller.ts:94-120`) — **aucun wrapper `src/api` ne l'appelle, grep exhaustif négatif** |
| Formule `revenueHt` | `SUM((unitPrice × quantity − COALESCE(reduction,0)) / (1 + vat/100))` (`aggregation.service.ts:297`) — **conversion TVA présente depuis le 2026-07-21** (commit `a71045b`, BUG-015) ; avant cette date la division était absente, et **les lignes écrites avant n'ont jamais été rejouées** (cf. bug #2) | `SUM(unitPrice × quantity / (1+vatRate/100))`, ou repli **codé en dur `/1.20`** si `WeezeventProduct.vatRate` est null (`space-aggregation.service.ts:171-178,273-277`) |
| Résolution de `spaceElementId` | **Bug confirmé** : la requête insère `pm."menuItemId"` (un id `MenuItem`, via `WeezeventProductMapping`) dans la colonne `spaceElementId` (`aggregation.service.ts:276`) — jamais un vrai `SpaceElement.id` | Correcte : `LEFT JOIN WeezeventLocationShopMapping mem ON mem."weezeventLocationId" = t."merchantId"` puis `mem."spaceElementId"` (`space-aggregation.service.ts:169-170,184-186`) |
| Résolution de `weezeventMerchantId` | **Bug confirmé** : `t."locationId"` est inséré deux fois — une fois dans `weezeventLocationId`, une fois dans `weezeventMerchantId` (`aggregation.service.ts:274-275`) — la colonne merchant ne contient donc jamais un vrai id de marchand | Correcte : `t."merchantId"` distinct de `t."locationId"` (`space-aggregation.service.ts:167-169`) |
| Alimente `UnmappedDataMetrics`/`SpaceDashboardVersion` | Non — ces tables ne sont référencées nulle part dans `features/aggregation/` | Oui (`trackUnmappedData`, `incrementDashboardVersion`, `space-aggregation.service.ts:245-247`) |

**Conséquence concrète, vérifiée dans le code de la RPC de lecture** (`supabase/migrations/20260704200000_shop_details_rpc_builder_v2_zones.sql:296-306`) : la liste des shops (`shops[].revenue`) filtre
`SpaceRevenueMinuteAgg."spaceElementId" = ANY(v_shop_ids_param)` où `v_shop_ids_param` contient de
vrais `SpaceElement.id`. Comme le seul pipeline réellement exécuté (`AggregationService`) n'écrit
jamais de vrai `SpaceElement.id` dans cette colonne (il y met un `menuItemId`), **cette jointure ne
peut structurellement jamais matcher une ligne produite par le pipeline vivant** — le CA par shop
de la RPC (`shops[].revenue`) ne peut provenir que de coïncidences de valeurs, jamais d'un vrai
calcul. La partie « granular » de la même RPC (lignes 152-187) contourne le problème en joignant
plutôt sur `weezeventLocationId` (colonne correctement peuplée par le pipeline vivant), ce qui
explique pourquoi le CA agrégé par event×shop peut sembler correct pendant que le CA par shop de la
liste ne l'est pas.

**Si tu corriges le pipeline vivant** : aligner `aggregation.service.ts` sur la formule et les
jointures de `space-aggregation.service.ts` (conversion TVA + résolution `merchantId`/`spaceElementId`
correcte), prévoir un backfill (`synchronize`) de tout l'historique, et décider si
`SpaceAggregationService`/`DashboardController` doivent être supprimés ou fusionnés — les deux
implémentations qui coexistent aujourd'hui ne peuvent pas rester : la première fausse la donnée
vivante, la seconde est correcte mais totalement inatteignable depuis le produit.

---

## ⚠️ Piège n°2 : le module backend « Analyse » (`features/analyse/`) est mort en usage réel — malgré son nom qui donne son titre au domaine

Vérifié par grep exhaustif :

- `getAnalyseDashboard`/`getAnalyseKpisMenu`/`getAnalyseKpisEvents`/`getAnalyseCostBreakdown`
  (`src/api/endpoints/analyse.api.js:28-58`) ne sont appelées que par une seule action du store,
  `loadSpaceLightweight` (`store/modules/analyse.js:2170-2206`) — et **cette action n'est
  dispatchée nulle part dans tout `datafriday-web/src`** (grep `loadSpaceLightweight` ne remonte
  que sa propre définition).
- Les states qu'elle peuple (`spaceSummary`, `menuKpis`, `eventKpis`, `costBreakdown`,
  `analyse.js:508-514`) ne sont lus par **aucun** getter ni composant.
- La route `GET /analyse/timeline/:eventId` (`analyse.controller.ts:107-160`, avec sa propre requête
  SQL raw complète) n'a **aucun wrapper** dans `src/api` — 0 appelant possible depuis le front.
- Même en admettant que `loadSpaceLightweight` soit un jour rebranchée : les 4 méthodes du service
  backend (`analyse.service.ts:11-214`) ignorent complètement le `spaceId` que le front envoie en
  query param (`analyse.js:2180 : const params = { spaceId }`) — le contrôleur
  (`analyse.controller.ts:45,74,103,190`) ne lit **aucun** `@Query()`, seulement `req.user.tenantId`
  — ces routes renvoient donc des agrégats **globaux au tenant, toutes espaces confondus**, jamais
  scopés à l'espace demandé. Même réactivées, elles ne feraient pas ce que leur nom promet.
- Seule exception : `getCostBreakdown` est gardée par la permission `back.fb.costTracking`
  (`analyse.controller.ts:163`, différente de `front.fb.analyse`) — vestige d'un écran de suivi de
  coûts distinct (probablement `CostTrackingChart.vue`, lui-même mort — voir Code mort du domaine
  Menu & Recettes, `04_MENU_CATALOGUE.md`).

**Conséquence pratique** : ne jamais utiliser `analyse.controller.ts`/`analyse.service.ts` comme
référence de ce que l'écran Analyse affiche réellement — c'est du code mort en pratique, malgré son
nom. La vraie donnée vient du module `Spaces` (RPC `get_space_shop_details` + `getEventTimelineBatch`,
voir Piège n°1 et la section Frontend ci-dessous). Si un besoin métier ressemble à « KPI globaux du
tenant » (et non par espace), ce module existant pourrait être ranimé et corrigé — mais aujourd'hui
il ne sert à rien de vivant.

---

## Piège n°3 : `LocationShopMapping` sert deux populations logiquement différentes sans discriminant, avec deux conventions incompatibles pour « shops mappés »

Le contrôleur `mappings.controller.ts` expose deux groupes de routes qui semblent distincts :
« Location → ShopElement » (`/mappings/location-shop`) et « Merchant → Element »
(`/mappings/merchant-element`, doc Swagger mentionnant une table `WeezeventMerchantElementMapping`
qui **n'existe pas** dans le schéma). En réalité :

- Les 4 méthodes `create/get/bulk/deleteMerchantElementMapping` (`mappings.service.ts:359-465`)
  écrivent **toutes dans le même modèle Prisma `LocationShopMapping`** (table réelle
  `WeezeventLocationShopMapping`, `schema.prisma:2291-2309`) que celles de « location-shop » — la
  seule différence est la nature de la valeur stockée dans la colonne `salesLocationId` (mappée
  `@map("weezeventLocationId")`) : un cuid `WeezeventLocation.id` pour la convention
  « location-shop », un id de merchant Weezevent pour la convention « merchant-element ». **Aucun
  champ discriminant** ne permet de savoir a posteriori laquelle des deux conventions une ligne
  donnée respecte.
- Conséquence directe sur le calcul de progression du wizard (`getIntegrationProgress` vs
  `getAllIntegrationProgress`, `mappings.service.ts:750-765` vs `:902-904`) : `step2_shops_mapped`
  est calculé **différemment** selon la route appelée — l'une teste `merchantId ∈
  salesLocationId`, l'autre teste `locationCuid ∈ salesLocationId` — sur les **mêmes lignes** de la
  même table. Le commentaire du code l'admet explicitement
  (`mappings.service.ts:814-818`).
- `createMerchantElementMapping`/`bulkMerchantElementMappings` (happy-path **et** fallback) ne
  vérifient **jamais** que le `spaceElementId` appartient au tenant appelant
  (`mappings.service.ts:364-434`) — contrairement à `createLocationSpaceMapping` et
  `createLocationShopMapping` seul (hors bulk) qui valident bien l'ownership.

**Si tu dois fiabiliser ce coin** : ajouter une colonne discriminante (`kind: 'location'|'merchant'`)
sur `LocationShopMapping`, unifier les deux calculs de `step2`, et ajouter la validation d'ownership
manquante sur le chemin merchant.

---

## Modèles Prisma

### SpaceRevenueMinuteAgg — l'agrégat minute × dimension, lu par la RPC de lecture

**Où vit le code** : `prisma/schema.prisma:2330-2356`.

| Champ | Sens métier |
|---|---|
| `minute` | Timestamp tronqué à la minute (TIMESTAMPTZ) — la granularité la plus fine du pipeline pré-agrégé. Agréger à la journée = `GROUP BY DATE_TRUNC('day', minute)` (commentaire du modèle). |
| `weezeventEventId`/`weezeventLocationId`/`weezeventMerchantId`/`spaceElementId` | 4 dimensions optionnelles de filtrage — **voir Piège n°1** : les deux dernières sont mal peuplées par le seul pipeline réellement exécuté. |
| `revenueHt` | CA hors taxes de la fenêtre — **la formule diffère selon le pipeline qui a écrit la ligne** (voir Piège n°1) ; le nom « Ht » ne garantit rien en lui-même. |
| `transactionsCount`/`itemsCount` | Nombre de transactions distinctes / somme des quantités. |

**Contrainte** `@@unique([tenantId, spaceId, minute, weezeventEventId, weezeventLocationId,
weezeventMerchantId, spaceElementId])` — permet l'upsert idempotent utilisé par les deux pipelines
(`ON CONFLICT DO UPDATE` en SQL brut côté `AggregationService`, `upsert` Prisma côté
`SpaceAggregationService`).

**Ce qui en dépend** : RPC `get_space_shop_details` (shops list §259-313 + granular §123-190 de la
migration `20260704200000_...sql`), `getEventBreakdown`/`getEventStats`/`getEventMinuteChart`
(`aggregation.service.ts:607-740`), `getIntegrationProgress` (step5, `mappings.service.ts:785-791`).

### SpaceProductRevenueDailyAgg — agrégat quotidien par produit

**Où vit le code** : `schema.prisma:2359-2376`. Champs : `day` (Date, pas Timestamp), `weezeventProductId`,
`revenueHt`, `quantity`. **Différence structurelle importante avec `SpaceRevenueMinuteAgg`** : la
requête d'insertion du pipeline vivant (`aggregation.service.ts:303-329`) **n'a pas** de jointure
sur `WeezeventProductMapping` — elle inclut donc les ventes de produits non mappés à un `MenuItem`,
contrairement à `SpaceRevenueMinuteAgg` qui les exclut silencieusement via un INNER JOIN
(`aggregation.service.ts:284-285`). Résultat : ces deux tables, censées décrire le même historique
de ventes, **ne couvrent pas le même périmètre de transactions** pour un même event.

### AggregationJobLog — traçabilité des jobs d'agrégation ET marqueur de « skip »

**Où vit le code** : `schema.prisma:2391-2412`. `jobType` : `'full'|'incremental'|'rebuild'` côté
`SpaceAggregationService`, mais en pratique le pipeline vivant crée des jobs `'process-events'` ou
`'synchronize'` (valeurs de `job.data.type`, `aggregation.processor.ts:23-36`) — **le commentaire du
modèle et les valeurs réellement écrites divergent**, à ne pas prendre pour argent comptant. `status`
prend aussi la valeur `'skipped'`, écrite par `skipEvent` (`aggregation.service.ts:552-575`) qui crée
une ligne de log **sans jamais passer par la queue Bull** — c'est un pseudo-job, pas un vrai
traitement. Point notable : rien n'empêche de « skip » un event déjà `completed` — un nouveau log
`skipped` plus récent masquera alors le statut affiché sans supprimer les agrégats déjà écrits (le
statut et les données peuvent diverger, `getEventsTimelineStatus`, `aggregation.service.ts:51-70`).
⚠️ La route `POST /aggregation/skip-event` n'a **aucun wrapper** dans `src/api/endpoints/aggregation.api.js`
— elle est, comme le module `Analyse`, inatteignable depuis le produit actuel.

**Ce qui en dépend** : `getEventsTimelineStatus` (statut pending/running/completed/failed/skipped
par event, lu par le wizard étape 4), `getIntegrationProgress` (step4, compte les jobs `completed`).

### SpaceDashboardVersion — jeton d'invalidation de cache, jamais lu

**Où vit le code** : `schema.prisma:2379-2386`, clé primaire = `spaceId`. Écrit uniquement par
`SpaceDashboardService.incrementVersion` et `SpaceAggregationService.incrementDashboardVersion`
(doublon quasi identique) — **tous deux appelés uniquement depuis `DashboardController`, lui-même
sans aucun appelant frontend** (voir Piège n°2 bis ci-dessous). Ce modèle est donc, en l'état,
écrit par du code mort et lu par personne.

### UnmappedDataMetrics — alerte « ventes non rattachées », alimentée par le pipeline mort

**Où vit le code** : `schema.prisma:2598-2615`. `entityType: 'location'|'merchant'|'product'`,
compteurs `transactionCount`/`revenueHt`, `firstSeenAt`/`lastSeenAt`. Alimentée exclusivement par
`SpaceAggregationService.trackUnmappedData` (`space-aggregation.service.ts:319-...`), lui-même
appelé uniquement par `aggregateForSpace` (le pipeline **mort**, voir Piège n°1). **Aucune ligne
n'est donc jamais écrite dans cette table en usage réel** — malgré son utilité fonctionnelle
évidente (détecter les ventes qui ne remontent jamais dans l'app faute de mapping), elle est vide en
pratique.

### LocationSpaceMapping — « cette location Weezevent sert quel espace ? »

**Où vit le code** : `schema.prisma:2277-2289` (table réelle `WeezeventLocationSpaceMapping`).
`salesLocationId` (mappé `@map("weezeventLocationId")`) stocke en réalité un **integrationId**
(convention confirmée par le commentaire `mappings.service.ts:131-133` et
`space-aggregation.service.ts:131`), pas directement un `WeezeventLocation.id` — un cuid réel de
location est résolu ensuite via `salesLocation.findMany({integrationId: {in: [...]}})`. C'est
l'étape 1 du wizard Data Integration. Upsert silencieux sur remapping (`createLocationSpaceMapping`,
`mappings.service.ts:99-114`) — aucune trace de l'ancien mapping conservée.

### LocationShopMapping — voir Piège n°3 (double convention merchant/location)

**Où vit le code** : `schema.prisma:2291-2310` (table réelle `WeezeventLocationShopMapping`).
`spaceElementId` porte une vraie FK `onDelete: Cascade` vers `SpaceElement` — commentaire du modèle :
corrige un ancien bug de « PDV démappés » (même invariant que documenté dans
`03_BUILDER_ESPACES.md` pour ce modèle).

### ProductMapping — « ce produit Weezevent = quel MenuItem ? »

**Où vit le code** : `schema.prisma:1304-1324` (table réelle `WeezeventProductMapping`).
`@@unique([salesProductId])` : **1 produit Weezevent ↔ au plus 1 MenuItem**, jamais l'inverse
n'est contraint (plusieurs produits Weezevent peuvent pointer vers le même MenuItem — ex. un menu
combo vendu sous plusieurs SKU). `autoMapped`/`confidence`/`mappedBy` tracent si le mapping vient
d'un algorithme de suggestion ou d'une saisie manuelle — consommés par le wizard étape 3, pas
exploré plus finement dans cette passe (zone grise, voir plus bas).

---

## Backend — toutes les routes des 4 contrôleurs du domaine

### `AnalyseController` (`/analyse`) — mort en usage réel, voir Piège n°2

| Route | Permission | Rôle réel |
|---|---|---|
| `GET /analyse/dashboard` | `front.fb.analyse` | KPIs **globaux au tenant** (compteurs menuItems/components/ingredients/suppliers/events/spaces), ignore `spaceId` |
| `GET /analyse/kpis/menu` | `front.fb.analyse` | Moyennes prix/coût/marge sur **tout le catalogue du tenant** |
| `GET /analyse/kpis/events` | `front.fb.analyse` | Totaux revenus/transactions sur **tous les events du tenant** |
| `GET /analyse/timeline/:eventId` | `front.fb.analyse` | Timeline minute×merchant×produit pour 1 event — requête SQL complète mais **aucun wrapper frontend** |
| `GET /analyse/cost-breakdown` | `back.fb.costTracking` | Top 20 articles par marge la plus faible, **tout le tenant** |

### `AggregationController` (`/aggregation`) — le pipeline vivant, alimente le wizard

| Route | Rôle | Appelant frontend confirmé |
|---|---|---|
| `GET events-timeline/:spaceId` | Statut par event (pending/running/completed/failed/skipped) | **Aucun** (superseded par `step4-context`, commentaire explicite `aggregation.api.js:16-18`) |
| `GET step4-context/:spaceId` | Bundle timeline + events Weezevent + `hasMappings` en 1 appel | `useTimelineProcessing.js:25` |
| `POST process-events` (`menu.integration.fb`) | Enqueue le traitement des events sélectionnés | `useTimelineProcessing.js:130,161` |
| `POST synchronize` (`menu.integration.fb`) | Enqueue un rebuild complet de l'espace (purge + retraite TOUS les events) | `useSynchronization.js:34` |
| `POST skip-event` (`menu.integration.fb`) | Marque un event « skipped » (pseudo-job, pas de queue) | **Aucun wrapper frontend** |
| `GET progress/:jobId` | Progression d'un job (lit `AggregationJobLog` en base, jamais l'état Bull en mémoire) | `useSynchronization.js:55`, `StepProcessTimeline.vue:863` |
| `GET event-breakdown/:spaceId/:eventId` | CA par shop×produit pour 1 event (lit les tables pré-agrégées) | `StepProcessTimeline.vue:1035` |
| `GET event-stats/:spaceId/:eventId` | Totaux d'un event, requête GROUP BY directe | **Aucun** |
| `GET event-minute-chart/:spaceId/:eventId` | Série CA/minute pour 1 event | `StepProcessTimeline.vue:1389` |

**Mécanisme de queue** : BullMQ, queue `aggregation` (`aggregation.module.ts:14`), `attempts:1`
**sans retry** (`queue.service.ts:274`, écrase explicitement le défaut global `attempts:3` +
backoff exponentiel) — un échec transitoire (timeout DB, deadlock) fait échouer définitivement le
job. `getJobProgress` recalcule à chaque appel un `count()` sur `SpaceRevenueMinuteAgg`
(`aggregation.service.ts:524-532`), sans cache — coûteux si le front poll fréquemment un
`synchronize` sur un espace à beaucoup d'events.

### `MappingsController` (`/mappings`) — configuration du wizard, étapes 1 à 3

| Groupe | Routes | Modèle Prisma cible |
|---|---|---|
| Location → Space | `GET/POST/DELETE location-space(/:locationId)` | `LocationSpaceMapping` |
| Location → ShopElement | `GET/POST/POST bulk/DELETE location-shop` | `LocationShopMapping` (convention « location ») |
| Merchant → Element | `GET/POST/POST bulk/DELETE merchant-element` | **`LocationShopMapping`, même table** (convention « merchant » — voir Piège n°3) |
| Product → MenuItem | `GET stats`, `GET`, `POST bulk`, `DELETE product-menu(/:id)` | `ProductMapping` |
| Progress | `GET progress(/:locationId)`, `GET summary/:locationId` | Lecture composite (5 étapes, voir Piège n°3) |

Les 3 endpoints bulk (`bulkLocationShopMappings`/`bulkMerchantElementMappings`/`bulkProductMappings`,
`mappings.service.ts:247-298,386-444,627-725`) partagent le même patron : chunks de 500 en
`$transaction` (atomique par chunk, **pas** globalement), fallback item-par-item hors transaction si
le chunk échoue, erreurs individuelles collectées. `bulkProductMappings` utilise un `$executeRaw`
INSERT...ON CONFLICT en happy-path mais un `upsert` Prisma Client dans le fallback — deux chemins de
persistance à garder synchronisés si le schéma évolue.

`deleteLocationShopMapping`/`deleteMerchantElementMapping` cascadent vers
`SpacesService.deleteElementIfUnreferenced` (`spaces.service.ts:3634-3703`) qui supprime le
`SpaceElement` orphelin **et** nettoie le JSON `Config.data` en builder v1 (filtre
`floors[].elements`/`forecourt.elements`/`externalMerch.elements`, `spaces.service.ts:3671-3692`) —
en builder v2 c'est une simple suppression relationnelle (cascade FK). L'appel est fait dans un
try/catch qui **avale l'erreur en warning** : le mapping est supprimé même si le cascade échoue.

### `DashboardController` (`/spaces/:spaceId/dashboard`) — module entier orphelin

**Où vit le code** : `api-datafriday-staging/src/features/spaces/dashboard.controller.ts` (enregistré
dans `spaces.module.ts:4,18`, donc bien actif/routé — contrairement à `KvModule`). 4 routes :
`GET /` (`SpaceDashboardService.getDashboard`), `GET /health` (`SpaceAggregationService.getAggregationHealth`),
`POST /invalidate` (`SpaceDashboardService.invalidateCache`), `POST /rebuild`
(`SpaceAggregationService.runAggregation`, le pipeline « correct » du Piège n°1). **Grep exhaustif :
aucun fichier `src/api/endpoints/*.js` ne construit une URL vers `/dashboard`, `/dashboard/health`,
`/dashboard/invalidate` ou `/dashboard/rebuild`.** Ce contrôleur entier — pas seulement une méthode —
est mort côté produit, bien qu'il soit celui qui contient la formule de calcul correcte.

---

## Le vrai moteur de données de l'écran Analyse : module `Spaces`

L'écran `/spaces/:id` ne consomme **aucune** des routes ci-dessus pour ses KPIs et graphiques — il
consomme deux endpoints du module `Spaces` (déjà partiellement documentés dans
`03_BUILDER_ESPACES.md` côté builder, ici détaillés côté données de vente) :

### `GET /spaces/:id/shop-details` (+`?granular=`) — shop-level, pré-agrégé

Délègue à la fonction Postgres `get_space_shop_details` (RPC, `SECURITY DEFINER`), dernière version
`supabase/migrations/20260704200000_shop_details_rpc_builder_v2_zones.sql`. Reçoit `spaceId`,
`tenantId`, `page`, `limit`, `includeGranular`. Retourne un objet unique `{shops, shopGranularData,
events, menuItemCostMap, meta}` :
- `shops[]` : liste des `SpaceElement` de type shop (v1 floor/forecourt **et** v2 zone, jointes
  toutes les deux depuis la migration de juillet — avant cette migration, les shops v2 étaient
  invisibles du dashboard, cf. commentaire de tête du fichier), avec `revenue` sommé depuis
  `SpaceRevenueMinuteAgg` **filtré par `spaceElementId`** — voir Piège n°1 pour la conséquence.
- `shopGranularData[]` : une ligne par (shop, event), **jamais par article** — tous les champs
  `menuItemId`/`menuItemName`/`menuItemType`/`menuItemCategory`/`itemCost` sont explicitement
  forcés à `NULL` dans la requête SQL (lignes 137-145 de la migration). L'enrichissement par
  article vu à l'écran est reconstruit **côté client** (voir section Frontend).
- `menuItemCostMap` : coût unitaire par `menuItemId` ou `weezeventProductId` (repli), calculé en
  live depuis `WeezeventTransactionItem`/`ProductMapping`/`MenuItem.totalCost` — **pas** depuis
  `SpaceProductRevenueDailyAgg`.
- `events[]` : jointure `WeezeventEvent` ↔ `Event` DataFriday **par égalité de DATE seulement**
  (`DATE(ev_df."eventDate") = DATE(ev."startDate")`, lignes 224-227 et 175-178) — deux events
  Weezevent le même jour calendaire sur le même espace collisionneraient silencieusement sur le
  même `Event` DataFriday. Zone à risque non couverte par un test connu (voir Zones grises).

### `GET /spaces/:id/event-timeline` (batch, `?eventIds=`) — item-level, temps réel

`spaces.service.ts:1035-1174` (`getEventTimelineBatch`). **Ne lit aucune table pré-agrégée** :
JOIN live `WeezeventTransaction`/`WeezeventTransactionItem`/`WeezeventLocationShopMapping`/
`WeezeventProductMapping`/`MenuItem`/`ProductType`/`ProductCategory`, formule
`unitPrice × quantity / (1 + vat/100)` (ligne 1118-1121, **cette fois avec conversion TVA
correcte**, contrairement au pipeline pré-agrégé vivant du Piège n°1). Plafonné à 100 `eventIds`
par appel (`spaces.service.ts:1036`). C'est la source de toutes les vues item-level (donut par
article, tableau « Menu items by shop », timeline minute par minute d'un event précis).

**Corrigé 2026-07-18 (fiche back 103, non déployé)** : la jointure shop était un `INNER JOIN`
`WeezeventLocationShopMapping` + `spaceElementId = ANY(shopIds)` — toute vente d'un PdV non mappé
était supprimée, d'où un écran « 0 article / Aucun article disponible pour cette configuration »
alors que le CA shop-level (RPC, LEFT JOIN + COALESCE) s'affichait. Désormais aligné sur la RPC :
`LEFT JOIN` + `COALESCE(spaceElementId, locationId)` (bucket gris `UNATTACHED_SHOP_KEY` côté
front), garde-fou : les non-mappés ne sont conservés que si un `integrationId` scope la requête.
Attention : l'attribution event reste par **fenêtre de dates** (`[eventDate, eventEndDate+1j)`),
différente du lien stocké utilisé par la RPC — règle canonique non tranchée (QUESTIONS 16). Le
front ne masque plus un échec HTTP du batch en « 0 article » (fiche front 187, snackbar
une fois/session).

**Conséquence pour un correctif** : le CA total « par article » (toujours calculé en live, formule
TVA correcte) et le CA total « par shop » (calculé depuis les agrégats pré-calculés, formule sans
TVA, Piège n°1) **peuvent structurellement ne pas sommer au même total** pour le même espace/période
— deux moteurs de calcul indépendants sur la même donnée source.

---

## Frontend — chaîne de données réelle

### `loadSpace` → `useSpaceData.js` → `shopGranularData`

`store/modules/analyse.js:1696` (`loadSpace`) délègue à `useSpaceDataFetch`
(`analyse.js:1716-1795`) qui appelle `fetchSpaceData` (`src/composables/useSpaceData.js:25-392`),
en 2 phases :
- **Phase 1 (bloquante)** : `getSpace`, `getSpaceConfigurations`, `getSpaceShopDetails(spaceId,
  {page:1, limit:20})` (→ `GET /spaces/:id/shop-details?granular=0`), `getEvents`. Pas de granular
  ici — `shopGranularData` reste `[]` à ce stade.
- **Phase 2 (arrière-plan)** : `getSpaceShopGranular(spaceId, {page:1, limit:200})` (→
  `GET /spaces/:id/shop-details?granular=1`, **c'est l'appel qui remonte le join lourd**), plus
  catalogue (menu items, produits Weezevent, mappings, taxonomies) nécessaire à l'enrichissement
  client-side.

Avant d'entrer dans le store, chaque ligne passe par `enrichGranularMenuDimensions`
(`src/utils/analyseDimensions.js:20-110`), qui tente de reconstruire `menuItemType`/
`menuItemCategory`/`menuItemName` (NULL côté SQL, cf. section RPC ci-dessus) depuis le catalogue.
`state.shopGranularData` est ensuite **écrit deux fois** (`analyse.js:1743` puis `1752` — phase 2
put avant l'écrasement phase 1 vide) : ordre non garanti structurellement, fragile mais sans
incident connu à ce jour vu le différentiel de coût entre les deux appels.

### Enrichissement — `analyseReconciliation.js`

Le getter `reconciledShopGranularData` (`analyse.js:789-806`) applique `reconcileRecord`
(`src/utils/analyseReconciliation.js:378-538`) à chaque ligne : jamais un filtre — « toute vente
compte » (commentaire explicite lignes 1-13). Cascade de résolution du type/catégorie d'article
(lignes 430-521) : catalogue DataFriday matché → champs backend (NULL ici, cf. RPC) → nature/
subnature Weezevent → sentinelle `UNATTACHED_ITEM_KEY`/`UNATTACHED_SHOP_KEY` en dernier recours
(lignes 19-20, posées 523-531 et 393-395). Ces sentinelles sont **exclues des options de filtre**
mais **affichées comme un bucket gris distinct** (`#B0BEC5`, libellé i18n `anUnmatchedItems`) dans
les donuts (`MenuItemRevenueDistribution.vue`, `ShopDistributionPieChart.vue`) — comportement
volontaire, différent de l'ancien prototype React qui reversait ces lignes dans un bucket
« BEVERAGE » fourre-tout (confirmé absent du code React réel par confrontation directe, voir
Historique).

### Timeline event et item-level — indépendants de `shopGranularData`

Trois composables consomment directement `getSpaceEventTimelineBatch`
(`src/api/endpoints/space.api.js:158-188`, avec son propre cache mémoire interne
`_eventTimelineCache`), **chacun avec son propre cache local, sans passer par le store** :
`useAnalyseTimeline.js` (graphe timeline principal), `useAnalyseItemRecords.js` (records item-level
pour les vues « by article »), `useShopPerformance.js` (taux de transaction par shop). Le cache
prévu dans le store pour cet usage (`state.timelineCacheByEventId`, l'action singulier
`loadTimelineForEvent`, `analyse.js:2212-2229`, et le getter `aggregatedTimelineByEvent`,
`analyse.js:559-577`) est **entièrement mort** — 0 dispatch trouvé dans tout le repo. Toute
l'infrastructure de cache timeline du store est shadow-implémentée en dehors de lui.

> **Depuis le 2026-07-29 ([BUG-244-01](../bugs/244_01_timeline_analyse_filtres_non_appliques.md))** :
> la sortie d'`useAnalyseTimeline` ne va plus directement au graphique. `AnalyseView` la fait passer
> par `reconcileRecord` puis `buildItemFilterPredicate` (computeds `reconciledTimelineData` →
> `filteredTimelineData`) avant de la transmettre — la timeline partage donc enfin le périmètre des
> donuts et des tables. Deux conséquences pour qui touche à ce code :
>
> - le `passesFilters` interne d'`EventTimelineChart` est **mort pour le site d'appel Analyse** (les
>   props de filtre ne lui sont plus passées) mais **reste vivant pour `EventPredictView`**, qui
>   continue de lui donner ses données non filtrées ;
> **Depuis le 2026-07-29 ([BUG-245-01](../bugs/245_01_donut_categories_par_transaction.md))** : un
> **4ᵉ** consommateur s'ajoute, mais sur un endpoint DIFFÉRENT —
> `GET /spaces/:id/transaction-baskets` (`useTransactionBaskets.js`, cache local
> `_basketCache` dans `space.api.js`). C'est la **seule** lecture du code qui préserve l'identité de
> la transaction : `event-timeline` porte la même chaîne de jointure produit→catégorie mais écrase
> `t.id` en `COUNT(DISTINCT t.id)`, et aucun pré-agrégat ne porte de dimension transaction. Les deux
> méthodes backend partagent le helper privé `resolveEventSalesScope` (fenêtre de dates, scope
> tenant/intégration/PdV) : un scope qui divergerait ferait afficher deux périmètres différents sur
> le même écran.
>
> - le contexte de réconciliation a désormais **un seul point de définition**
>   (`composables/useReconciliationContext.js`), utilisé par `useAnalyseItemRecords`, les records
>   article des scénarios Predict et la timeline. Chaque appelant garde son propre `computed` (donc
>   son propre `matchMemo`), mais tous dérivent des mêmes champs du store : les valeurs sont
>   identiques par construction. Ne pas rouvrir un `buildReconciliationContext` en parallèle — deux
>   constructions divergentes attribueraient deux catégories différentes à la même ligne, et cliquer
>   une part de donut filtrerait alors la timeline à zéro.

### Formules KPI — trois implémentations concurrentes de « CA moyen par event »

> **Tranché le 2026-07-24 (réponse Bertrand — [Question #17](../QUESTIONS_A_BERTRAND.md))** :
> formule canonique = **total des CA des events enregistrés ÷ nombre d'events enregistrés**. Pas de
> filtre « CA > 0 », pas de repli conditionnel — donc ni la formule A (repli sur `events.length`
> uniquement si le Set est vide) ni B/C (exclusion stricte des events à CA nul) ne sont
> correctes telles quelles : le dénominateur doit être **tous** les events, sans filtrer sur le CA.
> **Code pas encore aligné** — les 3 implémentations ci-dessous sont toujours en place.

| Formule | Fichier:lignes | Définition d'« event avec CA » | Pilote |
|---|---|---|---|
| A | `useMetricsCalculator.js:39-80` | `eventsWithRevenueCount` = events avec `rowRevenue>0`, **repli sur `events.length` (tous, même à 0) si le Set est vide** | La **valeur** KPI affichée (carte « Moy./Évén. ») |
| B | `analyse.js:71-107` (`totalsForEventIds`) | `validEventCount` : somme du revenu par event strictement `> 0`, **aucun repli** | `summaryWithComparisons`, utilisé seulement si aucun item-level n'est chargé, ou en mode Predict |
| C | `AnalyseView.vue:695-727` (`itemTotals`) | Quasi copie de B (même règle stricte), mais recalculée localement sur les records item-level | La **variation %** affichée à côté de la valeur, dans le chemin normal (mode Analyse, item-level chargé) |

En usage normal, **la valeur vient de A et la variation % vient de C** — deux formules différentes
avec des définitions différentes d'« event valide » affichées côte à côte sur la même carte. Risque
de divergence visuelle réel, pas hypothétique (déjà présent dans le prototype React avec des
dénominateurs différents encore, voir Historique — la divergence a changé de forme au portage Vue
mais n'a jamais été résolue). **À unifier sur la formule tranchée ci-dessus** (total CA ÷ nb
events, sans filtre) dans les 3 fichiers.

`isSingleEventMode` (`useMetricsCalculator.js:37`) = strictement `selectedEventIds.length === 1`
dans le filtre — indépendant du nombre d'events affichés après les autres filtres, et différent de
la définition React historique (qui dépendait du mode d'affichage timeline, voir Historique).

`peakTransactionRate`/`peakWindow` (`useShopPerformance.js:111-232`) : fenêtre glissante de **15
minutes en dur** (pas paramétrable), balayée minute par minute où existe au moins une transaction,
max **toutes fenêtres tous events confondus** pour un shop donné (pas de reset par event). Métrique
ajoutée pendant le portage Vue — n'existe dans aucun prototype antérieur (confirmé par grep négatif
sur le code React, voir Historique).

### Candidats code mort confirmés dans le store (grep exhaustif, hors leur propre définition)

- Bucket complet `spaceSummary`/`menuKpis`/`eventKpis`/`costBreakdown` + action
  `loadSpaceLightweight` — voir Piège n°2.
- `timelineCacheByEventId` (state), `aggregatedTimelineByEvent` (getter), `loadTimelineForEvent`
  (action singulier, `analyse.js:2212-2229`) — 0 dispatch.
- `cachePrediction`/`getCachedPrediction` (actions, `analyse.js:2235-2243`) — le state
  `predictionCacheByEventConfigKey` qu'elles visaient est en réalité écrit directement par un
  `commit('SET_PREDICTION_FOR_KEY', ...)` dans `regeneratePredictions` (`analyse.js:2052`), sans
  passer par ces actions dédiées.
- `hasPredictiveRecords` (getter, `analyse.js:1522-1524`) — 0 occurrence externe.
- `catalogAssignedItems`/`catalogMenuItems`/`catalogMenuItemNames`/`catalogMenuItemTypes`/
  `catalogMenuItemCategories`/`assignedItemsPerShopElement` (getters, `analyse.js:933-1072`) —
  chaîne interne cohérente mais jamais consommée par un composant, supplantée par la chaîne
  data-driven `salesMenuItemNames/Types/Categories` (`analyse.js:1079-1087`).
- `futureEventsCount` (getter store, `analyse.js:1512-1519`, condition `d > today`) — jamais lu via
  `store.getters` ; `AnalyseView.vue:1126-1133` recalcule sa propre version locale avec une
  condition légèrement différente (`d >= today`) — écart sémantique dormant entre les deux si un
  event a lieu le jour même.

---

## Frontend — composants (`components/analyse/`)

### Route et gating

`router/index.js:137-144` : `/spaces/:spaceId` → `space-analyse` → `AnalyseView.vue`,
`beforeEnter: spaceEntryGuard`, **pas de `meta.permission` direct**. Le gating réel se fait dans
`router/guards.js:184-216` (`SPACE_SCREENS`/`spaceEntryGuard`) : si l'utilisateur n'a pas
`front.fb.analyse`, il est redirigé vers le premier écran d'espace que son rôle autorise
(Predict → Inventory → Logistic → Restock), sinon vers `/spaces`.

### Composants vivants (importés réellement par `AnalyseView.vue`, 1644 lignes)

| Composant | Rôle |
|---|---|
| `filters/FilterSummary.vue` | Bandeau période + toggle comparaison (Précédent/N-1) |
| `filters/FilterPanel.vue` (celui du sous-dossier `filters/`, **pas** celui à la racine `analyse/`) | Colonne filtres : accordéons Événements/Dates/Affluence/Avancés/PdV/Types/Zones/Articles |
| `filters/CheckboxListFilter.vue` | Liste à cocher générique, réutilisée aussi par `panels/FilterEditorPanel.vue` |
| `panels/FinancialMetricsGrid.vue` + `panels/KpiCard.vue` | 4 cartes KPI (CA, per-cap, marge, taux transaction) |
| `charts/ShopPerformanceByTransactionRate.vue` | Panneau txn/min, 1ère heure, pic 15 min (via `useShopPerformance`) |
| `charts/GenericByEventChart.vue` | Graphe barres générique par event, rendu inline (le dialog qui l'enveloppait est mort, voir Code mort) |
| `dialogs/ShopItemEventsDialog.vue` | Events d'un combo PdV×article |
| `dialogs/UnalignedEventsDialog.vue` | Events écartés de la moyenne (pas d'heure de coup d'envoi saisie) |
| `charts/EventRevenueByShopChart.vue` (762 l.) | Carte CA par event/PdV, empilable par shop ou par type d'article, atténuation 50% des events passés en mode Predict |
| `charts/EventTimelineChart.vue` (761 l., partagé avec `EventPredictView.vue`) | Timeline minute par minute, délègue le bucketing à `utils/timelineBucketing.js` (source unique partagée Analyse/Predict/EventPredict/Stockup) |
| `charts/ShopDistributionPieChart.vue` | 3 donuts PdV/Type/Zone, sentinelle `UNATTACHED_SHOP_KEY` |
| `tables/MenuItemRevenueDistribution.vue` | Cartes « by POS type » + 3 donuts article/type/catégorie, sentinelle `UNATTACHED_ITEM_KEY` |
| `tables/MenuItemsByShopTable.vue` | Double vue PdV/article, export XLSX, lien fiche catalogue si l'article est réellement rattaché |

Ces deux vues consomment `articleRecords` (et non `chartRecords`). En mode **Analyse** c'est
`chartRecords` à l'identique. En mode **Predict**, la prédiction du moteur est shop-level (aucun
`menuItemId`) : le grain article vient alors des **scénarios Event Predict**
(`EventPredictVersion.predictedRecords`, reconstruits par `regeneratePredictions` dans
`state.predictScenarioItemRecords`, cf. `utils/predictScenarioRecords.js`). Les events prédits sans
scénario sauvegardé n'ont donc aucun article et sont signalés par un compteur (`missingEventsCount`).
Détail, limites et pièges : fiche [190](../bugs/190_predict_vues_article_absentes_grain_shop_level.md).
| `panels/SummaryPanel.vue` | Colonne droite : assistant IA local + leaderboards cliquables |
| `panels/FilterEditorPanel.vue` | Mini-éditeur multi-select ouvert depuis un chip du bandeau |
| `charts/DonutChartCard.vue` | Donut Chart.js générique, réutilisé par les 2 composants donuts ci-dessus |

Le header vient de `WorkspaceAppHeader.vue` (composant partagé, pas spécifique à Analyse).

### Code mort confirmé (grep exhaustif, 0 importeur hors le fichier lui-même)

| Fichier | Preuve |
|---|---|
| `analyse/FilterPanel.vue` (racine du dossier `analyse/`, 707 lignes, doublon de `filters/FilterPanel.vue`) | 0 import ailleurs que sa propre définition |
| `analyse/filters/MultiSelectFilter.vue` | N'était importé que par le `FilterPanel.vue` racine ci-dessus — mort par transitivité |
| `analyse/AnalyseAppHeader.vue` | 5 occurrences restantes, toutes en commentaire (`App.vue:153`, `WorkspaceAppHeader.vue:85`, etc.), 0 import réel — remplacé par `WorkspaceAppHeader.vue` |
| `analyse/filters/FilterBottomSheet.vue` | 0 occurrence, même pas auto-référencé |
| `analyse/dialogs/ByEventChartDialog.vue` | 0 occurrence — le graphe by-event est maintenant rendu inline dans `AnalyseView.vue` |
| `src/components/ShopDistributionPieChart.vue`, `EventRevenueByShopChart.vue`, `EventTimelineChart.vue`, `MenuItemQuantityPieChart.vue` (racine `src/components/`) | Tous les imports réels pointent vers `./charts/...` (sous `analyse/`) ; ces 4 fichiers racine ne sont importés nulle part, ni dans le router |
| `src/components/ConsolidatedAccountView.vue`, `EventsView.vue` | Atteignables uniquement via la chaîne `appCopy.vue` → `ConsolidatedEventsView.vue`/`ConsolidatedAccountView.vue` → `EventsListPanel.vue` → `EventsView.vue` ; `appCopy.vue` lui-même n'est importé nulle part (ni le router, ni ailleurs) |
| `src/utils/predictiveAnalytics.legacy.js` | 0 importeur (vit dans `utils/`, pas `composables/` malgré son nom évocateur) |

**Vivant mais hors périmètre strict de l'écran Analyse** : `SpaceRevenueByMonth.vue`/
`SpaceRevenueByMonthChart.vue` — importés par `SpacesPage.vue`, monté par `SpacesOverviewView.vue`,
routé sur `/spaces-overview` (`router/index.js:130-134`), **pas** `/spaces/:id`. Ces deux fichiers
contiennent bien le champ `event_revenue_HT` — absent de la vraie route Analyse mais utilisé sur cet
écran voisin ; à corriger séparément si `/spaces-overview` est audité un jour.

---

## Client API — qui appelle quoi

| Fichier | Statut réel | Détail |
|---|---|---|
| `src/api/endpoints/analyse.api.js` | **Mort** (voir Piège n°2) | Seul appelant : l'action `loadSpaceLightweight`, jamais dispatchée |
| `src/api/endpoints/aggregation.api.js` | **Vivant, mais nom trompeur** | Expose à la fois les vraies fonctions du module backend `Aggregation` (`getStep4Context`, `processEvents`, `synchronize`, `getJobProgress`, `getEventBreakdown`, `getEventMinuteChart` — tous utilisés par le wizard Data Integration étape 4/5) **et** une grosse quantité de fonctions Weezevent/Digifood (locations, produits, sync, instances multi — domaine « Intégrations & ventes », pas « Aggregation ») ; `getEventsTimeline`/`getEventStats`/`skipEvent` n'ont aucun appelant frontend |
| `src/api/endpoints/mapping.api.js` | **Vivant** | Consommé par les étapes 1-3 du wizard Data Integration (`StepMapShops`, `StepMapMenuItems`, écrans de progression) |
| `src/api/endpoints/space.api.js` (fonctions `getSpaceShopDetails`/`getSpaceShopGranular`/`getSpaceEventTimeline(Batch)`) | **Vivant — le vrai moteur de données** | Consommé par `useSpaceData.js` (shop-level) et par `useAnalyseTimeline.js`/`useAnalyseItemRecords.js`/`useShopPerformance.js` (item-level, direct, sans passer par le store) |

---

## Bugs actifs confirmés (2026-07-15 ; statuts mis à jour 2026-07-18)

> **Mise à jour 2026-07-18** : #9 → décision de formule portée à `QUESTIONS_A_BERTRAND.md` #17
> (pas de code tant que non tranché). **Mise à jour 2026-07-24** : #9 tranché par Bertrand (total
> CA ÷ nb events enregistrés, sans filtre `CA > 0`) — code des 3 implémentations pas encore
> unifié. #10 corrigé : getter store mort `futureEventsCount`
> supprimé, seule reste la version locale d'`AnalyseView.vue` (condition `>=`, l'event du jour
> compte comme futur). S'ajoute le bug majeur découvert ce jour — item-level vide alors que le
> shop-level affiche du CA — corrigé côté backend (fiche back 103) et durci côté front (fiche 187),
> voir la section `GET /spaces/:id/event-timeline` ci-dessus.

| # | Bug | Fichiers | Repro |
|---|---|---|---|
| 1 | Le pipeline d'agrégation réellement exécuté (`AggregationService`) écrit un `menuItemId` dans la colonne `spaceElementId` et duplique `locationId` dans `weezeventMerchantId` — la jointure « shops list » de la RPC de lecture ne peut donc jamais matcher ces lignes | `aggregation.service.ts:274-276`, RPC `20260704200000_...sql:296-306` | Lancer « Traiter les événements » dans le wizard sur un espace, puis observer `shops[].revenue` dans la réponse `GET /spaces/:id/shop-details` : à 0 ou incohérent malgré des ventes réelles agrégées |
| 2 | La formule de CA du pipeline vivant ne convertit jamais TTC→HT (pas de division par `1+vat/100`), contrairement au pipeline mort `SpaceAggregationService` et au calcul live `getEventTimelineBatch` | `aggregation.service.ts:264-300` vs `space-aggregation.service.ts:171-178` vs `spaces.service.ts:1118-1121` | Comparer `SpaceRevenueMinuteAgg.revenueHt` d'un event à la somme calculée par `GET /spaces/:id/event-timeline/:eventId` pour le même event |
| 3 | `SpaceProductRevenueDailyAgg` inclut les ventes de produits non mappés à un MenuItem, `SpaceRevenueMinuteAgg` les exclut (INNER JOIN) — deux tables sensées décrire le même historique divergent en périmètre | `aggregation.service.ts:284-285` (exclut) vs `:303-329` (inclut) | Sommer les deux tables pour le même event/tenant sur un espace avec des ventes non mappées |
| 4 | `step2_shops_mapped` du wizard est calculé différemment entre la route unitaire et la route bulk de progression, sur les mêmes lignes de `LocationShopMapping` | `mappings.service.ts:750-765` vs `:902-904` | Comparer `GET /mappings/progress/:locationId` et `GET /mappings/progress` pour la même location après un mapping fait uniquement via l'endpoint merchant-element |
| 5 | `createMerchantElementMapping`/`bulkMerchantElementMappings` (happy-path) n'imposent aucune vérification d'ownership tenant sur le `spaceElementId` | `mappings.service.ts:364-434` | Appeler l'endpoint avec un `spaceElementId` d'un autre tenant (nécessite un accès API direct) |
| 6 | Aucun retry BullMQ sur la queue d'agrégation (`attempts:1`), malgré un défaut global `attempts:3`+backoff explicitement écrasé | `queue.service.ts:274` vs `queue.module.ts:29-37` | Provoquer un timeout DB transitoire pendant un `synchronize` : le job échoue définitivement, aucune notification de relance automatique |
| 7 | `getEventsTimelineStatus` : un event marqué « skipped » après un traitement réussi conserve ses données déjà agrégées mais affiche un statut trompeur (le comptage `dataPoints` et le statut ne sont pas garantis cohérents) | `aggregation.service.ts:51-70` | Traiter un event avec succès, puis appeler `skip-event` dessus, puis relire `events-timeline` |
| 8 | Jointure `Event` DataFriday ↔ `WeezeventEvent` par égalité de DATE seule dans la RPC `get_space_shop_details` | `20260704200000_...sql:175-178,224-227` | Deux events Weezevent le même jour calendaire sur le même espace |
| 9 | Triple formule « CA moyen par event », deux définitions différentes d'« event valide » affichées côte à côte (valeur vs variation) — **tranché 2026-07-24** : total CA ÷ nb events, sans filtre (Question #17), code à unifier | `useMetricsCalculator.js:39-80`, `analyse.js:71-107`, `AnalyseView.vue:695-727` | Sélectionner une période avec un event à CA nul parmi d'autres à CA positif |
| 10 | `futureEventsCount` : deux implémentations (store mort, composant vivant) avec des conditions `>` vs `>=` légèrement différentes | `analyse.js:1512-1519` vs `AnalyseView.vue:1126-1133` | Un event ayant lieu le jour même de la consultation |

---

## Code mort de ce domaine — récapitulatif

- Module backend `Analyse` entier (`features/analyse/`) — voir Piège n°2.
- Module backend `DashboardController`/`SpaceAggregationService` (routes `/spaces/:id/dashboard*`)
  — voir Piège n°1 ; contient pourtant la formule de calcul correcte.
- `AggregationController` : routes `events-timeline/:spaceId`, `event-stats/:spaceId/:eventId`,
  `skip-event` — aucun appelant frontend.
- Store `analyse.js` : bucket `spaceSummary`/`menuKpis`/`eventKpis`/`costBreakdown` + action
  `loadSpaceLightweight` ; `timelineCacheByEventId`/`aggregatedTimelineByEvent`/
  `loadTimelineForEvent` ; `cachePrediction`/`getCachedPrediction` ; `hasPredictiveRecords` ;
  chaîne `catalogAssignedItems`/`catalogMenuItems*` ; `futureEventsCount` (getter store).
- Composants : `analyse/FilterPanel.vue` (racine) + `analyse/filters/MultiSelectFilter.vue` (mort
  par transitivité) ; `analyse/AnalyseAppHeader.vue` ; `analyse/filters/FilterBottomSheet.vue` ;
  `analyse/dialogs/ByEventChartDialog.vue` ; `src/components/ShopDistributionPieChart.vue`,
  `EventRevenueByShopChart.vue`, `EventTimelineChart.vue`, `MenuItemQuantityPieChart.vue` (racine,
  doublons des versions vivantes sous `analyse/charts/`) ; `src/components/ConsolidatedAccountView.vue`,
  `EventsView.vue` (atteignables uniquement via `appCopy.vue`, lui-même mort) ;
  `src/utils/predictiveAnalytics.legacy.js`.

---

## Historique — ce qui a changé depuis le prototype React

Confrontation complète dans `docs/utiles/prototypes/07_REACT_ANALYSEVIEW.md`. Points confirmés
encore pertinents aujourd'hui :
- Le comportement « fourre-tout BEVERAGE » pour les articles non résolus, parfois documenté comme
  historique, **n'a jamais existé dans le code React réel** (vérifié par lecture directe de
  `MenuItemQuantityPieChart.tsx`) — c'était une déviation introduite (puis corrigée) côté portage
  Vue ; le composant vivant aujourd'hui (`MenuItemRevenueDistribution.vue`) utilise la sentinelle
  grise `UNATTACHED_ITEM_KEY`, jamais un repli sur une catégorie existante.
- La duplication de formule « CA moyen par event » existait déjà en React (2 formules, dénominateurs
  différents) — elle **a changé de forme** au portage Vue (3 implémentations aujourd'hui, cf. bug
  #9) mais n'a jamais été résolue, dans aucune des deux générations du produit.
- `peakTransactionRate`/`peakWindow` (fenêtre 15 min) sont un ajout pur du portage Vue, sans aucun
  précédent dans le code React (grep négatif confirmé sur tout `versionReact/`).
- `isSingleEventMode` a changé de définition entre les deux générations (dépendait du mode
  d'affichage timeline en React, dépend uniquement du nombre d'events sélectionnés en Vue) — ce
  n'est pas un simple portage 1:1, à garder en tête si un comportement « ne fait plus comme avant »
  est signalé par un utilisateur qui a connu les deux versions.
- Le module d'agrégation pré-calculée (`SpaceRevenueMinuteAgg` et le pipeline associé) est un ajout
  du backend NestJS — il n'existe aucun équivalent dans le prototype React, qui calculait tout en
  live côté client à partir d'un payload plus riche. Le Piège n°1 documenté plus haut est donc une
  dette entièrement née pendant la construction du backend actuel, pas héritée du prototype.

---

## Zones grises restantes — points réellement non tranchés (vérifiés, pas des angles morts)

- **Priorité `line.unitCost` vs `Ingredient.costPerRecipeUnit`** dans `menuItemCostMap` (RPC
  `get_space_shop_details`, lignes 234-255) : la requête prend `MIN(mi."totalCost")` par
  `menuItemId`/`productId` — comportement simple et vérifié, mais je n'ai pas vérifié si un même
  `menuItemId` peut légitimement avoir plusieurs `totalCost` différents dans l'historique agrégé
  (auquel cas `MIN` sous-estimerait systématiquement le coût) — à creuser si un ticket de marge
  incorrecte remonte sur cet endroit précis.
- **`Supplier.configurationIds`/`sectors`** (déjà signalé comme zone grise dans
  `04_MENU_CATALOGUE.md`) — sans lien direct avec ce domaine mais partage le même flou d'usage non
  exploré en détail.
- **`ProductMapping.confidence`/`autoMapped`/`mappedBy`** : le mécanisme de suggestion automatique de
  mapping produit→menu (probablement basé sur un score de similarité de nom) n'a pas été lu dans
  cette passe — je n'ai vérifié que le contrat CRUD du mapping lui-même (`mappings.service.ts`), pas
  l'algorithme qui pose `confidence`/`autoMapped=true`. Point réellement non vérifié, pas supposé
  inexistant : à lire dans le service qui appelle `bulkProductMappings` avec `autoMapped:true` avant
  de documenter la logique de suggestion.
- **Décision produit à prendre, pas un bug** : les trois pipelines d'agrégation (Piège n°1) doivent
  être arbitrés — fusionner sur la formule correcte de `SpaceAggregationService`, ou fusionner
  l'inverse et corriger `AggregationService` en conservant son architecture de queue Bull (plus
  robuste pour de gros volumes que les boucles `upsert` séquentielles de `SpaceAggregationService`,
  qui n'a aucune queue et tourne en synchrone dans la requête HTTP `POST rebuild`). Les deux options
  sont viables ; ce n'est pas tranché dans le code actuel.
