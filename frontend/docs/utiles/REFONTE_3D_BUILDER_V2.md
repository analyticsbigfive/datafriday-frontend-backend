# Refonte 3D Builder v2 — Conception complète

> Proposition du 2026-07-04. Objectif : remplacer le builder actuel (dualité JSON↔relationnel,
> save-blob 30 s, synchro multi-config côté client) par une architecture propre, en **gardant
> ce qui marche** (projection isométrique, taxonomie, layout, contrats Data Integration /
> Space Menu) et en **préservant les ids d'éléments** (zéro impact sur les mappings Weezevent,
> les MenuAssignments et l'analytique).
>
> Complément : `docs/ARCHITECTURE_3D_BUILDER.md` (état des lieux v1, dettes §9).
> Maquette visuelle : artifact « Wireframes Builder v2 » (voir conversation).

---

## 0. TL;DR — les 5 décisions structurantes

| # | Décision | Ce que ça tue |
|---|---|---|
| 1 | **Le relationnel devient l'unique source de vérité.** `Config.data` JSON disparaît (gardé en colonne backup le temps de la migration). | Toute la classe de bugs « désync JSON/relationnel » (PDV démappés, floors dupliqués, badges perdus) |
| 2 | **Les éléments existent UNE fois par espace** (rattachés à une `Zone` de l'espace) ; une configuration = une **liste d'adhésions** (table de jointure `ConfigurationElement`). | La duplication d'éléments entre configs, `configurationIds` en JSON, la synchro cross-config client (N GET + N PATCH par nom+type), la danse de duplication de config |
| 3 | **API granulaire + autosave** : chaque geste = une petite mutation (create/patch/delete zone/élément, add/remove membership), débouncée. Plus de save-blob. | La transaction 30 s, le double-save automatique, l'adoption d'ids temporaires, les dialogs « unsaved changes », le PATCH-upsert |
| 4 | **Les ids de `SpaceElement` sont conservés tels quels** (on garde la table, on la migre en place). | Tout risque sur WeezeventLocationShopMapping, MenuAssignment, analytics — ils ne bougent PAS |
| 5 | **Le menu d'un shop = MenuAssignment, point.** L'inspecteur lit/écrit les endpoints Space Menu existants ; on supprime le doublon `menuItems` du JSON d'élément. | La double comptabilité menus (JSON élément vs MenuAssignment) |

---

## 1. Diagnostic → principes

### 1.1 Les racines des bugs actuels (v1)

1. **Deux sources de vérité** (`Config.data` JSON + rows `Floor`/`SpaceElement`) qu'il faut
   garder synchrones à la main : reconcile au save, fusion par level au get, verrou
   optimiste `Config.version`, ré-injections… Chaque nouveau chemin d'écriture est un
   nouveau risque.
2. **La visibilité multi-config est émulée** : chaque config possède SES floors et SES
   éléments ; « visible dans la config B » = copier l'élément dans B et maintenir un
   tableau `configurationIds` des deux côtés, synchronisé **depuis le navigateur** par
   matching nom+type. Non transactionnel, incohérent au premier échec partiel.
3. **Save = blob entier** : le client renvoie tout le monde à chaque fois → transaction
   lourde (timeout 30 s), prune dangereux (d'où les gardes « éléments protégés »),
   double-save pour les floors neufs, adoption d'ids par position.
4. Résidus du port React (props morts, taxonomie dupliquée dans 4 fichiers, callbacks
   non branchés).

### 1.2 Principes v2

- **Une donnée = un endroit.** Le JSON n'est autorisé que pour de la présentation pure
  sans jointure (cornerRadius, hole).
- **Le geste utilisateur = l'unité d'écriture.** Dessiner un shop = 1 POST. Le déplacer =
  1 PATCH (débouncé). Le cocher dans une config = 1 INSERT. Chaque écriture est petite,
  transactionnelle, idempotente.
- **Les ids sont éternels.** Un élément créé garde son id jusqu'à sa suppression explicite
  — et la suppression d'un élément « utilisé » (mappé Weezevent, menus) est un **409
  documenté**, jamais un silence.
- **Compat descendante des contrats consommés ailleurs** : `GET /spaces/:id/shops`,
  quick-element, assign-floor gardent leur forme de réponse (réimplémentés sur le
  nouveau modèle — ils deviennent plus simples car plus de JSON à synchroniser).

---

## 2. Modèle de données v2

### 2.1 Schéma

```
Space
 ├──< Zone                        ★ NOUVELLE TABLE — les zones appartiennent à l'ESPACE
 │     · kind: FLOOR | FORECOURT | EXTERNAL
 │     · level Int (FLOOR : 0=RDC, <0 sous-sol, >0 étage ; 0 pour les autres kinds)
 │     · name, width, length, height
 │     · geometry Json?           (cornerRadius, hole — présentation pure, aucune jointure)
 │     · sortIndex
 │     @@unique([spaceId, kind, level])
 │
 │     └──< SpaceElement          ★ TABLE EXISTANTE CONSERVÉE (ids préservés !)
 │           · zoneId  (remplace floorId/forecourtId/externalMerchId)
 │           · name, type ElementType, subtypes String[]  (fusionne les 7 colonnes *Types)
 │           · x, y, width, depth, height3d, rotation, cornerRadius Json?
 │           · capacity, image, notes
 │           · area String?       (promu depuis attributes.area — l'analytique le lit déjà)
 │           · attributes Json?   (extension libre, plus de originalType : le type composite
 │                                 front devient une colonne `subtype` implicite via subtypes)
 │           · version Int        (verrou optimiste PAR ÉLÉMENT)
 │
 │           ├──1 ElementPerformance   (inchangé)
 │           ├──< ElementStaff         (inchangé)
 │           ├──< ElementInventory     (inchangé)
 │           ├──< MenuAssignment       (inchangé — devient LE menu du shop, plus de doublon JSON)
 │           └──< WeezeventLocationShopMapping (inchangé, FK cascade)
 │
 └──< Configuration               (= table Config actuelle, `data` → colonne backup `legacyData`)
       · name, isSystem, capacity (calculée, mise en cache à l'écriture)
       │
       └──< ConfigurationElement  ★ NOUVELLE TABLE — l'adhésion élément↔config
             · configId + elementId  @@id composite
             · onDelete: Cascade des deux côtés
             @@index([elementId])
```

### 2.2 Ce que ce modèle règle mécaniquement

| Opération v1 (fragile) | Opération v2 (triviale) |
|---|---|
| Cocher une config dans l'inspecteur → GET config cible + matching nom+type + PATCH blob | `INSERT INTO ConfigurationElement (configId, elementId)` |
| Décocher → filtrer l'élément du blob de la config cible + PATCH | `DELETE FROM ConfigurationElement WHERE …` |
| Dupliquer une config → POST blob sans ids + re-GET + 2 PATCH croisés | `INSERT INTO Configuration` + `INSERT SELECT` des adhésions (1 transaction, instantané) |
| « Vide = visible partout » (convention implicite) | Adhésion explicite, toujours. La migration matérialise l'ancienne convention. |
| Éléments « protégés » ré-injectés au save | Plus de prune : on ne supprime que sur DELETE explicite ; un élément mappé → 409 + détail |
| Capacité = somme recalculée par le client au save | `capacity` recalculée serveur à chaque adhésion/maj d'élément (ou vue SQL) |

### 2.3 Détails et conventions

- **`subtypes String[]`** remplace shopTypes/storageTypes/… : le `type` détermine le
  vocabulaire (mêmes valeurs qu'aujourd'hui, cf. taxonomie §5.4). La couche API du
  endpoint `/spaces/:id/shops` continue d'exposer `shopTypes` pour compatibilité.
- **Types F&B** : on garde l'enum `ElementType` actuel (fnb_food…) ; le « type composite »
  front (`fnb-food`) devient une simple fonction de mapping UI ↔ enum, plus de
  `attributes.originalType`.
- **`geometry Json` de Zone** : `{ cornerRadius: {tl,tr,bl,br}, hole: { enabled, x, y, width, length, cornerRadius } }`.
  Autorisé en JSON car strictement présentationnel (aucune jointure, aucun autre lecteur).
- **`version` par élément** : chaque PATCH envoie `If-Match: version` ; conflit → 409 +
  état frais. Le rayon d'un conflit = un élément (vs toute la config en v1).
- **Suppression** :
  - `DELETE /elements/:id` → 409 `{ reasons: ['weezevent-mapping', 'menu-assignments:12'] }`
    si référencé ; `?force=true` = l'utilisateur a confirmé le dialog (supprime le mapping
    et les assignments en cascade, journalisé).
  - `DELETE /zones/:id` → 409 si la zone contient des éléments référencés.
- **Station** : hors périmètre, table conservée en l'état (legacy dormant).

---

## 3. API v2

### 3.1 Lecture — un seul bootstrap

```
GET /spaces/:spaceId/builder-state
→ {
    space:          { id, name, maxCapacity },
    zones:          [ { id, kind, level, name, width, length, height, geometry,
                        sortIndex, elements: [ ...éléments complets... ] } ],
    configurations: [ { id, name, isSystem, capacity } ],
    memberships:    [ { elementId, configIds: [...] } ]      // ou inline sur l'élément
  }
```

1 round-trip (3 requêtes Prisma en parallèle ou 1 requête brute json_agg — même patron que
`getSpaceShops` v1). Cache Redis 30 s, invalidé par toute mutation builder.

### 3.2 Mutations — granulaires

| Verbe | Route | Corps / retour | Notes |
|---|---|---|---|
| POST | `/spaces/:spaceId/zones` | { kind, level?, name, width, length, height, geometry? } → zone | 409 si (kind, level) existe |
| PATCH | `/zones/:id` | partiel | |
| PATCH | `/zones/reorder` | { orderedIds } | sortIndex |
| DELETE | `/zones/:id` | — | 409 si éléments référencés |
| POST | `/zones/:zoneId/elements` | { name, type, subtypes, x, y, width, depth, height3d?, …, configIds } → élément **avec id serveur** | l'id revient dans la réponse : plus jamais d'id temporaire |
| PATCH | `/elements/:id` | partiel + header If-Match version | géométrie, nom, subtypes, capacity, area, image, notes, attributes |
| PATCH | `/elements/batch` | [ { id, x, y, rotation?, … } ] | fin de drag multi/gros débit ; une transaction |
| POST | `/elements/:id/duplicate` | { offsetX?, offsetY? } → nouvel élément | duplication SERVEUR (copie aussi les adhésions ; PAS les mappings) |
| DELETE | `/elements/:id?force=` | — | 409 documenté sinon |
| PUT | `/elements/:id/performance` | objet complet | remplace ElementPerformance |
| PUT | `/elements/:id/staff` | liste complète | diff serveur |
| PUT | `/elements/:id/inventory` | liste complète | diff serveur |
| POST | `/configurations/:configId/elements/:elementId` | — | adhésion (idempotent) |
| DELETE | `/configurations/:configId/elements/:elementId` | — | retrait ; 409 si c'est la DERNIÈRE adhésion de l'élément (choix : un élément doit vivre dans ≥1 config, sinon → proposer DELETE élément) |
| POST | `/spaces/:spaceId/configurations` | { name, cloneFromConfigId? } | clone = copie des adhésions, 1 tx |
| PATCH | `/configurations/:id` | { name } | **404 si absent** (plus d'upsert) |
| DELETE | `/configurations/:id` | — | supprime les adhésions ; les éléments restent (ils appartiennent à l'espace). 409 si des éléments n'appartiendraient plus à aucune config → dialog « supprimer aussi N éléments ? » |

- Toutes les mutations : permission `space.edit`, SpaceAccessGuard, invalidation Redis
  (`builder-state`, `space_shops`, `space_configs`).
- Le menu du shop n'a PAS d'endpoint builder : l'inspecteur utilise les endpoints Space
  Menu existants (`GET /space-menu/shop/:id/items`, `POST /space-menu`).

### 3.3 Endpoints conservés tels quels (compat consommateurs)

- `GET /spaces/:id/shops[?configId=]` — même forme de réponse ; l'implémentation devient :
  `SpaceElement JOIN Zone` (+ `JOIN ConfigurationElement` si configId) — **plus simple
  qu'aujourd'hui** (plus de 3 branches UNION, `floorLevel` = `zone.kind == FLOOR ? zone.level : kind`).
- `POST /spaces/:id/quick-element` (Data Integration) — crée l'élément dans la zone RDC
  (créée au besoin) + adhésion à la config résolue par `resolveTargetConfig` (contrat
  strict conservé : config explicite → plus ancienne user-config → 400). **Plus aucune
  synchro JSON** : c'était la moitié du code.
- `POST /spaces/:id/assign-floor` — devient `UPDATE SpaceElement SET zoneId` (+ création
  de zone au besoin). Idem : le corps JSON-sync disparaît.
- `GET /spaces/:id/shop-details`, event-timeline, space-menu/* : aucun changement
  (ils joignent par elementId, préservé).

---

## 4. Logique frontend v2

### 4.1 Modèle d'édition : autosave + undo/redo (plus de bouton Save)

```
Geste UI ──► action Pinia (mutation optimiste du store)
                │
                ├──► pousse une Commande {redo, undo} sur la pile d'historique (cap 50)
                │
                └──► enqueue dans la MutationQueue
                       · geometry (drag/resize/rotate) : coalescée par élément,
                         flush au debounce 500 ms OU au mouseup
                       · structurel (create/delete/membership) : flush immédiat
                       · sérialisée par entité (pas de PATCH croisés sur le même id)
                       · retry ×3 backoff ; échec définitif → rollback optimiste + toast
                       · 409 version → refetch élément, rebase ou toast « modifié ailleurs »

Indicateur d'état permanent dans le header : ● Enregistré · il y a 3 s / ↻ Enregistrement… / ⚠ Hors ligne (n en attente)
```

Conséquences : suppression de `savedSnapshot`, `hasUnsavedChanges`, `beforeunload`,
`beforeRouteLeave`, dialog « Sauver & quitter », double-save, adoption d'ids. Undo/redo
(Ctrl+Z/Y) devient possible **parce que** chaque geste est une commande atomique.

### 4.2 Store (Pinia, normalisé)

```ts
// stores/builder.ts
state: {
  spaceId, space,
  zones:        Record<zoneId, Zone>,           // sans elements imbriqués
  elements:     Record<elementId, Element>,      // à plat, zoneId dedans
  configs:      Record<configId, Configuration>,
  memberships:  Record<elementId, Set<configId>>,
  // UI
  activeConfigId, activeZoneId, selectedElementId,
  activeTool, activeSubtypes: Record<tool, string[]>,
  saveStatus: 'saved' | 'saving' | 'offline' | 'error',
}
getters: {
  zonesSorted, elementsOfZone(zoneId),
  visibleElementsOfZone(zoneId)   // filtre par memberships[el] ∋ activeConfigId
  elementUsage(elementId)          // { mapped, menuCount } — chargé du bootstrap
}
```

Un seul flux de données : composants → actions → store → rendu. Plus de props-fonctions
en cascade (20 props par widget en v1), plus d'état dupliqué dans les widgets.

### 4.3 Arborescence des composants

```
views/builder/
├── BuilderPage.vue                    ← shell route : layout 3 volets + header, RIEN d'autre
├── constants/
│   └── elementTaxonomy.ts             ← LA source unique : 8 outils, sous-types, couleurs,
│                                        icônes, mapping enum ↔ label (v1 : dupliqué ×4)
├── composables/
│   ├── useBuilderBootstrap.ts         ← GET builder-state, hydrate le store
│   ├── useMutationQueue.ts            ← autosave (§4.1)
│   ├── useHistory.ts                  ← pile undo/redo (commandes)
│   ├── usePlanInteractions.ts         ← machine à états du canvas 2D :
│   │                                    idle → drawing | draggingElement | resizing
│   │                                    | rotating | draggingHole | panning
│   └── useIsoProjection.ts            ← fonctions pures reprises de v1 (toIsometric,
│                                        getFloorZ, drawRoundedBox) — TESTABLES
├── components/
│   ├── BuilderHeader.vue              ← switcher espace, ConfigSwitcher, SaveStatus, undo/redo
│   ├── ConfigSwitcher.vue             ← select config + menu (New/Clone/Rename/Delete)
│   ├── panels/
│   │   ├── ZonePanel.vue              ← zones (ex-FloorListView) ; dialogs → ZoneEditDialog.vue
│   │   ├── PalettePanel.vue           ← outils + sous-types (ex-ElementPaletteView), rendu
│   │   │                                généré depuis elementTaxonomy (fini les 8 blocs copiés)
│   │   └── ElementListPanel.vue       ← liste des éléments de l'outil actif (sidebar droite,
│   │                                    état « aucun élément sélectionné »)
│   ├── canvas/
│   │   ├── PlanCanvas.vue             ← SVG 2D : RENDU seul ; interactions via usePlanInteractions
│   │   ├── PlanElement.vue            ← un élément (path, poignées, label)
│   │   └── PlanHole.vue               ← le trou du floor
│   ├── iso/
│   │   ├── IsoView.vue                ← SVG isométrique (rendu conservé de v1, dumb)
│   │   └── IsoControls.vue            ← zoom / rotation 45° / pan
│   └── inspector/
│       ├── InspectorPanel.vue         ← switch par type ; monte les sections
│       └── sections/
│           ├── IdentitySection.vue    (nom, image, notes, area, dupliquer, supprimer)
│           ├── GeometrySection.vue    (x, y, w, d, h3d, rotation, cornerRadius)
│           ├── SubtypesSection.vue    (checkboxes depuis elementTaxonomy)
│           ├── ConfigsSection.vue     (chips d'adhésion — 1 clic = 1 POST/DELETE membership)
│           ├── UsageSection.vue       ★ nouveau : badges « Mappé Weezevent », « 12 menu items »,
│           │                            liens vers Data Integration / Space Menu
│           ├── PerformanceSection.vue (PUT /elements/:id/performance)
│           ├── StaffSection.vue       (PUT /elements/:id/staff)
│           ├── InventorySection.vue   (PUT /elements/:id/inventory)
│           └── MenuSection.vue        ★ lit GET /space-menu/shop/:id/items,
│                                        écrit POST /space-menu (endpoints EXISTANTS)
└── dialogs/
    ├── DeleteElementDialog.vue        ← affiche le 409 : « mappé Weezevent, 12 menu items —
    │                                    supprimer quand même ? » (→ ?force=true)
    ├── DeleteConfigDialog.vue         ← « N éléments ne seront plus dans aucune config… »
    └── ZoneEditDialog.vue             ← dims, cornerRadius, hole
```

### 4.4 UX : ce qui change pour l'utilisateur

1. **Plus de bouton Save ni de dialogs de sortie** — indicateur « Enregistré » + undo/redo.
2. **Adhésion aux configs en chips** dans l'inspecteur (1 clic = effet immédiat, spinner
   par chip) au lieu de checkboxes + synchro opaque.
3. **Badges d'usage sur les éléments** (⚡ mappé Weezevent, 🍔 n menu items) dans le plan
   ET l'inspecteur → on SAIT ce qu'on casse avant de supprimer ; suppression d'un élément
   utilisé = dialog explicite (fini les gardes silencieuses).
4. **Duplication de config instantanée** (clone serveur) avec les mêmes éléments visibles —
   plus de « les PDV n'apparaissent pas cochés dans la copie ».
5. Le reste NE change PAS : layout 3 volets, palette, dessin au drag, vue iso, dialogs de
   zone — l'utilisateur retrouve son outil.

---

## 5. Ce qu'on garde de l'existant (et pourquoi)

| Conservé | Provenance v1 | Justification |
|---|---|---|
| Projection isométrique SVG (`toIsometric`, empilement par level, boîtes arrondies) | ElevationBuilderView | Fonctionne, zéro dépendance, performant ; extraite en module pur testable |
| Taxonomie 8 outils + sous-types + couleurs | ElementPaletteView | Vocabulaire métier validé ; centralisée dans `elementTaxonomy.ts` |
| Layout 3 volets + interactions du plan 2D (drag/resize/rotate/hole/fullscreen) | FloorPlanBuilderView | UX éprouvée ; seul le code est restructuré (machine à états) |
| Contrat `resolveTargetConfig` strict (jamais de config auto « Weezevent Import ») | spaces.service | Contrat déjà durci et validé |
| Forme de réponse `GET /spaces/:id/shops` (floorLevel, isMappedToWeezevent, menuItemsCount) | getSpaceShops | Consommée par StepMapShops + SpaceMenuView |
| Discipline d'invalidation Redis (shops/configs/detail par espace) | invalidateSpaceCache | Efficace ; appliquée à chaque mutation v2 |
| Sémantique « un élément mappé ne disparaît jamais silencieusement » | gardes du save v1 | Reprise en MIEUX : 409 explicite au lieu de ré-injection cachée |
| Modèles ElementPerformance / ElementStaff / ElementInventory / MenuAssignment | Prisma | FK sur elementId préservé — aucun changement |

Ce qu'on **supprime** : `Config.data` (→ `legacyData` backup), `Floor`/`Forecourt`/
`ExternalMerch` (→ `Zone`), `configurationIds` JSON, `attributes.originalType`, le
reconcile/prune/fusion-par-level, `syncConfigurationIdChanges` côté client, les props
morts, `menuItems` dans le JSON d'élément.

---

## 6. Migration v1 → v2

**Contrainte n°1 : ne JAMAIS régénérer un id de SpaceElement** (mappings, menus, analytics).
D'où : on garde la table `SpaceElement` et on la migre EN PLACE.

### 6.1 Script (idempotent, mode dry-run avec rapport)

```
Pour chaque Space :
 1. ZONES — union des niveaux à travers toutes les configs de l'espace :
    · pour chaque level distinct des Floor existants  → Zone(kind=FLOOR, level)
      (géométrie : celle du floor de la config user la plus ancienne ; hole depuis le JSON
       via la logique de fusion getConfiguration v1 réutilisée comme EXTRACTEUR)
    · Forecourt existant(s) → Zone(kind=FORECOURT)   · ExternalMerch → Zone(kind=EXTERNAL)

 2. ÉLÉMENTS — pour chaque SpaceElement : zoneId = zone du (kind, level) de son parent v1.
    subtypes = concat des 7 colonnes *Types. area = attributes.area si présent.

 3. ADHÉSIONS — pour chaque élément :
    · configurationIds (JSON v1, via l'élément JSON correspondant par id) non vide
        → une row ConfigurationElement par id valide
    · vide/absent (convention v1 « visible partout »)
        → une row par config non-système de l'espace
    · toujours ∪ { config propriétaire du floor v1 }

 4. DÉDOUBLONNAGE (cas synchro v1 : même shop copié dans 2 configs = 2 rows physiques) :
    grouper par (name normalisé, type, level) les éléments de configs différentes dont les
    configurationIds se recouvrent → fusionner sur UN canonique :
      priorité : porteur d'un WeezeventLocationShopMapping > porteur de MenuAssignments
                 > le plus ancien.
    Les adhésions des fusionnés sont reversées au canonique ; rapport de fusion émis
    (à valider à la main sur le tenant Big Five avant prod).

 5. Config.data → renommé legacyData (lecture seule, rollback), version figée.
```

### 6.2 Rollout par phases (chaque phase shippe seule)

| Phase | Contenu | Filet de sécurité |
|---|---|---|
| **P1** | Migration schéma (tables Zone, ConfigurationElement, colonnes SpaceElement) + script + `GET /builder-state`. Rien ne consomme encore v2. | Dry-run + **dual-read diff** : comparer builder-state v2 vs getConfiguration v1 fusionné sur tous les espaces ; écart = bug de migration |
| **P2** | Endpoints mutations v2 + réécriture de quick-element / assign-floor / getSpaceShops sur Zone (mêmes réponses). v1 save reste actif (feature flag). | Les writes v1 et v2 ne cohabitent PAS sur un même tenant (flag par tenant) |
| **P3** | Nouveau front builder (BuilderPage) derrière le flag ; bascule tenant par tenant. | Retour arrière = flag off (legacyData intact tant que P4 pas franchie) |
| **P4** | Suppression des chemins v1 (saveConfiguration-blob, reconcile, fusion), drop Floor/Forecourt/ExternalMerch + legacyData après période de bake (≥ 2 semaines sans écart). | — |

⚠️ Rappels projet : migrations gitignorées → `make prod-migrate` AVANT le code
(cf. mémoire « migrations deploy gotcha ») ; P2/P3 : déployer front + back ensemble si un
contrat bouge.

### 6.3 Tests

- **Unitaires service** : adhésions (idempotence, dernière adhésion → 409), clone config,
  DELETE élément mappé → 409 + force, quick-element/assign-floor sur zones.
- **Migration** : golden tests sur des dumps anonymisés (dont le tenant Big Five —
  les cas dégénérés connus : floors dupliqués par level, éléments sans id, configurationIds
  vides) ; le rapport de fusion doit être vide sur un espace sain.
- **E2E builder** : dessiner → recharger → présent ; cocher config B → visible dans B ;
  cloner → adhésions identiques ; supprimer élément mappé → dialog ; undo/redo.
- **Contrats** : snapshot de la réponse `/spaces/:id/shops` avant/après P2.

---

## 7. Risques & arbitrages

| Risque | Mitigation |
|---|---|
| Fusion migration trop agressive (faux positifs nom+type) | dry-run + rapport à valider ; seuil : ne fusionner QUE si recouvrement configurationIds explicite |
| Autosave = écritures fréquentes | debounce 500 ms + batch endpoint + coalescing ; volumétrie réelle faible (édition ponctuelle) |
| Deux modes de save pendant la transition | flag PAR TENANT, jamais les deux actifs à la fois |
| « Un élément doit appartenir à ≥ 1 config » peut surprendre | dialog dédié qui propose la suppression complète ; c'est l'explicitation d'un invariant déjà implicite |
| Offline / onglet fermé pendant la queue | beforeunload UNIQUEMENT si queue non vide (le seul cas restant) + persistance de la queue en sessionStorage (option P3+) |

---

## 8. Estimation de découpage (ordre de grandeur, pas d'engagement)

- P1 (schéma + migration + builder-state + diff tool) : le gros morceau backend.
- P2 (mutations + réécriture des 3 endpoints compat) : backend, plus petit que P1.
- P3 (front complet) : le gros morceau front — mais 70 % du rendu (iso, plan, palette,
  inspecteur) est du PORT de l'existant vers la nouvelle arborescence, pas de la réécriture.
- P4 : nettoyage.

Le point de non-retour est P4 ; tout ce qui précède est réversible par flag.
