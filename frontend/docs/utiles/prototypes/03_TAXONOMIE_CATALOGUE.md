# Rapport détaillé — Taxonomie du catalogue (MarketPrice, MenuItem, Ingredient, Packaging...)

> Confrontation entre le prototype Supabase KV (2024) et `PEPITES_EXTRAITES.md` §2.2
> (readyForSale + détection packaging), plus la connaissance générale de la taxonomie actuelle
> (MenuItem/MenuComponent Type-Category, MarketPrice Type-Category indépendant, Ingredient,
> Packaging + PackingType, Brand, DisplayName, Industrial, Supplier).
>
> **Fichiers lus** : `type_category_init.tsx` (166 lignes, entier), `index.tsx` lignes 1-65,
> 851-925, 1005-2543, 12188-12450 (jusqu'à la fin du fichier, 12789 lignes au total).
> `aggregation_helper.tsx` (lignes 1-120) pour le système d'agrégations Type/Category. Grep ciblés
> sur `readyForSale`, `itemType`, `isPackagingComponent`, `storageType` sur tout le dossier.

## 1. Correspondances confirmées

- **`components[]` dénormalisé sur MenuItem, avec `itemType` discriminant** : `index.tsx:2324-2372`
  (route `refresh-costs`) itère `menuItem.components` et distingue `comp.itemType === 'Ingredient'`
  vs `'Component'`, avec les champs `sourceId`, `numberOfUnits`, `unitCost`, `totalCost`,
  `storageType` — exactement la structure décrite dans PEPITES §2.2 (`sourceId`, `itemType`,
  `numberOfUnits`, `category`, `storageType`). Le concept de dénormalisation en tableau unique
  existait déjà dans le prototype.
- **`numberOfPiecesRecipe`** existe déjà comme diviseur du coût total : `index.tsx:2377` —
  `totalCost = Σ comp.totalCost / menuItem.numberOfPiecesRecipe`, cohérent avec la règle documentée
  (« numberOfUnits vaut pour numberOfPiecesRecipe pièces »).
- **Ingredient et Packaging comme entités sœurs, alimentées par MarketPrice** :
  `ingredients/cleanup` (`index.tsx:1294-1323`) et `packaging/cleanup` (`index.tsx:1368-1397`)
  exigent toutes deux `marketPriceId`, `costPerRecipeUnit`, `costPerPurchaseUnit`,
  `purchaseUnitsPerRecipeUnit` — confirme que Ingredient/Packaging étaient déjà dérivés d'un
  MarketPrice, comme aujourd'hui.
- **Hiérarchie Type → Category à deux niveaux** : `type_category_init.tsx:14-50` (types
  Combo/Food/Beverage, catégories avec `typeId`) correspond au modèle Type/Category encore en
  place pour MenuItem aujourd'hui.
- **Packaging Type = référentiel plat, sans hiérarchie** : `index.tsx:1733-1763`
  (`packaging-type:` = `{id, name, createdAt}`, aucun lien à un type/category) confirme exactement
  ce que le mémo `project_marketprice_packing_type_referential.md` (2026-07-07) décrit comme un
  « référentiel plat indépendant » — cette caractéristique existait déjà dans le prototype, elle
  n'est pas une invention récente.
- **Quirk des 4 clés `sites/spaces/spaceIds/siteIds` sur Supplier** : `index.tsx:2440-2463` logue
  et écrit littéralement `sup.sites || sup.spaces` puis `data.sites` — c'est la source directe du
  comportement documenté dans PEPITES §4.2. Le front qui tolère les 4 variantes compense un flou
  déjà présent ici, pas un bug introduit plus tard.

## 2. Divergences

- **`readyForSale` n'existe nulle part dans le prototype** (`grep -rn "readyForSale"` sur tout le
  dossier : aucun résultat, tout comme `isPackagingComponent`/`MAX_DEPTH`). La règle Yes/No et
  l'expansion récursive documentées en PEPITES §2.2/2.1 sont donc une **construction postérieure
  au prototype** — pas un héritage à confronter, un ajout net de la refonte NestJS.
