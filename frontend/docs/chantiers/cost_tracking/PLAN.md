# Chantier : Cost tracking, historique des coûts et prix par article (demande Bertrand)

Statut (2026-10-21) : **plan écrit, rien codé**. Maquette validée par Ulrich (voir [`maquette.html`](maquette.html), version 3). Les décisions de §2 sont tranchées. Les points de §9 restent à confirmer avant les lots concernés.

## 1. Ce que demande Bertrand

1. Quand un prix d'ingrédient ou une recette change et modifie le coût d'un Menu Item, **garder l'ancien coût et l'ancienne recette** pour ne pas modifier les rapports des événements passés.
2. Coûts et prix de vente **mémorisés avec le Menu Item ID**, pour suivre la marge dans le temps, et **associés aux events selon leur date d'application**.
3. Une section **Cost tracking** dans Analyse : coût par Article, par Type et par Catégorie, trois filtres dépendants, graphique temps en abscisse et coût en ordonnée, lignes = top 10 articles si non filtrés, sinon types ou catégories.
4. Demande d'Ulrich après la maquette : **nom de l'événement en diagonale** sous l'axe, et au survol.

Consommateurs actuels du coût et du prix : Analyse (marge) et Event Predict (CA et marge prédictifs).

## 2. Décisions validées

| # | Décision |
|---|---|
| 1 | Date d'application = **date du changement** (pas de date d'effet saisie, pas d'antidatage en v1). |
| 2 | Top 10 des articles par **CA sur la période affichée**. |
| 3 | Ligne de Type ou de Catégorie = **moyenne simple** du coût par pièce des articles actifs. |
| 4 | Hiérarchie **Type, puis Catégorie, puis Article** (`ProductCategory.typeId` est obligatoire). Choisir un enfant remplit le parent, changer le parent vide les choix incompatibles. |
| 5 | **Page séparée** sous Analyse dans le sélecteur d'outils, rien ajouté au pipeline de chargement d'Analyse. |
| 6 | Bascule « Par article, par catégorie, par type » dans l'en-tête du graphique, qui suit les filtres. Courbe de marge limitée à 3 lignes. |
| 7 | Étiquettes d'events en diagonale (40 degrés) sous l'axe, supprimées quand elles se serrent (moins de 17 px), infobulle au survol de l'étiquette et du losange pour tous. |
| 8 | La notice ambre « Suivi des coûts actif depuis le… » se **ferme par une croix** en haut à droite. En production, la fermeture est mémorisée par utilisateur (`localStorage`, clé `costTracking.baselineNoticeDismissed`, lecture et écriture dans un try/catch). La maquette ne la mémorise pas. |

## 3. Constat dans le code (avant chantier)

