# EventPredict — Sections « Configuration settings » et « Stock up »

Référence: `versionReact/src/app/components/EventPredictMenusSection.tsx` (1839 l.)
et `EventPredictStockUpSection.tsx` (467 l.).

Ce document explique comment fonctionnent ces deux sections, leurs entrées,
leur état interne, leurs algorithmes, et leur UI. Il sert de spec pour le
portage Vue 1:1.

---

## 1. Vue d'ensemble

Quand un utilisateur sélectionne un **événement futur** (date dans le futur)
dans l'EventPredict, l'écran affiche, dans l'ordre :

1. `Event Details Editor` — édition métadonnées de l'event (collapsible).
2. `Quantity/Revenue by Minute` — timeline prédictive (chart).
3. **`Configuration settings`** — pilote la **prédiction** (sélection des
   menu items par PdV + ajustement % par shop / par item / par cellule).
4. **`Stock up`** — calcule, à partir de cette prédiction ajustée, **la liste
   des composants/ingrédients à approvisionner**, par shop, par type F&B.

Les deux sections partagent **deux états contrôlés par le parent
`EventPredictView`** :

| State | Type | Sémantique |
|------|------|----------|
| `selectedMenuItems` | `Map<elementId, Set<menuItemId>>` | Quels items sont activés dans quel PdV |
| `quantityAdjustments` | `Map<"elementId-menuItemId", percent>` | % par cellule (0–500, défaut 100) |

Si un PdV n'apparaît pas dans `selectedMenuItems` ou que son `Set` est vide,
le PdV est considéré comme **fermé** (onglet « Closed »).

---

## 2. Source de données

### 2.1 `configuration`

Objet `{ id, name, data: { floors, forecourt, externalMerch } }`.

Chacune de ces 3 zones contient un tableau `elements`. On garde uniquement
les éléments dont `type ∈ {shop, hospitality, kitchen}` :

```ts
const fbElements: FloorElement[] = [
  ...configData.floors.flatMap(f => f.elements),
  ...configData.forecourt.elements,
  ...configData.externalMerch.elements,
].filter(el => ['shop', 'hospitality', 'kitchen'].includes(el.type));
```

Chaque element a notamment : `id`, `name`, `picture`, `shopType[]`
(`["food"]`, `["beverages","beer"]`, etc.), `registryId`.

> **Adaptation Vue** : la version Vue n'a pas la structure floors/forecourt.
> On considère `space.shops` comme `fbElements`, avec :
> - `id = shop.id`, `name = shop.name`
> - `shopType = shop.type.split(',').map(s => s.trim())`
> - `picture = undefined`
> - `registryId = shop.id`

### 2.2 `predictedTimelineData`

Tableau de records timeline déjà **pondéré** par `usePredictiveTimeline` :

```ts
[
  { shop: 'Comptoir Sud', menuItemId: 'budweiser-45', totalQuantity: 12.3, totalRevenue: 110.7, ... },
  ...
]
```

Les poids des événements passés (somme = 1.0) et l'`attendeeRatio` sont
**déjà appliqués** dans `totalQuantity` et `totalRevenue` — on n'a plus qu'à
sommer.

### 2.3 `menuItems`, `ingredients`, `components`, `suppliers`

Référentiels du catalogue produits. Utilisés pour :

- déterminer si un menu item est **disponible dans le space** (chaîne
  ingrédients → suppliers → spaces servis). Vue : on simplifie → toujours
  disponible.
- expansion `Stock up` (recette d'un menu item `readyForSale='No'` → liste
  composants/ingrédients avec quantités unitaires).

---

## 3. Index de performance — `timelineDataIndex`

Pré-calculé une fois par changement de `predictedTimelineData` :

```ts
const timelineDataIndex = new Map<string, number>(); // "shopKey|menuItemId" → quantity
for (const r of predictedTimelineData) {
  const key = `${r.shop || r.shopId}|${r.menuItemId || r.mappedMenuItemId}`;
  index.set(key, (index.get(key) || 0) + r.totalQuantity);
}
```

Recherche `getPredictedQuantity(element, menuItemId)` :

