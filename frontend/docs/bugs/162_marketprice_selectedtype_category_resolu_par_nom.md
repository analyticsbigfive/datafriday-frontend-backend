# BUG-162 — MarketPrice : `selectedTypeId`/`selectedCategoryId` résolus par nom, pas par la FK chargée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels (Configurations — Good Types/Categories)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/components/menu-fb/views/market-prices/drawers/MarketPriceEditDrawer.vue:371-376`
  - `src/components/menu-fb/views/market-prices/drawers/MarketPriceCreateDrawer.vue:852-855`

## Symptôme

`selectedTypeId`/`selectedCategoryId` sont recalculés à chaque rendu en cherchant, dans la liste
mise en cache du store, l'entrée dont le `name` correspond au texte affiché (`this.form.goodType`/
`category`) — jamais en réutilisant le `marketPriceTypeId`/`marketPriceCategoryId` initialement
chargé depuis l'API. La valeur ainsi résolue est ensuite envoyée telle quelle à la sauvegarde
(`MarketPriceEditDrawer.vue:589-592`, `MarketPriceCreateDrawer.vue:1296-1299`).

## Cause racine

Exactement le pattern déjà diagnostiqué et corrigé ailleurs dans ce domaine :
[BUG-62](62_component_taxonomie_fk_resolution_fragile_par_nom.md) (`ComponentCreateView.vue`) et
[BUG-81](81_menu_items_fk_taxonomie_resolue_par_nom.md) (`MenuItemCreateView.vue`) — deux entrées
homonymes dans la taxonomie du tenant (ou un cache périmé/dupliqué) peuvent faire résoudre le
mauvais id au moment de la sauvegarde. Jamais corrigé sur les drawers MarketPrice.

## Correction

Même pattern que BUG-62/81 : un état `_loadedTaxonomy` (`{ typeId, categoryId, typeName,
categoryName }`) capture le FK d'origine au moment du chargement, et `selectedTypeId`/
`selectedCategoryId` le réutilisent tant que le nom affiché n'a pas changé depuis ce chargement ;
ils ne retombent sur la résolution par nom (comportement précédent, inchangé) que si l'utilisateur
change effectivement le Good Type/Category, ou si aucun id n'a été chargé.

- `MarketPriceEditDrawer.vue:236-239` — ajout de `_loadedTaxonomy` dans `data()`.
- `MarketPriceEditDrawer.vue:432-445` (watcher `modelValue`, hydratation de `form` depuis
  `this.initialItem`) — capture `_loadedTaxonomy` à partir de `raw.marketPriceTypeId`/
  `marketPriceCategoryId` (avec fallback `raw.typeId`/`categoryId`) et des noms préremplis.
  Repris tel quel du pattern `loadComponentData()`/BUG-62 : édition d'un enregistrement existant,
  donc le FK d'origine doit toujours être disponible.
- `MarketPriceEditDrawer.vue:375-390` — `selectedTypeId`/`selectedCategoryId` (computed)
  réutilisent `_loadedTaxonomy` si le nom affiché correspond, sinon retombent sur la résolution
  par nom (`.find(t => t.name === ...)`, code d'origine inchangé).
- `MarketPriceCreateDrawer.vue:631-635` — ajout de `_loadedTaxonomy` dans `data()`.
- `MarketPriceCreateDrawer.vue:979-1005` (`reset(initialData)`) — adapté au cas create/edit
  hybride de ce drawer (BUG-81 gérait ça via `onCreate` vs premier chargement) : si
  `initialData` est fourni (flux "ajouter un fournisseur à un item existant", équivalent d'une
  édition), capture `_loadedTaxonomy` comme dans le drawer d'édition ; sinon (item brand-new,
  step 1 → aucune FK n'a jamais existé), `_loadedTaxonomy` est remis à `null`/`''` et la
  résolution par nom s'applique intégralement (seule source possible pour un item qui n'existe
  pas encore).
- `MarketPriceCreateDrawer.vue:857-873` — `selectedTypeId`/`selectedCategoryId` (computed),
  même logique que dans le drawer d'édition.
