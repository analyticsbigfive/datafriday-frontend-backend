# Rapport Cost tracking (2026-10-22)

Branche `feat/cost-tracking` (worktree `datafriday-cost-tracking`, depuis `develop`). Rien commité, rien poussé, aucune migration appliquée, aucune base touchée, aucun build.

## Lots livrés (un agent Sonnet par lot, aucun n'a atteint 140k)
- Lot 0 : ADR_LOT0.md (constats, modèle, points d'appel).
- Lot 1 : table MenuItemCostSnapshot (migration écrite, non appliquée), service recordIfChanged idempotent, appels branchés, script de baseline (non lancé).
- Lot 2 : module backend `features/cost-tracking` (series, catalog, history, costsAsOf), permission `front.fb.costTracking`.
- Lot 3a/3b : couche données frontend, page et 21 composants, route, entrée de menu, i18n FR/EN.
- Lot 1bis : propagation composant vers articles (voir ci-dessous).
- Lot 4a/4b : endpoint `GET /analyse/:spaceId/event-costs` et branchement de l'Analyse avec repli sur le coût actuel.

## Décisions prises
- Propagation composant vers articles : FAITE au lot 1bis (elle change les coûts affichés des articles modifiés à la main ailleurs, voir ci-dessous).
- Marge Weezevent par jointure latérale : NON faite (dupliquerait resolveEventReference en SQL).
- Boutons partage/export de la maquette non repris.

## Lot 1bis : propagation composant vers articles
- Nouveau `menu-components/services/menu-component-item-propagation.service.ts` (modèle : MarketPriceCostPropagationService). Après `refreshCosts` d'un composant : rafraîchit les composants parents, retrouve les articles qui utilisent le composant ou ses parents (+ parents de combo), `MenuItemCostService.refreshCosts` par lots de 200, `refreshComboCost` des parents de combo, puis un seul `recordIfChanged(..., 'component_edit', { componentId })` (rien si l'empreinte est identique).
- Appelé sans `await` (`void`, try/catch + `logger.warn` interne) depuis `menu-components.service.ts` : `replaceIngredients`, `replaceChildren`, `update` (lignes modifiées, ou `unitCost` saisi sans lignes). Module : `MenuComponentsModule` importe `MenuItemsModule` (pas de cycle).
- Non propagés volontairement : `create` (un composant neuf n'a aucun article), `remove` (soft delete, les lignes d'articles gardent le dernier coût), simple renommage/champs sans effet coût.
- Suite (lot 1bis 02) : édition directe d'un Ingrédient (`ingredients.service.ts` update) et d'un Emballage (`packaging.service.ts` update) propagée via `MenuComponentItemPropagationService.propagateFromBricks` (reasons `ingredient_edit` / `packaging_edit`, sourceRef `{ ingredientId }` / `{ packagingId }`). Déclenchée seulement si un champ de coût change réellement (`shared/cost-propagation/brick-cost-change.ts` : costPerRecipeUnit, costPerPurchaseUnit, purchaseUnitsPerRecipeUnit, marketPriceId, storageType). `void` + try/catch interne + `logger.warn`. `IngredientsModule` et `PackagingModule` importent `MenuComponentsModule` (qui exporte désormais le service). Le recalcul des articles (lots de 200, part combo, un seul `recordIfChanged`) est factorisé dans `refreshItemsAndSnapshot`, partagé avec `propagate`.
- Helpers `withAncestorComponents` / `withAncestorItems` extraits dans `shared/cost-propagation/cost-ancestry.ts` (fonctions prenant prisma), utilisés par MarketPriceCostPropagationService et MenuComponentItemPropagationService (specs inchangés, verts). Le corps des deux propagations reste distinct (le tronc market_price n'est pas refondu, risque inutile).
- Frontend : libellés `ctReasonIngredientEdit` / `ctReasonPackagingEdit` (FR/EN) et famille 'recipe' dans `costTrackingRecipeDiff.js`.
- Audit des autres écritures de coût (grep sur menuItem / menuComponent / lignes / ingredient / packaging, scripts compris) : déjà couverts par recordIfChanged ou refreshCosts avec reason : création, bulk-create, update d'article (dont numberOfPiecesRecipe), composition (composants, ingrédients, emballages, combos), prix Weezevent, chaîne prix du marché (imports CSV compris, un appel groupé).
- Suppression : FAITE, bloquée (409) au lieu de propager. Règle : `remove` d'un composant (enfant d'un composant non supprimé ou ligne d'un article non supprimé), d'un ingrédient (ligne de composant ou d'article non supprimés) ou d'un emballage (ligne d'article non supprimé) lève ConflictException « Utilisé dans N élément(s) (exemples : A, B, ...) : retirez-le d'abord des recettes. » (5 exemples max). Code : `backend/src/shared/cost-propagation/brick-usage.ts`. Pas de bulkDelete backend (la suppression en masse de composants est une boucle front, chaque élément bloqué est compté et le premier motif affiché) ; aucune UI front de suppression d'ingrédient/emballage. Le client axios (`api/client.js`) renvoie désormais le message backend pour les 409. Ancien raisonnement : (le calcul des coûts les ignore alors, mais `refreshCosts` des composants parents lève "MenuComponent not found" sur un enfant supprimé, donc une propagation échouerait ou ferait chuter des coûts affichés sans décision métier ; à trancher avec Bertrand : bloquer la suppression d'un élément utilisé) ; `storage-types` / `packing-types` / `kitchens` (updateMany sans effet sur les montants) ; `product-mapping` (réactivation d'article, coût inchangé) ; copie/duplication (le front passe par `create`, donc `created` / refreshCosts) ; scripts (`copy-config-menus` écrit des SpaceMenuItem, `backfill-*` sans coût de recette).
- Vérifié sur base locale (transaction rollback) : une édition de ligne d'un composant produit 1 snapshot `component_edit` sur un article qui l'utilise ; un second appel n'en crée pas. Idem 2e passe : doublement du coût d'un ingrédient (Tenders) produit 1 snapshot `ingredient_edit`, d'un emballage (Cup vierge) 1 snapshot `packaging_edit`, rollback confirmé (0 restant).

## À faire par un humain avant tout déploiement
1. Appliquer la migration en local, lancer `scripts/check-schema-indexes.mjs`.
2. EXPLAIN (begin read only, jamais de SET sur le pooleur 6543) : requête CA top 10, lectures snapshots, event-costs sur 100 events.
3. Lancer la baseline en `--dry-run` puis en local ; mesurer le volume du JSON recipe.
4. Recette navigateur : page Cost tracking (graphique, étiquettes 40 degrés, thème sombre, tiroir) et Analyse sur 1 ou 2 events de référence (les chiffres changent si le snapshot diffère du coût actuel).
5. Vérifier la sync RBAC au premier boot (front.fb.costTracking).
6. Ordre des PR vers staging : 1, 2, 3, puis 4 (le plus risqué), jamais de push develop sans go.

## Points ouverts (§9 du plan)
Fournée contre pièce dans l'Analyse (conservé : fournée), prix global contre par espace (global), rétention, axe Temps | Matchs, période "depuis le début du suivi" remplacée par des durées fixes.

## Retours Bertrand (22/10, captures d'écran)
- Doublon de barre : `DashboardView` ne connaissait pas la route `space-cost-tracking` comme page à en-tête propre (ajoutée aux listes self-headed et rail, comme Analyse).
- Colonnes gauche, centre, droite défilent chacune verticalement (au-dessus de 1280 px ; en dessous, défilement de page).
- Bascule « Matchs sur le graphique » supprimée : les events sont toujours affichés.
- Pastille « N courbe(s) » remplacée par le niveau affiché (« 28 catégories », « 5 ingrédients »), idem dans le bandeau.
- Classements de droite : 5 lignes puis « Voir tout (N) » ; un clic descend d'un niveau en filtrant (type, catégories ; catégorie, articles ; article, ingrédients). Historique d'un article : lien « Historique des versions » du tableau ou clic sur un dernier changement.
- Filtre Ingrédient (dépend de l'article) et mode « Par ingrédient » : backend `groupBy=ingredient` + `ingredientId`, `GET /cost-tracking/:spaceId/articles/:id/ingredients`. Courbe d'une ligne de recette = quantité x coût unitaire figés / nombre de pièces, lue dans le Json `recipe` des snapshots (ingrédients, composants, emballages, fils de combo ; une ligne retirée retombe à 0). Les ingrédients à l'intérieur d'un composant ne sont pas détaillés (le snapshot fige la ligne du composant, pas sa recette).
- Variation : phrase explicative « entre la première version suivie et la plus récente, depuis le {date} ».