```ts
const shopKeys = [element.name, element.registryId, element.id].filter(Boolean);
for (const k of shopKeys) {
  const q = timelineDataIndex.get(`${k}|${menuItemId}`);
  if (q) qty += q;
}
```

Plusieurs clés essayées par robustesse (matching shop par nom OU id).

---

## 4. Architecture 3 niveaux d'ajustement

Tout l'écran tourne autour de **`quantityAdjustments`**, une `Map` où la clé
est `"elementId-menuItemId"` et la valeur un % (0–500). Défaut : 100 (= pas
de changement).

### 4.1 Niveau cellule

Slider individuel par (shop, item) :
- Si `getPredictedQuantity = 0` → **input numérique** « Manual Qty ».
- Sinon → **slider 0–500%**, step 10.

```ts
adjustedQty = round(baseQty * adjustment / 100)
```

### 4.2 Niveau shop (`shopAdjustments`)

État **dérivé** : pour chaque shop, on calcule si **tous** ses items
sélectionnés ont la même % d'ajustement. Si oui → on l'expose. Sinon → le
slider shop reste à 100 (ou pas d'affichage commun).

```ts
useEffect(() => {
  for (const element of fbElements) {
    const selected = selectedMenuItems.get(element.id);
    const values = new Set(
      [...selected].map(itemId => quantityAdjustments.get(`${element.id}-${itemId}`) || 100)
    );
    if (values.size === 1) shopAdjustments.set(element.id, [...values][0]);
  }
  // idem pour itemAdjustments (par menu item à travers shops)
}, [quantityAdjustments, fbElements, selectedMenuItems]);
```

Action utilisateur sur le **slider shop** → propage le % sur **toutes les
cellules** du shop (parmi les items sélectionnés). Le `useEffect` resync
automatiquement.

### 4.3 Niveau item (`itemAdjustments`, Item View)

Symétrique : si un menu item a la même % à travers **tous les shops où il
est sélectionné**, on expose la valeur commune. Action → propage sur toutes
les cellules de cet item.

---

## 5. Filtrage Shop View ↔ Item View

Toggle géré au parent. Deux modes :

### 5.1 Shop View

- Tabs `Open` / `Closed` (basé sur `getMenuItemCounts(el).total > 0` —
  `total` = nb items sélectionnés).
- Champ de recherche (matche nom shop OU nom item).
- Groupement par `compositeKey = shopType.sort().join(',')` →
  rendu d'un bandeau « Food and Beverages », « Beer », etc. avec icône.
- Pour chaque shop : `Card` + `Collapsible` :
  - Header : nom, image, badges types (`All`, `Food`, `Beverage`, `Combo`
    cliquables = filtre items), revenue affiché `€predicted - Adjusted: €adjusted`,
    `Shop Adjustment` slider 0–500% avec bouton Reset.
  - Body (`ScrollArea h=400px`) :
    - Checkbox « Select All Menu Items »
    - Liste items (triés : sélectionnés d'abord par catégorie/nom, puis non
      sélectionnés par predictedQty décroissant)
    - Chaque item : image, nom + prix `(displayPrice ou basePrice)`,
      catégorie, contrôle qty (slider ou input manuel), à droite
      `predicted - Adjusted: adjusted` + checkbox de sélection.

### 5.2 Item View

- Tabs `All / Food / Beverage / Combo` avec compteurs.
- Recherche identique.
- Groupement plat (pas par shopType).
- Pour chaque menu item : `Card` + `Collapsible` :
  - Header : nom item, total `predicted - Adjusted: adjusted` (somme sur
    shops sélectionnés), badges catégorie + type, ratio `X / Y shops`,
    `Item Adjustment` slider + reset.
  - Body : liste de tous les shops servant cet item, chacun avec son
    contrôle qty (slider ou manuel) + sa checkbox.

### 5.3 Disponibilité des items dans un shop

Filtres successifs :

1. **Space-level** : `isMenuItemAvailableInSpace` parcourt récursivement les
   composants → ingrédients → suppliers → vérifie que `spaceId ∈ supplier.sites`.
2. **F&B type** (règles strictes) :
   - `gppremium` ou `temporary` → tous items.
   - `Beverage` catégorie `Beer` → shopType inclut `beer` OU `beverages` OU `drinkee`.
   - `Food` → shopType inclut `food`.
   - `Beverage` → shopType inclut `beverages` OU `drinkee`.
   - `Combo` → shopType inclut `food` ET `beverages`.

> Adaptation Vue : on remplace par un mapping plus simple basé sur les
> records actuels (`shopGranularData`) — un item est « dispo dans un shop »
> si il existe au moins 1 record pour cette paire.

---

## 6. Section « Stock up »

Algorithme dans `EventPredictStockUpSection.tsx` :

### 6.1 Calcul `shopStockData : Map<elementId, StockItem[]>`

Pour chaque shop :

```ts
for (const menuItemId of selectedMenuItems.get(element.id) || []) {
  const adjustedQty = round(predictedQty(element, item) * adj/100);
  if (adjustedQty === 0) continue;
  const expanded = expandMenuItem(menuItemId, adjustedQty, rootMenuName);
  // accumuler dans aggregatedItems indexé par `${item.name}|||${item.unit}`
}
```

### 6.2 `expandMenuItem` (récursif, MAX_DEPTH=10)

- Si `menuItem.readyForSale === 'Yes'` → retourne `{name, qty, unit:'pcs'}`.
- Si `readyForSale === 'No'` → pour chaque component du menu item :
  - `componentQty = numberOfUnits * menuItemQty / numberOfPiecesRecipe`
  - Si le component est lui-même un `menuItem` `readyForSale='No'` →
    recurse.
  - Sinon → ajoute au stock avec `{name, totalQuantity, unit, isExpanded:true}`.

Le résultat est un agrégat par `(name, unit)`, gardant la trace des sources
(« from N MenuItemA : X.X unit »).

### 6.3 UI

- Grouping par `compositeKey` (shopType.sort().join(',')) — même logique que
  Configuration settings.
- Bandeau « Beverages and Food » + nombre de shops.
- Pour chaque shop : `Card` `Collapsible` (image, nom, « N items ») →
  liste items :
  - Surlignés bleu si `isExpanded` (issu d'une expansion `readyForSale=No`).
  - Sources : « from 11 Sandwich Tenders : 0.1 kg ».
  - Badge à droite : `totalQuantity.toFixed(1) unit`.

> Adaptation Vue : à défaut de `components` détaillés, on garde le menu item
> tel quel en unité `pcs` (= comportement React quand `readyForSale='Yes'`).

---

## 7. Mapping React → Vue

| React | Vue (port) |
|-------|------------|
| `useState` / `useMemo` / `useCallback` | `data()` + `computed:` + `methods:` |
| `Map` | `{}` (plain object, clés `String`) ou `Map` (Options API supporte) |
| `Tabs` Shadcn | `v-btn-toggle` mandatory |
| `Card` / `Collapsible` Shadcn | `<Card>` UI custom + chevron + `v-show` |
| `ScrollArea` Radix | `div.scroll` overflow-y:auto + max-height |
| `Slider` Radix | `v-slider` |
| `Checkbox` Shadcn (indeterminate) | `v-checkbox` avec `:indeterminate` |
| `Badge` Shadcn | `<Badge>` custom existant |
| `ImageWithFallback` Figma | `<img>` avec `@error` (ou omettre si absent) |
| `toast` sonner | `useToast()` Vuetify ou no-op |

---

## 8. Comportement attendu (capture user)

Captures de référence :

1. **Header** : « Configuration settings » + tabs `Shop View` / `Item View`
   à droite.
2. **Sous-ligne** : tabs `Open <count>` / `Closed <count>` + champ
   « Search shops or menu items… ».
3. **Bandeau type** : icône + label « Beverages and Food » + badge
   `<count>` à droite.
4. **Card shop** : nom, revenue, badges types cliquables, slider
   « Shop Adjustment » + bouton reset.
5. **Item dans Card** : background bleu si sélectionné, image, nom + prix,
   slider 0–500 ou input « Manual Qty », à droite `N - Adjusted: M` + checkbox.
6. **Stock up** : bandeau type, Card shop pliable, liste items :
   « 11 pcs or 0.34 Plastic Bag » + source « from 11 Barre chocolatée-Twix : 11.0 pcs »
   + badge `Plastic Bag of 32 pc : 1` à droite (calcul packaging si dispo).
