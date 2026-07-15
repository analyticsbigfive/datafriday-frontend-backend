# Confrontation React legacy — Catalogue (Menu Items, Components, Market Price)

> Domaine couvert par 5 sous-rapports (un agent parent + 4 enfants, du fait de la taille du
> périmètre) : observations directes de l'agent parent sur `MenuItemBuilderPanel.tsx` +
> `menu-types.ts` (§A), cluster Component (§B), petits fichiers menu-item (§C), 3 gros fichiers
> MenuItemsLibraryPanel/MenuItemsByShopTable/SpaceMenusPanel (§D), cluster Market Price (§E).
> Docs de référence confrontées : `PEPITES_EXTRAITES.md` §2.2, `03_TAXONOMIE_CATALOGUE.md`
> (confrontation du backend KV).

---

## A. Observations directes (MenuItemBuilderPanel.tsx + menu-types.ts)

Couvre `MenuItemBuilderPanel.tsx` (1720 lignes, lu en entier), `components/types/menu-types.ts`
(292 lignes, lu en entier), `utils/menuItemHelpers.ts` et `utils/migration-ingredients-to-market-price.ts`
(lus en entier), plus un grep sweep sur `readyForSale`/`itemType`/`storageType`/`numberOfUnits`/`margin`
qui a fait remonter des fichiers hors périmètre assigné (`ElevationView.tsx`,
`EventPredictStockUpSection.tsx`, `PropertiesPanel.tsx`, `utils/inventoryUtils.ts`,
`LocationIntegrationWizard.tsx`).

### A.1 Correspondances confirmées

- **`readyForSale` existe bel et bien en React**, contrairement au constat du rapport KV
  (`03_TAXONOMIE_CATALOGUE.md` : absent du prototype KV). `menu-types.ts:50`
  (`readyForSale: 'Yes' | 'No'`, champ obligatoire) ; `MenuItemBuilderPanel.tsx:204,1154,1549`.
  Grep confirmé aussi dans `MenuItemEditor.tsx:286-287`, `MenuItemsLibraryPanel.tsx:394,443,534,
  1882-1883`, `ElevationView.tsx:151-152,206,313-314`, `PropertiesPanel.tsx:359`,
  `LocationIntegrationWizard.tsx:2745`.
- **Expansion récursive avec `MAX_DEPTH=10` et formule identique mot pour mot à la doc actuelle**,
  trouvée dans `EventPredictStockUpSection.tsx` (hors périmètre assigné, découverte par grep) :
  - `:170-171` `const MAX_DEPTH = 10; if (depth > MAX_DEPTH) return [];`
  - `:176-177` `readyForSale === 'Yes'` → retourne l'item tel quel
  - `:193-194` `readyForSale === 'No' && components.length > 0` → expansion
  - `:196` `numberOfPiecesRecipe = menuItem.numberOfPiecesRecipe || 1`
  - `:200-202` `calculatedQuantity = (numberOfUnits * menuItemQuantity) / numberOfPiecesRecipe` —
    formule strictement identique à PEPITES §2.2.
- **Structure `components[]`** (sourceId, itemType, numberOfUnits, category, unit, storageType)
  confirmée exactement par l'interface `MenuItemComponent` : `menu-types.ts:185-202`.
- **`numberOfPiecesRecipe` comme diviseur du coût total du MenuItem** :
  `MenuItemBuilderPanel.tsx:288` — `return total / numberOfPiecesRecipe;` dans
  `calculateTotalCost()`.
- **Seuils de marge par Type `{lowThreshold:68, highThreshold:75}`** : grep-observé
  `MenuItemsLibraryPanel.tsx:153,281` — identique au défaut `margin-threshold-settings` du KV.
  Confirme que cette règle existait **aux deux couches** (KV backend ET React), pas seulement en
  base.
- **Système d'agrégation Type/Category** (`sumOfCosts`, `sumOfAveragePrices`,
  `averageOfAverageMargins`, `spaceBreakdowns`, `categoryBreakdowns`) : interfaces
  `CategoryAggregations`/`TypeAggregations`/`AggregationSpaceBreakdown` — `menu-types.ts:230-293`,
  champs identiques à ceux cités dans `03_TAXONOMIE_CATALOGUE.md` §3. Consommation confirmée en UI
  via grep `MenuItemsLibraryPanel.tsx:238-245,1329-1390` — ce n'était donc pas de la plomberie
  backend morte : un vrai P&L par Type/Category était affiché à l'écran en React.
- **MarketPrice = taxonomie ad hoc** (`goodType`/`category` en strings libres, aucun
  `typeId`/`categoryId`) : `menu-types.ts:132-156` (interface `MarketPriceItem`) — confirme que la
  divergence trouvée dans le KV existait aussi à la couche React intermédiaire, pas seulement dans
  le KV.
- **Packaging Type = référentiel plat référencé par FK** : `menu-types.ts:143`
  `packagingId?: string // Reference to Packaging Type ID` — confirme que ce référentiel plat
  (déjà noté dans le rapport KV) était bien consommé via une vraie FK côté React.
- **Snapshot d'audit de coût (`MenuItemSnapshot`)** : `menu-types.ts:72-84` — champs `menuItemId`,
  `timestamp`, `changeReason` (ex. `"Ingredient cost change"`) — correspond exactement à la pépite
  KV `menu-item-snapshot:{id}-{timestamp}`. Confirme que ce concept existait comme type React
  typé, pas seulement comme route KV.
- **Filtres de storage `dry/cold/belowzero/material/merch`** : correspond exactement à
  `InventoryItem.storageType` — `menu-types.ts:94`. Grep confirmé : conversion
  `.toLowerCase() as 'dry'|'cold'|'belowzero'|'material'|'merch'` dans `AddEditComponent.tsx:96`,
  `AddEditMenuItem.tsx:143`, `ComponentEditor.tsx:118`, `ComponentLibrary.tsx:432`.

### A.2 Divergences

- **`itemType` a 4 valeurs à l'usage réel** (`'Ingredient'`, `'Component'`, `'Combo Item'`,
  `'Packaging'` — `MenuItemBuilderPanel.tsx:327,401,455,499`) **alors que le type déclaré n'en
  autorise que 2** : `menu-types.ts:188` — `itemType: 'Ingredient' | 'Component';`. Le type TS est
  en retard sur l'usage réel du code — divergence interne au React lui-même, pas seulement vs la
  doc actuelle.
- **"Combo Item" = un MenuItem entier imbriqué comme ligne de composant**, coûté par
  `comboItem.totalCost` (`MenuItemBuilderPanel.tsx:440-441,459-460`). Absent de la doc actuelle qui
  ne documente que 3 relations (Ingredient/Component/Packaging). Pas clair si le backend NestJS
  actuel a un équivalent MenuItem-dans-MenuItem — à vérifier.
