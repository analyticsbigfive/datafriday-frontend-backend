# ADR Lot 0 : historique des coûts par snapshots immuables

Statut : proposé (lecture de code seule, 2026-10-22). Rien exécuté, aucune requête base.
Décision : une table additive `MenuItemCostSnapshot`, écrite par un seul service appelé depuis les services de coût, jamais par les contrôleurs.

## 1. Propagation composant vers articles (constat)

**Un changement de recette ou de coût de Composant ne recalcule PAS les articles.** `menu-components.service.ts` (l.99, 149, 276, 444) n'appelle que `MenuComponentCostService.refreshCosts` (écrit `MenuComponent.unitCost` et les lignes). `MenuItemCostService` n'est injecté que dans `menu-item-command`, `menu-item-composition`, `market-price-cost-propagation` et le contrôleur. Idem pour une édition directe d'`Ingredient.costPerRecipeUnit` (`ingredients.service.ts` l.141) ou `Packaging` (`packaging.service.ts` l.89) : aucun appel vers les articles. Seule la chaîne **prix du marché** propage jusqu'aux articles.

Conséquence : la cause `component_edit` du PLAN n'a aujourd'hui aucun déclencheur. Le coût d'un article reste périmé jusqu'au prochain `refreshCosts` (bouton global, fiche article, ou prix du marché). Choix à faire (go Ulrich) : (a) lot 1 sans changement de comportement, `component_edit` seulement quand l'article est rafraîchi pour un autre motif ; (b) ajouter la propagation composant vers articles aux 4 points ci-dessus (réutiliser la logique de `MarketPriceCostPropagationService`, qui connaît déjà `withAncestorItems` et le recalcul combo). Recommandé : (a) en lot 1, (b) en lot 1bis isolé, car il change les coûts affichés.

Chaîne prix du marché (`market-prices.service.ts` l.132 update unitaire, l.328 import CSV groupé) : `propagate()` ([`market-price-cost-propagation.service.ts`](../../../../backend/src/features/market-prices/services/market-price-cost-propagation.service.ts) l.30-82) liste ingrédients/emballages, composants (+ ancêtres), articles (+ parents de combo), puis `componentCostService.refreshCosts` (l.64), `menuItemCostService.refreshCosts` (l.67, plat), puis `refreshComboCost` par parent de combo (l.76). Tout est dans un try/catch non bloquant (l.80).

### Points d'écriture de `MenuItem.totalCost`, `numberOfPiecesRecipe`, `basePrice` (où appeler `recordIfChanged`)

