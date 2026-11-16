# 09c. Cost tracking (approfondi) et restes de Live

Complète `09_live_pos_cost.md`. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code, jamais d'une mesure. Ce qui n'est pas lu est marqué "non vérifié".

PARTIE A: Cost tracking. PARTIE B: restes de Live (voir plus bas).

# PARTIE A. Cost tracking

## 1. Fiche de la page

| Élément | Valeur | Preuve |
|---|---|---|
| Route | `/spaces/:spaceId/cost-tracking`, nom `space-cost-tracking`, meta permission `front.fb.costTracking`, pas de keepAlive | `frontend/src/router/index.js:292-295` (établi dans 09) |
| Composant routé | `frontend/src/components/space-workspace/cost-tracking/views/SpaceCostTrackingView.vue`, 361 lignes (template 108, script 63, styles 187) | lu |
| Garde | aucun `beforeEnter` propre; `enabled` = `auth/can('front.fb.costTracking')`, sinon aucun appel (`useCostTracking.js:262,266`) | `SpaceCostTrackingView.vue:136-139` |
| Chaîne de données | `.vue` -> `useCostTracking` (409 l) + `useCostTrackingPageModel` (143 l) + `useCostTrackingOptions` (52 l) + `useCostTrackingSupplierPerf` (57 l) -> store `costTracking` (203 l) -> `cost-tracking.api.js` (98 l) | lus |
| Utilitaires purs front | `utils/costTrackingSeries.js` 336 l, `costTrackingRows.js` 107 l, `costTrackingParams.js` 47 l, etc. (731 l au total pour 8 fichiers) | `wc -l` |
| Backend | `backend/src/features/cost-tracking/`: contrôleur 70 l, 11 services (3137 l avec utilitaires et types), 5 routes GET | `cost-tracking.controller.ts:27-69` |

## 2. Arbre des composants (25 .vue, 2909 lignes front avec la vue, API et composables hors total)

Tous montés à l'ouverture sauf indication. Aucun lazy interne, aucun `defineAsyncComponent`.

| Composant | Fichier (dans `.../cost-tracking/`) | Lignes | Rôle | Monté | Props reçues |
|---|---|---|---|---|---|
| WorkspaceAppHeader | `frontend/src/components/WorkspaceAppHeader.vue` | 319 | bandeau + 8 KPI | oui | `model.headerKpis` |
| CostTrackingLeftColumn | `CostTrackingLeftColumn.vue` | 37 | colonne gauche, utilise `useWorkspaceToolbox` | `v-if="leftOpen"` (ouvert si largeur >= 1100 px, `SpaceCostTrackingView.vue:144-145`) | période, 4 listes d'options + fournisseurs + composants |
| CostTrackingFilterPanel | `CostTrackingFilterPanel.vue` | 203 | filtres période, type, catégorie, article, ingrédient, fournisseur, composant | avec la colonne gauche | listes complètes (`<option v-for>`, `:38,45,54,67`) |
| CostTrackingAccordion / OptionSelect / Switch / Segmented / SortSwitch / GroupSwitch | idem | 74 / 52 / 82 / 78 / 66 / 32 | contrôles génériques | oui | |
| CostTrackingBanner | `CostTrackingBanner.vue` | 66 | bandeau rouge | oui, collant | titre, sous-titre |
| CostTrackingFilterChips | `CostTrackingFilterChips.vue` | 69 | pastilles | oui | `chips` |
| CostTrackingBaselineNotice | `CostTrackingBaselineNotice.vue` | 107 | notice "suivi actif depuis" | `v-if="model.notice"` | `useDismissedNotice` (fermeture mémorisée) |
| CostTrackingChartCard | `CostTrackingChartCard.vue` | 93 | carte graphique + légende + états | oui | séries, légende, bornes |
| CostTrackingChart | `CostTrackingChart.vue` | 236 | graphique SVG en escalier, crosshair, marge | oui (états ready) | `chartModel` (fonction), `series` |
| CostTrackingChartKey / Legend / Tooltip / StateMessage | idem | 58 / 75 / 108 / 100 | légende, infobulle, états | oui | |
| CostTrackingTable | `CostTrackingTable.vue` | 158 | tableau des lignes (`v-for row in rows`, `:22`) | oui | `rows` non paginées |
| CostTrackingSummaryPanel | `CostTrackingSummaryPanel.vue` | 117 | colonne droite: classements, derniers changements | oui | `rows`, `changes`, `supplierRows` |
| CostTrackingPerformanceSection | `CostTrackingPerformanceSection.vue` | 80 | "Performance des ..." (niveaux, fournisseurs): tri, recherche, 5 cartes puis "Voir tout" | oui (2 instances probables, non confirmé) | `rows` |
| CostTrackingRankCard / FeedItem | idem | 116 / 58 | cartes de classement, flux | oui | |
| CostTrackingHistoryDrawer | `CostTrackingHistoryDrawer.vue` | 219 | tiroir d'historique d'un article | monté en permanence, contenu `v-if="open"` (`:2`); données chargées au clic | `history`, `loading`, `error`, `tags` |
| CostTrackingVersionItem | `CostTrackingVersionItem.vue` | 166 | une version + recette figée | une instance par version, seulement à l'ouverture du tiroir | `version`, `previous` |