| Sujet | Constat |
|---|---|
| Coût courant, écrasé | `MenuItem.totalCost` et `margin` sont réécrits sur place par `refreshCosts` et `refreshComboCost` ([`menu-item-cost.service.ts`](../../../../backend/src/features/menu-items/services/menu-item-cost.service.ts)). Les lignes `MenuItemComponent/Ingredient/Packaging.unitCost` aussi. `MarketPrice.price` est écrasé sans historique. |
| Points de recalcul | `refreshCosts` : [`menu-item-command.service.ts`](../../../../backend/src/features/menu-items/services/menu-item-command.service.ts) (l.189, 333), [`menu-item-composition.service.ts`](../../../../backend/src/features/menu-items/services/menu-item-composition.service.ts) (l.44, 78, 112, 148), [`menu-items.controller.ts`](../../../../backend/src/features/menu-items/menu-items.controller.ts) (l.196 global, l.210 unitaire), propagation prix du marché : [`market-price-cost-propagation.service.ts`](../../../../backend/src/features/market-prices/services/market-price-cost-propagation.service.ts). Composants : `menu-components.service.ts` (l.99, 149, 276, 444). **À vérifier** : un changement de recette de composant se propage-t-il aux articles qui l'utilisent hors prix du marché. |
| Historique de prix existant | `MenuItemPriceHistory` : prix TTC, espace, source (Weezevent ou manuel). Aucun coût, aucune recette. Source de vérité du prix de vente passé. |
| Coût utilisé par l'Analyse | **Une seule carte `menuItemCostMap` (article vers coût), sans dimension event.** Elle est construite **dans la RPC SQL `shop_details`** (`MIN(mi."totalCost")` via `WeezeventProductMapping`, migration `20261016120000_shop_details_rpc_exclude_declared_sources`), stockée dans `store.analyse.menuItemCostMap` et lue par `assembleTimelineRecords`, `preprocessTimelineRecords` ([`timelineBucketing.js`](../../../src/utils/timelineBucketing.js) l.261), `itemLevelTotalsByEvent` ([`analyseAggregations.js`](../../../src/utils/analyseAggregations.js) l.391), `computeItemTotals`, `totalsForEventIds` ([`analyse.js`](../../../src/store/modules/analyse.js) l.1325, 1386), `useMetricsCalculator`, `analyseAssistant`, composables de comparaison. Aujourd'hui un changement de coût **réécrit rétroactivement** toutes les marges passées. |
| Marge Weezevent | [`weezevent-sales-analytics.queries.ts`](../../../../backend/src/features/weezevent/services/weezevent-sales-analytics.queries.ts) l.92 joint `MenuItem.totalCost` courant. Même défaut. |
| Incohérence existante | La carte d'Analyse est en **coût de fournée** (`totalCost`), alors que la marge de Menu Item et le resolver de stock divisent par `numberOfPiecesRecipe`. À ne pas changer en v1 (voir §9, point 3). |
| Instant d'un event | `Event.eventDate` est un jour à minuit (100 % des events). `resolveDoorsOpenAt` ([`event-window.util.ts`](../../../../backend/src/shared/utils/event-window.util.ts) l.97) renvoie l'heure d'ouverture des portes ou `null`, sans repli sur minuit. |
| Chart | Analyse dessine en Chart.js (canvas). Les paliers en escalier, les losanges et les étiquettes en diagonale sont plus simples en SVG, déjà prototypé dans la maquette. |

## 4. Architecture cible

### 4.1 Table `MenuItemCostSnapshot` (additive)

Une ligne par **version** de coût d'un article. Immuable, jamais mise à jour.

| Champ | Contenu |
|---|---|
| `id`, `tenantId`, `menuItemId` | Identité. FK `onDelete: Cascade` sur l'article. |
| `effectiveFrom` | Instant du changement (`now()` au moment de l'écriture). |
| `totalCost` | Coût de la fournée (même sémantique que `MenuItem.totalCost`). |
| `numberOfPieces` | `numberOfPiecesRecipe` au moment du snapshot (repli 1). |
| `costPerPiece` | `totalCost / numberOfPieces`, stocké pour les lectures. |
| `basePrice`, `vatRate` | Prix de vente courant à ce moment (le prix par espace reste dans `MenuItemPriceHistory`). |
| `recipe` (Json) | Recette figée : lignes `{kind, refId, name, quantity, unitCost}` (composants, ingrédients, emballages, enfants de combo). |
| `reason` | `baseline`, `market_price`, `recipe_edit`, `component_edit`, `combo_edit`, `manual_refresh`, `created`. |
| `sourceRef` (Json, optionnel) | Ex. `{marketPriceIds: [...]}` pour afficher « Steak haché 1,58 à 1,71 ». |
| `createdAt` | Pose. |

Index : `(menuItemId, effectiveFrom desc)`, `(tenantId, effectiveFrom)`. Contrainte : pas de doublon identique consécutif (voir idempotence §4.2).

### 4.2 Écriture : un seul service

`MenuItemCostSnapshotService` (nouveau fichier, dans `menu-items/services/`), appelé **par les deux services de coût** et jamais par les contrôleurs :

- `recordIfChanged(tenantId, itemIds, reason, sourceRef?)` : charge le dernier snapshot de chaque article, compare (`totalCost`, `numberOfPieces`, `basePrice`, hash de la recette), n'insère que s'il y a une différence. **Idempotent** : relancer un refresh ne crée rien.
- Écriture **en lot** (un `createMany` par appel), jamais ligne par ligne : un CSV de prix du marché touche des centaines d'articles.
- Appelé après la persistance de `totalCost` dans `refreshCosts` et `refreshComboCost`, avec la cause fournie par l'appelant (prix du marché, édition de recette, etc.).
- Un échec d'écriture du snapshot **ne bloque pas** le recalcul (même politique que la propagation, avec log `warn`), mais est compté pour alerte.

### 4.3 Lecture : coût d'un article à la date d'un event

`costsAsOf(tenantId, {eventId, menuItemIds})` : instant de référence de l'event = `resolveDoorsOpenAt(event, tz)` sinon **minuit du jour de l'event**. Retient le dernier snapshot avec `effectiveFrom <= instant`. Si l'event précède le premier snapshot, retourne ce premier snapshot avec `source: 'baseline'` (l'UI affiche la notice « suivi actif depuis le… »). Un seul `SELECT DISTINCT ON (menuItemId)` par lot d'events, avec `EXPLAIN` avant livraison (règle maison sur les tables volumineuses).

