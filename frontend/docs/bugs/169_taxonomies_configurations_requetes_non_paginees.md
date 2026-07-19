# BUG-169 — Taxonomies Configurations : requêtes non paginées (product/component types-categories)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/features/menu-items/menu-items.service.ts:1555-1565` (`getProductTypes`), `:1617-1628` (`getProductCategories`)
  - `src/features/menu-components/component-taxonomy.service.ts:17-27,71-82`
  - `src/features/market-prices/market-price-taxonomy.service.ts:17-27,71-82`
  - `src/features/industrials/industrials.service.ts:8-13`, `src/features/packing-types/packing-types.service.ts:8-13`
  - `src/features/brands/brands.service.ts:8-13`, `src/features/display-names/display-names.service.ts:8-13`

## Symptôme

Les 10 endpoints de liste de la section Configurations utilisent tous un `findMany` Prisma sans
`take`/`skip` — contrairement à `GET /menu-items` ou `GET /market-prices` (données volumineuses,
déjà corrigées pour la pagination réelle, voir BUG-54/37/40). Aucun N+1 constaté (chaque liste
reste une requête unique, avec `include` le cas échéant), donc pas un risque de performance actif
aujourd'hui.

## Cause racine

Absence de `take`/`skip` par choix implicite plutôt qu'un bug introduit — ces listes sont des
référentiels de configuration, à cardinalité naturellement faible (quelques dizaines de lignes par
tenant dans le pire cas observé lors de l'audit du domaine, cf.
[`backend/docs/bugs/62_spacemenu_availability_referentiel_tenant_non_scope.md`](62_spacemenu_availability_referentiel_tenant_non_scope.md)
pour un ordre de grandeur comparable sur un référentiel voisin).

## Correction