Listes non virtualisées: toutes. Les bornes réelles: lignes de série plafonnées à 10 pour les modes article, fournisseur, composant, ingrédient (`cost-tracking-line-cap.util.ts:2`, `MAX_ARTICLE_LINES = 10`), mais PAS plafonnées pour les modes catégorie et type (`cost-tracking-series.service.ts:142-158`, aucun `capLines`). Événements: jusqu'à 200 (`cost-tracking-events.service.ts:11`), chacun un `<g>` SVG avec étiquette (`CostTrackingChart.vue:31`). Tiroir: jusqu'à 100 versions (défaut backend, `cost-tracking-history.service.ts:4`), chacune avec un tableau de recette dans un `<details>` mais rendu au DOM même fermé (`CostTrackingVersionItem.vue:16-45`).

## 3. Appels API, composant par composant

### 3.1 Au montage et à chaque changement de filtre

| Déclencheur | Méthode + URL | Front | Séquentiel / bloquant | Cache front | Backend | Tables | Redis | Payload |
|---|---|---|---|---|---|---|---|---|
| `onMounted` de la vue | `spaces/fetchSpaces` (store) | `SpaceCostTrackingView.vue:171-173` | parallèle, non bloquant | store spaces (non lu) | non lu | | | liste des espaces, pour le nom du bandeau |
| watch immediate `[spaceId, enabled]` | GET `/cost-tracking/:spaceId/catalog` | `useCostTracking.js:340-356` (appel `loadCatalog({force:true})` ligne 351), store `costTracking.js:116-129` | parallèle aux autres | le TTL de 15 min (`costTracking.js:12`) est contourné par `force:true`: le catalogue est toujours relu à chaque montage, alors que le commentaire dit "affiché tel quel puis revalide en fond" (`useCostTracking.js:350`) | `cost-tracking.controller.ts:35-41`, `CostTrackingCatalogService.getCatalog` (`:74-103`) -> `listArticles` (`:30-59`) | `MenuItem` (where tenantId, deletedAt null, `spaceLinks some spaceId`, join ProductType et ProductCategory), tous les articles du Space Menu | aucun | liste hiérarchique id + nom de tous les articles |
| même watch | GET `/cost-tracking/:spaceId/series` (mode courant, défaut `article`) | `loadSeries` `useCostTracking.js:265-268`, store `costTracking.js:131-146` | parallèle, c'est l'appel qui porte le graphique (état `loading`) | aucun (`series` remplacé à chaque appel, jeton anti-course) | `:27-33` -> `CostTrackingSeriesService.getSeries` (`cost-tracking-series.service.ts:75-159`) | voir 3.2 | seulement `costtracking:revenue:*` (TTL 3600 s si période passée, 300 s sinon, `cost-tracking-revenue.service.ts:16-17,37-41`) | lignes + points d'escalier + events |
| watch immediate de `useCostTrackingOptions` | GET `/cost-tracking/:spaceId/options?typeId&categoryId&menuItemId&from&to` | `useCostTrackingOptions.js:23-49` (immediate ligne 49) | parallèle | aucun | `cost-tracking.controller.ts:43-53` -> `listArticles` + `resolvePeriod` en parallèle puis `CostTrackingBrickScopeService.getOptions` (`cost-tracking-brick-scope.service.ts:90-100`) | `MenuItem`, `Space` (timezone), `Event` (resolvePeriod ne lit que Space), `MenuItemCostSnapshot` (recette Json de TOUS les articles du périmètre, `recipe-reader:22-27`), `BrickCostSnapshot` x3 (ingredient, packaging, component), `MenuComponent` + `MenuComponentIngredient` + enfants (graphe, jusqu'à 6 niveaux, `component-graph:18-43`), puis `BrickCostSnapshot` ingrédients feuilles | aucun | listes fournisseurs et composants |
| watch immediate de `useCostTrackingSupplierPerf` (inactif si le mode courant est déjà `supplier`, `useCostTracking.js:275-280`) | GET `/cost-tracking/:spaceId/series?groupBy=supplier` | `useCostTrackingSupplierPerf.js:29-47`, watch `:49-53` | parallèle | aucun | même `getSeries` en mode fournisseur (`series.service:100-103`, `supplierLines :180-191`) | tout ce que fait `/options`, PLUS `capByRevenue` (CA SpaceRevenueMinuteItemAgg si plus de 10 fournisseurs), PLUS `readRecipesForPeriodMany` (recette Json de chaque snapshot de la période pour les articles des 10 fournisseurs retenus, `snapshot-reader:179-207`) | `costtracking:revenue:*` | lignes fournisseurs avec points |
| watch immediate `[menuItemId, spaceId]` | `fetchIngredientOptions` | `useCostTracking.js:359-365` | sans article: aucun réseau (vide la liste); avec article: GET `/cost-tracking/:spaceId/articles/:id/ingredients` | aucun | `cost-tracking.controller.ts:55-61` -> `catalog.getArticleIngredients` (`:62-72`) -> `listArticles` (refait un findMany) + `latestRecipe` (`snapshot-reader:210-217`) | `MenuItem`, `MenuItemCostSnapshot` (1 ligne, recette Json) | aucun | lignes de recette |
| clic sur une ligne (icône historique) | GET `/cost-tracking/:spaceId/articles/:id/history` | `selectArticle` `useCostTracking.js:328-332`, store `:148-164` (aucun `limit` passé) | bloque le contenu du tiroir seulement | aucun, relu à chaque ouverture | `cost-tracking.controller.ts:63-69` -> `CostTrackingHistoryService.getHistory` (`:32-62`) | `MenuItem` (1 findFirst), `MenuItemCostSnapshot` `take 101` ORDER BY effectiveFrom desc, createdAt desc, SELECT de toutes les colonnes dont `recipe` et `sourceRef` Json | aucun | jusqu'à 101 versions avec recette complète chacune |

Chaque requête passe d'abord par `JwtDatabaseGuard`, `RequirePermissions` et `spaceAccess.assertSpaceAccessible` (`cost-tracking.controller.ts:31,38,47,59,67`). Le coût de ce garde par appel n'a pas été lu (non vérifié).

### 3.2 Détail SQL du backend `/series`

`getSeries` (`cost-tracking-series.service.ts:75`) enchaîne, par appel:
1. `resolvePeriod` -> `Space.findFirst` timezone (`cost-tracking-events.service.ts:40-43`). 1 requête.
2. En parallèle: `listArticles` (MenuItem + 2 joins, aucune pagination) et `listEvents` (`Event.findMany` take 200 avec `sessions` Json, `:68-80`).
3. Mode article sans filtre ni fournisseur: `trackingStartedAt` (`aggregate _min` par lot de 500, `snapshot-reader:235-249`), `tenantDefaultVatRate` (`TenantVatConfig.findFirst`), `pickArticles`: si plus de 10 articles, `revenueByItem` (SQL `SpaceRevenueMinuteItemAgg` via `eventTimelineWindowCtes`, sous `analyseBatchSemaphore`, cache Redis par ensemble d'events, `revenue.service:34-64`), puis `readForPeriod`: par lot de 500 articles, 2 requêtes en parallèle (`DISTINCT ON` des versions antérieures + versions de la période), sans Json recipe (`snapshot-reader:40-63`). Les lots sont séquentiels.
4. Modes catégorie et type: aucune limite; `readForPeriod` sur TOUS les articles du périmètre, puis moyenne en mémoire (`averageStaircase`).
5. Modes ingrédient sans article, composant, fournisseur, ou filtres Fournisseur/Composant: `brickScope.resolve` (`brick-scope.service:62-87`): `latestRecipes` (recette Json de tous les articles du périmètre, lots de 200, `DISTINCT ON`), `readVersions` (3 types de brique en séquence), `supplierScope` (graphe des composants jusqu'à 6 requêtes séquentielles + relecture des versions d'ingrédients).
6. Index annoncés: `MenuItemCostSnapshot` `@@index([tenantId, menuItemId, effectiveFrom desc])` (`backend/prisma/schema.prisma:2545`), `BrickCostSnapshot` `@@index([tenantId, kind, refId, effectiveFrom desc])` (`:2572`). Les requêtes `= ANY(ids)` avec `DISTINCT ON` sont alignées sur ces index (commentaire `snapshot-reader:30`), non vérifié par EXPLAIN.

## 4. Cascade au premier affichage

- t0: chunk de la vue, `useCostTracking` crée tous ses watchers immediate dans le même tick.
- t1 (tous en parallèle, 5 appels réseau): `fetchSpaces`, GET `catalog`, GET `series` (mode article), GET `options`, GET `series?groupBy=supplier`. `ingredients` ne part pas (aucun article).
- Côté serveur, 4 de ces 5 appels refont chacun `Space.findFirst` (timezone) et `listArticles` (le même findMany MenuItem) sans cache; `options` et `series supplier` refont chacun le même travail `brickScope` (recettes Json, versions de briques, graphe des composants).
- Chemin critique pour l'affichage du graphique: `series` (mode article) seul. Le panneau de droite "Performance des fournisseurs" dépend de `series?groupBy=supplier` (le plus lourd); les listes Fournisseur et Composant de la colonne gauche dépendent de `options`.
- Après `options`: `onLoaded` peut vider un filtre périmé et déclencher `patch` (`useCostTracking.js:240-243`), donc une nouvelle série.
- Retour sur la page (route sans keepAlive): filtres persistés dans le store (`useCostTracking.js:76`) mais tout est rechargé, y compris le catalogue (`force:true`).

## 5. Problèmes de performance

1. **Deux appels qui calculent la même chose en parallèle (haut).** `/options` et `/series?groupBy=supplier` exécutent chacun `latestRecipes` (recette Json de tous les articles du périmètre), `readVersions` x3 types de brique, `leavesFor` (jusqu'à 6 requêtes séquentielles) puis `collectSupplierScope` (`brick-scope.service.ts:90-100` et `:62-87`; `useCostTrackingOptions.js:49` et `useCostTrackingSupplierPerf.js:49-53`). Les deux partent au montage et à chaque changement de filtre ou de période. Aucun cache Redis. Le résultat `suppliers` de `/series?groupBy=supplier` suffirait à alimenter la liste Fournisseur (nom, clé, nombre de briques). Pages: Cost tracking.
2. **Aucun cache Redis sur catalogue, séries, options, historique (haut à moyen).** Seul le CA est en cache (`cost-tracking-revenue.service.ts:37-41`). Les données (snapshots) sont append-only et ne changent qu'à l'écriture d'un snapshot: un cache invalidé par version aurait un bon taux de hit. À mesurer: durée réelle des requêtes (non vérifié).
3. **Catalogue relu à chaque montage malgré un TTL de 15 min (moyen).** `loadCatalog({force:true})` (`useCostTracking.js:351`) contredit le commentaire de la ligne 350. Le catalogue contient la liste de tous les articles de l'espace (findMany sans pagination, `catalog.service:31-48`) et est recalculé à chaque appel `series` et `options` aussi (`listArticles` appelé 3 fois côté serveur par chargement de page, une 4e fois pour `ingredients`).
4. **Doublon de requêtes serveur identiques par chargement (moyen).** `Space.findFirst` (timezone) et `MenuItem.findMany` (articles) sont refaits pour chacun des appels series, options, series supplier, catalog (`events.service:40-43`, `catalog.service:30-59`). Aucun partage par requête.
5. **Mode fournisseur: relecture des recettes Json de la période (haut, à mesurer).** `articleShares` -> `readRecipesForPeriodMany` lit, pour tous les articles liés aux 10 fournisseurs retenus (union des `articleIds`), toutes les versions de la période AVEC leur colonne `recipe` Json, par lots de 100 (`snapshot-reader.service.ts:179-207`, `supplier-share.service.ts:20`). Le nombre de snapshots par article n'est pas connu (non vérifié). Charge mémoire et CPU: `buildSupplierShareSeries` par article.
6. **Séries catégorie et type sans plafond (moyen).** Les modes `category` et `type` lisent les snapshots de TOUS les articles (`articlePoints(articles.map(id))`, `series.service:142`) alors que le mode article plafonne à 10. Le nombre de lignes renvoyées est celui des catégories (non plafonné).
7. **Historique: payload et DOM (moyen).** Aucun `limit` passé (`useCostTracking.js:331` -> défaut 100, backend lit 101 lignes avec colonnes Json `recipe` et `sourceRef`, `history.service:39-43`). Le front rend un tableau de recette par version, dans un `<details>` mais déjà présent dans le DOM (`CostTrackingVersionItem.vue:16-45`), sans virtualisation, donc jusqu'à 100 x nb lignes de recette lignes `<tr>`. Relu à chaque ouverture du tiroir (pas de cache).
8. **Recalculs front à chaque réponse (bas à moyen).** `lines`, `visibleSeries`, `summary`, `rows`, `changes`, `legendRows`, `headerKpis` se recalculent sur chaque `response` (`useCostTracking.js:283-307`, `useCostTrackingPageModel.js:28-131`). `legendRows` fait un `rows.find` par ligne (O(n²), n <= ~10 en mode article, plus grand en mode catégorie). `chartModel` est appelé comme fonction par un computed du graphique (`CostTrackingChart.vue:136`), ce qui reconstruit échelles et chemins à chaque changement de `width` (ResizeObserver, `:165-170`, sans debounce) ou de série. Le hover recalcule via `useCostTrackingChartHover` (non lu).
9. **Jusqu'à 200 events dessinés dans le SVG (bas).** `Event.findMany take 200` avec `sessions` Json (`events.service:68-80`), un `<g>` par event (`CostTrackingChart.vue:31`), étiquettes masquées sous 17 px. Pas de pagination.
10. **Watch par `JSON.stringify` des paramètres (bas).** `watch(() => JSON.stringify(seriesParams.value))` (`useCostTracking.js:368-376`) et celui de SupplierPerf (`:50`) sont corrects mais déclenchent `loadSeries` + `load` supplier à chaque changement, sans debounce: un changement de période en curseur ou 3 clics de filtres rapides enchaînent des requêtes lourdes (le jeton de course évite l'affichage obsolète, pas le travail serveur, qui continue).
11. **Garde d'accès par appel (non quantifié).** `assertSpaceAccessible` est appelé à chaque requête (5 routes), coût non lu.

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| **Backend**: alimenter la liste Fournisseur depuis le résultat du calcul séries (ou mutualiser `brickScope` entre `/options` et `/series?groupBy=supplier` via un cache court par (tenant, espace, filtres, période)) | supprime un calcul lourd redondant au chargement et à chaque filtre | cache à invalider à l'écriture d'un snapshot | M | `cost-tracking-brick-scope.service.ts`, `cost-tracking.controller.ts`, `useCostTrackingOptions.js` |
| **Backend**: cache Redis des séries, options et catalogue, clé incluant la date du dernier snapshot du tenant (version de données) | taux de hit élevé (snapshots append-only), charge DB réduite | clé de version à maintenir | M | `cost-tracking-series.service.ts`, `catalog.service.ts`, module Redis |
| **Backend**: mémoïser par requête `Space` timezone et `listArticles`, ou les passer au service au lieu de les relire | -3 à -4 requêtes identiques par chargement | faible | S | `cost-tracking.controller.ts`, `events.service.ts`, `catalog.service.ts` |
| **Backend/SQL**: EXPLAIN de `readForPeriod`, `latestRecipes`, `readRecipesForPeriodMany`, `BrickCostSnapshot readForPeriod` sur la prod (lecture seule) | vérifie l'usage des index annoncés, détecte un tri ou un Json large | aucun | S | `snapshot-reader.service.ts`, `brick-reader.service.ts`, `recipe-reader.service.ts` |
| **Backend**: plafonner/paginer l'historique (limit 20 par défaut) et ne renvoyer `recipe` que pour la version dépliée, ou une route dédiée | payload et DOM divisés | UX du tiroir | M | `history.service.ts`, `CostTrackingVersionItem.vue`, `useCostTracking.js` |
| **Backend**: lire `recipe` seulement pour les articles retenus du mode fournisseur, ou calculer la part fournisseur à l'écriture du snapshot | évite le plus gros Json au chargement | cohérence | L | `snapshot-reader.service.ts:179`, `supplier-share.service.ts` |
| **Frontend**: `loadCatalog({force:false})` au montage (TTL 15 min existant), revalidation de fond seulement si périmé | -1 appel au retour sur la page | catalogue périmé de 15 min | S | `useCostTracking.js:351` |
| **Frontend**: debounce (250 à 400 ms) des watchers de séries, options et fournisseurs; annuler la requête précédente (AbortController) | évite les requêtes lourdes en rafale | latence de 300 ms | S | `useCostTracking.js:368`, `useCostTrackingOptions.js:49`, `useCostTrackingSupplierPerf.js:49` |
| **Frontend**: différer `series?groupBy=supplier` (après le premier rendu du graphique, ou à l'ouverture de la section) | le chemin critique ne partage plus la bande passante et le pooler avec l'appel le plus lourd | section vide quelques instants | S | `useCostTrackingSupplierPerf.js` |
| **Frontend**: debounce du `ResizeObserver` du graphique; index par clé dans `legendRows` (Map) | moins de recalcul de chemins | faible | S | `CostTrackingChart.vue:160-170`, `useCostTrackingPageModel.js:32-44` |
| **Frontend**: charger l'historique à la demande avec `limit` (20) | tiroir plus rapide | | S | `useCostTracking.js:328` |

## 7. Points non vérifiés (Cost tracking)

- Durées réelles des requêtes SQL (EXPLAIN ANALYZE), nombre de snapshots par article et par période, taille réelle des réponses `series`, `options`, `history`.
- `SpaceAccessService.assertSpaceAccessible` et `JwtDatabaseGuard` (coût par appel, cache éventuel).
- `RedisService.getOrSet` (sérialisation, verrou anti-stampede), `analyseBatchSemaphore`.
- Composants non lus ligne à ligne: Table, SummaryPanel, RankCard, Legend, Tooltip, FilterPanel (seulement grep de `v-for` et imports), `useCostTrackingChartHover`, `useWorkspaceToolbox`, `useDismissedNotice`, `costTrackingPerformance.js`, `costTrackingRows.js`.
- Les utilitaires backend purs (`cost-tracking-*.util.ts`, `buildSupplierShareSeries`) ont été supposés O(n) sans lecture; coût CPU non vérifié.
- Écriture des snapshots (`MenuItemCostSnapshot`, `BrickCostSnapshot`): hors périmètre, pas lue.

# PARTIE B. Restes de Live

Statut: NON COUVERT. Arrêt sur consigne du coordinateur (dépassement du budget de contexte) avant toute lecture de ces points. Rien ci-dessous n'a été lu dans cette session; les éléments sont à reprendre par un agent neuf. Les constats déjà établis sont dans `09_live_pos_cost.md` (sections 3.3, 5.4, 5.8, 5.9 et 7).

| Point demandé | État | Où reprendre |
|---|---|---|
| SQL et cache de GET `/spaces/:id/live/inventory` | non vérifié | contrôleur `backend/src/features/spaces/.../space-analytics.controller.ts:287+`, `StockLevelService.getLiveInventory` (`space-shops.service.ts:266-268` d'après 09); poller front `LiveInventoryPanel.vue:224,369,388-391` (15 s, sans garde `document.hidden`, d'après 09) |
| `basket-agg-read.sql.ts` (plan, index) | non vérifié | `SpaceBasketMinuteAgg`, repli brut `space-analyse-batch.service.ts:131-145` (d'après 09) |
| `loadPredictedNeed` / `usePredictedNeed` | non vérifié | `useLiveRemainingNeed.js:42-62` (d'après 09); question ouverte: 3e appel `predict-versions` ou non |
| `LiveFilterPanel` (508 l), `LiveHeader` (320 l), `LiveShopList` (140 l), `LiveItemsList` (137 l): computed, watchers, virtualisation | non vérifié (lignes déjà données par 09) | `frontend/src/components/space-workspace/live/` |
| Cadence réelle des signaux SSE | non vérifié | `weezevent/services/live/live-aggregation-trigger.service.ts:37`, `pos/sales/pos-live-trigger.service.ts:58`, cron de secours, `aggregation.processor.ts:78-87` (références reprises de 09) |
| Double appel `/live-status` (page + flux global) | déjà établi dans 09 (problème 2), non rouvert ici | `useLiveData.js:112`, `useGlobalLiveIndicator.js:56-69` |
| Double `loadSpace` `onMounted`/`onActivated` | hypothèse de 09 (problème 4), non confirmée | `LiveView.vue:435-436`, `useSpaceData` (partage de requêtes en vol non lu) |