| # | Fichier:ligne | Écrit | Appel snapshot |
|---|---|---|---|
| 1 | `menu-item-cost.service.ts` l.75 (`refreshComboCost`) | totalCost | **Oui**, fin de méthode |
| 2 | `menu-item-cost.service.ts` l.195-198 (`refreshCosts`, `update` par article) | totalCost, margin | **Oui**, après la boucle, un lot `itemIds` changés |
| 3 | `menu-item-command.service.ts` l.85-112 (`create`) | basePrice, totalCost brut du DTO, numberOfPieces | **Oui**, cause `created`, après les refresh l.189-192 |
| 4 | `menu-item-command.service.ts` l.296 (`update`, `updateData` l.230-244) | basePrice, totalCost (l.234 DTO direct), numberOfPiecesRecipe | **Oui**, fin d'`update` (l.333-336), y compris quand il n'y a aucune ligne de recette (aujourd'hui aucun refresh dans ce cas) |
| 5 | `menu-item-composition.service.ts` l.44, 78, 112 (`refreshCosts`), l.148 (`refreshComboCost`) | via 1 et 2 | Couvert par 1 et 2, cause `recipe_edit` / `combo_edit` passée par l'appelant |
| 6 | `menu-item-bulk-create.service.ts` l.135 (`createMany`, totalCost/margin/numberOfPiecesRecipe/basePrice DTO l.112-127) | tous | **Oui**, `created`, un seul lot après l'insertion |
| 7 | `menu-item-weezevent-price.service.ts` l.200 et l.366 (sans `spaceId` seulement) | basePrice, vatRate | **Oui** si on suit le prix de vente (§9.4 du PLAN), cause `manual_refresh` ou nouvelle cause `price_sync` |
| 8 | `market-price-cost-propagation.service.ts` l.67 et l.76 | via 1 et 2 | Passer `reason='market_price'` + `sourceRef` |
| 9 | `menu-items.controller.ts` l.196 et l.210 | via 2 | Cause `manual_refresh` |

**Écritures hors de ces services** : aucune en SQL brut sur ces colonnes (le seul `$executeRaw` sur MenuItem est `storage-types.queries.ts` l.8, `storageType` uniquement). Aucun `updateMany` ne touche coût ou prix (`kitchens.service.ts` l.121 : cuisine, `product-mapping.service.ts` l.133 : `deletedAt`). Aucun script de `backend/scripts/` ni de `prisma/` n'écrit ces colonnes. `refreshCosts` global est plat (pas de part combo, limite documentée dans le fichier) : pour un parent de combo, écrire le snapshot **après** `refreshComboCost`, sinon un faux snapshot sans la part combo.

## 2. Spike CA par article

`SpaceRevenueMinuteItemAgg` (schema.prisma l.3037) : grain **event x minute x PdV x produit Weezevent**. Colonnes utiles : `tenantId`, `spaceId`, `minute`, `weezeventEventId`, `weezeventProductId`, `revenueHt`, `itemsCount`, `integrationId` (nullable, **hors unique**, ne sert qu'aux `deleteMany` par intégration). Pas de `menuItemId` : résolu à la lecture par `WeezeventProductMapping` (`weezeventProductId` unique, donc 1 produit = 1 article, N produits possibles par article) puis `MenuItem`. Index : `(tenantId, spaceId, weezeventEventId, minute)`, `(tenantId, spaceId, spaceElementId, minute)`, `(tenantId, spaceId, integrationId)`.

Faisable, sans toucher aux transactions brutes, en **réutilisant le patron existant** : `SpaceSalesScopeService.resolveEventSalesScope(spaceId, eventIds, tenantId)` (fenêtres par event, scope d'intégrations, `shopScopeClause`, `valuesSql`) puis `eventTimelineWindowCtes` ([`event-timeline-window.sql.ts`](../../../../backend/src/features/spaces/event-timeline-window.sql.ts), CTE `win` MATERIALIZED + `dedup`). C'est exactement la requête du mode `summary` de `space-event-timeline.service.ts` (l.74-105) ; seule la fin change :

```sql
-- eventTimelineWindowCtes(...) fournit win + dedup
SELECT wpm."menuItemId", mi.name,
       SUM(dd."revenueHt")::numeric(12,2) AS ca,
       SUM(dd."itemsCount")::integer      AS quantite
FROM dedup dd
JOIN "WeezeventProductMapping" wpm
  ON wpm."weezeventProductId" = dd."weezeventProductId" AND wpm."tenantId" = $tenant
JOIN "MenuItem" mi ON mi.id = wpm."menuItemId" AND mi."deletedAt" IS NULL
GROUP BY wpm."menuItemId", mi.name
ORDER BY ca DESC LIMIT 10;
```

Les `eventIds` viennent d'une requête préalable sur `Event` (espace, `eventDate` dans la période). Le top 10 se fait donc en 2 temps : events de la période, puis cette agrégation, dans `analyseBatchSemaphore` + `queryWithWorkMem` comme le summary.

Risques :
- **Perf** : sans la barrière `MATERIALIZED`, 12 à 32 s mesurés (702k lignes via l'index `spaceElementId`, 2026-09-21). Bornes de la lecture : `slice(0,100)` events, pas de période libre. EXPLAIN obligatoire en local avant livraison, jamais de `SET` de session sur le pooleur 6543.
- **Pollution inter-intégrations (BUG-384-02)** : ne jamais filtrer sur `mem.integrationId` ni lire hors scope ; passer par `tagId` / `eventIntegrationId` du scope, sinon le CA de Le Mans-Brest redevient gonflé. Tester sur un espace multi-intégrations.
- **Cohérence des chiffres** : `revenueHt` de cette table **ne soustrait pas la remise** (différent de `SpaceRevenueMinuteAgg`, BUG-015) ; le top 10 colle à Analyse, pas au CA financier. Les produits non mappés sont exclus du top 10 (l'intersection JOIN est volontaire ; l'ajouter en LEFT JOIN seulement si on veut une ligne « Non mappé »).
- Events conteneurs de saison (> 2 jours) ignorés par le scope (`MAX_EVENT_SPAN_DAYS`). Cache Redis à prévoir (TTL long pour période passée, comme `eventBatchCacheTtl`).

## 3. Modèle Prisma proposé

Conventions vues : `tenantId String` + relation `Tenant onDelete: Cascade`, `id @default(cuid())`, `createdAt @default(now())`, `@@index` explicites, `@@map` seulement quand le nom de table diffère (ex. `WeezeventProductMapping`) donc **pas de `@@map`** ici. Migration : dossier `YYYYMMDDHHMMSS_snake_case` sous `backend/prisma/migrations/` (dernière : `20261020120000_menu_item_seasons`), SQL idempotent et additif (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), ex. `20261022100000_menu_item_cost_snapshot`.

```prisma
/// Version immuable du coût d'un article (jamais mise à jour). Historique de coût et de recette
/// pour garder les marges des events passés stables (chantier Cost tracking).
model MenuItemCostSnapshot {
  id            String   @id @default(cuid())
  tenantId      String
  menuItemId    String
  effectiveFrom DateTime // instant de l'écriture
  totalCost     Decimal  @db.Decimal(12, 4) // coût de la fournée (sémantique MenuItem.totalCost)
  numberOfPieces Int     @default(1)
  costPerPiece  Decimal  @db.Decimal(12, 4)
  basePrice     Decimal? @db.Decimal(10, 2)
  vatRate       Decimal? @db.Decimal(5, 2)
  recipe        Json // lignes figées {kind, refId, name, quantity, unitCost}
  recipeHash    String // pour l'idempotence (comparaison sans relire le Json)
  reason        String // baseline | market_price | recipe_edit | component_edit | combo_edit | manual_refresh | created
  sourceRef     Json?
  createdAt     DateTime @default(now())

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  menuItem MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)

  @@index([tenantId, menuItemId, effectiveFrom(sort: Desc)])
  @@index([tenantId, effectiveFrom])
}
```
Ajouts : `costSnapshots MenuItemCostSnapshot[]` sur `MenuItem` (après `priceHistory`, l.2403) et sur `Tenant`. `recipeHash` s'ajoute au PLAN (champ non listé) : sans lui la comparaison relit le Json de chaque dernier snapshot. `reason` en `String` comme `MenuItemPriceHistory.source` (pas d'enum, évite une migration par nouvelle cause). Le lookup `DISTINCT ON (menuItemId)` du §4.3 est servi par le premier index. `onDelete: Cascade` : un `MenuItem` n'est que soft-deleted (`deletedAt`), le cascade ne joue qu'au hard delete. Vérifier `scripts/check-schema-indexes.mjs` après ajout.

## 4. `resolveDoorsOpenAt` et permission

- `resolveDoorsOpenAt(e: EventDayFields, timeZone: string): Date | null` dans [`backend/src/shared/utils/event-window.util.ts`](../../../../backend/src/shared/utils/event-window.util.ts) l.97. Prend le plus tôt des `sessions[].doorsOpening` posé sur le jour de début, **`null` sans repli** (volontaire). `costsAsOf` fera `resolveDoorsOpenAt(event, spaceTimezone) ?? minuit local du jour` (`startDayOf` n'est pas exporté : vérifier, sinon exporter ou recomposer avec `eventStartDate ?? eventDate`). Le fuseau vient du space (`spaceTimezone`, voir `resolveEventSalesScope`).
- Permissions ([`permission-catalog.ts`](../../../../backend/src/core/rbac/permission-catalog.ts)) : format `{ code, name, category }`, catégorie `'F&B Front'` pour `front.fb.*` (l.47-77). Ajouter `{ code: 'front.fb.costTracking', name: 'Cost tracking', category: 'F&B Front' }` après `front.fb.analyse` (l.47) et le code dans les listes de rôles qui ont `front.fb.analyse` : « Analyste F&B » (l.189) et « Achat F&B » (l.275) ; ADMIN le reçoit via `ALL_CODES`.
- **Attention collision de noms** : `back.fb.costTracking` existe déjà (catalogue l.121, rôle Analyste l.196) et protège `GET analyse/cost-breakdown` (`analyse.controller.ts` l.164). Ne pas le réutiliser ni le renommer ; `front.fb.costTracking` est un code distinct, à documenter pour éviter la confusion.
- Sync RBAC : `RbacCatalogSyncService.onApplicationBootstrap` appelle `ensureSystemPermissionCatalog` à chaque démarrage, et n'accorde aux rôles existants **que les codes nouvellement créés** (une révocation admin n'est pas ré-accordée). Pas de script manuel nécessaire, mais vérifier au premier boot (web et worker, verrou consultatif). Côté front, le garde est dans `router/guards.js` et `useWorkspaceToolbox.js` (là où `front.fb.analyse` est lu).

## 5. Risques et points d'attention pour le lot 1

1. Aucun hook ne couvre les écritures hors services (§1, lignes 3, 4, 6, 7) : sans appel explicite, `update()` d'un prix ou de `numberOfPiecesRecipe` sans lignes de recette ne crée pas de version.
2. `dto.totalCost` / `margin` saisis à la main (create/update/bulk) existent : le snapshot doit lire la valeur **persistée** après refresh, pas le DTO.
3. Écriture de snapshot non bloquante (try/catch + `warn`), un seul `createMany` par appel, 500 articles par lot, comparaison au dernier snapshot en une requête `DISTINCT ON`.
4. Volume du Json `recipe` sur de gros imports : mesurer sur la base locale avant la baseline.
5. Hypothèse non testée : tous les constats viennent de la lecture, aucun jest ni EXPLAIN n'a été lancé (pas de node_modules dans ce worktree).
