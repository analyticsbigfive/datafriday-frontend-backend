# Architecture complète — 3D Builder (`/spaces/:spaceId/builder`)

> Analyse exhaustive du 2026-07-04. Couvre : frontend Vue (source de vérité `datafriday-web/src/`),
> backend NestJS (`api-datafriday-staging`), modèle de données Prisma, relations avec
> Data Integration et Space Menu, et comparaison avec la version React legacy (`versionReact/`).

---

## 1. Vue d'ensemble

Le « 3D Builder » est l'éditeur de plan d'un espace (stade, arène…). Il permet de :

- modéliser les **zones** : étages (`floors`, y compris sous-sols), parvis (`forecourt`), zone
  merchandising extérieure (`externalMerch`) ;
- dessiner des **éléments** (`SpaceElement`) dans ces zones : shops F&B, hospitality, merch,
  storage, ticketing, entertainment, access, kitchen ;
- gérer plusieurs **configurations** par espace (`Config`) — un même espace peut avoir des
  agencements différents (concert / match / MICE), chaque élément pouvant être visible dans
  une ou plusieurs configurations (`configurationIds`) ;
- alimenter le reste du produit : **Data Integration** (mapping locations Weezevent → shops),
  **Space Menu** (menus par shop), **Analytics** (revenu par shop/zone).

**Important — « 3D » est en réalité une projection isométrique SVG.** Aucun WebGL/three.js :
`ElevationBuilderView` projette (x, y, z) → 2D via `toIsometric()` et dessine des `<path>` SVG.

---

## 2. Frontend — arborescence et rôles

```
datafriday-web/src/
├── router/index.js
│     route SpaceBuilder : /spaces/:spaceId/builder
│     → components/spaces/views/builder/views/SpaceBuilderViewRoute.vue
│
├── components/spaces/views/builder/
│   ├── views/SpaceBuilderViewRoute.vue      (2416 l.) ← ORCHESTRATEUR (état + API + save)
│   └── widgets/
│       ├── FloorListView.vue                 (897 l.) ← liste des Areas (sidebar gauche, haut)
│       ├── ElementPaletteView.vue            (647 l.) ← palette d'outils (sidebar gauche, bas)
│       ├── ElevationBuilderView.vue         (1414 l.) ← « Vue 3D » isométrique SVG (centre, haut)
│       ├── FloorPlanBuilderView.vue         (1617 l.) ← plan 2D éditable SVG (centre, bas)
│       └── PropertiesPanelView.vue          (2024 l.) ← panneau propriétés (sidebar droite)
│
├── api/endpoints/
│   ├── space.api.js          getSpace, getSpaceConfigurations, getSpaceShopList,
│   │                         quickCreateSpaceElement, assignShopsFloor, updateSpaceElement…
│   └── configuration.api.js  getConfiguration, createConfiguration (POST),
│                             updateConfiguration (PATCH), deleteConfiguration
│
└── store/modules/
    ├── spaceConfigurations.js  cache configs par spaceId (fetch/set/upsert/removeForSpace)
    └── spaceShops.js           cache shops par spaceId (fetchForSpace, invalidateForSpace)
```

