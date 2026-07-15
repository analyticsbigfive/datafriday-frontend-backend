# Confrontation React legacy vs docs actuelles — Builder 3D & gestion Espaces/Configurations

> Note de méthode : `MenuBuilder.tsx` (5413 l.) s'est avéré ne PAS être le builder 3D — c'est le
> shell du module "Menu F&B" (market-prices/ingredients/components/menu-items/space-menus, voir
> `MenuBuilder.tsx:1-115` : imports `ComponentsLibraryPanel`, `MenuItemsLibraryPanel`,
> `SpaceMenusPanel`, `MarketPriceImportPage`…, zéro occurrence de
> `floorId`/`registryId`/`placement`/`SpaceElement`). Le vrai builder 3D React est `App.tsx`
> (3029 l., non lu en entier mais sondé en profondeur) qui orchestre `FloorList`, `ElementPalette`,
> `FloorPlanView`, `ElevationView`, `PropertiesPanel` via les hooks
> `useElementOperations`/`useConfigurationManager`/`useSpaceManager`. C'est ce périmètre qui a été
> confronté aux docs.

## 1. Correspondances confirmées

Le portage Vue est très fidèle sur la couche présentation/géométrie :

- **Projection isométrique** — formule identique : `rotatePoint` + `iso.x = x'−y'`,
  `iso.y = (x'+y')·0.5−z` (`ElevationView.tsx:470-485`) = ARCHITECTURE_3D_BUILDER.md §2.6
  l.202-203, mot pour mot.
- **Empilement vertical** — `getFloorZ(floor) = Σ height des floors de level inférieur`
  (`ElevationView.tsx:492-495`) = doc l.204.
- **Couleurs par type** — shop `#10b981` vert, storage `#f59e0b` orange, hospitality `#ec4899`
  rose (`ElevationView.tsx:497-509`) = doc l.207.
- **Zoom/rotation** — plan 2D zoom 0.2→3 (`FloorPlanView.tsx:231,235`), vue iso zoom 0.5→2 +
  rotation par pas de **+45°**/clic (`ElevationView.tsx:1214,1218,1302`) = doc §2.5/§2.6
  exactement.
- **Création d'élément par drag** — formule identique à celle citée dans le doc :
  `{ id: Date.now().toString(), type: selectedTool, x, y, width, depth, height: 2, name: "Type
  NNN" }` + injection des sous-types cochés (`FloorPlanView.tsx:628-679`) = doc l.187.
