# Menu & Recettes — Achats & Référentiels

> Domaine cartographie : **Menu & recettes** + **Achats & référentiels**. Owner produit : Ulrich.
> Écrans : `/menu-items` (+create/edit), `/components` (+new/edit), `/space-menus` (+
> `/space-menus/:spaceId/shops/:shopId`), `/suppliers`, `/market-prices`, référentiels sous
> `/configurations/` (préfixe ajouté le 2026-07-19, anciennes URLs redirigées automatiquement, voir
> `frontend/src/router/index.js`) : `/configurations/product-types`,
> `/configurations/product-categories`, `/configurations/component-types`,
> `/configurations/component-categories`, `/configurations/market-price-types`,
> `/configurations/market-price-categories`, `/configurations/brand-names`,
> `/configurations/display-names`, `/configurations/industrials`,
> `/configurations/packing-types`.
>
> ⚠️ Ces routes `/configurations/*` sont uniquement les URLs **frontend** (pages) — les routes
> **backend** REST correspondantes (`/product-types`, `/component-types`, etc., voir
> `src/api/endpoints/*.api.js`) n'ont pas changé et ne doivent pas être confondues avec elles.
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma, chaque route backend, chaque store
> Vuex et chaque client API de ce domaine a été localisé et lu directement (pas de citation
> recopiée d'un rapport tiers). Objectif : qu'un dev ou un agent IA qui doit corriger un bug ici
> sache exactement où regarder et ce qu'il risque de casser ailleurs, sans relire le code.

---

## Vue d'ensemble — comment les entités s'emboîtent

```
Supplier ──sert──> Espaces (via Supplier.sites, String[] "array of spaceIds")
    │
    └─ vend ──> MarketPrice (prix d'achat + taxonomie Good Type/Category propre)
                    │  (goodType pilote l'auto-création via syncIngredients/syncPackagings)
                    ├─> Ingredient (coût par unité de recette)
                    └─> Packaging (coût de l'emballage)
                            │
                            ▼
                    MenuComponent (une sous-recette : sauce, garniture... récursif)
                    [ComponentIngredient + ComponentComponent enfant]
                            │
                            ▼
                    MenuItem (l'article vendable : burger, bière...)
                    [components[] = fusion MenuItemIngredient + MenuItemComponent + MenuItemPackaging]
                            │
                            ├─> SpaceMenuItem   (vendu dans TEL ESPACE, à quel prix ?)
                            ├─> MenuAssignment  (activé sur TEL SHOP précis, dans TELLE config ?)
                            └─> MenuItemPriceHistory (historique des prix appliqués)
```

La chaîne de coût descend d'`Ingredient`/`Packaging` → `MenuComponent` → `MenuItem`. **Un bug de
calcul à un étage se propage automatiquement aux étages du dessus** — voir le bug documenté plus
bas, qui en est l'exemple concret et actif en prod.

---

## ⚠️ Le piège architectural n°1 de ce domaine : 3 clients API se disputent MenuItem/MenuComponent

Avant de toucher au code, il faut savoir QUEL fichier est réellement appelé — sinon on modifie un
chemin mort et rien ne change en prod, ou inversement on croit qu'un chemin est mort et on casse un
écran. Vérifié fonction par fonction :

| Entité | Client **réellement vivant** | Consommateurs confirmés | Client(s) mort/legacy en parallèle |
|---|---|---|---|
| **MenuItem** | `src/api/endpoints/menu-item.api.js` | `store/modules/menuItems.js`, `MenuItemCreateView.vue`, `MenuItemView.vue`, `MenuItemCsvImportDrawer.vue`, `RecipeImportDrawer.vue`, `ShopDetailView.vue`, `EventPredictView.vue`, `StepMapMenuItems.vue` (wizard), `useSpaceData.js` (`MenuItemFormDrawer.vue` supprimé le 2026-07-17, jamais branché) | `menu.api.js` expose aussi `getMenuItems/createMenuItem/...` (lignes 14-70) — **zéro appelant en dehors de lui-même**, mort pour MenuItem. `utils/api.js` (legacy 45 Ko) expose aussi `getAllMenuItems/saveMenuItem/...` — encore appelé, mais **uniquement par le builder v1** (`PropertiesPanelView.vue:1663`, live) et par des fichiers eux-mêmes morts (`PropertiesPanel.vue`, `SearchResultsPanel.vue`, `ElevationView.vue` racine, `MenuItemMarginReport.vue` — 0 référence externe, voir Code mort) |
| **MenuComponent** | `src/api/endpoints/menu.api.js` (`getMenuComponents` etc., lignes 82-131) | `store/modules/menuComponents.js` — donc l'écran `/components` passe par le **monolithe**, contrairement à MenuItem qui en est sorti | `component.api.js` (34 lignes, mêmes fonctions dupliquées) — utilisé uniquement par `useSpaceData.js`, pas par l'écran Components lui-même |
| Suppliers, Packaging, MarketPrices, MarketPriceIngredients | `menu.api.js` | `store/modules/suppliers.js`, `packaging.js`, `marketPrices.js`, `marketPriceIngredients.js` | — (pas de client dédié pour ces 4, tout passe par le monolithe) |
| Brand/DisplayName/Industrial/PackingType/ProductType-Category | Clients dédiés propres | `brand-name.api.js`, `display-name.api.js`, `industrial.api.js`, `packing-type.api.js`, `product.api.js` — chacun avec son store correspondant, **aucune ambiguïté** | — |

**Conséquence pratique** : si tu dois modifier le comportement de MenuItem, édite
`menu-item.api.js` — **et vérifie que le builder v1 (`PropertiesPanelView.vue`) n'a pas aussi
besoin du changement**, puisqu'il lit encore via `utils/api.js`. Si tu dois modifier
MenuComponent, édite `menu.api.js` (pas `component.api.js`, sauf si tu touches spécifiquement
`useSpaceData.js`).

---

## MenuItem — l'article vendable

**Qu'est-ce que c'est** : un article qu'on peut vendre à un point de vente (un burger, une bière,
un pack de chips). C'est la fiche produit du menu d'un espace.