- **Champ `comboItem` (`'Yes'/'No'`) distinct de `readyForSale`** :
  `MenuItemBuilderPanel.tsx:205,1165-1180,1560-1575` — "If Yes, this item can be reused in Menu
  category items". Absent de PEPITES §2.2. Et surtout : `utils/inventoryUtils.ts` (grep)
  conditionne l'expansion sur **les deux flags à la fois** (`comboItem === 'Yes' &&
  readyForSale === 'No'`), alors qu'`EventPredictStockUpSection.tsx` (qui, lui, correspond à la
  doc actuelle) ne teste que `readyForSale` seul. **Deux logiques d'expansion coexistent dans le
  React**, à des époques différentes ; la doc actuelle documente la version simplifiée, pas la
  version à double condition.
- **Formule de coût du `Component` potentiellement inversée** : `menu-types.ts:107` —
  `unitCost: Calculated: sum of all sub-items * numberOfUnitsRecipe` — une **multiplication**,
  alors que `MenuItem.totalCost` **divise** par `numberOfPiecesRecipe`
  (`MenuItemBuilderPanel.tsx:288`). Même concept (nombre de pièces produites) traité en sens
  opposé selon l'entité — voir §B pour l'analyse complète de cette incohérence sur 5 variantes.
- **Trois enums `storageType` différents coexistent sans conversion univoque** dans
  `menu-types.ts` :
  - `MenuItemData.storageType` (`:53`) : `('Dry'|'Cold'|'Freezer')[]` — pas de Material/NA
  - `ComponentDefinition`/`MenuItemComponent`/`IngredientItem.storageType` (`:106,179,193`) :
    `'Dry'|'Cold'|'Freezer'|'Material'|'NA'`
  - `InventoryItem`/`ComponentItem.storageType` (`:9,94`) :
    `'dry'|'cold'|'belowzero'|'material'|'merch'` (pas de freezer)
  Le mapping recette→inventaire perd de l'info : "Freezer" n'a pas d'équivalent inventaire,
  "belowzero"/"merch" n'ont pas d'équivalent recette. Non documenté ailleurs.
- **Storage type de l'ingrédient auto-déterminé par catégorie hardcodée** (pas choisi par
  l'utilisateur) : `MenuItemBuilderPanel.tsx:105-114,347-357,387-396` — `coldCategories=['Fish',
  'Meat','Cheese','Dairy']`, `freezerCategories=['Ice Cream','Frozen']`, défaut `'Dry'`. Règle
  métier implicite absente de PEPITES.
- **Prix par espace déjà un concept de premier ordre bien avant son implémentation "2026-06-30"** :
  `calculateSpacePricingData` (`MenuItemBuilderPanel.tsx:594-628`), `calculateAverages`
  (`:631-658`), sauvegardé dans `spacePricingData` (`:719`) ; types
  `SpaceSpecificPrice`/`SpacePricingData` (`menu-types.ts:20-31`), champs
  `averagePrice`/`averageMargin`/`spaceSpecificPrices`/`spacePricingData` sur `MenuItemData`
  (`:58-59,67-68`). Le mémo `project_menuitem_per_space_pricing_plan.md` présente cette
  fonctionnalité comme récente (2026-06-30) — le prototype React avait déjà un modèle de données
  quasi identique. Antériorité frappante à signaler, plus que divergence.
- **`margin` marqué DEPRECATED au profit d'`averageMargin`** : `menu-types.ts:57` — "Kept for
  backward compatibility". À vérifier si le backend actuel distingue toujours ces deux champs ou
  n'en a gardé qu'un.

### A.3 Pépites nouvelles

- **`SupplierItem.sites: string[]` — "empty array means all sites"** (`menu-types.ts:212`).
  PEPITES §4.2 documente les 4 variantes de clé (spaceIds/siteIds/sites/spaces) mais **pas** cette
  sémantique contre-intuitive (tableau vide = TOUS les sites, pas AUCUN). Règle métier importante
  et absente de la doc actuelle.
- **`IngredientItem.active?: boolean`**, défaut `true`, "when false, ingredient is hidden from
  selection dialogs" (`menu-types.ts:181`) — mécanisme de soft-delete/archivage d'ingrédient jamais
  mentionné dans les docs actuelles.
- **Duplication délibérée `cost` / `totalCost`** sur `MenuItemData` (`menu-types.ts:55-56`) :
  "cost: Cost to produce one unit (same as totalCost, explicitly stored)", confirmé
  `MenuItemBuilderPanel.tsx:727` (`cost: totalCost, // Explicitly set cost field`). Piège à
  surveiller si porté : deux champs synonymes à garder cohérents.
- **Modèle promo/réduction entre deux MenuItems** : `isPromotion`, `discountedProductId`
  (référence à un AUTRE MenuItem "remisé"), `promotionTypeId` (`menu-types.ts:44-46` ;
  `MenuItemBuilderPanel.tsx:218-220,1196-1279`). Fonctionnalité entière absente des docs fournies —
  potentiellement jamais portée.
- **`changeReason` du snapshot a au moins 3 valeurs suggérées** (`menu-types.ts:83`) :
  "Ingredient cost change", "Price update", "Composition change" — enrichit la pépite KV qui ne
  citait que le premier exemple.
- **DisplayName/PromotionType/Brand réellement intégrés en React** (`DisplayNameSelector`
  `:1102-1105`, `PromotionTypeSelector` `:1273-1276`, `BrandSelector` `:1138-1141` dans
  `MenuItemBuilderPanel.tsx`) — **contredit une partie de la conclusion KV** ("CRUD squelette
  jamais lié à un MenuItem"). Cette conclusion ne vaut que pour la couche KV pure ; au niveau React
  ces référentiels étaient bien consommés dans un vrai formulaire.
- **`utils/migration-ingredients-to-market-price.ts` (lu en entier)** révèle un modèle **encore
  plus ancien** : `MenuItem.ingredients[]` avec prix/unité inline (avant même le
  `components[]`/`MarketPrice` actuel). La migration dédoublonne par
  `ingredient.name.toLowerCase()` contre les `MarketPrice` existants (`:25,35-40`), catégorie par
  défaut `'Ingredients'`, note `'Migrated from Menu Item ingredients'` (`:48-51`). Trace une 3e
  génération de modèle (ingredients inline → MarketPrice liste → components[] dénormalisé) non
  documentée ailleurs.

### A.4 Mort/hors-sujet

- **`type`/`category` legacy + `typeId`/`categoryId` + resynchronisation** (`menu-types.ts:36-37,
  48-49` ; `MenuItemBuilderPanel.tsx:248-278`, `syncTypeAndCategory`) — même pattern de
  dénormalisation-à-resynchroniser que `03_TAXONOMIE_CATALOGUE.md` qualifie déjà de "dette
  purement KV, sans objet avec un backend relationnel". Confirmé également présent (et donc
  également mort) à la couche React.
- **Interface `ComponentItem`** (`menu-types.ts:1-17`, `category: 'Ingredients'|'Packaging'|
  'Consumables'`, `isCustomComponent`) — semble un modèle parallèle/antérieur à `MenuItemComponent`
  (ligne 185) ; probablement un prototype abandonné.
- **Logs `console.log` verbeux de debug** (`[MENU ITEM SAVE]` `:684-696,730`, `[MENU ITEM SYNC]`
  `:255,268`) — cruft de debug sans valeur de portage, mais révèle que le calcul prix moyen/marge
  par espace était une source de bugs fréquents à l'époque.