### 2.1 Layout de la page

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Header (Teleport → #space-builder-header-target dans DashboardView)        │
│   [Space switcher ▾]  (nom + maxCapacity)                    [burger][cog] │
├──────────────┬───────────────────────────────────────────┬─────────────────┤
│ SIDEBAR G.   │  CENTRE                                   │ SIDEBAR DROITE  │
│              │ ┌───────────────────────────────────────┐ │                 │
│ FloorList    │ │ ElevationBuilderView (« Vue 3D »)     │ │ PropertiesPanel │
│ View         │ │  slot #config-controls :              │ │ View            │
│  · Floors    │ │   [v-select config][menu ⌂ actions]   │ │  (si élément    │
│  · Forecourt │ │  zoom / rotation 45° / pan            │ │   sélectionné)  │
│  · External  │ └───────────────────────────────────────┘ │                 │
│    Merch     │ ┌───────────────────────────────────────┐ │ — sinon —       │
│──────────────│ │ FloorPlanBuilderView (plan 2D)        │ │ liste éléments  │
│ ElementPal.  │ │  dessin rect / drag / resize / rotate │ │ de l'outil      │
│  8 outils +  │ │  hole (trou), corner radius, zoom,    │ │ sélectionné     │
│  sous-types  │ │  fullscreen                           │ │ groupés / Area  │
└──────────────┴───────────────────────────────────────────┴─────────────────┘
+ Snackbar, dialogs (nom config / rename / delete), overlay « saving »
```

Responsive : drawers permanents ≥ lg, temporaires en dessous ; la vue 3D est masquée < md ;
mode fullscreen du plan 2D masque les deux sidebars.

### 2.2 SpaceBuilderViewRoute.vue — l'orchestrateur

**État central (data)** — c'est LE modèle en mémoire du builder :

| Champ | Rôle |
|---|---|
| `space` | espace courant (GET /spaces/:id) |
| `availableConfigurations` | liste des configs de l'espace |
| `selectedConfigId` | config affichée ; valeur spéciale `'__create__'` = mode création |
| `configuration` | { id, name, spaceId, capacity, data } de la config chargée |
| `floors[]`, `forecourt`, `externalMerch` | **copie de travail locale** de `config.data` |
| `selectedFloorId` + `viewMode` | zone affichée dans le plan 2D (`floor` \| `forecourt` \| `externalmerch`) |
| `selectedElementId` | élément sélectionné (→ PropertiesPanel) |
| `selectedTool` + `selected*Types` | outil de palette actif + filtres de sous-types |
| `savedSnapshot` | JSON stringifié pour détecter `hasUnsavedChanges` |
| `syncingConfigIds` | configs en cours de synchro (checkbox configuration → spinner) |
| `menuItems`, `inventoryItems` | ⚠️ **toujours `[]`** — jamais fetchés ici (props morts, cf. §2.7) |

**Cycle de vie** :

1. `mounted()` → `spaces/fetchSpaces` (pour le switcher) + `fetchSpace()`.
2. `fetchSpace()` → en parallèle `GET /spaces/:id` + `GET /spaces/:id/configurations` ;
   pousse les configs dans le store Vuex `spaceConfigurations` ; sélectionne `configs[0]`
   (le backend trie user-configs d'abord) ou `'__create__'` si aucune.
3. watcher `selectedConfigId` → `loadConfiguration(id)` → `GET /configurations/:id`,
   puis **déduplication des floors par `level`** (fusion du `hole`), tri décroissant,
   génération d'ids `temp-…` pour les entrées sans id, snapshot.
4. `activated()` (keep-alive) → refresh de la liste des configs sans reset de l'éditeur.
5. Garde-fous de sortie : `beforeRouteLeave` + `beforeunload` → `leaveDialog`
   (Quitter / Sauver & quitter / Annuler) si `hasUnsavedChanges`.

**Sauvegarde (`confirmSaveConfiguration` → `persistFloorsToBackend`)** — le flux le plus
délicat du builder :

```
UI "Save"
  │ capacity = Σ element.capacity
  │ dédup floors par level (garde celui avec vrai id)
  │ POST  /configurations         si nouvelle config (strip TOUS les ids)
  │ PATCH /configurations/:id     si update (garde ids, strip seulement les temp-*)
  ▼
Backend saveConfiguration (§4.3) → renvoie data.floors RÉCONCILIÉ (vrais cuid)
  │
  ▼ Adoption des ids serveur côté client :
  │   match floor par LEVEL (clé métier stable), éléments par POSITION
  │   → l'état local n'a plus d'ids temporaires divergents
  │
  ├─ si un floor tout juste créé contenait des éléments → 2e save automatique
  │  (au 1er passage le floor n'existait pas encore côté relationnel)
  │
  ├─ si duplication (`_duplicatingFromId`) :
  │    · addConfigurationIdToElements(originalId, newId)  → PATCH config A
  │    · re-GET config B (vrais ids) puis PATCH B avec configurationIds ∪ {A, B}
  │    → les éléments apparaissent cochés dans les 2 configs
  │
  └─ upsert du cache Vuex spaceConfigurations + invalidation spaceShops
     reload de la config depuis le serveur + snapshot
```

**Visibilité multi-config (`configurationIds`)** — convention côté élément JSON :
`configurationIds` **vide ou absent = visible dans toutes les configs** (legacy) ;
sinon liste blanche d'ids. À la création d'un élément, il est estampillé
`[configuration.id]`. Le cochage/décochage dans PropertiesPanel déclenche
`syncConfigurationIdChanges()` : pour chaque config ajoutée/retirée, on
GET la config cible, on matche les éléments par **nom+type normalisés**, on copie
(add, dans la zone du même type/level) ou on supprime (remove), puis PATCH.
C'est une **synchro N configs = N GET + N PATCH côté client** (pas d'endpoint dédié).

### 2.3 FloorListView — les « Areas »

- Liste ordonnée des floors (drag & drop de réordonnancement local), + entrées Forecourt et
  External Merch (une seule de chaque, `@unique configId` en DB).
- Menu « + » : Add Floor / Add Basement (level < 0) / Add Forecourt / Add External Area.
- Dialogs d'édition : nom, dimensions (width/length/height), **cornerRadius** par coin
  (liables), et pour les floors le **hole** (trou : enabled, position relative x/y ∈ [0,1],
  dimensions, cornerRadius).
- Suppression **locale uniquement** — ne devient effective qu'au Save (le backend prune
  alors les floors absents du payload, sauf s'ils retiennent un élément mappé Weezevent).
- Tous les callbacks remontent au parent (props fonctions, pas d'emits).

### 2.4 ElementPaletteView — la palette

8 outils, chacun avec des sous-types cochables (filtres de dessin ET de surbrillance) :

| Outil (`type`) | Label | Sous-types |
|---|---|---|
| `shop` | F&B | food, beverages, beer, gppremium, temporary, drinkee |
| `hospitality` | Hospitality | lodges, salon |
| `merchshop` | Merch | onsite, offsite, temporary |
| `storage` | Storage | dry, cold, belowzero, material, merch |
| `entrance` | Ticketing | public, vip, staff |
| `entertainment` | Entertainment | sportground, stage, mice |
| `access` | Access | lift, staircase, servicelift, venueentrance, parking, reception, information |
| `kitchen` | Kitchen | fb, hospitality, storage |

Sélectionner un outil : (1) arme le dessin dans le plan 2D, (2) désélectionne l'élément
courant, (3) affiche dans la sidebar droite la **liste des éléments existants de cette
catégorie** groupés par Area (chips de filtre par Area) — cliquer un élément navigue vers
sa zone et le sélectionne.

### 2.5 FloorPlanBuilderView — le plan 2D (SVG)

- Rendu SVG à l'échelle (`scale` px/m), zoom 0.2→3, pan, fullscreen.
- **Création** : outil actif + drag sur le fond → rectangle fantôme → au mouseup, si
  > 1 m × 1 m, construit l'élément :
  `{ id: Date.now().toString(), type: selectedTool, x, y, width, depth, height: 2, name: "Type NNN", <cat>Type: [sous-types cochés] }`
  → `onAddElement` (le parent l'estampille `configurationIds: [configId]` et le pousse
  dans la zone active).
- **Édition** : drag de déplacement, 4 poignées de resize, rotation +15°/clic, dialog
  corner-radius (4 coins, liables), édition des dimensions du floor, gestion complète du
  **hole** (drag + resize + poignées) pour les floors.
- Surbrillance : les éléments correspondant à l'outil/sous-types sélectionnés sont
  surlignés (`isElementHighlighted`).
- Touch support (handlers tactiles équivalents).
- ⚠️ Unité géométrie : `width` × `depth` au sol, `height` = hauteur 3D de l'élément
  (défaut 2 m) — mais côté DB `height` du floor = hauteur d'étage et l'élément relationnel
  porte `height3d` (mapping fait au save, cf. §4.3).

### 2.6 ElevationBuilderView — la « Vue 3D »

- Projection **isométrique maison** : `rotatePoint(x,y,angle)` puis
  `iso.x = x' − y'` ; `iso.y = (x' + y')·0.5 − z`. Rotation par pas de 45°, zoom 0.5→2, pan.
- Empilement vertical : `getFloorZ(floor) = Σ height des floors de level inférieur` ;
  forecourt et externalMerch posés au niveau du sol (z du level 0), décalés latéralement.
- Chaque zone/élément = boîte arrondie dessinée en `<path>` (composant interne `SvgPaths`),
  couleur par type (`shop` vert, `storage` orange, `hospitality` rose…).
- Clic floor/forecourt/external → sélection de la zone ; clic élément → sélection élément.
- **Filtre de visibilité par configuration** : `_visibleFilter` masque les éléments dont
  `configurationIds` ne contient pas la config courante (vide = visible partout).
- Héberge le slot `#config-controls` : le **v-select de configuration** + le menu
  d'actions (Back / Save / Duplicate / Rename / New / Delete) fournis par le parent.

### 2.7 PropertiesPanelView — le panneau propriétés

Sections accordéon selon le `type` de l'élément :

1. **Element Name** + boutons Image / Duplicate / Delete (dialog avec option
   `keepHistoricalData`).
2. **Sous-types** (checkboxes shopType / hospitalityType / storageType / merchType /
   accessType / entertainmentType / entranceType / kitchenType).
3. **Configuration** (masquée pour storage/entrance/access) : une checkbox par config de
   l'espace ; la config courante est verrouillée cochée ; toggle → `handleConfigToggle`
   → `onUpdate({ configurationIds })` → synchro cross-config du parent (§2.2) avec
   spinner par config (`syncingConfigIds`).
4. **Performance** (masquée pour storage/entertainment/access/kitchen) : revenue,
   numberOfPOS, numberOfTransactions, transactionsPerMinute, staffCost,
   revenuePerEmployee → persistés dans `ElementPerformance` au save.
5. **Menu** : items de menu attachés à l'élément (JSON local `menuItems`) — recherche dans
   le catalogue chargé par le panneau lui-même via `api.getAllMenuItems()`.
6. **Inventory** : inventaire consolidé (expansion composants/ingrédients via
   `inventoryUtils`) + items custom → `ElementInventory` au save.
7. **Staff** : postes { position, count } → `ElementStaff` au save.
8. **Position** : x, y, largeur, profondeur, hauteur, rotation, corner radius.
9. **Zone d'implantation** (`area`) : persistée dans `attributes.area` — consommée par
   l'analytique (filtre « Zones », donut « By area »).

⚠️ Les props `all-shop-menu-items` / `all-merch-shop-items` / `available-menu-items`
reçoivent les `menuItems`/`inventoryItems` du parent **qui restent toujours vides** ;
le panneau ne s'appuie réellement que sur son propre `loadAllMenuItems()`. Héritage du
port React à nettoyer un jour.

---

## 3. Modèle de données (Prisma) et double représentation

### 3.1 Schéma relationnel

```
Tenant ──< Space ──< Config ─────────────< Floor ────────< SpaceElement
                       │  │                (level Int,      (type ElementType,
                       │  │                 width/height/    x,y,width,height,depth,
                       │  │                 length,          height3d, rotation,
                       │  │                 cornerRadius)    cornerRadiusTL/TR/BL/BR,
                       │  │                                  shopTypes[] storageTypes[] …,
                       │  ├──1 Forecourt ──────<──┤          attributes Json (originalType,
                       │  ├──1 ExternalMerch ──<──┤          area, importedFromWeezevent),
                       │  └──< Station (legacy)   │          tags[], capacity, image, notes)
                       │                          │
                       │                          ├──1 ElementPerformance
                       │                          ├──< ElementStaff
                       │                          ├──< ElementInventory (→ menuItemId?)
                       │                          ├──< MenuAssignment (→ MenuItem, enabled)
                       │                          └──< WeezeventLocationShopMapping
                       │                              (FK onDelete: Cascade,
                       │                               @@unique [tenantId, weezeventLocationId])
                       └─ data Json  ◄── LE JSON DU BUILDER (floors/forecourt/externalMerch)
                          version Int (verrou optimiste)
                          isSystem Bool (configs auto-générées, masquées UI)
```

`SpaceElement` est **polymorphe** : exactement un de `floorId` / `forecourtId` /
`externalMerchId` est renseigné.

`ElementType` enum : shop, fnb_food, fnb_beverages, fnb_bar, fnb_snack, fnb_icecream,
merchshop, storage, hospitality, access, entertainment, entrance, kitchen, seating, stage,
parking, restroom, office, other. Le type « frontend » composite (ex. `fnb-food`,
`merch-temporary`) est conservé dans `attributes.originalType` et restauré à la lecture.

### 3.2 La dualité JSON ↔ relationnel — cœur de l'architecture

`Config.data` (JSON) et les tables `Floor`/`SpaceElement` stockent **la même chose deux
fois** :

| Représentation | Sert à | Écrite par |
|---|---|---|
| `Config.data` JSON | source du builder (géométrie complète : hole, cornerRadius objet, configurationIds, menuItems locaux…) | saveConfiguration (miroir), updateConfigDataOptimistic (quick-element / assign-floor) |
| Rows `Floor`/`SpaceElement` | source des JOINTURES : mappings Weezevent, MenuAssignment, analytics, /spaces/:id/shops | saveConfiguration (reconcile), quickCreateElement, assignElementsToFloorLevel |

Le JSON porte des données que le relationnel n'a pas (`hole`, `configurationIds`,
`menuItems` d'élément) ; le relationnel porte les FK dont dépend tout le reste du produit.
**L'invariant à préserver : mêmes ids des deux côtés.** L'historique des bugs du projet
(PDV démappés, floors dupliqués, badge d'étage perdu) vient tous de désynchronisations de
cet invariant.

Mécanismes de protection actuels :

- `saveConfiguration` **réconcilie** (update en place, ids immuables) au lieu de
  delete+recreate, puis réécrit le JSON avec les ids réels (§4.3) ;
- `getConfiguration` **fusionne par level** JSON + relationnel et choisit comme id canonique
  le floor relationnel le plus peuplé (§4.2) ;
- `Config.version` + `updateConfigDataOptimistic` : verrou optimiste (3 retries puis
  last-write-wins) pour les écritures JSON concurrentes hors-builder ;
- FK `WeezeventLocationShopMapping.spaceElementId` avec cascade : plus de mappings
  « dangling » silencieux ; les éléments mappés sont **protégés** du prune au save.

---

## 4. Backend — endpoints et logique

Tout est dans `src/features/spaces/` : `SpacesController` (`/spaces`),
`ConfigurationsController` (`/configurations`), les deux délégant à `SpacesService`
(2884 l.). Guards : `JwtDatabaseGuard` + `RolesGuard` ; écriture = permission `space.edit` ;
`@SpaceIdParam('id')` pour le SpaceAccessGuard (restriction par espace).

### 4.1 Endpoints consommés par la page builder

| Endpoint | Usage builder |
|---|---|
| `GET /spaces/:id` | header (nom, maxCapacity) |
| `GET /spaces/:id/configurations` | v-select des configs — **sans** `data`, `_count(floors, stations)`, cache Redis 30 s, tri isSystem asc puis createdAt asc |
| `GET /configurations/:id` | chargement de la config (fusion JSON+relationnel, §4.2) |
| `POST /configurations` | création (201) |
| `PATCH /configurations/:id` | update — route vers le **même** `saveConfiguration` |
| `DELETE /configurations/:id` | suppression (cascade floors/éléments) |
| `PATCH /configurations/elements/:elementId` | update ciblé d'un SpaceElement (name/image/notes/type/shopTypes) — utilisé par Data Integration, pas par le builder |

### 4.2 `getConfiguration` — lecture avec fusion

1. Lit `Config` (JSON `data`) + les `Floor` relationnels avec leurs `elements`.
2. **Colonne vertébrale = `level`** : un bucket par level ; le JSON fournit la géométrie
   (hole, cornerRadius…), le relationnel injecte les éléments manquants (dédup par id).
3. Id canonique du floor émis : le floor **relationnel qui détient le plus d'éléments**
   (pour que le prochain save fusionne les doublons), sinon l'id JSON, sinon n'importe quel
   id relationnel.
4. Retourne `{ id, name, spaceId, capacity, isSystem, data: { floors: mergedFloors, forecourt, externalMerch } }`.
   ⚠️ forecourt/externalMerch sont lus **du JSON uniquement** (pas de fusion relationnelle
   — les éléments assignés au parvis par Data Integration sont visibles parce que
   `assignElementsToForecourt` synchronise aussi le JSON).

### 4.3 `saveConfiguration` — écriture avec réconciliation

Transaction Prisma unique (**timeout 30 s / maxWait 10 s** — le pooler Supabase ~200 ms RTT
rend le défaut de 5 s insuffisant) :

1. Upsert `Config` (id fourni) ou create.
2. **Garde anti-perte** : les éléments existants porteurs d'un `WeezeventLocationShopMapping`
   absents du payload JSON sont **ré-injectés** dans le payload (sur le floor level 0, créé
   « RDC » au besoin).
3. Capture des `MenuAssignment` de la config (non sérialisés en JSON) pour ré-insertion.
4. **Reconcile floors** : match par id sinon par level → `floor.update` ; sinon `create`
   (id étranger jamais honoré). L'id réel est réécrit dans l'objet JSON (`floor.id = …`).
5. **Reconcile éléments** (`reconcileElement`, en `Promise.all` par floor) : update si l'id
   appartient à la config, sinon create ; mappe `type` composite → enum + `attributes.originalType` ;
   `shopType`(JSON)→`shopTypes`(DB) etc. ; recrée performance/staff/inventory (delete+create).
6. **Prune** : éléments retirés du payload supprimés **sauf** protégés (mappés Weezevent) ;
   floors absents supprimés s'ils ne retiennent aucun protégé ; forecourts prunés seulement
   si le payload gère le forecourt (null = « ne pas toucher »).
7. Restauration des MenuAssignment (skipDuplicates, @@unique [elementId, menuItemId]).
8. **Réécriture du JSON réconcilié** dans `Config.data` → le retour de l'API contient les
   vrais ids que le front adopte.
9. Hors transaction : `invalidateSpaceCache(tenantId, spaceId)` → purge Redis
   (listes spaces, détail, **shops**, **configs**) pour que /space-menus et le wizard voient
   les changements immédiatement.

⚠️ La branche « update » fait `config.upsert` avec l'id client : un PATCH avec un id
inexistant **crée** la config avec cet id (upsert create).
⚠️ Le reconcile ne traite pas `externalMerch` en relationnel dans `saveConfiguration`
(seuls floors + forecourt) — la zone externalMerch vit essentiellement dans le JSON, ses
éléments relationnels étant créés par `assignElementsToExternalMerch` (Data Integration).

### 4.4 Caches Redis (SpacesService)

| Clé | TTL | Invalidée par |
|---|---|---|
| spaces list / light | 60 s | create/update/remove space |
| space detail | 120 s | idem + saveConfiguration |
| `space_shops:{tenant}:{space}[:configId]` | 30 s | saveConfiguration, quickCreateElement, assign-floor, updateSpaceElement, deleteConfiguration |
| `space_configs:{tenant}:{space}` | 30 s | idem |

---

## 5. Relation avec Data Integration (wizard `/data-integration`)

L'étape 2 du wizard (`StepMapShops.vue`) mappe les **locations Weezevent** vers les
**shops du builder** (SpaceElements). Le builder est à la fois producteur et consommateur :

```
                    ┌──────────────────────── 3D BUILDER ────────────────────────┐
                    │  crée/déplace/supprime des SpaceElements (via save config)  │
                    └──────────────┬──────────────────────────▲──────────────────┘
                                   │ ids immuables            │ getConfiguration
                                   ▼                          │ (fusion JSON+rel.)
   WeezeventLocation      WeezeventLocationShopMapping        │
   (sync Weezevent) ────► (tenantId, weezeventLocationId, spaceElementId FK)
                                   ▲                          │
                    ┌──────────────┴──────────────────────────┴──────────────────┐
                    │                   DATA INTEGRATION — Étape 2               │
                    │  GET /spaces/:id/shops        (liste + floorLevel + mappé?)│
                    │  POST /spaces/:id/quick-element  (créer un shop manquant)  │
                    │  POST /spaces/:id/assign-floor   (assigner étage/parvis/   │
                    │                                   external, crée la zone)  │
                    └─────────────────────────────────────────────────────────────┘
```

Points de contrat :

- **`resolveTargetConfig(spaceId, configId?)`** : les créations/assignations ciblent la
  config explicite du sélecteur, sinon la config utilisateur la plus ancienne
  (`isSystem=false`), sinon **400** — plus jamais de config « Weezevent Import » auto-créée.
- **`quickCreateElement`** : crée le SpaceElement (2×2×2 m) sur le 1er floor de la config
  (créé « RDC » si config vide), position en grille (pas de 10 m) pour éviter l'empilement
  à l'origine, `shopTypes` auto-déduits du type F&B (filtres du builder), **et synchronise
  le JSON** via `updateConfigDataOptimistic` → le shop apparaît dans le builder sans re-save.
  Le builder affiche d'ailleurs un snackbar si on arrive avec `?newShop=<name>`.
- **`assignElementsToFloorLevel`** : déplace des éléments vers un level (floor trouvé/créé :
  RDC / Étage N / Sous-sol N), ou `'forecourt'` (« Parvis ») ou `'externalmerch'`
  (« Espace Externe ») — met à jour la FK **et** déplace les entrées JSON, nettoie les
  floors JSON vides.
- **`getSpaceShops`** (aussi utilisé par Space Menu) : 1 seul round-trip SQL (CTE +
  UNION ALL floor/forecourt/externalMerch + json_agg) ; renvoie par shop `floorLevel`
  (Int | 'forecourt' | 'externalmerch'), `isMappedToWeezevent`, `menuItemsCount`
  (MenuAssignments enabled), `isOpen`.
- **Suppression d'un mapping** côté Data Integration → `deleteElementIfUnreferenced` :
  si plus aucun mapping ne référence l'élément, il est supprimé du relationnel **et** du JSON.
- L'étape 3 (mapping produits → menu items) est en aval : les ventes d'un shop ne sont
  attribuables que si le mapping location→shop (étape 2) existe — d'où la protection
  absolue des éléments mappés dans le save du builder.

Bug historique résolu (mémoire projet) : le save du builder faisait delete+recreate des
SpaceElements → `spaceElementId` des mappings devenait orphelin → « PDV démappés ». Fix :
reconcile + FK cascade + éléments protégés (§4.3).

## 6. Relation avec Space Menu (`/space-menus`)

Space Menu consomme la structure produite par le builder :

```
SpaceMenuView ──► GET /spaces/:id/shops?configId=   (liste des shops de la config)
     │                └── mêmes SpaceElements que le builder (types shop/fnb_*/merchshop)
     │
     ├─► GET /menu-items?spaceId=                  (catalogue scopé à l'espace)
     │
ShopDetailView / drawer shop
     ├─► GET /space-menu/shop/:shopId              (menu complet du shop : MenuAssignments
     │                                              → MenuItems + composants/ingrédients/packaging)
     ├─► GET /space-menu/shop/:shopId/items        (catalogue + available/missingIngredients/
     │                                              enabled/prix espace — 6 requêtes parallèles)
     ├─► GET /space-menu/space/:spaceId/items      (variante niveau espace)
     ├─► GET /space-menu/:spaceId/:configId        (état On/Off par shop×item de la config)
     └─► POST /space-menu                          (saveMenuConfiguration :
                                                    upsert MenuAssignment[elementId, menuItemId],
                                                    backfill MenuItem.spaceIds,
                                                    invalidation Redis space+menu-items)
```

- L'unité d'accrochage des menus est **le SpaceElement du builder** (`MenuAssignment.elementId`).
  Un shop supprimé dans le builder emporte ses MenuAssignments (cascade) — mais le save du
  builder les **capture/restaure** pour les éléments conservés (§4.3 étape 3/7).
- `menuItemsCount`/`isOpen` de `getSpaceShops` = nombre d'assignments enabled → badge
  Open/Closed dans Space Menu.
- La visibilité d'un item dans un espace = `MenuItem.spaceIds ∋ spaceId` (règle stricte,
  backfillée au save du menu). La disponibilité (`available`) = ingrédient actif +
  fournisseur résolu + `Supplier.sites ∋ spaceId` STRICT.
- Le builder invalide le cache `spaceShops` Vuex + Redis à chaque save → Space Menu voit
  immédiatement les nouveaux shops.
- `Station`/`MenuAssignment.stationId` : héritage legacy (stations d'une config) — le
  modèle existe encore mais le flux courant passe par `elementId`.

Analytics (hors périmètre direct mais même dépendance) : `/spaces/:id/shop-details`,
`/spaces/:id/event-timeline/:eventId` joignent transactions Weezevent × mapping shop ×
mapping produit — le `shopArea` vient de `attributes.area` saisi dans PropertiesPanel.

---

## 7. Version React legacy (`versionReact/`) — lecture comparative

> Rappel : `versionReact/` est **legacy, lecture seule** — ne pas s'y référer pour du code
> nouveau. Utile ici uniquement pour comprendre l'origine du design.

- **Monolithe SPA sans router** : `App.tsx` (3029 l.) gère TOUT par flags d'état
  (`showSpacesPage`, `showMenuBuilder`, `previousViewBefore*`…). Le builder est la « vue par
  défaut » quand aucun overlay n'est ouvert. La version Vue a éclaté ça en routes + keep-alive.
- Composants quasi 1:1 portés : `FloorList` → FloorListView, `ElementPalette` →
  ElementPaletteView, `ElevationView` → ElevationBuilderView (même projection
  `toIsometric`, mêmes couleurs), `FloorPlanView` → FloorPlanBuilderView (App.tsx en
  montait 3 instances — floor/forecourt/external — la version Vue n'en monte qu'une,
  pilotée par `viewMode`), `PropertiesPanel` → PropertiesPanelView.
- `ConfigurationManager`/`ConfigurationControl` React → remplacés par le v-select + menu
  d'actions dans le slot `#config-controls` de la vue 3D.
- Les props morts du panneau (menuItems/inventoryItems du parent, callbacks
  onHighlightElements/onSearchQueryChange non branchés, `configurations`/`onSaveConfiguration`
  passés à ElevationBuilderView mais non utilisés) sont des **résidus du port React**.
- `MenuBuilder`/`MenuItemBuilderPanel` React = le prototype mort documenté en mémoire
  projet (ne pas coder dessus).

---

## 8. Flux de bout en bout (séquence type)

```
CHARGEMENT                                    SAUVEGARDE
──────────                                    ───────────
GET /spaces/:id ─────────┐                    POST|PATCH /configurations[/:id]
GET /spaces/:id/configurations (Redis 30s)      └─ tx 30s : upsert Config
  └─ configs[0] → selectedConfigId                 ├─ ré-injection éléments mappés absents
GET /configurations/:id                            ├─ capture MenuAssignments
  └─ fusion JSON+relationnel par level             ├─ reconcile floors (id→level→create)
  └─ front : dédup level, ids temp-*,              ├─ reconcile éléments (Promise.all)
     snapshot                                      ├─ prune (sauf protégés Weezevent)
                                                   ├─ restore MenuAssignments
ÉDITION (100% locale, aucune API)                  └─ réécrit Config.data réconcilié
  palette → dessin → onAddElement               invalidate Redis (shops+configs+detail)
  drag/resize/rotate → onUpdateElement          front : adopte ids serveur (level/position)
  PropertiesPanel → onUpdate(updates)           front : 2e save auto si floor neuf peuplé
  checkbox config → sync N configs              front : upsert Vuex configs,
   (GET+PATCH par config cible)                         invalide Vuex spaceShops
```

---

## 9. Points d'attention / dettes identifiées

1. **Double représentation JSON/relationnel** : robuste depuis les fixes (reconcile, fusion
   par level, verrou optimiste) mais structurellement fragile — toute nouvelle écriture de
   `Config.data` hors `updateConfigDataOptimistic` réintroduirait des races.
2. **`configurationIds` uniquement en JSON** : la visibilité multi-config n'existe pas en
   relationnel ; `getSpaceShops` renvoie donc les shops de TOUTES les configs d'un espace
   sauf filtre `configId` (qui filtre par rattachement de zone, pas par configurationIds).
   Sémantique « vide = toutes les configs » à garder en tête dans tout nouveau code.
3. **Synchro cross-config côté client** (`syncConfigurationIdChanges`) : N GET + N PATCH
   séquencés depuis le navigateur, matching par nom+type — non transactionnel ; un échec
   partiel laisse les configs incohérentes (juste un `console.warn`).
4. **Double save automatique** pour les floors neufs peuplés : fonctionne, mais 2×
   la latence d'une transaction lourde ; conséquence directe du choix « pas d'API floor ».
5. **`PATCH /configurations/:id` = upsert** : un id inexistant crée la config (create de
   l'upsert) au lieu d'un 404.
6. **externalMerch non réconcilié en relationnel** dans `saveConfiguration` (floors +
   forecourt seulement) ; ses éléments relationnels ne naissent que via assign-floor.
7. **Props morts** hérités du port React (menuItems/inventoryItems parents vides,
   callbacks non branchés) — bruit pour la maintenance.
8. **Performance des éléments (ElementPerformance/Staff/Inventory)** : delete+recreate à
   chaque save (pas de reconcile fin) — acceptable car pas de FK entrantes.
9. Le **hole** et les **cornerRadius d'élément** n'existent qu'en JSON (le relationnel a
   les 4 scalaires TL/TR/BL/BR pour les éléments, mais le hole du floor est JSON-only) —
   la garde de ré-injection (§4.3 étape 2) reconstruit un élément SANS ses cornerRadius.