**Où vit le code** :
- Modèle : `api-datafriday-staging/prisma/schema.prisma:1840-1895`
- Service backend : `api-datafriday-staging/src/features/menu-items/menu-items.service.ts`
- Contrôleur : `menu-items.controller.ts` (`@Controller('menu-items')`)
- Store Vuex : `datafriday-web/src/store/modules/menuItems.js`
- Client API live : `datafriday-web/src/api/endpoints/menu-item.api.js`
- Écrans : `datafriday-web/src/components/menu-fb/views/menu-items/views/`
  (`MenuItemView.vue` = liste, `MenuItemCreateView.vue` = création/édition), drawers
  `MenuItemCsvImportDrawer.vue`, `RecipeImportDrawer.vue` (`MenuItemFormDrawer.vue`, ancien
  drawer parallèle jamais branché, supprimé le 2026-07-17 — voir Code mort de ce domaine)

**Toutes les routes backend** (`menu-items.controller.ts`) :

| Route | Rôle |
|---|---|
| `POST /menu-items` | Créer un article |
| `POST /menu-items/bulk` | Création en masse |
| `GET /menu-items` | Liste (paginée) |
| `POST /menu-items/refresh-costs` | Recalculer le coût de TOUS les articles du tenant |
| `POST /menu-items/:id/refresh-costs` | Recalculer le coût d'UN article |
| `POST /menu-items/apply-weezevent-prices` | Appliquer en masse les prix Weezevent |
| `POST /menu-items/backfill-weezevent-prices` | Backfill historique des prix Weezevent (dry-run/overwrite, cf. mémoire projet) |
| `POST /menu-items/recipes` | Import de recettes en masse |
| `GET /menu-items/:id/recipe` | Recette complète d'un article (composants fusionnés) |
| `POST /menu-items/:id/apply-weezevent-price` | Appliquer le prix Weezevent à UN article + historiser |
| `GET /menu-items/:id/price-history` | Historique des prix (table `MenuItemPriceHistory`) |
| `GET /menu-items/:id` | Détail |
| `PUT /menu-items/:id/components` \| `/ingredients` \| `/packagings` | Remplacer une des 3 relations de composition |
| `PATCH /menu-items/:id` | Édition partielle |
| `DELETE /menu-items/:id` | Suppression |
| `GET/POST/PATCH/DELETE /product-types`, `/product-categories` | Taxonomie (même contrôleur fichier, `menu-items.controller.ts:374,425`) |

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `readyForSale` (`"Yes"`/`"No"`/null) | **Yes** = l'article arrive déjà prêt/emballé de la cuisine centrale (chips, bouteille d'eau) → on le réarme *tel quel*. **No** = assemblé au point de vente (sandwich + serviette ajoutée sur place) → on **éclate** `components[]` pour le réarmement. C'est la fiche technique qui fait foi. |
| `kitchenType` | Cuisine Centrale/Locale — saisi seulement quand `readyForSale = "Yes"` (existe aussi sur `MenuComponent`, même contrat). |
| `comboItem` (`"Yes"`/`"No"`/null) | **Distinct de `readyForSale`.** Marque un article réutilisable *tel quel* comme ligne d'un item catégorie "Menu" composé. |
| `numberOfPiecesRecipe` | Combien de pièces produit la recette. `totalCost` est le coût de **toute la fournée**, pas d'une pièce. |
| `typeId`/`categoryId` | FK vers `ProductType`/`ProductCategory` (Food/Beverage/Combo puis sous-catégories) — 1 des 3 taxonomies parallèles du domaine (voir plus bas), ne pas confondre avec celle de MarketPrice ni de MenuComponent. |
| `brandId`/`displayNameId` | FK vers `Brand`/`DisplayName` (référentiels plats, voir plus bas). |
| `basePrice`/`vatRate` | Prix TTC courant et taux de TVA. `SpaceMenuItem.priceTtc` le surcharge par espace. |
| `discountType`/`discountValue` | Remise catalogue : `"percent"` ou `"amount"`. |
| `totalCost` | Coût de production de **toute la fournée** décrite par `components[]`. Coût par pièce = `totalCost / numberOfPiecesRecipe`, calculé **à la lecture** (`menu-items.service.ts:111-114`), jamais stocké tel quel. |
| `components[]` | Pas un vrai champ — **fusion en lecture** de 3 relations : `MenuItemIngredient`, `MenuItemComponent`, `MenuItemPackaging`. Chaque ligne a `numberOfUnits`, `unitCost`/`totalCost`, `storageType`. |
| `storageType` (tableau, enum `Cold`/`Dry`/`Frozen`) | Un seul enum aujourd'hui, appliqué au niveau MenuItem entier. |
| `menuAssignments` | Relation vers `MenuAssignment` — voir section dédiée plus bas. |