- Le flux "créer un nouveau type/catégorie à la volée" (`confirmNewType`/`confirmNewCategory`,
  présent dans les deux drawers) n'a pas été touché : il continue de faire
  `this.form.goodType = name` après création API, ce qui retombe sur la résolution par nom
  (`_loadedTaxonomy.typeName` ne correspond plus) — comportement identique à avant, volontaire
  (mirroring de la façon dont BUG-81 a traité ce cas : la résolution par nom reste la seule
  source pour une taxonomie tout juste créée dans la session).

**Point découvert pendant l'investigation, puis corrigé le même jour** : `MarketPriceListView.vue`
(computed `items`, lignes 261-382) construisait l'item agrégé transmis en `initial-item`/
`initial-data` à partir d'une liste de champs explicite qui omettait `marketPriceTypeId`/
`marketPriceCategoryId`, alors que le backend les renvoie bien sur chaque ligne brute
(`prisma.marketPrice.findMany` sans `select`, cf. `market-prices.service.ts`) — ce qui aurait
laissé le correctif ci-dessus inerte (`_loadedTaxonomy.typeId`/`categoryId` toujours `null`,
retombant systématiquement sur la résolution par nom). Corrigé dans la foulée :
- `MarketPriceListView.vue:272-273` — capture `marketPriceTypeId`/`marketPriceCategoryId` depuis
  chaque ligne brute `r`.
- `MarketPriceListView.vue:341-342` — les deux champs initialisés sur l'objet agrégé au premier
  passage (`map.set(itemName, {...})`).
- `MarketPriceListView.vue:360-361` — merge best-effort sur les passages suivants (même pattern
  que `goodType`/`category` juste au-dessus : premier FK non vide rencontré gagne).

`unwrapItem()` (`:530-532`, simple passthrough `item.raw ?? item`) confirmé ne rien filtrer —
les deux champs atteignent donc bien `editTargetItem`/`createInitialData` puis les drawers.

Voir aussi [BUG-83](../../../backend/docs/bugs/83_marketprice_goodtype_category_desync_rename_delete.md)
côté backend : `marketPriceTypeId`/`marketPriceCategoryId` étaient déjà retournés par l'API avant
ce correctif — seul le front les ignorait dans cet agrégat.

## Risque de régression / à surveiller

Voir le "Risque de régression" des fiches BUG-62/81 — même classe de risque (deux entrées de
taxonomie au même nom dans le même tenant).

Aucun test automatisé exécuté ni `pnpm dev` lancé pour cette correction (session sans build/dev
server). À valider manuellement :
- Éditer un MarketPrice existant (`MarketPriceEditDrawer`) sans toucher au Good Type/Category,
  sauvegarder, vérifier en base que `marketPriceTypeId`/`marketPriceCategoryId` restent
  identiques à avant (le fix `MarketPriceListView.vue` ci-dessus est nécessaire pour que ce cas
  soit réellement exercé — sans lui, `raw.marketPriceTypeId` serait resté `undefined`).
- Changer le Good Type/Category dans l'un ou l'autre drawer, sauvegarder, vérifier que la
  résolution par nom reprend la main et pointe vers le bon nouveau Type/Category.
- Flux "créer un nouveau Good Type/Category à la volée" (`+ Add Good Type` / `+ Add Category`),
  présent dans les deux drawers (`MarketPriceEditDrawer.vue`, `MarketPriceCreateDrawer.vue`) :
  vérifier que le nouveau type/catégorie créé est bien sélectionné et sauvegardé avec le bon FK
  (résolution par nom sur un nom fraîchement créé, donc unique — pas de collision attendue).
- `MarketPriceCreateDrawer.vue` : vérifier séparément le flux "nouvel item" (step 1, pas
  d'`initialData` — résolution par nom pure, comportement inchangé) et le flux "ajouter un
  fournisseur à un item existant" (`initialData` fourni — même logique que l'édition).

## Références

- [BUG-62](62_component_taxonomie_fk_resolution_fragile_par_nom.md)
- [BUG-81](81_menu_items_fk_taxonomie_resolue_par_nom.md)
- [`backend/docs/bugs/83_marketprice_goodtype_category_desync_rename_delete.md`](../../../backend/docs/bugs/83_marketprice_goodtype_category_desync_rename_delete.md) — cause racine côté backend qui rend ce pattern par nom particulièrement fragile (le texte peut désynchroniser de la taxonomie active).