- **`refresh-costs` ne traite que `itemType === 'Ingredient'` et `'Component'`**
  (`index.tsx:2325,2348`) — aucune branche `'Packaging'` : le `.map()` retombe sur `return comp;`
  inchangé pour tout composant packaging. Soit le packaging n'était pas encore un `itemType` de
  premier rang à cette époque, soit son coût ne se rafraîchissait jamais automatiquement — un gap
  concret du prototype.
- **MarketPrice = taxonomie ad hoc, disjointe de Type/Category** : la création de market-price
  (`index.tsx:1069-1085`) et son résumé (`index.tsx:1026-1039`) manipulent `price.goodType` /
  `price.category` comme **chaînes libres**, sans `typeId`/`categoryId` référençant les entités
  `type:`/`category:` utilisées par MenuItem. Seul MenuItem a une taxonomie structurée par ID dans
  ce prototype ; MarketPrice, Ingredient (`ingredientCategory`, `index.tsx:1304`) et Packaging
  (même champ `ingredientCategory` réutilisé tel quel, `index.tsx:1378`) restent en strings libres
  sans FK. **Ça sent très fort le modèle ancien que la refonte MarketPrice/MenuItem Type-Category
  de juillet 2026 est venue remplacer** : le split documenté
  (`project_split_menuitem_marketprice_taxonomy.md`) crée justement des
  `MarketPriceType`/`MarketPriceCategory` dédiés — chose qui n'existait pas du tout ici, où
  MarketPrice n'avait même pas de référentiel structuré, juste des strings.
- **Double représentation type/category (string legacy + ID) avec route de resynchronisation
  dédiée** : `menu-item:` porte à la fois `type`/`category` (strings, legacy) et
  `typeId`/`categoryId`, avec une route `sync-type-category-names` (`index.tsx:2252-2308`) pour
  repousser le nom canonique vers le champ string dénormalisé chaque fois qu'il dérive. Ce pattern
  de dénormalisation-à-resynchroniser-manuellement est une dette purement KV ; un backend
  relationnel (Prisma/FK) n'a pas ce problème par construction.
- **Brand / DisplayName / PromotionType = CRUD squelette sans aucune liaison** :
  `index.tsx:1637-1731` — seulement GET liste + POST create, aucun PATCH/DELETE, aucune route qui
  associe un brand/display-name/promotion-type à un MenuItem. Contraste avec le mémo actuel
  (`project_menuitem_displayname_industrial_fields.md`) où DisplayName est un champ intégré au
  modèle MenuItem — dans le prototype ce sont des référentiels flottants, jamais consommés dans les
  routes lues.

## 3. Pépites nouvelles (règles non documentées ailleurs)

- **Règle exacte de déduplication MarketPrice** (`index.tsx:1101-1139`) : deux entrées sont des
  doublons si `{supplierItem, supplier_id (fallback: supplier), unit, unitsPerPurchase, price}`
  sont identiques (comparaison par `JSON.stringify`) ; la première occurrence rencontrée est
  conservée, les suivantes supprimées.
- **Normalisation `pricePerUnit = price / unitsPerPurchase`** calculée côté serveur à chaque
  sauvegarde (`index.tsx:1076`).
- **Règle de fallback `supplierItem ← itemName`** (`index.tsx:1142-1204`, routes
  `migrate`/`force-migrate`) : le nom spécifique-fournisseur retombe sur le nom standardisé de
  l'article quand il est vide — logique de nommage produit/fournisseur pas documentée ailleurs.
- **Triangle de réparation `cost / unitCost / numberOfUnits` des sous-composants**
  (`index.tsx:1418-1449` à la sauvegarde, et `1478-1546` en réparation batch) : si `unitCost`
  manque mais `cost` et `numberOfUnits` sont connus → `unitCost = cost/numberOfUnits` ; si
  `numberOfUnits` manque mais `cost` et `unitCost` sont connus →
  `numberOfUnits = cost/unitCost` ; sinon défaut `numberOfUnits = 1.0` ; puis `cost` est toujours
  recalculé comme `unitCost × numberOfUnits`. Règle de cohérence de données réutilisable, jamais
  mentionnée dans les mémos actuels sur MenuComponent.