### 4.4 Baseline

- Script `backend/scripts/backfill-cost-snapshots.ts`, **idempotent**, un snapshot `baseline` par article actif (`effectiveFrom` = instant d'exécution). Lancé après déploiement de la migration, sur demande explicite (la base de prod ne se touche pas sans go).
- Les articles créés ensuite reçoivent un snapshot `created` à la création.
- Aucun historique antérieur n'est reconstituable (prix du marché déjà écrasés). Les events antérieurs prennent le coût de la baseline, signalé dans l'UI.

## 5. Lots

Ordre de livraison : **backend avant frontend** (règle déjà suivie sur le live). Une branche `feat/cost-tracking` créée **depuis `production` dans un worktree dédié** (comme `feat/logistic-ventilation`), PR vers `staging` selon le `CLAUDE.md` du frontend : l'arbre de travail actuel (`fix/weezevent-sync-pagination-and-date-guard`) contient des modifications non commitées d'un autre chantier à ne pas mélanger.

### Lot 0 : lever les doutes (petit)

- Confirmer les points de §9 (1, 2, 3).
- Vérifier la propagation composant vers articles (§3, ligne « Points de recalcul »).
- Spike lecture du CA par article sur une période : requête sur les agrégats (`SpaceRevenueMinuteItemAgg` via le scope d'intégrations, jamais les transactions brutes), `EXPLAIN` et temps sur la base locale.
- Rédiger l'ADR « historique des coûts par snapshots immuables ».

### Lot 1 : snapshots (backend, taille M)

| Fichier | Changement |
|---|---|
| `prisma/schema.prisma` + migration datée | Modèle `MenuItemCostSnapshot`, index, relation `MenuItem.costSnapshots`. |
| `menu-items/services/menu-item-cost-snapshot.service.ts` (nouveau) | `recordIfChanged`, `latestFor`, hash de recette. |
| `menu-item-cost.service.ts` | Appel après persistance dans `refreshCosts` et `refreshComboCost`. |
| `market-price-cost-propagation.service.ts` | Passe la cause `market_price` et `sourceRef`. |
| `menu-item-command.service.ts`, `menu-item-composition.service.ts`, `menu-components.service.ts` | Cause `recipe_edit`, `component_edit`, `combo_edit`. Snapshot `created` à la création. |
| `scripts/backfill-cost-snapshots.ts` | Baseline idempotente. |
| Tests | Idempotence, lot de 500 articles, combo, échec d'écriture non bloquant. |

Critères de fin : modifier un prix du marché crée exactement une version par article touché ; un second refresh n'en crée aucune ; la recette figée relit les anciennes quantités.

### Lot 2 : API Cost tracking + permission (backend, taille M)

- Module `cost-tracking` (nouveau dossier `features/cost-tracking/`).
- `GET /cost-tracking/:spaceId/series?from&to&typeId&categoryId&menuItemId&groupBy` : séries en escalier (points de changement uniquement), top 10 par CA quand `groupBy=article` sans filtre article, moyenne simple pour catégorie et type, matchs de la période (id, nom, date, instant de référence).
- `GET /cost-tracking/:spaceId/catalog` : hiérarchie Type, Catégorie, Article pour les dropdowns dépendants.
- `GET /cost-tracking/articles/:id/history` : versions, cause, recette figée.
- Périmètre des articles : voir §9, point 2.
- Permission `front.fb.costTracking` dans [`permission-catalog.ts`](../../../../backend/src/core/rbac/permission-catalog.ts), ajoutée aux mêmes rôles que `front.fb.analyse`, **vérifier la sync RBAC** (des permissions manquantes ont déjà dû être créées à la main).
- Tests unitaires par fichier spec, `--runInBand`.

### Lot 3 : page frontend (taille L, tout dans de nouveaux fichiers)

Chaîne imposée : composant, composable, store, API, client.

| Fichier (nouveau) | Rôle |
|---|---|
| `src/api/endpoints/cost-tracking.api.js` | Appels des 3 routes. |
| `src/store/modules/costTracking.js` | Module standard (`list`, `cachedAt`, `fetching`, `fetchList({force})`, `invalidate`). |
| `src/composables/useCostTracking.js` | Filtres dépendants, mode « Afficher par » automatique, période. |
| `src/utils/costTrackingSeries.js` | Pur : `niceTicks`, échelles, chemin en escalier, thinning des étiquettes (testable en Jest). |
| `.../cost-tracking/views/SpaceCostTrackingView.vue` | Page, grille 3 colonnes d'Analyse. |
| `.../cost-tracking/CostTrackingFilterPanel.vue`, `CostTrackingChart.vue`, `CostTrackingTable.vue`, `CostTrackingHistoryDrawer.vue`, `CostTrackingSummaryPanel.vue` | Un composant par bloc de la maquette (pas de fichier monolithique). |
| `src/router/index.js`, `src/router/guards.js` | Route `space-cost-tracking`, permission, atterrissage. |
| `src/composables/useWorkspaceToolbox.js` | Entrée « Cost tracking » après Analyse, `navigateToTool`. |
| `src/i18n/translations.js` | Clés FR et EN, libellés sans tiret cadratin. |
| `tests/unit/costTrackingSeries.spec.js`, `useCostTracking.spec.js` | Séries, dépendance des filtres, thinning. |

Charte : tokens `--fs-*` et `--fw-*`, `pnpm lint:typo` sur le diff. Thème sombre : couleurs de la maquette (variables Vuetify). Pas de `pnpm build` de mon côté : Ulrich build et teste dans le navigateur.

### Lot 4 : coûts à la date de l'event dans les rapports (taille L, risque le plus élevé)

C'est le lot qui répond à la demande « ne pas modifier les rapports passés ». Il touche des chiffres que Bertrand regarde déjà : livraison derrière un **repli sûr** (sans snapshot, comportement identique à aujourd'hui).

Backend :
- `GET /analyse/:spaceId/event-costs?eventIds=` : `{eventId: {menuItemId: {totalCost, source, versionAt}}}`, par lots de 100 events (même plafond que l'event-timeline).
- Marge Weezevent : jointure latérale sur le snapshot à la date de l'event.
- **Ne pas modifier la RPC `shop_details`** (déjà modifiée à répétition, coûteuse) : `menuItemCostMap` reste le coût courant, la nouvelle carte par event vient d'un appel distinct.

Frontend :
- `store.analyse.menuItemCostByEvent` + helper `costFor(eventId, menuItemId)` avec repli sur `menuItemCostMap`.
- À brancher : `preprocessTimelineRecords`, `itemLevelTotalsByEvent`, `computeItemTotals`, `totalsForEventIds` (2 sites), `useMetricsCalculator`, `analyseAssistant`, composables de comparaison (`useComparisonKpis`, `useComparisonTimeline`). Les records portent déjà `eventId`.
- Live (`useLiveItemRecords`) et Event Predict : **inchangés**, ils utilisent le coût courant par nature.
- Tests : un event avant un changement garde l'ancienne marge, un event après prend la nouvelle, un event sans snapshot garde le comportement actuel, comparaison sur deux fenêtres.

### Lot 5 : optionnel, après retours de Bertrand

- Interrupteur d'axe « Temps | Matchs » (un point par match, noms complets), proposé à Ulrich, non validé.
- Export CSV de la page.
- Prix de vente par espace dans le suivi.

## 6. Données et déploiement

- Migrations appliquées automatiquement au déploiement (`prisma migrate deploy`, comme les chantiers précédents). La table est additive, aucune colonne existante modifiée.
- `backend/.env` pointe sur la base **locale** : tests et script de baseline d'abord en local. La base de prod ne se lit qu'en `SELECT` (`envFiles/.env.prod-db-readonly`), jamais de `SET` de session sur le pooleur 6543 (`begin read only`).
- Ordre : backend et migration, **baseline**, puis frontend. Lot 4 en dernier, après une recette sur un ou deux events de référence.
- **Aucun déploiement, merge ou commit sans go explicite d'Ulrich.**

## 7. Risques

| Risque | Parade |
|---|---|
| Volume d'écritures sur gros imports (CSV de prix du marché) | `createMany` par lot, un seul appel de propagation, comparaison avant insertion. |
| Snapshots de combos faux | `refreshCosts` global est plat (ne recalcule pas la part combo). Écrire le snapshot **après** `refreshComboCost` pour les parents de combo, test dédié. |
| Régression des marges d'Analyse (lot 4) | Repli sur la carte actuelle, recette sur events de référence avant et après, un lot par PR. |
| Lecture lente du CA par article (top 10) | Agrégats uniquement, `EXPLAIN`, période bornée, cache comme les autres vues d'Analyse. |
| Pollution inter-intégrations des agrégats (BUG-384-02) | Passer par le scope d'intégrations existant, pas de lecture directe. |
| Instant de référence à minuit (events sans heure) | Un changement fait le jour du match ne s'applique qu'au match suivant, à valider (§9, point 1). |
| Chart.js déjà présent mais SVG choisi | Composant SVG isolé et testé sur sa partie pure, aucune dépendance ajoutée. |

## 8. Hors périmètre

Reconstituer l'historique avant la mise en service, antidater un changement, suivre le coût d'un composant ou d'un ingrédient seul (seul l'article est suivi), toucher Event Predict, changer l'unité du coût d'Analyse (fournée contre pièce).

## 9. Points à confirmer (consigner dans [`QUESTIONS_A_BERTRAND.md`](../../QUESTIONS_A_BERTRAND.md) si non tranchés)

1. **Instant de référence d'un event** : portes ouvertes, sinon minuit du jour. Recommandé. Alternative : fin du jour.
2. **Périmètre des articles de la page** : articles du Space Menu de l'espace (recommandé) ou tous les articles du tenant.
3. **Fournée contre pièce dans Analyse** : l'Analyse multiplie la quantité vendue par `totalCost` (fournée), la marge de Menu Item divise par les pièces. Les deux divergent pour tout article à plusieurs pièces. Le lot 4 conserve la sémantique actuelle. Faut-il aligner Analyse sur la pièce, dans un chantier séparé ?
4. **Prix de vente** : snapshot du prix global à chaque version, prix par espace hors v1.
5. **Rétention** : aucune purge des snapshots.
6. **Interrupteur d'axe Temps | Matchs** : à ajouter ou non (lot 5).

## 10. Suite immédiate

Lot 0, puis lot 1 sur sa branche. Ordre de PR : 1, 2, 3, puis 4 isolé.