---

## B. Cluster Component Builder (7 fichiers, 5 variantes évolutives)

### Ordre de succession des variantes (du plus ancien au plus récent)

1. **AddEditComponent.tsx** + dialogue interne `AddEditComponentDialog` dans **ComponentLibrary.tsx**
   (lignes 384-714) — quasi-identiques (fonctions `calculateTotalCost` copiées mot pour mot :
   ComponentLibrary.tsx:410-421 = AddEditComponent.tsx:74-85 = ComponentEditor.tsx:96-107). Modèle
   `ComponentItem` (quantity/costPerUnit, category='Ingredients'|'Packaging'|'Consumables',
   storageType lowercase 'dry'|'cold'|'belowzero'|'material'|'merch'), arborescence **récursive**
   imbriquée (un ComponentItem peut avoir ses propres `subComponents`).
2. **ComponentEditor.tsx** — hybride : nouveaux champs top-level (componentCategory,
   numberOfUnitsRecipe, storageType Dry/Cold/Freezer/Material/NA) mais sous-items toujours au
   format `ComponentItem`/quantity legacy, formule **DIVISION**.
3. **ComponentBuilderDialog.tsx** — bascule vers `SubComponentItem[]` plat (itemType
   Ingredient/Component), formule bascule en **MULTIPLICATION**, `numberOfUnitsRecipe` stocké en
   string, sourcing ingrédient encore via `IngredientItem`/`InventoryLibrary` legacy.
4. **NewComponentEditor.tsx** — adopte `MarketPriceSelector`, formule multiplication conservée,
   mais logique de coût encore fragile (voir divergences).
5. **ComponentBuilderPanel.tsx** (le plus complet, 1036 lignes) + **ComponentsLibraryPanel.tsx**
   (vue liste associée, bouton "edit in builder" ligne 508) — paire finale/vraisemblablement live :
   triangle de réparation complet, `MarketPriceSelector`, `PackagingTypeSelector`, affichage
   fournisseur/date.

### B.1 Correspondances confirmées