**Champs gelés (à ne PAS écrire)** : `spaceIds`/`spacePrices` existent encore en colonnes DB mais
sont **plus jamais lus** (commentaire explicite `schema.prisma:1865-1868` : *"GELÉS... Drop DB
différé"*). Source de vérité = `SpaceMenuItem`. Le contrat API sérialise toujours
`spaceIds`/`spacePrices` pour compat ascendante, reconstruits dynamiquement.

**Pourquoi ce design** : `components[]` est dénormalisé en 3 tables (au lieu d'une table
générique) pour garder des FK propres vers 3 entités aux règles de coût différentes
(`Ingredient`/`MenuComponent`/`Packaging`) tout en exposant une liste unique côté API.

**Ce qui dépend de MenuItem (impact si tu le modifies)** :
- **Event Predict** (`EventPredictStockUpSection.vue`) lit `readyForSale` + `components[]` pour
  l'expansion récursive (`MAX_DEPTH=10`).
- **Logistics** (`logistics.service.ts:407,904`) lit `comboItem` + `readyForSale` pour la même
  décision d'éclatement, avec une condition **différente** (voir bug plus bas).
- **Analyse** (`MenuItemRevenueDistribution.vue`) lit `typeId`/`categoryId` pour le donut de
  répartition du CA par article.
- **Weezevent pricing sync** écrit `basePrice` + crée une ligne `MenuItemPriceHistory`.
- **SpaceMenus** (`space-menus.service.ts`) lit `components[]` pour la disponibilité (tous les
  fournisseurs des ingrédients doivent servir l'espace).
- **Builder v1** (`PropertiesPanelView.vue`) lit la liste des menu items via `utils/api.js` (voir
  piège n°1 ci-dessus) pour les associer aux shops du plan.

---

## MenuComponent — la sous-recette (composant)

**Qu'est-ce que c'est** : une brique de recette réutilisable dans plusieurs MenuItem — sauce,
garniture, assemblage. Récursif : un MenuComponent peut contenir d'autres MenuComponent enfants
(garde anti-cycle explicite, `menu-components.service.ts:201-205`).

**Où vit le code** :
- Modèle : `schema.prisma:1598-1640` (+ `ComponentIngredient:1678-1693`,
  `ComponentComponent:1695-1709`)
- Service : `api-datafriday-staging/src/features/menu-components/menu-components.service.ts`
- Contrôleur principal : `menu-components.controller.ts` (`@Controller('menu-components')`)
- Contrôleur taxonomie **séparé** : `component-taxonomy.controller.ts`
  (`@Controller('component-types')` + `@Controller('component-categories')`)
- Store Vuex : `datafriday-web/src/store/modules/menuComponents.js`
- Client API live : `menu.api.js` (voir piège n°1)
- Écrans : `components/menu-fb/views/component-library/views/` (`componentListView.vue` = liste,
  `ComponentCreateView.vue` = création/édition, `ComponentTypeList.vue`/`ComponentCategoryList.vue`
  = taxonomie)

**Toutes les routes backend** : `POST /menu-components`, `POST /menu-components/repair` (legacy,
voir bug), `POST /menu-components/refresh-costs`, `GET /menu-components` (+`:id`),
`PATCH`/`DELETE /menu-components/:id`, `PUT :id/ingredients`\|`/children` ;
`GET/POST/PATCH/DELETE /component-types`, `/component-categories`.

**Champs clés** :

| Champ | Sens |
|---|---|
| `numberOfUnitsRecipe` | Combien d'unités produit CETTE sous-recette (ex. une bassine de sauce fait 20 portions). **`Float?`** depuis BUG-256-02 (était `Int?` — la reprise du CSV historique Components a révélé que 40% des rendements réels sont fractionnaires, ex. 0.750 kg ; le typage `Int` était une erreur de modélisation, le front affichait déjà ce champ en flottant). |
| `unitCost` | **Censé être** le coût d'UNE unité produite. Voir le bug ci-dessous : ce n'est actuellement PAS le cas. |
| `readyForSale`/`kitchenType` | Même contrat que sur `MenuItem`. |
| `componentTypeId`/`componentCategoryId` | Taxonomie propre (voir section taxonomies). |
| `subComponents` (Json) | **Champ legacy mort** — reliquat du portage Figma. Encore lu par `repair()` (endpoint quasi mort), ne plus l'alimenter. |

### 🔴 Bug actif confirmé — le coût d'un MenuComponent est surestimé quand `numberOfUnitsRecipe > 1`

C'est l'exemple concret de "modifier B (un composant) crée une régression dans A (un MenuItem)".

`computeComponentUnitCost()` (`menu-components.service.ts:196-236`) calcule :
```
total = Σ(ingredient.unitCost × quantité) + Σ(sous-composant.unitCost × quantité)
```
… et cette valeur brute (coût de toute la fournée décrite par les lignes de recette) est écrite
**telle quelle** dans `MenuComponent.unitCost` par `refreshCosts()`
(`menu-components.service.ts:544-549`) — **sans jamais diviser par `numberOfUnitsRecipe`**.

Concrètement : une sauce dont la recette (ingrédients pour 5€) produit 10 portions
(`numberOfUnitsRecipe=10`) se retrouve avec `unitCost = 5€` en base — le coût réel d'UNE portion
est `5€ / 10 = 0,50€`. Le champ s'appelle `unitCost` mais contient un coût de batch.

Cette valeur fausse remonte directement dans `MenuItem.totalCost`
(`menu-items.service.ts:1398-1409` : `lineTotal = MenuComponent.unitCost × numberOfUnits`) : **tout
MenuItem qui utilise ce composant voit son coût de production, et donc sa marge affichée,
surestimé du facteur `numberOfUnitsRecipe` du composant.**

Piège de débogage : le formulaire front (`ComponentCreateView.vue:560-578`) affiche à l'écran
`finalUnitCost = totalCost / numberOfUnitsRecipe` — **correcte, divisée** — mais cette valeur
affichée n'est jamais celle réellement persistée : le backend recalcule et écrase à la sauvegarde.
"Ça a l'air bon à l'écran" ne veut rien dire ici.

Le vieux endpoint `repair()` (`menu-components.service.ts:581-610`, s'appuie sur le champ JSON
legacy mort `subComponents`) fait l'erreur inverse — une **multiplication**
(`unitCost = totalCost * numberOfUnitsRecipe`) — mais ce chemin n'est quasi plus emprunté.

**Statut (2026-07-15)** : documenté, **non corrigé**. Si tu corriges : diviser par
`numberOfUnitsRecipe || 1` dans `computeComponentUnitCost()`, et prévoir un backfill de tous les
`MenuItem.totalCost` dépendant d'un composant concerné.

### Import/Export CSV — recette incluse (BUG-256-02)

Un seul format cible en import (contrairement à Market Prices, aucun format legacy à préserver
côté Components) :
`Component ID,Component Name,Category,Component Type,Unit,Number of Units per Recipe,Packaging Type,Number of units,Storage Type,Description,Recipe`.
`Category` (valeur parente, ex. "Food") → `category` (texte) + `componentTypeId` (résolu/auto-créé)
; `Component Type` (valeur enfant, ex. "Veg"/"Sauce") → `componentCategory` (texte) +
`componentCategoryId` — inversion volontaire entre le nom des colonnes CSV et les champs internes,
la hiérarchie Food→Veg/Sauce prime sur le libellé littéral de la colonne.

**Format packé de `Recipe`** : segments séparés par `|`, sous-champs séparés par `>`. Un ingrédient
a un slot vide en plus d'un sous-composant (`localId>Ingredient>>refId>quantity`, 5 parties, vs.
`localId>Component>refId>quantity`, 4 parties) — même syntaxe que l'ancien format `Recipe` de
MenuItem (`parseRecipe()`, remplacé depuis par un format multi-lignes, voir
[[108_menu_items_csv_reimport_format_multi_lignes]]), réutilisée ici car elle convient à la
reprise d'un fichier historique figé (pas à un cycle d'édition humaine répété, d'où l'absence
volontaire d'un format multi-lignes équivalent côté Components pour l'instant).