**Décision révisée (2026-07-19, même jour)** : l'arbitrage initial ("cardinalité faible aujourd'hui,
pas de risque actif") a été explicitement rejeté — la croissance attendue du volume de données
(plusieurs centaines de lignes par tenant possibles d'ici la fin du mois) rend ce trou réel, pas
seulement théorique, et laisser un `findMany` non borné grandir avec les données aurait recréé
exactement la même classe de bug déjà documentée et corrigée ailleurs dans ce projet ("plafond
silencieux" — BUG-52/54/89/139) : soit on paginerait plus tard sous la contrainte (avec un risque de
troncature silencieuse le temps du fix), soit on ne le fait jamais et l'app dégrade avec le tenant.
Corrigé sur les 10 endpoints, en 3 passes (MarketPrice, Product+Component, référentiels plats),
toutes suivant le même contrat pour ne rien casser : chaque `GET` retourne désormais
`{ data, meta: { total, page, limit, totalPages } }` (page/limit bornés, même clamp que
`menu-items.service.ts findAll`), et **côté frontend, aucun consommateur ne voit de différence** —
chaque store boucle sur les pages serveur (limite 200/appel) et reconstitue la liste complète avant
de la committer, exactement comme `marketPrices.js` le fait déjà pour les données volumineuses de ce
même domaine. Une recherche exhaustive de tous les consommateurs des 10 modules (dropdowns de
création, wizards d'import CSV, filtres de liste — confirmée : aucun des 10 modules n'a moins de 2
consommateurs en dehors de son propre écran de liste) a précédé l'implémentation pour être sûr
qu'aucune option de `<select>` ne serait tronquée silencieusement par ce changement.

**Slice MarketPrice (Good Types/Categories) — corrigé** :

- `backend/src/features/market-prices/market-price-taxonomy.service.ts:55-81` (`getTypes`) et
  `:144-167` (`getCategories`) : ajout d'une pagination bornée, même forme/clamp que
  `menu-items.service.ts findAll` — `{ data, meta: { total, page, limit, totalPages } }`,
  `page`/`limit` optionnels (défaut `page=1`, `limit=200`), `limit` clampé à
  `Math.min(Math.max(limit,1), 500)`, implémentée via `Promise.all([findMany({..., skip, take}),
  count(where)])`. `getTypes` conserve son `include: { categories: ... }`.
- `backend/src/features/market-prices/market-price-taxonomy.controller.ts:33-45`
  (`MarketPriceTypesController.findAll`) et `:85-99`
  (`MarketPriceCategoriesController.findAll`) : ajout des `@Query('page')`/`@Query('limit')`
  optionnels (strings castées avec `+`), transmis au service ; `typeId` existant préservé.
- `frontend/src/api/endpoints/market.price.api.js` : `getMarketPriceTypes`/`getMarketPriceCategories`
  acceptent désormais un objet optionnel `{ page, limit }` (et `typeId` pour les catégories),
  passé en query string ; appel sans argument toujours supporté (rétro-compatible).
- `frontend/src/store/modules/marketPriceTypes.js` (`fetchMarketPriceTypes`) et
  `frontend/src/store/modules/marketPriceCategories.js` (`fetchMarketPriceCategories`) : boucle de
  pagination côté client identique au pattern déjà en place dans `marketPrices.js`
  (`page=1`, `limit=200`, on concatène chaque page jusqu'à ce que `meta.total` soit atteint ou
  qu'une page renvoie moins de `limit` lignes), avant de committer le tableau complet dans
  `state.list` — le contrat public du store (getter = tableau plat complet, signature
  `fetchX({ forceRefresh })`) est inchangé. La boucle est construite sur la réécriture BUG-161 de
  `fetchMarketPriceCategories` (appel direct à `getMarketPriceCategories()`, sans dérivation depuis
  Types) sans la régresser, et la cross-invalidation BUG-163
  (`marketPriceTypes/invalidate` dispatché depuis `addMarketPriceCategory`/`updateMarketPriceCategory`/
  `removeMarketPriceCategory`) n'a pas été touchée.

**Slice Product + Component (ProductType/ProductCategory, ComponentType/ComponentCategory) —
corrigé** :

- `backend/src/features/menu-items/menu-items.service.ts:1558-1579` (`getProductTypes`) et
  `:1689-1709` (`getProductCategories`) : même forme/clamp que `menu-items.service.ts findAll` —
  `{ data, meta: { total, page, limit, totalPages } }`, `page`/`limit` optionnels (défaut
  `page=1`, `limit=200`), `limit` clampé à `Math.min(Math.max(limit,1), 500)`, implémentée via
  `Promise.all([findMany({..., skip, take}), count(where)])`. `getProductTypes` conserve son
  `include: { categories: ... }`.
- `backend/src/features/menu-items/menu-items.controller.ts:393-406`
  (`ProductTypesController.findAll`) et `:452-467` (`ProductCategoriesController.findAll`) :
  ajout des `@Query('page')`/`@Query('limit')` optionnels (strings castées avec `+`), transmis au
  service ; `typeId` existant préservé sur `product-categories`.
- `backend/src/features/menu-components/component-taxonomy.service.ts:54-75` (`getTypes`) et
  `:150-170` (`getCategories`) : même forme/clamp, même pattern `Promise.all`. `getTypes`
  conserve son `include: { categories: ... }`.
- `backend/src/features/menu-components/component-taxonomy.controller.ts:33-45`
  (`ComponentTypesController.findAll`) et `:85-99` (`ComponentCategoriesController.findAll`) :
  ajout des `@Query('page')`/`@Query('limit')` optionnels, transmis au service ; `typeId`
  existant préservé sur `component-categories`.
- `frontend/src/api/endpoints/product.api.js` : `getProductType`/`getProductCategory` acceptent
  désormais un objet optionnel `{ page, limit }`, passé en query string ; appel sans argument
  toujours supporté (rétro-compatible, défaut `{}`).
- `frontend/src/api/endpoints/menu.api.js` : `getComponentTypes`/`getComponentCategories` idem
  (objet optionnel `{ page, limit }`, rétro-compatible). Les fonctions `getProductTypes`/
  `getProductCategories` (section "PRODUCT TYPES (dynamiques)" du même fichier, non utilisées par
  les stores audités) n'ont pas été touchées — hors périmètre de cette passe.
- `frontend/src/store/modules/productTypes.js` (`fetchProductTypes`),
  `frontend/src/store/modules/productCategories.js` (`fetchProductCategories`),
  `frontend/src/store/modules/componentTypes.js` (`fetchComponentTypes`) et
  `frontend/src/store/modules/componentCategories.js` (`fetchComponentCategories`) : boucle de
  pagination côté client identique au pattern déjà en place dans `marketPrices.js`
  (`page=1`, `limit=200`, on concatène chaque page jusqu'à ce que `meta.total` soit atteint ou
  qu'une page renvoie moins de `limit` lignes), avant de committer le tableau complet dans
  `state.list` — le contrat public du store (getter = tableau plat complet, signature
  `fetchX({ forceRefresh })`) est inchangé, la logique `fetching`/`pendingForceRefresh` de
  `productTypes.js`/`productCategories.js` et la cross-invalidation
  `componentTypes/invalidate` dispatchée depuis `componentCategories.js` n'ont pas été touchées.

**Slice référentiels plats (Brand/DisplayName/Industrial/PackingType) — corrigé, en une seule passe
grâce au refactor BUG-165** :

- `backend/src/features/brands/brands.service.ts`, `display-names/display-names.service.ts`,
  `industrials/industrials.service.ts`, `packing-types/packing-types.service.ts` (`findAll`) :
  même forme/clamp que les 6 autres taxonomies —
  `{ data, meta: { total, page, limit, totalPages } }`, `page`/`limit` optionnels (défaut
  `page=1`, `limit=200`), clamp `Math.min(Math.max(limit,1), 500)`, `Promise.all([findMany({...,
  skip, take}), count(where)])`. Les 4 services étant structurellement identiques
  (`{id,name,tenantId}`), le même patch a été appliqué 4 fois à l'identique plutôt que factorisé
  côté backend — chaque service reste un module NestJS indépendant (pas de factory backend
  équivalente à `flatReferentialModule.js`).
- Les 4 contrôleurs (`brands.controller.ts`, `display-names.controller.ts`,
  `industrials.controller.ts`, `packing-types.controller.ts`) : ajout des
  `@Query('page')`/`@Query('limit')` optionnels sur `findAll`, transmis au service.
- Les 4 clients API (`brand-name.api.js`, `display-name.api.js`, `industrial.api.js`,
  `packing-type.api.js`) : `getBrandNames`/`getDisplayNames`/`getIndustrials`/`getPackingTypes`
  acceptent désormais un objet optionnel `{ page, limit }`, passé en query string ; rétro-compatible.
- **Un seul point de changement côté store**, grâce au refactor BUG-165 :
  `frontend/src/store/modules/factories/flatReferentialModule.js` (action `[fetchAction]`) — même
  boucle de pagination que les 6 autres modules (`limit=200`, concatène jusqu'à `meta.total` ou une
  page courte), appliquée une fois dans la factory et donc automatiquement effective pour les 4
  modules (`brandNames.js`, `displayNames.js`, `industrials.js`, `packingTypes.js`) qui la
  consomment. Contrat public inchangé (getter = tableau plat complet, `fetchX({forceRefresh})`).
- **Bonus trouvé en cours de route** : le refactor BUG-165 avait mis au jour deux divergences
  comportementales entre les 4 référentiels plats (`mergeOnUpdate` jamais activé sur
  Industrial/PackingType, `loadErrorFallback` jamais traduit) et les avait délibérément préservées
  telles quelles pour rester un refactor pur. Une fois la factorisation en place, les deux sont
  devenues des corrections d'une ligne — closes dans la foulée (voir
  [BUG-165](165_referentiels_plats_duplication_non_factorisee.md) pour le détail).

## Risque de régression / à surveiller

**Slice MarketPrice — validation manuelle requise** (pas de `pnpm dev` lancé cette session) :
vérifier que les dropdowns Good Type/Category de `MarketPriceCreateDrawer.vue`,
`MarketPriceEditDrawer.vue`, `MarketPriceEditSupplierDrawer.vue`, `MarketPriceCsvImportDrawer.vue`
et les filtres de `MarketPriceListView.vue` affichent bien la liste complète (pas seulement les 200
premiers) une fois qu'un tenant dépasse `limit=200` lignes, et que le wiring de cross-invalidation
BUG-163 (une création/modif/suppression de catégorie invalide toujours
`marketPriceTypes/isCacheValid`) fonctionne toujours après ce changement.

**Slice Product + Component — validation manuelle requise** (pas de `pnpm dev` lancé cette
session) : vérifier qu'un consommateur dropdown (p. ex. le select Type/Category de
`MenuItemCreateView.vue` pour Product, et l'équivalent côté `ComponentCreateView.vue`) affiche
bien la liste COMPLÈTE d'options après ce changement — pas seulement les 200 premières lignes —
une fois qu'un tenant dépasse `limit=200` types/catégories. Vérifier aussi les autres
consommateurs identifiés par l'audit (CSV import wizards, quick-create dialogs) qui dépendent
d'une liste d'options non tronquée.

**Slice référentiels plats — validation manuelle requise** (pas de `pnpm dev` lancé cette session) :
vérifier que les dropdowns Brand/DisplayName/Industrial/PackingType (`MenuItemCreateView.vue`,
`ComponentCreateView.vue`, `MarketPriceCreateDrawer.vue`, `MarketPriceEditSupplierDrawer.vue`,
`MenuItemCsvImportDrawer.vue`, `MarketPriceCsvImportDrawer.vue`) affichent bien la liste complète
au-delà de 200 lignes, et que les 2 correctifs de polish (fusion optimiste Industrial/PackingType,
message d'erreur i18n) n'ont pas introduit de régression visuelle sur les 4 écrans de liste.

**Global** : vérifié par grep (`grep -rl` sur chaque nom de service/classe) que `BrandsService`,
`DisplayNamesService`, `IndustrialsService`, `PackingTypesService`, `MarketPriceTaxonomyService`,
`ComponentTaxonomyService` et les méthodes `getProductTypes`/`getProductCategories` de
`MenuItemsService` ne sont référencés nulle part ailleurs que leur propre contrôleur/module
NestJS — aucun cron, seed, script ou autre service backend n'appelle directement ces méthodes en
s'attendant à un tableau brut. Le changement de forme de réponse (`Array` → `{ data, meta }`) est
donc contenu aux 10 endpoints HTTP et à leurs 10 stores frontend correspondants, tous mis à jour.

## Références

- [`62_spacemenu_availability_referentiel_tenant_non_scope.md`](62_spacemenu_availability_referentiel_tenant_non_scope.md) — arbitrage similaire déjà documenté pour un référentiel voisin.