- **Triangle de réparation cost/unitCost/numberOfUnits confirmé et détaillé** dans
  ComponentBuilderPanel.tsx :
  - Migration à l'initialisation du state (lignes 76-93) : `unitCost = sub.unitCost ??
    (numberOfUnits>0 ? cost/numberOfUnits : 0)` (ligne 79), puis si `numberOfUnits` manquant et
    cost/unitCost connus → `numberOfUnits = cost/unitCost` (lignes 82-86), sinon défaut 1.0
    (ligne 91).
  - Second passage via `useEffect` (lignes 154-241, dépendances `[ingredients, components]`) : si
    `unitCost` toujours à 0, il est **re-dérivé du catalogue vivant** par recherche par **nom**
    dans `ingredients`/`components` (lignes 174-207) — pas seulement recalculé arithmétiquement —
    puis `numberOfUnits` réparé (lignes 210-221), puis `cost` **toujours recalculé** =
    `unitCost × numberOfUnits` (ligne 224). C'est plus riche que le triangle KV pur : c'est un
    mécanisme d'auto-guérison qui va rafraîchir le prix depuis le catalogue courant, pas juste
    réconcilier les 3 nombres entre eux.
  - Re-vérification à la sauvegarde (lignes 372-377) : `cost` recalculé une 3e fois avant `onSave`.
  - Ce pattern confirme bien que ce n'est **pas propre au KV** : il existe identiquement à la
    couche React (comme suspecté).
- **storageType Dry/Cold/Freezer/Material/NA** confirmé comme l'enum "moderne" du modèle,
  identique dans ComponentBuilderPanel.tsx:65-67, ComponentBuilderDialog.tsx:62-64,
  NewComponentEditor.tsx (SelectItem 323-327), ComponentsLibraryPanel.tsx (476-480),
  ComponentEditor.tsx (544-548, 692-696). Correspond exactement à la doc.
- **numberOfUnitsRecipe** confirmé comme "combien d'unités produit cette recette" (libellé
  explicite ComponentBuilderPanel.tsx:720 "How many units this recipe makes") — analogue au
  `numberOfPiecesRecipe` de MenuItem évoqué dans les pépites.
- **Pattern de dénormalisation en tableau plat** (composants[] chez MenuItem) se retrouve
  **récursivement un niveau plus bas** : `ComponentDefinition.subComponents[]` (modèle final,
  `SubComponentItem` avec `itemType: 'Ingredient'|'Component'`, `sourceId`, `category`,
  `storageType`) est le même pattern appliqué à une sous-recette (Component) qu'à un plat
  (MenuItem). Confirmation structurelle forte du principe déjà documenté.
- **sourceId comme référence vers l'entité mère** : `handleAddComponent`
  (ComponentBuilderPanel.tsx:313) stocke `sourceId: comp.id` pour retrouver la ComponentDefinition
  d'origine — même logique que sourceId documentée pour MenuItem.components[].

### B.2 Divergences

- **Formule unitCost du Component contredite entre variantes** — creusé en détail :
  - **MULTIPLICATION** dans 4 fichiers : ComponentBuilderPanel.tsx:244-247
    (`totalSubCost * numberOfUnitsRecipe`, affiché explicitement en UI ligne 780
    `× {numberOfUnitsRecipe} units`), ComponentBuilderDialog.tsx:81-85 (idem, UI ligne 471
    `× {...} units`), NewComponentEditor.tsx:80-83, ComponentsLibraryPanel.tsx:119-122.
  - **DIVISION** dans 1 seul fichier : ComponentEditor.tsx:227-228
    (`unitCost = totalSubCost / (component.numberOfUnitsRecipe || 1)`), avec commentaire explicite
    "÷ Number of Units Recipe" en UI (lignes 561, 709).
  - Ce n'est **pas un simple bug d'affichage** : le "×" est rendu explicitement dans le
    detail-breakdown UI des 4 fichiers "multiply" — c'est un choix assumé, pas une faute de frappe
    isolée. Sémantiquement, avec un libellé "combien d'unités produit la recette", la **division**
    (coût total ÷ unités produites = coût unitaire) est l'interprétation économiquement cohérente ;
    la multiplication ferait exploser le coût unitaire pour tout batch >1 unité. C'est donc une
    **incohérence non résolue entre variantes du prototype**, avec le fichier le plus abouti
    (ComponentBuilderPanel, celui probablement "live") du côté de la formule suspecte. **À
    vérifier absolument contre la formule réellement utilisée côté backend actuel avant tout
    portage — ne pas trancher sans confirmation.**
- **Modèle de données du "Component" totalement différent selon l'ancienneté** :
  - Ancien (AddEditComponent.tsx, ComponentLibrary.tsx interne) :
    `category: 'Ingredients'|'Packaging'|'Consumables'`, `unit` en texte libre, `totalCost` (pas
    `unitCost`), sous-items = `ComponentItem` avec `quantity`/`costPerUnit`, **imbrication
    récursive réelle** (un sous-composant peut avoir ses propres `subComponents`, rendu en lignes
    de tableau dépliables — ComponentEditor.tsx:325-443, AddEditComponent.tsx:343-482).
  - Récent : `category: 'Food'|'Beverage'` + `componentCategory` (Sauce/Meat/Fish/Veg/Salad/
    Biscuit/Jus/Juice), `unit` enum kg/liter/piece, `unitCost` calculé, sous-items =
    `SubComponentItem` **plat** (itemType + sourceId, pas d'imbrication réelle — un Component
    ajouté comme sous-item ne stocke qu'une référence `sourceId`, pas son arbre complet).
  - **Effet de bord de l'ancien modèle récursif** : `handleAddComponent`
    (ComponentEditor.tsx:136-146, AddEditComponent.tsx:112-129) copie
    `subComponents: comp.subComponents` **par valeur** au moment de l'ajout → snapshot figé. Si la
    ComponentDefinition imbriquée est éditée ensuite, la copie devient obsolète (pas de référence
    vivante). C'est probablement la raison d'être du mécanisme d'auto-réparation par nom du modèle
    récent (ComponentBuilderPanel) : contourner cette obsolescence en re-résolvant par nom à chaque
    montage plutôt que de faire confiance à une valeur figée.
- **storageType enum différent aussi** : ancien modèle =
  `'dry'|'cold'|'belowzero'|'material'|'merch'` (minuscules, "belowzero"/"merch" au lieu de
  "Freezer"/"NA") — visible dans ComponentLibrary.tsx:656-661 et AddEditComponent.tsx (badges
  capitalize ligne 419/475 gérant spécifiquement "belowzero" → "Below Zero"). Ne correspond pas à
  l'enum documenté ; c'est le fantôme d'une taxonomie antérieure.
- **Packaging au niveau Component ≠ packaging au niveau MenuItem** : la règle documentée
  (détection via category contenant "packaging"/"emballage", storageType==='material', ou sourceId
  préfixé "pkg-") s'applique au tableau `components[]` de MenuItem. Au niveau
  `ComponentDefinition`, aucun de ces 7 fichiers ne modélise le packaging comme un itemType dans
  `subComponents[]` — il n'existe ni itemType 'Packaging' ni sourceId préfixé 'pkg-' à cette
  couche. Le packaging y est un **champ dédié unique** sur la ComponentDefinition elle-même :
  `inventoryPackagingId` + `inventoryQuantityPackaged` (ComponentBuilderPanel.tsx:69-74, 726-768 ;
  ComponentBuilderDialog.tsx:69-74, 419-443), piloté par `PackagingTypeSelector`, avec un texte
  généré du style "{name} is stored in [Bucket] of [5.000] {unit}". C'est un mécanisme de
  **conditionnement d'inventaire** pour le composant fini, distinct de tout ingrédient d'emballage
  dans la recette. NewComponentEditor.tsx n'a même pas ce concept du tout (pas de
  PackagingTypeSelector importé) — régression/lacune de cette variante intermédiaire.
- **handleUpdateSubComponent incohérent entre variantes** :
  - ComponentBuilderDialog.tsx:130-140 dérive `unitCostForItem = sub.cost / sub.numberOfUnits` à
    la volée (pas de champ `unitCost` persistant) — fragile si `numberOfUnits` était déjà 0.
  - NewComponentEditor.tsx:160-183 re-résout le coût unitaire en recherchant l'ingrédient/composant
    **par nom** dans les tableaux passés en props (`ingredients.find(i => i.name ===
    updated.name)`) plutôt que d'utiliser un `unitCost` stocké — et pour les Components ajoutés
    (lignes 128-145), aucun `unitCost` n'est même écrit à l'ajout, seulement `cost:
    comp.unitCost`. C'est exactement le trou que le triangle de réparation de
    ComponentBuilderPanel corrige.
  - ComponentBuilderPanel.tsx:320-335 est le seul à utiliser un `unitCost` persistant et fiable
    comme source de vérité pour recalculer `cost`.

### B.3 Pépites nouvelles

- **Inférence automatique du storageType depuis la catégorie Market Price** (dupliquée à
  l'identique dans ComponentBuilderPanel.tsx:257-267 et NewComponentEditor.tsx:89-99) : à l'ajout
  d'un ingrédient, si `item.category` ∈ `['Fish','Meat','Cheese','Dairy']` → storageType='Cold' ;
  si ∈ `['Ice Cream','Frozen']` → 'Freezer' ; sinon défaut 'Dry'. Règle métier absente des docs
  listées, dupliquée verbatim dans 2 fichiers donc clairement intentionnelle.
- **Convention de préfixe d'ID pour marquer un enregistrement "nouveau/non sauvegardé"** :
  ComponentEditor.tsx:66 détecte `isNewComponent = component?.id?.startsWith('comp-')`, et le
  générateur correspondant crée `id: comp-${Date.now()}` (AddEditComponent.tsx:170). C'est le même
  style de convention que le préfixe "pkg-" documenté pour le packaging côté MenuItem, mais
  appliqué ici pour distinguer "brouillon local" vs "persisté côté serveur" — pattern récurrent de
  cette codebase (encoder un type/état dans le préfixe d'ID) qui mérite d'être connu si on retombe
  sur des IDs bizarres en migration.
- **Triple fallback de résolution fournisseur/date** (ComponentBuilderPanel.tsx:108-152,
  `getMarketPriceDetails`) : 1) match direct par `marketPriceId` ; 2) legacy — `sourceId` vers un
  `IngredientItem` puis match par nom vers `marketPrices` ; 3) legacy — aucun
  `sourceId`/`marketPriceId`, match par nom pur. Documente une stratégie de migration progressive
  où les vieux enregistrements n'ont jamais été backfillés avec un `marketPriceId` propre, et où la
  résolution par **nom** (fragile) reste le filet de sécurité — écho direct des soucis de
  démapping par nom/ID déjà rencontrés côté MenuItem.
- **Distinction 'Jus' vs 'Juice' dans componentCategory** : l'enum
  (Sauce/Meat/Fish/Veg/Salad/Biscuit/Jus/Juice) contient les deux valeurs séparément, de façon
  identique et répétée dans 5 fichiers — pas une faute de frappe isolée. Vraisemblablement "Jus" =
  jus/fond de cuisson (terme culinaire, sauce réduite) vs "Juice" = jus de fruit/boisson. À
  vérifier si la taxonomie catalogue actuelle distingue bien ces deux notions ou les a fusionnées
  par erreur de "nettoyage".
- **Recalcul défensif systématique avant sauvegarde** : ComponentBuilderPanel.tsx:372-377
  recalcule `cost = unitCost × numberOfUnits` pour **tous** les sous-composants juste avant
  `onSave`, même si rien n'a semblé changer — principe "ne jamais faire confiance à la valeur
  affichée, toujours re-dériver au moment de la persistance".
- **Le libellé "Total Cost" (ancien modèle) vs "Unit Cost" (nouveau modèle)** — l'ancien modèle
  stocke un `totalCost` sur la ComponentDefinition (coût du batch entier), alors que le nouveau
  modèle expose un `unitCost` (coût par unité). Ce glissement sémantique (batch total → coût
  unitaire) est probablement la cause profonde de la confusion multiplication/division ci-dessus :
  si `numberOfUnitsRecipe` a été ajouté après-coup pour convertir un total en unitaire, une
  inversion de sens (diviseur vs multiplicateur) entre les auteurs des différentes variantes
  serait cohérente avec ce qu'on observe.

### B.4 Mort / hors-sujet

- **AddEditComponent.tsx** et le dialogue interne d'**ComponentLibrary.tsx**
  (`AddEditComponentDialog`, lignes 384-714) : modèle de données obsolète (category
  Ingredients/Packaging/Consumables, storageType belowzero/merch) qui ne correspond à aucune doc
  de référence actuelle. Probablement le tout premier prototype, conservé par inertie. Aucune
  valeur de portage au-delà de l'historique.
- **ComponentLibrary.tsx en tant que gestionnaire CRUD** (`api.getAllMenuComponents/
  saveMenuComponent/deleteMenuComponent`, lignes 66-129) est la seule des 7 vues à appeler une
  vraie API — mais elle persiste le modèle **obsolète** (`ComponentItem`/quantity). Si elle est
  encore branchée quelque part, elle écrirait des données dans l'ancien format à côté du nouveau
  modèle utilisé par ComponentBuilderPanel.
- **ComponentEditor.tsx** : intéressant pour la formule "÷" divergente et pour documenter la
  transition, mais son modèle hybride n'a probablement plus cours dans le modèle final — à traiter
  comme témoin historique, pas comme référence de portage.
- **Export CSV** (ComponentsLibraryPanel.tsx:137-180) : fonctionnalité UI pure sans règle métier
  cachée, colonnes correspondent 1:1 aux champs déjà documentés.

---

## C. Petits fichiers menu-item (AddEditMenuItem, MenuItemEditor, SpaceMenusByMenuItem, ItemNameEditDialog)

- **AddEditMenuItem.tsx** : écran d'édition menu item, état local `formData` (draft + bouton Save
  explicite).
- **MenuItemEditor.tsx** : écran d'édition menu item, pattern "live update" (`onUpdate` appelé à
  chaque changement de champ, pas de draft local).
- **SpaceMenusByMenuItem.tsx** : vue "par article" de l'assignation menu-item ↔ shops dans un
  espace.
- **ItemNameEditDialog.tsx** : dialog d'édition d'un Good (ingrédient/packaging), pas un menu item
  — nom, goodType, category, recipeUnit, conversion d'unité, image.
- **menuItemHelpers.ts** : helpers `getMenuItemCategory`/`getMenuItemType` avec fallback legacy.

### C.1 Correspondances confirmées

- **readyForSale** confirmé comme champ MenuItem : `MenuItemEditor.tsx:284-296`, select Yes/No.
- **numberOfPiecesRecipe** confirmé, formule de coût conforme à la doc : champ
  `MenuItemEditor.tsx:318-327` ; calcul `totalCost = componentsCost / numberOfPiecesRecipe` en
  `:132`, où `componentsCost = Σ comp.totalCost` (`:131`) et
  `comp.totalCost = unitCost × numberOfUnits` (`:125`, `:100-104`, `:75-79`). Correspond
  exactement à la mécanique "numberOfUnits vaut pour numberOfPiecesRecipe pièces" (qtéPlat=1 ici).
- **sourceId** confirmé comme référence à l'origine (Ingredient/Component) dans `components[]` :
  `MenuItemEditor.tsx:77, 102`.
- **itemType** 'Ingredient'/'Component' confirmés comme valeurs littérales typées (`as const`) :
  `MenuItemEditor.tsx:71, 96`. Seules 2 des 4 valeurs sont manipulées dans cet écran (pas de
  bouton Add Packaging/Add Combo Item).
- **Taxonomie MarketPrice/Good ad hoc en strings libres** confirmée textuellement par
  `ItemNameEditDialog.tsx` : goodType `'Food'|'Beverage'|'Packaging'` (`:15, 173-186`) + category
  en simple string via listes hardcodées `INGREDIENT_CATEGORIES`/`PACKAGING_CATEGORIES`
  (`:32-40`), aucun typeId/categoryId.
- **Pattern double-champ legacy+ID** existe (`menuItemHelpers.ts:11-45`,
  `category||categoryLegacy`, `type||typeLegacy`) mais ni AddEditMenuItem.tsx ni
  MenuItemEditor.tsx ne l'appellent.
- **Disponibilité par manque d'ingrédients** déjà prototypée, précurseur direct de la feature
  backend réelle : `SpaceMenusByMenuItem.tsx:23-24` (isAvailable, missingIngredients), rendu
  `:105` (carte grisée), `:127` (nom barré), `:136-140` (badge rouge Unavailable), `:169-178`
  (liste ingrédients manquants), `:210, 247` (checkbox désactivée si indisponible).

### C.2 Divergences

- **Trois notions distinctes de "combo"** coexistent sans consolidation : (1) `MenuItem.type`
  incluant `'Combo'` au même niveau que Food/Beverage (`SpaceMenusByMenuItem.tsx:18`) ; (2)
  `MenuItem.comboItem`, booléen séparé "réutilisable dans items catégorie Menu"
  (`MenuItemEditor.tsx:300-316`) ; (3) `itemType 'Combo Item'` au niveau composant (voir §A/§B).
- **Taxonomie catégorie incohérente entre les 2 écrans** : `AddEditMenuItem.tsx:60-71,94-105,
  356-374` utilise category = simple string plate hardcodée, aucun typeId/categoryId ;
  `MenuItemEditor.tsx:276-281` utilise TypeCategorySelector avec typeId/categoryId référentiel
  complet. → AddEditMenuItem.tsx antérieur à la migration category→categoryId.
- **Modèle de storage divergent** : `AddEditMenuItem.tsx:611-628` storageType PAR COMPOSANT,
  éditable, 5 valeurs minuscules `dry|cold|belowzero|material|merch` via `.toLowerCase()`
  (`:143`) ; `MenuItemEditor.tsx:57,330-351` storageType au niveau MENUITEM (multi-select),
  seulement 3 valeurs `Dry|Cold|Freezer`, et le storageType par composant y est en lecture seule
  (`:238`).
- **Sub-composants récursifs** uniquement dans AddEditMenuItem.tsx (`:124-132`, `:167`) ; absents
  de MenuItemEditor.tsx.
- **Architecture d'état opposée** : draft local + Save explicite (AddEditMenuItem) vs écriture
  immédiate à chaque onChange (MenuItemEditor, bouton Save = no-op `:452-460`).
- **Aucune intégration Brand/DisplayName/PromotionType** dans ces 2 fichiers (seul import métier
  dans MenuItemEditor est TypeCategorySelector, `:42`) — cette intégration semble spécifique à
  MenuItemBuilderPanel.tsx (voir §A.3).
- **Catégories Good ne couvrent pas "freezer"** : `INGREDIENT_CATEGORIES` (`:32-36`) n'a pas Ice
  Cream/Frozen — mapping potentiellement mort si utilisé ailleurs pour l'auto-détermination du
  storageType.
- **Aucune prix par espace** dans les 4 fichiers — confirme que c'est concentré dans
  MenuItemBuilderPanel.tsx seul.

### C.3 Pépites nouvelles

- **Seuil de marge 60%** (vert/orange), répété dans 2 écrans indépendants :
  `AddEditMenuItem.tsx:497`, `MenuItemEditor.tsx:155,376-378`.
- **comboItem** avec sémantique de réutilisation inter-catégories : `MenuItemEditor.tsx:300-316`.
- **purchaseUnitConversion** avec direction explicite unité fournisseur → unité recette,
  contextualisée par l'import : `ItemNameEditDialog.tsx:238-244`, `lastSupplierUnit` (`:20`).
- **recipeUnit** enum fermé à 3 valeurs kg/l/pc au niveau Good : `ItemNameEditDialog.tsx:17,
  219-235`.
- **storageType material/merch** déjà présent au niveau composant : `AddEditMenuItem.tsx:625-626`
  — préfigure le module Logistic.
- **"Select All Shops" masqué (pas désactivé)** si item indisponible :
  `SpaceMenusByMenuItem.tsx:187`.
- **diet incluant 'Hot'** mêlé à des régimes alimentaires : `MenuItemEditor.tsx:58,388-410` —
  artefact suspect.
- **Upload image base64** : `ItemNameEditDialog.tsx:78-89`.
- **"Storage Info" en ligne composant** (stock en cours) : `AddEditMenuItem.tsx:598-604`.
- **Catégorie Ingredient partagée Food+Beverage** : `ItemNameEditDialog.tsx:32-36,205-213`.

### C.4 Mort / hors-sujet

- **AddEditMenuItem.tsx** : prototype antérieur manifestement abandonné (pas de
  readyForSale/comboItem/numberOfPiecesRecipe/typeId/categoryId/prix par espace/
  Brand-DisplayName-Promotion). Seule valeur de portage potentielle : subComponents récursifs et
  storage-per-composant 5 valeurs.
- **MenuItemEditor.tsx** : intermédiaire, probablement abandonné aussi, mais meilleure source de
  confirmation textuelle pour readyForSale/numberOfPiecesRecipe/comboItem.
- **Upload image base64** (`ItemNameEditDialog.tsx:78-94`) : artefact Figma-make, sans valeur de
  portage.
- **menuItemHelpers.ts** non utilisé par les 2 fichiers d'édition analysés — sert probablement une
  vue liste non incluse dans cette mission.

---

## D. Gros fichiers : MenuItemsLibraryPanel, MenuItemsByShopTable, SpaceMenusPanel

### D.1 MenuItemsLibraryPanel.tsx

**Correspondances confirmées**
- Seuils de marge par Type `{lowThreshold:68, highThreshold:75}` : défaut en dur L153-158, chargés
  via `api.getMarginThresholdSettings()` (L176), sauvegardés via
  `api.saveMarginThresholdSettings()` (L296) — réglage persistant par Type, pas un simple défaut
  statique.
- Agrégations Type/Category = fetch d'un calcul serveur déjà fait, pas un recalcul client :
  `api.getAllCategoryAggregations()`/`getAllTypeAggregations()` (L218, 227, 346-347) → `Map`
  (L165-166) consommées en lecture seule pour l'affichage (sumOfCosts, sumOfAveragePrices,
  averageOfAverageMargins, L1318-1391, 1771-1850). Le `reduce` Type→Category (L1260-1297) ne sert
  qu'au regroupement visuel de l'accordéon.
- Bouton "recalculer" explicite : `handleRecalculateMetrics` → `api.recalculateAllAggregations()`
  (L338-369), affiché si `typeAggregations.size===0 || categoryAggregations.size===0` (L753,
  1027).
- `handleSyncTypeCategories` → `api.syncMenuItemTypeCategories()` (L320-335) confirme la route
  `sync-type-category-names` documentée.
- `readyForSale` bien utilisé comme filtre (L394, 443) et Badge (L1882-1883).

**Divergences** : aucune divergence forte — cohérent avec le système KV documenté.

**Pépites nouvelles**
- Export CSV (`handleExportCSV`, L512-566) : colonnes = Name, Category, Ready for Sale, Number of
  Pieces, Base Price (€), Total Cost (€), Margin (%), Diet, Storage Type, Combo Item, Description
  (L518-530). Confirme un champ `comboItem` distinct de `readyForSale`.
- `getAveragePrice` (L415-424) : commentaire explicite indiquant que `averagePrice` est calculé à
  la sauvegarde et ne doit PAS être recalculé en lecture (fallback `basePrice` pour items legacy).
- Bouton "Refresh Costs" (L731-745, prop `onRefreshCosts`) — 3e niveau de recalcul manuel (coût
  item ← prix ingrédients), distinct des deux autres. Trois recalculs manuels coexistent, aucun
  automatique.
- Commentaire mort révélateur (L426-429) : ancien diagnostic supprimé qui itérait sur TOUS les
  menu items à chaque changement pour vérifier la disponibilité "La Beaujoire Nantes", bloquant
  l'UI et causant des fermetures de connexion HTTP pendant les sauvegardes — **preuve historique
  concrète de l'anti-pattern "requêtes lourdes non scopées"**.
- Tri uniquement alphabétique fixe par groupe (L1346, 1812), pas de tri configurable.

**Mort/hors-sujet** : logs de debug nombreux (L206-251) ; le diagnostic "La Beaujoire Nantes" est
du code mort gardé en commentaire (cité ci-dessus comme pépite historique).

### D.2 MenuItemsByShopTable.tsx

**Correspondances confirmées**
- `type` legacy en dur 'Food'/'Beverage'/'Combo' pour les métriques agrégées/camemberts
  (L706-741) — coexiste avec le système typeId/categoryId du fichier D.1.
- Coût/prix/marge non calculés ici, lookup dans `allMenuItems` via `menuItemDetailsMap`
  (L149-159) — valeurs précalculées consommées en lecture, cohérent avec D.1.

**Divergences**
- **Aucune des logiques attendues n'est présente** : zéro occurrence de `readyForSale`,
  `itemType`, `spacePrice`/`spaceSpecificPrice`, `missingIngredient`, `.components`,
  `ingredientIds`, `componentsMap` (grep exhaustif). Ce n'est PAS un équivalent frontend de
  `/space-menu/shop/:shopId/items` : c'est un tableau de reporting de ventes déjà survenues
  (`menuItemsByShop` = données d'événements Weezevent passés), pas une vérification de
  disponibilité catalogue↔espace. Cette logique existe en réalité dans SpaceMenusPanel.tsx (D.3).
- 3 `viewMode` ('analyse'/'menu'/'inventory', L86) réutilisent le même composant ; le mode
  'inventory' (L883-976) n'affiche QUE le nom de l'item, sans quantité de stock — mode
  incomplet/placeholder malgré son nom.

**Pépites nouvelles**
- Export Excel (xlsx) avec onglet par shop OU par menu item au choix (L871 vs L949), colonnes
  différentes par viewMode, sanitization robuste des noms d'onglets (31 car., caractères
  interdits, dédup `(n)`, L935-946).
- Sync bidirectionnelle entre un filtre sidebar multi-select et un état table local single-select
  (L124-135).

**Mort/hors-sujet** : mode 'inventory' essentiellement mort en l'état ; `console.warn` défensifs
sans logique métier.

### D.3 SpaceMenusPanel.tsx

**Correspondances confirmées**
- Forte correspondance avec la règle mémoire "Supplier.sites∋spaceId STRICT" :
  `supplierServesSpace` (L541-566+) lit `supplier.sites || supplier.spaces`, liste vide = sert
  tous les espaces, sinon appartenance stricte ; cas spécial où tous les espaces valides cochés
  individuellement = traité comme "All Sites" (L559-566).
- `MenuItemWithAvailability{isAvailable, missingIngredients}` (L43-55) +
  `checkMenuItemAvailability` (L775-928) = prédécesseur direct, 100% client-side, de la route
  backend `/space-menu/shop/:shopId/items`. Parcourt `components[]`, résout fournisseur (priorité
  `marketPriceId` > `sourceId` > `id`, L712-716), puis `supplierServesSpace` ; pour
  `itemType==='Component'` recurse via `subComponents` (L684-772) ou, si l'id matche un menu item
  existant, traite comme combo imbriqué (L849-873).
- `type?:'Food'|'Beverage'|'Combo'` (L46) confirme encore le legacy enum string.
- `spaceSpecificPrices?: {id, spaceIds[], price}[]` (L53, lu L900-908) = prédécesseur du
  `spacePrices Json` documenté, mais de FORME différente (règles many-to-one vs Json par
  spaceId). Lu seulement ici, pas édité.

**Divergences**
- **`readyForSale` et `MAX_DEPTH` totalement absents** (zéro occurrence). La récursion ici
  (`checkComponentAvailability`/`checkMenuItemAvailability`) n'a **aucun garde-fou de
  profondeur**, contrairement à l'expansion documentée ailleurs (MAX_DEPTH=10 dans
  ElevationView.tsx/EventPredictStockUpSection.tsx) — **risque de boucle infinie en cas de
  référence circulaire**.
- **Packaging jamais vérifié dans la disponibilité** : seuls `itemType==='Ingredient'` et
  `'Component'` sont branchés (L711, 763, 809, 849) — aucun cas `'Packaging'` ni `'Combo Item'`
  malgré les 4 valeurs documentées dans MenuItemBuilderPanel.tsx. Un composant Packaging est
  silencieusement ignoré (ni bloquant ni vérifié) ; zéro occurrence de `storageType` dans tout le
  fichier — la détection heuristique documentée en PEPITES §2.1 n'existe pas ici.
- **Combo détecté par recherche d'ID** (`menuItems.find(mi => mi.id === itemId)`, L852), pas par
  un itemType `'Combo Item'` dédié — incohérent avec MenuItemBuilderPanel.tsx.
- **Deux algorithmes de disponibilité incohérents entre eux** : `getMenuItemAvailableSpaces`
  (filtre grossier, L931-997) parcourt l'arbre via `component.ingredients` (L952-953), tandis que
  `checkComponentAvailability` (calcul fin avec missingIngredients) parcourt le même arbre via
  `component.subComponents` (L705) — dette technique déjà présente à l'époque.

**Pépites nouvelles**
- Cache de disponibilité client-side `availabilityCache` (Map keyed
  `${menuItem.id}-${selectedSpace.id}`, L186, 781-925), invalidé via dépendances `useMemo`.
- Règle de compatibilité F&B fine (L1027-1068) : `gppremium`/`temporary` = shop accepte tout ;
  Beverage+catégorie 'beer' matche 'beer' OU 'beverages' OU 'drinkee' ; Food strict 'food' ;
  Beverage (hors bière) 'beverages' OU 'drinkee' ; **Combo exige 'food' ET 'beverages'
  simultanément** — à vérifier si présente côté Vue actuel.
- UI de disponibilité aboutie : compteurs Available/Not Available (L2023-2334), "Select All
  Available Items" (L2361, L2398), liste détaillée des `missingIngredients` par item indisponible
  (L2475-2530) — confirme une vraie fonctionnalité utilisateur, pas de la plomberie morte.
- `getIngredientSupplierId` : cascade de fallback en 3 niveaux (ID → nom Market Price → nom
  Ingredient) avec warning explicite "may be stale data, menu item should be re-saved"
  (L660-677) — révèle un problème connu de désynchronisation d'IDs déjà contourné à l'époque,
  similaire aux problèmes actuels de régénération d'ID.

**Mort/hors-sujet** : dizaines de `console.log` conditionnés par `DEBUG_LOGGING` — bruit sans
impact logique.

---

## E. Cluster Market Price (7 fichiers)

### E.1 Correspondances confirmées

- **MarketPrice = taxonomie en strings libres, pas de typeId/categoryId** : confirmé formellement
  par `types/menu-types.ts:137-138` — `MarketPriceItem.goodType: 'Food'|'Beverage'|'Packaging'` +
  `category?: string`. Aucun des 5 composants Market Price ne référence `typeId`/`categoryId`. Le
  seul composant qui manipule `typeId`/`categoryId` est `TypeCategorySelector.tsx`, et il n'est
  importé QUE par des composants MenuItem (`MenuItemsLibraryPanel.tsx:46`, `MenuItemEditor.tsx:42`,
  `MenuMappingStep.tsx:10`, `MenuItemBuilderPanel.tsx:51`) — jamais par un composant Market Price.
  Double confirmation de la séparation Type/Category (MenuItem, hiérarchique) vs goodType/category
  (MarketPrice, plat/libre).
- **Packaging Type = référentiel plat {id, name, createdAt}** : confirmé littéralement,
  `PackagingTypeSelector.tsx:11-15` : `export interface PackagingType { id: string; name: string;
  createdAt: number; }`. Endpoints `getAllPackagingTypes`/`createPackagingType` sur
  `/packaging-types` (`utils/api.ts:1409,1415`) — pas de hiérarchie, pas de parent.
- **Dédup MarketPrice** : la clé {supplierItem, supplier_id, unit, unitsPerPurchase, price} est
  retrouvée à l'identique à 3 endroits : `MarketPriceAddDialog.tsx:201-208`,
  `MarketPriceImportPage.tsx:412-418`, `MarketPriceImportWizard.tsx:349-355`. En réalité **deux
  dédups en cascade** : (a) dédup grossière sur `supplierItem.toLowerCase()` seul juste après
  parsing CSV (`ImportPage.tsx:261-271`, `ImportWizard.tsx:215-225`, garde la 1ère occurrence via
  `Set`) ; (b) dédup fine sur la combinaison complète à la construction de l'objet final.
- **pricePerUnit = price / unitsPerPurchase, jamais importé** : confirmé partout —
  `MarketPriceAddDialog.tsx:88-93` (recalcul useEffect), `MarketPriceImportPage.tsx:247,434`
  (commentaire explicite « Always calculate, never import »), `MarketPriceSelector.tsx:231-233`
  (recalcul de `costPerRecipeUnit`).
- **Fallback itemName ← supplierItem** : à la création d'un nouvel Item Name pendant l'import,
  `newItemForm.itemName` est pré-rempli avec `mapping.supplierItem` (`ImportPage.tsx:303`,
  `ImportWizard.tsx:239`).
- **Seuils de marge / agrégations Type-Category** : absents des 7 fichiers Market Price, cohérent
  (logique confirmée uniquement côté MenuItem).

### E.2 Divergences

- **Deux packagings distincts et non confondus** : le « goodType Packaging » (un MarketPriceItem
  comme un autre, avec `IngredientItem` dérivé) est différent du « Packaging Type » (référentiel
  plat de contenants). Pas explicité comme deux notions séparées dans les docs de référence.
- **Purchase packaging ≠ Inventory packaging** : `MarketPriceAddDialog.tsx` a DEUX sections avec
  deux `PackagingType` potentiellement différents : `packagingId` (« Purchase Information »,
  l.439-500) et `inventoryPackagingId` + `inventoryQuantityPackaged` (« Inventory Information »,
  l.502-538). Le second se synchronise par défaut sur le premier via `useEffect` (l.96-102 :
  `inventoryPackagingId: prev.inventoryPackagingId ?? prev.packagingId`) mais reste éditable
  séparément.
- **Champs de dimensionnement physique absents du KV documenté** : `packedUnits`, `numberOfUnits`,
  `packingLength/Width/Height` (`menu-types.ts:150-154`).
- **Incohérence de typage `itemType`** : `menu-types.ts:118,188` déclare
  `'Ingredient' | 'Component'` (2 valeurs), alors que le runtime
  (`MenuItemBuilderPanel.tsx:204`) en utilise 4 (`Ingredient`, `Component`, `Combo Item`,
  `Packaging`) — le fichier de types partagé n'a pas suivi l'évolution réelle (cf. §A.2).

### E.3 Pépites nouvelles

- **Purchase Packaging vs Inventory Packaging avec auto-sync**
  (`MarketPriceAddDialog.tsx:88-102, 438-538`) : un article acheté conditionné d'une façon (ex.
  carton de 24) peut être stocké/compté différemment (ex. palette de 4 cartons). UI formulée en
  phrase : *"[Item] is purchased in [Packaging] of [N] [unit] for €[price]"* puis *"[Item] is
  stored in [InventoryPackaging] of [M] [unit]"*. Potentiellement pertinent pour l'Interface
  Logistic (StockMovement/StockLevel) déjà en prod.
- **Deux champs de colisage distincts et cumulables** : `packedUnits` (unités dans le
  conditionnement d'achat) ET `numberOfUnits` (nombre de conditionnements empaquetés ensemble),
  affichés `{packedUnits} {unit} × {numberOfUnits}` (`MarketPriceHierarchicalTable.tsx:357-359`).
- **Dimensions physiques de colis** parsées depuis une colonne CSV unique `"L/W/H"` splitée par
  `/` (`ImportPage.tsx:204-221`, `ImportWizard.tsx:169-187`) ; si le split ne donne pas 3 parties
  valides, mise à `undefined` silencieuse sans erreur remontée.
- **Scoring de similarité pour l'auto-suggestion de mapping à l'import**
  (`ImportPage.tsx:46-60`, absent d'`ImportWizard`) : égalité stricte → 1.0 ; inclusion d'une
  chaîne dans l'autre → 0.8 ; sinon ratio de chevauchement de mots. Seuil d'auto-suggestion :
  **score > 0.6** (l.234).
- **Auto-détection des colonnes CSV par mots-clés** (`ImportPage.tsx:93-116`,
  `ImportWizard.tsx:78-99`) : règles textuelles précises (ex. `unit` mappé seulement si header
  contient "unit" mais pas "per"), ordre de priorité `if/else if` important.
- **Contrainte d'unicité stricte "Supplier Item ↔ un seul Item Name"** : bloque avec erreur (pas
  juste warning) si le même `supplierItem` existe déjà sous un `itemName` différent
  (`MarketPriceAddDialog.tsx:190-198`, `ImportPage.tsx:400-409`, `ImportWizard.tsx:337-346`).
- **Warning non bloquant sur mismatch de Good Type** au mapping : toast d'erreur mais poursuite
  autorisée (`ImportPage.tsx:311-313`, `ImportWizard.tsx:262-264`) — deux niveaux de sévérité de
  validation cohabitent.
- **Import CSV batché** par lots de 10 avec pause de 50ms entre lots, uniquement pour la
  réactivité UI (`ImportPage.tsx:381-452`).
- **Disponibilité par espace agrégée au niveau Item Name**
  (`MarketPriceHierarchicalTable.tsx:74-121`) : un Item Name est "disponible" si au moins un de
  ses supplier items a un fournisseur avec `sites` vide ou contenant l'espace ; sinon grisé
  (opacité 40%) mais reste visible.

### E.4 Mort / hors-sujet

- **`getMarketPricesByItemName` importé mais jamais appelé**
  (`MarketPriceHierarchicalTable.tsx:8`) — lazy loading réel fait par filtrage local en mémoire
  (l.138).
- **`MarketPriceImportWizard.tsx` est un doublon antérieur/plus simple de
  `MarketPriceImportPage.tsx`** : même logique de base, mais sans scoring de similarité, sans
  compteurs skipped/empty, sans traitement par lots. `ImportPage.tsx` est la version aboutie ;
  `ImportWizard` n'a aucune règle métier qui ne soit pas déjà mieux présente dans `ImportPage`.
- **`getPackagingCategory()` dans `PackagingSelectorDialog.tsx:58-64`** : fonction avec TODO non
  fini, ne fait qu'un fallback trivial.
- **Génération d'ID côté client** (`Date.now()-Math.random()`) : artefact de prototype sans
  backend relationnel réel, sans valeur de portage.

**Fichiers de référence (catalogue, tous domaines confondus)** : sous
`datafriday-web/old/versionReact/src/app/`, `components/MenuItemBuilderPanel.tsx`,
`components/types/menu-types.ts`, `utils/menuItemHelpers.ts`,
`utils/migration-ingredients-to-market-price.ts`, `components/ComponentBuilderPanel.tsx`,
`components/ComponentEditor.tsx`, `components/ComponentLibrary.tsx`,
`components/ComponentsLibraryPanel.tsx`, `components/NewComponentEditor.tsx`,
`components/ComponentBuilderDialog.tsx`, `components/AddEditComponent.tsx`,
`components/AddEditMenuItem.tsx`, `components/MenuItemEditor.tsx`,
`components/SpaceMenusByMenuItem.tsx`, `components/ItemNameEditDialog.tsx`,
`components/MenuItemsLibraryPanel.tsx`, `components/MenuItemsByShopTable.tsx`,
`components/SpaceMenusPanel.tsx`, `components/MarketPriceHierarchicalTable.tsx`,
`components/MarketPriceSelector.tsx`, `components/MarketPriceImportPage.tsx`,
`components/MarketPriceImportWizard.tsx`, `components/MarketPriceAddDialog.tsx`,
`components/TypeCategorySelector.tsx`, `components/PackagingSelectorDialog.tsx`, `utils/api.ts`.