**Résolution des références legacy** — la colonne `Recipe` référence des ingrédients par
d'anciens **Market Price ID** (pas des noms, pas des ids d'`Ingredient`) : le chantier Market
Prices (BUG-254-02) ne conserve nulle part le mapping ancien-id → nouveau-id. Résolution : (a) si
la référence correspond à un `Ingredient.id` réel du tenant → utilisée directement (round-trip
après un export packé de cette base) ; (b) sinon, un **fichier compagnon Market Prices optionnel**
(le CSV d'origine, uploadé en plus du CSV Components, parsé uniquement en mémoire côté navigateur)
permet de résoudre ancien-id → `Item Name` → `Ingredient` par nom ; (c) sinon la ligne de recette
est ignorée (le composant est quand même créé/mis à jour). Les sous-composants (`Component` dans
`Recipe`) référencent toujours une **autre ligne du même CSV** via sa colonne `Component ID` —
résolu en 2 passes (tous les composants créés/mis à jour d'abord, puis les sous-composants),
indépendamment de l'ordre des lignes dans le fichier.

**Upsert** : par `Component ID` s'il correspond à un cuid réel du tenant, sinon par nom (évite les
doublons sur réimport d'un même fichier legacy, dont les ids ne matcheront jamais).
`ComponentType`/`ComponentCategory` résolus par nom exact et auto-créés si absents — pas d'étape
de résolution interactive façon Levenshtein (Market Prices en a une pour 4 champs de taxonomie ;
2 champs ici, jugé disproportionné).

**Export** : `componentListView.vue` a deux boutons qui coexistent — l'export plat existant
(8 colonnes, inchangé) et un nouvel export packé (`onExportCsvPacked()`) qui encode
`ingredients[]`/`children[]` avec les **vrais cuids** de cette base, permettant un cycle
export → édition → réimport sans fichier compagnon.

**Fichiers** : `ComponentCsvImportDrawer.vue` (nouveau, drawer d'import), `componentListView.vue`
(export packé + bouton import), `menu.api.js` (`replaceComponentIngredients`/
`replaceComponentChildren`, les routes `PUT /menu-components/:id/ingredients`\|`/children`
existaient déjà côté backend mais sans wrapper client). Détail complet :
[[256_02_components_csv_import_export_recette]].

---

## SpaceMenus — deux granularités : "vendu dans l'espace" vs "activé sur CE shop"

Deux modèles répondent à deux questions différentes — à ne pas confondre.

### SpaceMenuItem — "cet article est-il vendu dans TEL ESPACE, à quel prix ?"

**Qu'est-ce que c'est** : une ligne = *"ce MenuItem est vendu dans TEL espace"*, avec
éventuellement un prix TTC/TVA propre à cet espace. Condition 0, au niveau espace entier.

**Où vit le code** : modèle `schema.prisma:1902-1916` ; contrainte
`@@unique([menuItemId, spaceId])`.

**Règle de prix** : `priceTtc`/`vatRate` null = fallback sur `MenuItem.basePrice`/`vatRate`.

**Pourquoi ce design** : remplace les anciens champs dénormalisés `MenuItem.spaceIds`/
`spacePrices` (gelés, voir plus haut) qui ne garantissaient aucune intégrité référentielle.

### MenuAssignment — "cet article est-il activé sur TEL SHOP, dans TELLE configuration ?"

**Qu'est-ce que c'est** : la granularité fine sous `SpaceMenuItem` — un item peut être vendu dans
l'espace en général, mais désactivé sur un shop précis (ex. le stand Beer ne vend pas de burgers).
C'est ce modèle qui répond à `/space-menus/:spaceId/shops/:shopId`.

**Où vit le code** : modèle `schema.prisma:2009-2035`. Champs : `elementId` (le shop =
`SpaceElement`), `menuItemId`, `enabled` (le booléen d'activation réel), `configId`, `stationId`
(assignation alternative à une `Station`, builder legacy).

**⚠️ Piège déjà corrigé une fois — à ne pas régresser** : le commentaire du schéma explique
pourquoi `configId` existe : *« en builder v2 un élément est partagé entre configs
(ConfigurationElement), donc "scopé élément" ne suffit plus — un item coché en config A
apparaissait à tort en config B »*. La contrainte `@@unique([elementId, menuItemId, configId])`
(pas juste `[elementId, menuItemId]`) EST la correction de ce bug historique. Si tu retires ce
scoping, tu réintroduis la fuite entre configurations.

**Frontend — deux consommateurs distincts, pour deux usages différents** :
- **Édition** (l'écran `/space-menus` — cocher/décocher les items d'un shop) : état géré **inline**
  dans les composants (`SpaceMenuView.vue` `data()`), appels directs à `menu.api.js`
  (`getSpaceMenuConfiguration`, `assignMenuItemsToShop` en delta partiel — une paire shop×item ou
  les seuls items modifiés selon l'appelant). Écrans :
  `components/menu-fb/views/space-menus/views/SpaceMenuView.vue`, `ShopDetailView.vue` (+
  `SpaceMenuShopView.vue`, `SpaceMenuItemView.vue`), drawers associés (`ShopMenuItemsDrawer.vue`,
  `SpaceMenuEditShopDrawer.vue`, `ShopDetailEditDrawer.vue`).
  **Historique** : ce paragraphe décrivait auparavant `src/composables/useSpaceMenu.js` /
  `useSpaceMenuReconciliation.js` / `useShopElementMapping.js` comme la couche d'édition live —
  c'était faux. Ces 3 fichiers implémentaient une approche différente et jamais branchée à un
  écran réel (état `Map<elementId, Set<menuItemId>>`, sauvegarde POST complète via
  `saveSpaceMenuConfiguration`, réconciliation "souple" avec pré-remplissage suggéré depuis un
  mapping Weezevent shop↔élément + badge non bloquant de divergence), dépendant d'une route
  backend `GET /shop-element-mappings/:spaceId` qui n'a jamais existé dans `api-datafriday-staging`
  (vérifié le 2026-07-17). **Supprimés le 2026-07-17** (audit
  [BUG-116](../bugs/116_spacemenus_composables_morts_doc_obsolete.md)) après confirmation qu'ils
  étaient un prototype abandonné (aucune trace git d'un branchement passé, aucun spec document,
  et un concept concurrent déjà en production sous un autre nom — `LocationSpaceMapping` /
  module `mappings/`). Si ce besoin (suggestion + badge de divergence non bloquant) redevient
  pertinent, repartir de zéro côté backend plutôt que de chercher à réanimer ce code.
- **Lecture ailleurs dans l'app** (savoir quels items sont activés sur un shop, sans les éditer) :
  `src/store/modules/shopMenuItems.js`, qui appelle `getShopMenuItems` (`menu.api.js`) →
  `GET /space-menu/shop/:id?configId=...`. **Piège déjà corrigé, documenté dans le code
  lui-même** (commentaire du store) : la clé de cache est `${shopId}::${configId||''}` car
  l'assignation d'un shop est **scopée par configuration** côté backend — sans `configId`, le
  backend retombe sur une config arbitraire. Le store utilise aussi un registre `inflight` (Map)
  hors du state réactif pour dédupliquer les appels concurrents — un `if (state.fetching) return`
  naïf avait un bug de course (le getter pouvait être lu vide avant hydratation) ; ne pas revenir à
  ce pattern plus simple si tu retouches ce fichier.

### Le module backend `SpaceMenus` (routes réelles, `space-menus.controller.ts`)

| Route | Rôle |
|---|---|
| `GET shop/:shopId` | Détail complet d'un shop : tous les MenuItem assignés avec ingrédients/composants/packaging imbriqués, prix/coûts/marges |
| `GET shop/:shopId/items`, `GET shop/:shopId/inventory` | Variantes ciblées (items seuls, inventaire) |
| `GET :spaceId/:configId/shop-items` | **Batch léger** : un seul appel pour TOUS les shops d'un config (juste id/nom/catégorie), optimisation explicite anti-N+1 |
| `GET space/:spaceId/items` | Tous les items assignés dans l'espace, tous shops confondus |
| `GET :spaceId/:configId` / `POST` | Lecture/sauvegarde de la config de menu complète d'un espace+config |

**Si tu ajoutes un nouveau besoin "quels items sur quel shop"**, vérifie d'abord si `shop-items`
(batch léger) suffit avant de faire du N+1 avec `GET shop/:shopId`.

---

## Les 3 taxonomies parallèles — à ne jamais confondre en code

| Taxonomie | Classe | Routes backend | Écrans |
|---|---|---|---|
| `ProductType`/`ProductCategory` | `MenuItem` | `/product-types`, `/product-categories` — dans `menu-items.controller.ts` | `ProductTypeList.vue`, `ProductCategoryList.vue` (`components/products/views/`) |
| `ComponentType`/`ComponentCategory` | `MenuComponent` | `/component-types`, `/component-categories` — contrôleur **dédié** `component-taxonomy.controller.ts` | `ComponentTypeList.vue`, `ComponentCategoryList.vue` (`components/menu-fb/views/component-library/views/`) |
| `MarketPriceType`/`MarketPriceCategory` | `MarketPrice` (Good Type/Good Category) | `/market-price-types`, `/market-price-categories` — `market-price-taxonomy.controller.ts` | `MarketPriceTypeList.vue`, `MarketPriceCategoryList.vue` (`components/market-prices/views/`) |

Même forme (`Type {id,name} ← Category {id,name,typeId}`), **aucune relation entre elles**. Front :
`productTypes.js`/`productCategories.js` (store) → `product.api.js` (client, partagé pour les 2) ;
`componentTypes.js`/`componentCategories.js` → via `menu.api.js` ;
`marketPriceTypes.js`/`marketPriceCategories.js` → via `menu.api.js`.

---

## Ingredient / Packaging — les composants d'achat

Deux entités sœurs, dérivées d'un `MarketPrice`. **Où vit le code** : modèles
`schema.prisma:1538-1594` ; contrôleurs `ingredients.controller.ts` (`@Controller('ingredients')`,
+`GET by-market-price/:marketPriceId`) et `packaging.controller.ts` (`@Controller('packaging')`) ;
stores `store/modules/` correspondants (via `menu.api.js`, sauf `ingredient.api.js` qui existe et
est utilisé par `RecipeImportDrawer.vue`/`useSpaceData.js` pour des besoins
ponctuels — vérifier lequel des deux clients avant de modifier).

**Champs clés** (identiques sur les deux modèles sauf mention) :

| Champ | Sens |
|---|---|
| `active` (Boolean, défaut true) | Soft-toggle — masque l'ingrédient/packaging des dialogs de sélection sans le supprimer. |
| `marketPriceId` | FK nullable (`onDelete: SetNull`) — un Ingredient/Packaging **peut exister sans** MarketPrice lié (ex. saisi manuellement), auquel cas le coût doit être renseigné directement. |
| `costPerRecipeUnit` | Le coût réellement utilisé dans les calculs de recette (résolu par `resolveIngredientUnitCost`, `menu-components.service.ts`, si `line.unitCost` absent). |
| `costPerPurchaseUnit`, `purchaseUnitsPerRecipeUnit` | Conversion unité d'achat → unité de recette (ex. acheté au kg, utilisé en grammes). |
| `ingredientCategory` | **Enum** sur `Ingredient` (`IngredientCategory`), mais **simple string libre** sur `Packaging` (`ingredientCategory String?`) — asymétrie de typage entre les deux modèles, à connaître si tu factorises du code partagé Ingredient/Packaging. |

**Détection du packaging dans `components[]` de MenuItem/MenuComponent** : pas un `itemType`
séparé partout — le front détecte un packaging par `category` contenant
"packaging"/"emballage", ou `storageType==='material'`, ou `sourceId` préfixé `pkg-`
(`src/utils/stockPlanning.js → isPackagingComponent`).

---

## Supplier / MarketPrice — les référentiels d'achat

**Supplier** (`schema.prisma:774-797`) : un fournisseur. Champs : `sites` (String[], espaces
servis), `configurationIds` (String[], défaut `[]` — usage à vérifier au cas par cas, pas exploré
en détail dans cette passe), `sectors` (String[], défaut `[]`).

**Route backend** (`suppliers.controller.ts`, `@Controller('suppliers')`) : CRUD complet
standard. **Écran** : `SuppliersListView.vue`. **Store** : `suppliers.js` → `menu.api.js`.

### 🟠 Contradiction active — un composant front interprète `sites` vide à l'envers

`space-menus.service.ts:466-472` (backend) : **STRICT**, commentaire explicite *« sites vide = ne
livre pas cet espace »*. `MarketPriceHierarchicalTable.vue:211` (front) : `sites.length===0 ||
sites.includes(...)` = **vide → sert TOUS les espaces**. Les autres fichiers front
(`menuItemAvailability.js`, `SpaceMenusPanel.vue`) sont cohérents avec le backend. **Statut :
documenté, non corrigé.**

**MarketPrice** (`schema.prisma:799-843`) : le prix d'achat réel. Champs notables au-delà du prix :
`purchaseUnitConversion`, `packedUnits`/`numberOfUnits`/`unitsPerPurchase`,
`packingWidth`/`Height`/`Length` (dimensions physiques du colis), `purchasePackaging`/
`inventoryPackaging` (**String, PAS de FK** vers `PackingType` — la valeur stockée est le nom
choisi, comme `goodType`/`category` ; commentaire explicite du modèle `PackingType`,
`schema.prisma:1823-1827`), `industrialId` (FK vers `Industrial` = le façonnier/industriel de
cette ligne d'achat).

**Taxonomie** : `goodType` (texte libre, historiquement un enum) est le **discriminateur
fonctionnel** qui pilote l'auto-création d'un `Ingredient`/`Packaging` : `syncIngredients()`
(`market-prices.service.ts:540-558`) crée automatiquement un `Ingredient` pour tout `MarketPrice`
dont `goodType !== 'Packaging'` et qui n'en a pas encore ; `syncPackagings()` fait l'inverse.

### 🟡 Dédup MarketPrice — la clé a changé et est plus permissive qu'avant

`deduplicate()` (`market-prices.service.ts:596-...`) : deux lignes sont dupliquées si
`itemName::(supplierId||supplier)` sont identiques — **la clé ne compare PAS le prix, l'unité ni
la quantité par lot**, contrairement à une version antérieure du produit qui comparait aussi
`unit`/`unitsPerPurchase`/`price`. Tri `orderBy createdAt desc` puis conservation du premier vu →
**la ligne la plus récente est conservée, les plus anciennes supprimées**. Si un même item/fournisseur
a légitimement plusieurs lignes à des conditionnements/prix différents, un appel à `deduplicate`
les fusionnerait à tort en ne gardant que la plus récente — à vérifier avant d'exposer ce bouton
plus largement.

**Routes backend** (`market-prices.controller.ts`) : `POST /market-prices` (+`/import`,
`/deduplicate`, `/sync-ingredients`, `/sync-packagings`), `GET /market-prices` (+`with-packagings`,
`with-ingredients`, `:id`), `PATCH`/`DELETE /market-prices/:id`, `DELETE item/:itemName`.
Taxonomie dans un contrôleur séparé `market-price-taxonomy.controller.ts`.

### Import/Export CSV — deux formats coexistants

Deux formats sont acceptés en import (`MarketPriceCsvImportDrawer.vue`) et produits en export
(`MarketPriceListView.vue`) — aucun n'a besoin de migration Prisma, les deux réutilisent les
mêmes champs `MarketPrice`/`Supplier` déjà en base :

- **Format plat** (historique) : 1 ligne CSV = 1 `MarketPrice` (un item avec 3 fournisseurs = 3
  lignes qui répètent les infos de l'item). Bouton "CSV" / "Télécharger le modèle".
- **Format packé** (ajouté pour la reprise d'un jeu de données historique — voir
  `frontend/docs/example/market-prices-2026-07-29.csv`, 368 articles réels) : 1 ligne CSV = 1
  Item, avec une colonne `Market Prices` qui empile tous ses prix fournisseurs séparés par `|`,
  chaque prix ayant ses sous-champs séparés par `>` (ordre exact : `PACKED_SUBFIELD_ORDER` dans
  `MarketPriceCsvImportDrawer.vue`). Bouton "CSV (par article)" / "Télécharger le modèle (par
  article)". Le format est **auto-détecté** à l'upload (présence d'une colonne « Market Prices »)
  — pas de bascule manuelle.

Champs niveau Item (une fois par ligne, appliqués à tous ses prix) : `Item Name` → `itemName`
(c'est aussi la seule vraie clé — il n'existe pas de table "Item" séparée en base, `Item ID` est
donc informatif seulement et ignoré à l'import), `Good Type`, `Ingredient Category` → `category`,
`Recipe Unit`, `Purchase Unit Conversion`. Par prix fournisseur (segment `>`-séparé) : `Market
Price ID` → `id` (upsert, voir ci-dessous), `Supplier Item Name` → `supplierItem`, `Supplier ID` →
`supplierId` (généralement un id d'un autre système — jamais utilisé tel quel comme FK, seule la
résolution par **nom** alimente `supplierId`, avec auto-création si besoin, comme le format plat),
`Supplier Name`, `Good Type` (prioritaire sur le niveau item), `Packaging`/`Number of
units`/`Unit`/`Market Price Amount` (Purchase), `Packaging` (Inventory), `Packed Units`/`Number of
units`/`Length`/`Width`/`Height` (Packing). Pas de colonne Industrial dans ce format (absent du
sous-enregistrement) — `industrialId` reste non renseigné pour un import packé.

**⚠️ Conflation connue, volontairement non corrigée ici** : "Inventory Information > Number of
units" et "Packing Information > Packed Units" pointent vers le **même champ** `packedUnits` en
base (`MarketPriceEditSupplierDrawer.vue` lie `form.packedUnits` aux deux sections) — ce ne sont
pas deux valeurs distinctes aujourd'hui, contrairement à ce que suggère le format cible. L'import
prend "Packing > Packed Units" comme canonique et ignore "Inventory > Number of units" ; l'export
écrit la même valeur `packedUnits` aux deux positions.

**Upsert par `Market Price ID`** (`bulkCreate()`, `market-prices.service.ts`) : si une ligne du
format packé fournit un `id` qui correspond à un `MarketPrice` existant de ce tenant, cette ligne
est **mise à jour** au lieu d'être recréée/dédoublonnée — permet le cycle export (avec ids réels
de cette base) → édition externe (tableur) → réimport. Un `id` présent mais inconnu du tenant (cas
normal du tout premier import d'un fichier legacy dont les ids viennent d'un autre système, ex.
`1774987340963-9uit3bt4d`) tombe silencieusement dans le flux de création + dédoublonnage
existant — l'id fourni est simplement ignoré, un nouveau `cuid()` est généré. La réponse de
`POST /market-prices/import` inclut désormais `updated: [...]` en plus de `created`/`skipped`/
`errors`.

---

## Brand / DisplayName / Industrial / PackingType — référentiels plats

Quatre entités simples, même forme (`{id, name, tenantId}`, `@@unique([tenantId, name])`),
**chacune avec son propre client API dédié** (pas d'ambiguïté ici) :

| Modèle | Route API (backend) | Client API | Store | Écran |
|---|---|---|---|---|
| `Brand` | `/brand-names` | `brand-name.api.js` | `brandNames.js` | `BrandNameListView.vue` (page : `/configurations/brand-names`) |
| `DisplayName` | `/display-names` | `display-name.api.js` | `displayNames.js` | `DisplayNameListView.vue` (page : `/configurations/display-names`) |
| `Industrial` | `/industrials` | `industrial.api.js` | `industrials.js` | `IndustrialListView.vue` (page : `/configurations/industrials`) |
| `PackingType` | `/packing-types` | `packing-type.api.js` | `packingTypes.js` | `PackingTypeListView.vue` (page : `/configurations/packing-types`) |

`Brand`/`DisplayName` sont référencés par `MenuItem` (`brandId`/`displayNameId`). `Industrial` est
référencé par `MarketPrice` (`industrialId`). `PackingType` n'est **pas une FK** — c'est un
référentiel de noms consommé en texte libre par `MarketPrice.purchasePackaging`/
`inventoryPackaging` et par `MenuComponent.inventoryPackaging` (voir plus haut).

---

## Enum unifié — `StorageType`

Un seul enum aujourd'hui : `StorageType { Cold, Dry, Frozen }` (`schema.prisma:47-51`), partagé
par `Ingredient`, `Packaging`, `MenuComponent`, `MenuItem`. Les anciennes versions du produit
avaient 3 enums incompatibles — ils ont convergé vers celui-ci.

### 🔴 Bug de saisie actif — `"Freezer"` n'existe pas dans l'enum

`MenuItemCreateView.vue:504` envoie encore `"Freezer"` (l'autre occurrence,
`MenuItemFormDrawer.vue:225`, a disparu avec la suppression de ce fichier orphelin le
2026-07-17) alors que la vraie valeur d'enum est `Frozen`. Écriture d'une string invalide dans
une colonne enum Postgres → probablement rejetée. **Statut : documenté, non corrigé.**

---

## Récapitulatif — bugs actifs de ce domaine (2026-07-15, non corrigés)

| # | Bug | Fichiers |
|---|---|---|
| 1 | Coût `MenuComponent` surestimé (ignore `numberOfUnitsRecipe`) → `MenuItem.totalCost` faux | `menu-components.service.ts:196-236`, `menu-items.service.ts:1398-1409` |
| 2 | `"Freezer"` (front) vs `Frozen` (enum) | `MenuItemCreateView.vue:504` |
| 3 | Deux règles d'expansion combo incompatibles | `EventPredictStockUpSection.vue` (readyForSale seul) vs `logistics.service.ts:407,904` (+ comboItem) |
| 4 | `Supplier.sites` vide : "personne" (backend) vs "tout le monde" (1 composant front) | `space-menus.service.ts:466-472` vs `MarketPriceHierarchicalTable.vue:211` |
| 5 | Dédup MarketPrice ignore prix/unité/quantité — risque de fusion excessive | `market-prices.service.ts` (`deduplicate`) |

## Section Configurations (10 pages taxonomie/référentiels) — audit du 2026-07-19

Les 10 écrans de la sidebar "Configurations" (Menu Item Types/Categories, Good Types/Categories,
Component Types/Categories, Brand Names, Display Names, Industrials, Packing Types — routes listées
dans l'en-tête de ce fichier) ont fait l'objet d'un audit dédié le 2026-07-19, en 5 passes parallèles
(une par paire de taxonomie/référentiel). Détail complet dans les fiches bugs
[`backend 78-88`](../../../backend/docs/bugs/00_INDEX.md) et
[`frontend 159-169`](../bugs/00_INDEX.md). Synthèse des motifs récurrents trouvés :

- **Suppression sans garde contre les entités dépendantes** — sur 5 des 6 taxonomies/référentiels
  audités (`ProductType/Category`, `ComponentType/Category`, `MarketPriceType`, `Brand`/
  `DisplayName`, `Industrial`), supprimer une entrée référencée ailleurs cascade ou `SetNull`
  silencieusement, sans décompte ni confirmation — même famille que le bug déjà corrigé pour
  `EventType`/`EventCategory` ([backend BUG-75](../../../backend/docs/bugs/75_eventtype_eventcategory_delete_cascade_sans_garde.md)),
  jamais porté ici (backend BUG-79/81/82/85/86).
- **Désynchronisation des valeurs texte libre miroir** — `MarketPrice.goodType`/`category` et les 3
  champs `purchasePackaging`/`inventoryPackaging`/`inventoryPackaging` (Component) stockent le nom
  de la taxonomie en texte libre en plus (ou à la place, pour `PackingType`) d'une FK ; renommer ou
  supprimer l'entrée de taxonomie source ne propage jamais le changement vers ces colonnes miroir
  (backend BUG-83/84). Symétrique côté front : la résolution de FK par correspondance de nom au
  moment de la sauvegarde (au lieu de réutiliser l'id chargé) est le même problème sous un autre
  angle, déjà connu ([BUG-62](../bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)/
  [BUG-81](../bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md)) et retrouvé une nouvelle fois sur
  les drawers MarketPrice (frontend BUG-162).
- **Implémentation non uniforme des paires Type/Category** — sur 3 paires structurellement
  identiques (`ProductType/Category`, `ComponentType/Category`, `MarketPriceType/Category`), seule
  `ProductCategory` appelle son propre endpoint dédié pour la lecture ; les deux autres dérivent
  leurs Categories du payload de l'endpoint Types (`flatMap` sur `categories[]` imbriqué),
  laissant leur endpoint `GET .../categories` dédié totalement mort côté front et cassant
  l'invalidation croisée de cache entre les deux écrans (frontend BUG-161/163).
- **4 référentiels plats dupliqués à l'identique** — `Brand`/`DisplayName`/`Industrial`/
  `PackingType` sont 4 implémentations quasi byte-for-byte (vue liste, drawer, dialog suppression,
  store, client API), jamais factorisées en composant générique (frontend BUG-165) — ce qui explique
  la répétition du même bug i18n sur les 10 écrans de la section (frontend BUG-166).
- **Trou d'autorisation isolé** — `PATCH /product-types/:id` et `/product-categories/:id` n'ont
  jamais eu de garde de permission, contrairement à `create`/`remove` sur les mêmes contrôleurs
  (backend BUG-78, 🔴 le plus sévère de cette section).
- **Trou d'ownership cross-tenant** — `MenuComponent.create()`/`update()` ne vérifie pas que
  `componentTypeId`/`componentCategoryId` appartiennent au tenant courant, même famille que
  [backend BUG-67](../../../backend/docs/bugs/67_event_taxonomy_fk_sans_ownership.md) (Events),
  jamais porté ici (backend BUG-80).

Aucun de ces bugs n'a été reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider
manuellement avant correction.

## Code mort de ce domaine (à ne PAS prendre comme référence, ne pas modifier en pensant que ça sert)

- `src/components/ComponentBuilderPanel.vue`, `MenuItemBuilderPanel.vue` — orphelins, jamais routés.
- `src/components/SpaceMenusPanel.vue`, `SpaceMenusByMenuItem.vue` (racine) — référencés
  uniquement par `MenuBuilder.vue` (lui-même mort).
- `src/components/PropertiesPanel.vue`, `SearchResultsPanel.vue`, `ElevationView.vue` (racine,
  **différents** de leurs homonymes qui vivaient sous `components/spaces/views/builder/` —
  ce dossier a été supprimé le 2026-07-22, voir `docs/modules/03_BUILDER_ESPACES.md`)
  — zéro référence externe, mais contiennent des appels à `api.getAllMenuItems()` legacy qui
  auraient pu faire croire à un usage réel.
- `src/components/MenuItemMarginReport.vue`, `CostTrackingChart.vue` — référencés uniquement par
  `MenuBuilder.vue` (mort).
- `menu.api.js` : les fonctions `getMenuItems/createMenuItem/updateMenuItem/deleteMenuItem/
  getMenuItemSnapshots` (lignes 14-70) sont mortes pour MenuItem (voir piège n°1) — ne pas les
  utiliser comme référence, `menu-item.api.js` est la version vivante.
- `component.api.js` : doublon des fonctions MenuComponent de `menu.api.js` — totalement mort
  depuis le 2026-07-17 (`useSpaceData.js`, son dernier consommateur, redirigé vers `menu.api.js`
  pour corriger un cap silencieux à 100 lignes, voir BUG-064/105).
- `MenuComponent.subComponents` (Json legacy) — encore lu par `repair()` mais plus la source de
  vérité.
- `MenuItem.spaceIds`/`spacePrices` (colonnes gelées).
- `src/composables/useSpaceMenu.js`, `useSpaceMenuReconciliation.js`, `useShopElementMapping.js` —
  **supprimés le 2026-07-17** (cluster de 3 composables auto-référencés, zéro appelant réel hors
  d'eux-mêmes et de `SpaceMenusPanel.vue`, déjà mort). Voir
  [BUG-116](../bugs/116_spacemenus_composables_morts_doc_obsolete.md) pour l'arbitrage complet.
- `space-menu.api.js` : `getSpaceMenu` (seule `getShopMenus` du même fichier est vivante,
  consommée par `EventPredictView.vue`) — mort, plus aucun consommateur depuis la suppression
  ci-dessus (laissé en l'état, non prioritaire).
- `utils/api.js` : `getSpaceMenuConfiguration`/`saveSpaceMenuConfiguration` — plus aucun
  consommateur en dehors de `SpaceMenusPanel.vue` (déjà mort) depuis la suppression ci-dessus,
  laissées en l'état. **Ne pas confondre avec** `getShopElementMappings` du même fichier, qui reste
  vivante — consommée par `useShoppingList.js`/`SpaceRestockView.vue` (domaine Restock, l'usage
  documenté et légitime de ce module legacy).

## Zones grises restantes (pas des angles morts — des points réellement non tranchés)

- `Supplier.configurationIds`/`sectors` (String[]) : champs présents en base, usage non exploré en
  détail dans cette passe (aucun bug identifié, juste non documenté finement).
- La formule exacte de résolution `resolveIngredientUnitCost` en cas de `line.unitCost` ET
  `Ingredient.costPerRecipeUnit` tous deux renseignés (priorité de l'un sur l'autre) n'a pas été
  vérifiée caractère près — comportement à confirmer avant de le documenter comme règle absolue.