- **Rotation d'élément +15°/clic** — `onUpdateElement(id, { rotation: (currentRotation + 15) %
  360 })` (`FloorPlanView.tsx:1153`) = doc l.190.
- **Support tactile** complet (`onTouchStart/Move/End` sur drag, resize, rotate —
  `FloorPlanView.tsx:1204-1514`) = doc l.195.
- **8 outils + sous-types** — taxonomie exactement identique (shop/hospitality/merchshop/storage/
  entrance/entertainment/access/kitchen, mêmes valeurs de sous-types) : `ElementPalette.tsx:67-121`
  et `App.tsx:80-97,117-144` = tableau doc §2.4.
- **Hole + cornerRadius par floor**, un seul Forecourt/ExternalMerch par config (type singulier
  `Forecourt | null`, `useElementState.tsx:16-17`) = doc §2.3 et le `@@unique configId` Prisma.
- **`ElementPerformance`** — les 6 champs (`revenue, numberOfPOS, numberOfTransactions,
  transactionsPerMinute, staffCost, revenuePerEmployee`) sont repris **dans le même ordre** depuis
  `ShopPerformance` (`App.tsx:70-77`) → confirme que le modèle Prisma actuel a été calqué
  littéralement sur le prototype React.
- **`ElementStaff`** — `StaffPosition { id, position, count }` (`App.tsx:64-68`) = modèle Vue
  identique.
- **Convention « vide/absent = visible partout »** — `filterElementsByConfig` :
  `if (!element.registryId) return true; if (!registryElement) return true;`
  (`App.tsx:327-347`) est l'ancêtre direct de la règle Vue « configurationIds vide ou absent =
  visible dans toutes les configs » (doc l.142).
- **Slot config-controls hébergé dans la vue 3D** — `ElevationView.tsx:1243-1254` monte
  `<ConfigurationControl>` en interne (desktop) quand tous les callbacks
  `onSave/onLoad/onNew/onDuplicate/onRename/onDelete` sont fournis. C'est l'exacte préfiguration du
  « slot #config-controls » que Vue matérialise dans `ElevationBuilderView` (doc §2.6 l.211-212).
- **`ConfigurationManager`/`ConfigurationControl` → remplacés par le v-select** (doc §7) : confirmé,
  mais avec une précision importante (voir §2 divergences ci-dessous).
- **Backend KV Supabase Edge Function** confirmé : `utils/api.ts` fait `POST /configurations` avec
  le blob JSON entier (`api.ts:372-378`), endpoints `/kv/...` (`api.ts:160-161`) — cohérent avec
  GUIDE_PARCOURS_APP.md §14.

## 2. Divergences

- **Modèle registre/placement vs élément unique + configurationIds.** React ne stocke jamais
  directement une géométrie "de config" sur l'élément affiché : un élément F&B
  (`shop/hospitality/merchshop/kitchen/entertainment`) a un `registryId` pointant vers
  `FBElementRegistry` (identité partagée : nom, type, image, menuItems, performance,
  staffPositions — `App.tsx:80-102`), et **chaque configuration a sa PROPRE géométrie** via
  `FBElementPlacement` (`x,y,width,depth,height,rotation,cornerRadius` — `App.tsx:105-115`).
  Concrètement un même shop peut avoir une position/taille **différente selon la config** — ce que
  le modèle Vue actuel (une seule row `SpaceElement`, un seul x/y/rotation, `configurationIds` =
  pure visibilité) ne permet pas. Le doc Vue dit "même boutique, agencée différemment selon
  l'event" (GUIDE_PARCOURS_APP.md l.266) mais l'implémentation actuelle ne fournit que la
  visibilité, pas une géométrie par config — React allait plus loin sur ce point précis.
- **Duplication de la row physique entre configs, déjà présente en React**, mais avec une clé
  stable. `handleAddToConfiguration`/`handleRemoveFromConfiguration` (`useElementOperations.ts:692-1033`)
  font exactement ce que documente ARCHITECTURE_3D_BUILDER.md pour Vue (§2.2 l.144-148, "GET config
  cible, copie dans la zone du même type/level, PATCH") : GET la config cible, matching,
  copie/suppression d'une row dupliquée, PATCH. **Différence clé** : React route toute cette
  logique via `registryId` (UUID stable, source de vérité), alors que Vue
  (`syncConfigurationIdChanges`) matche par **nom+type normalisés** (doc l.146, dette #3 §9). Le
  port Vue a donc perdu la clé d'identité stable que React avait déjà inventée pour ce problème
  précis.
- **`saveConfiguration` = overwrite intégral d'un blob KV, sans réconciliation ni ids serveur.**
  `api.ts:372-378` : `POST /configurations` avec le config entier ; aucun mécanisme de
  reconcile-par-id/level comme le Vue v1 documenté (§4.3). Tous les ids sont générés côté client,
  jamais réémis par un serveur faisant autorité — `Date.now().toString()` (floors,
  `useElementOperations.ts:77`), `` `${Date.now()}-${Math.random().toString(36).substr(2,9)}` ``
  (éléments dupliqués), `crypto.randomUUID()` (registryId, `useElementOperations.ts:468`). C'est le
  stade **avant** l'invariant « ids réels du serveur adoptés côté client » (doc §2.2 l.125) : React
  n'a jamais eu cette étape, ce que le v1 Vue a dû construire de toutes pièces (Prisma cuid +
  reconcile).
- **Autosave 2s existait déjà en React et a été abandonné par le v1 Vue**, avant d'être réintroduit
  par REFONTE_3D_BUILDER_V2.md. `useConfigurationManager.ts:479-522` : `useEffect` avec
  `setTimeout(autoSaveConfiguration, 2000)` sur tout changement de `floors/forecourt/externalMerch`.
  Le Vue v1 actuel a un bouton Save + dialogs "unsaved changes" (ARCHITECTURE doc §2.2, §9 dette
  #1) ; REFONTE_3D_BUILDER_V2.md §4.1 propose de revenir à un autosave (débounce 500 ms + mutation
  queue). Ce n'est donc pas une innovation ex-nihilo de la refonte : c'est un retour à l'UX
  originelle de React, en mieux outillé (granulaire au lieu du blob entier).
- **La revendication ARCHITECTURE_3D_BUILDER.md §7 « App.tsx montait 3 instances de FloorPlanView »
  est inexacte au runtime.** Vérifié : les 3 occurrences de `<FloorPlanView`
  (`App.tsx:1932,1957,1982`) sont dans une chaîne **`if/else if/else if` mutuellement exclusive**
  sur `viewMode` — une seule est effectivement montée à la fois, exactement comme Vue (`viewMode`
  pilote une instance unique). Ce qui est réellement triplé, c'est le **code source** (~50 lignes de
  props quasi identiques répétées 3 fois), pas le montage runtime.
- **`ConfigurationManager.tsx` (dropdown UI, 491 lignes) est du code mort dans l'app React
  elle-même**, pas seulement un résidu de portage. `App.tsx:11-12` : `ConfigurationControl` est
  importé et monté (`App.tsx:1785`), `ConfigurationManager` n'est importé **que pour ses types**
  (`Configuration`, `Space`, `App.tsx:12`) — son composant React (le dropdown
  Save/Load/Duplicate/Rename/Delete) n'est jamais rendu nulle part. Le doc (§7) présente les deux
  comme équivalents et "remplacés" par le v-select Vue ; en réalité seul `ConfigurationControl`
  était vivant côté React.
- **`capacity` n'existe pas du tout dans le modèle React.** Aucune occurrence de `capacity` dans
  `App.tsx`/`PropertiesPanel.tsx`/`FloorPlanView.tsx` en dehors du champ texte libre de
  `ConfigurationControl.tsx:49,93-104` (un nombre tapé à la main, sans lien avec les éléments). Le
  calcul Vue "`capacity = Σ element.capacity`" (doc §2.2 l.118, §2.2 tableau v2 l.108) est donc une
  **addition du backend Vue**, pas un héritage — `SpaceElement.capacity` n'existe pas côté React.
- **`notes` et `tags[]`** sur `SpaceElement` (mentionnés doc §3.1 l.258) sont également absents du
  modèle React `FloorElement` (`App.tsx:117-144`) — additions Vue, pas du legacy.
- **`onHighlightElements`/`onSearchQueryChange` ne sont PAS morts en React** contrairement à ce que
  suggère la formulation du doc §7 l.492 ("callbacks... non branchés... résidus du port React").
  Vérifié : ces callbacks sont pleinement câblés et pilotent une vraie fonctionnalité de
  recherche+surbrillance d'éléments dans la vue iso (`ElevationView.tsx:379-459`, matching sur
  nom/type, `setHighlightedElementIds`, suggestions, `SearchResultsPanel`). C'est le **port Vue**
  qui a laissé ces props orphelines lors du portage d'`ElevationBuilderView`, pas une dette héritée
  de React.
- **Idem pour `allShopMenuItems`/`allMerchShopItems`/`allFBElements`/`allMerchElements` passés à
  `PropertiesPanel`** : en React ce ne sont pas des props toujours vides. `App.tsx:520-560`
  (`allShopMenuItems`) et `App.tsx:1156` (`allMerchShopItems`) sont des `useMemo` réels agrégeant
  les `menuItems` de tous les shops de l'espace, et `PropertiesPanel.tsx:843-2620` s'en sert
  activement (voir pépite ci-dessous). Le doc Vue §2.7 l.238-241 a raison de dire que côté Vue ces
  props restent vides ("héritage du port React à nettoyer") — mais c'est trompeur de laisser
  penser que la fonctionnalité elle-même vient de React à l'état mort : elle était vivante en
  React, c'est le port Vue qui ne l'a pas reconstruite derrière ces props.

## 3. Pépites nouvelles (absentes des docs actuelles)

- **Storage lié à des shops spécifiques, avec inventaire consolidé calculé (feature complète,
  disparue du modèle Vue).** `FloorElement.selectedShops?: string[]` ("F&B Element IDs that this
  storage serves", `App.tsx:135`) + UI dédiée dans `PropertiesPanel.tsx:843-938` (checkboxes
  groupées par Area, compteur "X/Y", bouton refresh) + calcul réel
  `buildConsolidatedInventory`/`buildMerchStorageInventory` (`PropertiesPanel.tsx:1834-2620`) qui
  agrège les menus des shops sélectionnés pour déduire ce que le storage doit contenir. **Rien
  d'équivalent dans le modèle Vue actuel** (`ElementInventory` est autonome par élément, sans
  relation storage↔shops multiples). C'est directement lié au sujet "persistance des ids" : cette
  relation repose sur des ids d'éléments (`selectedShops: string[]`) — si Vue veut un jour la
  réintroduire, elle bénéficierait immédiatement de l'invariant "ids éternels" que
  REFONTE_3D_BUILDER_V2.md met en avant (§0 décision 4), puisque React démontre déjà l'usage
  concret d'un id d'élément comme clé de relation durable inter-éléments (pas seulement
  inter-configs).
- **Entité `Area` structurée et référentielle, avec couleur, indépendante des zones géométriques.**
  `App.tsx:153-157` (`interface Area { id, name, color? }`), persistée via API dédiée
  `getAreas`/`saveAreas` par espace (`api.ts`, `useSpaceManager.ts:177-197`, 4 areas par défaut
  créées à la création d'un space : "Concourse", "Upper Level", "Lower Level", "VIP Area" avec
  couleurs hex). Sélection **exclusive** par élément F&B via `registryElement.areaId`
  (`PropertiesPanel.tsx:731-761`). C'est un référentiel bien plus riche que le simple
  `attributes.area` (string libre) documenté côté Vue (ARCHITECTURE doc §2.7 point 9, §9 dette #9)
  — la couleur notamment n'existe pas côté Vue/Prisma. À évaluer pour la v2 : matérialiser `Area`
  comme vraie table plutôt que free-text.
- **Feature de recherche+surbrillance d'éléments dans la vue 3D isométrique**, complète et
  fonctionnelle (`ElevationView.tsx:379-459`, `SearchResultsPanel.tsx`), absente de l'arborescence
  Vue documentée (ARCHITECTURE doc §2, aucun composant équivalent listé). Pourrait justifier une
  section `SearchResultsPanel.vue` dans REFONTE_3D_BUILDER_V2.md §4.3 (actuellement absente de
  l'arborescence proposée).
- **Migration/auto-guérison au chargement, exact précurseur de la fusion Vue.**
  `migrateLegacyFBElements` (`useConfigurationManager.ts:8-282`) : au chargement d'une config,
  nettoie les entrées de registre orphelines (aucun élément physique), crée les registryId
  manquants, recrée les éléments physiques manquants pour des placements orphelins, déduit
  `areaType`/`areaId` manquants par inspection des floors — puis déclenche un auto-save si des
  changements ont eu lieu (`hasUnsavedChanges: changesMade`, l.644). C'est conceptuellement
  identique à la stratégie Vue "`getConfiguration` fusionne et auto-répare" (doc §4.2, §9 point 1) :
  le même **pattern défensif** ("le stockage peut être incohérent, on répare silencieusement à la
  lecture") existait déjà en React, avec une heuristique différente (registre/aire vs level/id).
  Utile à citer si on documente l'historique de ce pattern.
- **Fonctionnalité "Pin" pour épingler des spaces favoris** (`SpacesPage.tsx:64,325-338`,
  `api.getPinnedSpaces`/`setPinnedSpaces`), avec tri "pinned first" (`SpacesPage.tsx:597-605`).
  Absente de GUIDE_PARCOURS_APP.md §4.1 ("liste des spaces (cartes + métriques cachées)") — petit
  gain UX à considérer.
- **Matching de revenu par nom de shop (`toLowerCase()`), déjà fragile en React** —
  `ElementSummaryPanel.tsx:390-396,538-544` : `shopRevenueData[item.element.name.toLowerCase()]`.
  C'est très exactement l'anti-pattern que la FK `WeezeventLocationShopMapping.spaceElementId` a
  corrigé côté Vue (doc §5, "Bug historique résolu... PDV démappés"). Utile comme preuve que le
  problème de matching par nom plutôt que par id est un défaut **d'origine du prototype React**,
  pas une régression introduite pendant le portage Vue — cohérent avec la fragilité des ids/du
  matching déjà repérée dans la confrontation KV.

## 4. Mort/hors-sujet

- **`MenuBuilder.tsx`** (5413 l.) — n'a rien à voir avec le builder 3D ; c'est le shell Menu F&B
  (market-prices/components/menu-items/space-menus). Le doc classe déjà correctement
  `MenuBuilder`/`MenuItemBuilderPanel` comme "prototype mort" (ARCHITECTURE doc §7 l.494), mais
  pour une raison différente de celle documentée dans la mémoire projet
  (`project_menuitem_dead_builder_prototype.md` parle du prototype Vue `MenuBuilder/appCopy` mort
  côté Vue, pas du fichier React homonyme) — à ne pas confondre.
- **`ConfigurationManager.tsx`** (component, 491 l.) — mort dans l'app React elle-même (voir §2),
  seuls ses types (`Configuration`, `Space`) sont réutilisés partout.
- **`SpacePricingDialog.tsx`, `SpaceSpecificPricing.tsx`, `SpaceSelectionDialog.tsx`** — hors
  périmètre builder : ce sont des outils de tarification **Menu Item par Space** (prix spécifique
  par espace, cf. mémoire `project_menuitem_per_space_pricing_plan.md`, déjà implémenté côté Vue
  via `spacePrices` Json + `MenuItemPriceHistory.spaceId`). Rien à en tirer pour le
  builder/configurations.
- **Dialogs de warning "unsaved changes"** dans `ConfigurationManager.tsx`/`ConfigurationControl.tsx`
  (Save-and-Continue / Discard) — obsolètes de facto si REFONTE_3D_BUILDER_V2.md §4.1/§4.4 va au
  bout de l'autosave (déjà noté dans le doc comme supprimé).
- **Props `configurations`/props de synchro passées mais qui ne survivront pas au modèle v2**
  (`registryId`, `FBElementRegistry`, `FBElementPlacement`) : toute cette mécanique
  registre/placement devient obsolète si REFONTE_3D_BUILDER_V2.md est implémentée telle quelle
  (SpaceElement unique + `ConfigurationElement` membership, §2.1) — mais comme noté en §3, la
  placement-par-config qu'elle offrait (géométrie différente par config) ne serait alors plus
  possible du tout, à moins de l'ajouter explicitement au modèle v2 (actuellement le modèle v2 ne
  prévoit qu'une géométrie unique par élément, partagée par toutes ses configs membres).

**Fichiers React clés cités** : `App.tsx`, `components/ElevationView.tsx`,
`components/FloorPlanView.tsx`, `components/FloorList.tsx`, `components/ElementPalette.tsx`,
`components/ElementSummaryPanel.tsx`, `components/PropertiesPanel.tsx`,
`components/ConfigurationManager.tsx`, `components/ConfigurationControl.tsx`,
`hooks/useElementOperations.ts`, `hooks/useConfigurationManager.ts`, `hooks/useSpaceManager.ts`,
`hooks/useElementState.tsx`, `hooks/useSpaceState.tsx`, `hooks/useViewState.tsx`,
`hooks/useUIState.tsx`, `hooks/useAppState.tsx`, `utils/api.ts`, `components/SpacesPage.tsx`
(tous sous `datafriday-web/old/versionReact/src/app/`).