- **Snapshot d'audit à chaque refresh de coût** (`index.tsx:2391-2405`) :
  `menu-item-snapshot:{id}-{timestamp}` créé uniquement quand `refresh-costs` détecte un
  changement réel, avec `changeReason: 'Ingredient cost change'`. C'est un mécanisme d'audit-trail
  distinct de `MenuItemPriceHistory` (qui documente les changements de prix de vente) — celui-ci
  trace la dérive du **coût recette** dans le temps, concept absent des mémos actuels.
- **Seuils de marge par Type** (`index.tsx:851-925`) : `margin-threshold-settings` =
  `{ [typeId]: { lowThreshold, highThreshold } }`, défaut `{68, 75}`, avec sa propre migration
  depuis un ancien format global unique. Probablement utilisé pour colorer la marge par Type
  (Food/Beverage/Combo) dans l'UI — aucune trace de cette règle métier dans les mémos actuels.
- **Système d'agrégations financières par Category/Type** (`aggregation_helper.tsx:18-55`, routes
  `index.tsx:1765-1920`) : `sumOfCosts`, `sumOfAveragePrices`, `averageOfAverageMargins`,
  `spaceBreakdowns` (par espace) et `categoryBreakdowns` (dans les agrégats de Type) — un vrai
  P&L par nœud de taxonomie, avec cache stale-while-revalidate 30s (`index.tsx:1808-1837`) et file
  d'attente « dirty » en arrière-plan (`aggregation_queue.tsx`, routes `1981-2087`) pour recalculer
  par lots sous la contrainte des 60s d'Edge Function. Fonctionnalité entièrement construite, sans
  équivalent documenté dans l'état actuel — **potentiellement une piste à ressusciter
  conceptuellement** (analytics marge par Type/Category) même si la plomberie KV est morte.

## 4. Mort / hors-sujet

- Toutes les routes `/migrate`, `/force-migrate`, `/cleanup`, `/repair`,
  `/sync-type-category-names` (`index.tsx:1141-1204`, `1295-1397`, `1478-1546`, `2252-2308`) et
  `type_category_init.tsx` en entier (`initializeTypesAndCategories`,
  `migrateMenuItemsToNewStructure`) : scripts de rattrapage propres à l'absence de
  schéma/contraintes du KV Supabase. Sans objet avec Prisma (migrations, NOT NULL, FK).
- Toute l'infrastructure de file « dirty » d'agrégations (`aggregation_queue.tsx`, routes
  `index.tsx:1981-2087`) et les courses `Promise.race` contre des `setTimeout` (ex.
  `index.tsx:2501-2508`, `2005-2033`) : artefacts du wall-clock 60s des Edge Functions et de
  l'absence de vues matérialisées/triggers SQL — un backend Postgres ferait ça avec une vue ou un
  job planifié classique.
- `csv-mappings` (`index.tsx:1206-1249`) : blob générique de mapping de colonnes CSV, supplanté par
  le wizard d'import CSV actuel (Digifood, dry-run, 3 étapes).
- `space-menus` KV (`index.tsx:2490-2543`, blob `{elementId: {menuItemId: boolean}}`) : remplacé
  par la table relationnelle `SpaceMenuItem` (mémo `project_spacemenuitem_table_migration.md`).
- `fnb-items` / `menu-item-mappings` (`index.tsx:12188-12420`) : lecture d'une table Supabase brute
  `fnb_items` avec `price_history` en texte parsé par `includes('^location^')`, plus tout le bloc
  de logging debug « 🍺 BUDWEISER TRACKING » (`12253-12264`) — cruft de debug ponctuel lié à une
  migration de données spécifique, supplanté aujourd'hui par le mapping Weezevent/Digifood.

## Chemins de fichiers pertinents

`old/docs-api-supabase-kv/type_category_init.tsx`, `old/docs-api-supabase-kv/index.tsx`,
`old/docs-api-supabase-kv/aggregation_helper.tsx`, `docs/utiles/PEPITES_EXTRAITES.md`.
