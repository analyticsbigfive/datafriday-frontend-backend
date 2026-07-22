# Espaces & Builder — 3D Builder v1 (backend seul) / v2

> Domaine cartographie : **Espaces & builder**. Owner produit : Ulrich.
> Écrans : `/spaces`, `/spaces-overview`, `/spaces/:id` (Analyse), `/spaces/:id/builder2` (v2 —
> unique parcours d'édition d'espace).
>
> **Mise à jour 2026-07-22 : le frontend v1 a été retiré** (`spaces/views/builder/` supprimé,
> route `SpaceBuilder`/`/spaces/:id/builder` enlevée de `router/index.js` — voir
> [ADR-0002](../adr/0002_builder_v2_relationnel_seul.md) pour le détail du retrait et ce qui a été
> nettoyé avec). Le reste de ce document (rédigé le 2026-07-15, avant le retrait) décrit le state
> backend qui, lui, **n'a pas changé** : `SpacesController`/`ConfigurationsController`,
> `Config.data` JSON, `Floor`/`Forecourt`/`ExternalMerch`, et toute la logique de cohabitation avec
> `Zone`/`ConfigurationElement` (v2) restent en place et actifs — utilisés par le wizard Data
> Integration (`StepMapSpace.vue`) pour créer la première config d'un espace, par
> `SpaceInventoryView.vue` (assign-floor/floor-options), et comme source de lecture pour les
> espaces jamais migrés vers `Zone`. Les sections ci-dessous décrivant l'ancienne UI
> (`spaces/views/builder/*.vue`) sont conservées à titre **historique** (elles expliquent le
> "pourquoi" de plusieurs choix backend encore actifs) mais le code qu'elles décrivent n'existe
> plus — ne pas y chercher de fichiers.
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma, chaque route backend (v1
> `SpacesController`/`ConfigurationsController` ET v2 `BuilderV2Controller`), chaque composant
> frontend (v1 `spaces/views/builder/` ET v2 `spaces/views/builder2/`), chaque composable, chaque
> client API et chaque route du router a été localisé et lu directement — y compris pour recouper
> et corriger un état des lieux fourni en amont (voir encadré ci-dessous). Objectif : qu'un dev ou
> un agent IA qui doit corriger un bug ici sache exactement où regarder et ce qu'il risque de
> casser ailleurs, sans relire le code.
>
> **Ce document remplace un ancien brouillon plus court du même nom** (format audit, moins
> détaillé) et un doc de conception `docs/utiles/REFONTE_3D_BUILDER_V2.md` qui décrivait la v2
> comme un plan à venir — dans les faits elle est **déjà construite et livrée** (voir plus bas).
> Compléments historiques : `docs/utiles/ARCHITECTURE_3D_BUILDER.md` (v1 seule, très détaillé,
> décrit l'ancienne UI, à lire comme archéologie depuis le retrait du 2026-07-22) et
> `docs/utiles/prototypes/08_REACT_BUILDER_3D.md` (archéologie du prototype React — utile pour
> comprendre le "pourquoi historique" de certains choix, jamais comme source de vérité sur l'état
> actuel).

---

## Ce que cette passe a corrigé par rapport à l'état des lieux fourni en amont

Une vérification précédente (même jour) avait établi que `REFONTE_3D_BUILDER_V2.md` n'est pas
qu'un plan mais une refonte largement construite, avec un dual-read/dual-write v1↔v2 déjà en prod.
Ce constat est confirmé ci-dessous. Mais en relisant le code source (pas les rapports), plusieurs
points de cet état des lieux se sont révélés inexacts ou incomplets :

1. **"Storage lié à des shops + inventaire consolidé, réintroduit en v2, perdu depuis React"
   — FAUX.** Le vrai builder v1 Vue (`PropertiesPanelView.vue:239-275`, `element.selectedShops`)
   a **toujours eu** cette fonctionnalité, avec un calcul consolidé 100 % client
   (`buildConsolidatedInventory`/`expandInventoryItems`, `src/utils/inventoryUtils.js`). Elle n'a
   donc jamais disparu : le v2 la **réimplémente en mieux** (calcul serveur sur le vrai menu/stock,
   `attributes.storageShopIds` + `GET /space-menu/storage-inventory`), mais ce n'est pas une
   résurrection d'une fonctionnalité perdue — voir section dédiée plus bas.
2. **`notes` — présenté comme "actif en v2"** (colonne + DTO + lu/écrit côté service, ce qui est
   vrai) **mais aucune UI ne l'édite ni ne l'affiche, ni en v1 ni en v2** (zéro occurrence de
   `notes` dans tout `components/spaces/` et `components/integration/`, vérifié par recherche
   exhaustive). Le champ est un tuyau backend complet sans robinet côté écran — même statut que
   `Area`, voir zones grises.
3. **`capacity` sur `SpaceElement` — présenté comme "recalculé serveur" (vrai) sans préciser qu'il
   n'existe AUCUN champ de saisie pour l'écrire.** Ni v1 (`PropertiesPanelView.vue`, zéro
   occurrence de `capacity`) ni v2 (`GeometrySection.vue`, aucun champ `capacity` dans `FIELDS`)
   ne permettent à un utilisateur de saisir la capacité d'UN élément. Le calcul (somme client v1,
   somme SQL serveur v2) est donc correct mais s'applique à des valeurs qui ne peuvent être écrites
   que par une voie externe (import, appel API direct) — jamais par le builder lui-même. Voir
   zones grises.
4. **`quickCreateElement`/`bulkQuickCreateAndMap` ne sont PAS "dual-write v1↔v2"** — ils écrivent
   **exclusivement en v2** désormais (`spaces.service.ts:2722-2726`, commentaire explicite : *"v2
   D'ABORD (bug étape 2 : bulk/quick-create invisibles dans builder2) : les créations Data
   Integration atterrissent TOUJOURS en v2"*). Le dual-write conditionnel (v2 si la Zone existe
   déjà, sinon v1 legacy) ne s'applique qu'à `assignElementsToFloorLevel`/`assignElementsToForecourt`/
   `assignElementsToExternalMerch` — nuance importante si tu dois déboguer pourquoi un shop importé
   apparaît dans un builder et pas l'autre.

Le reste de l'état des lieux fourni (schéma v2 posé, `builder-v2.controller.ts` conforme au plan,
`space.edit` partagé sans flag de rollout, `capacity` recalculée serveur, `tags[]` mort, `area`
backend-only) est confirmé exact ci-dessous, avec les détails.

---

## Vue d'ensemble — deux architectures qui cohabitent sur les MÊMES tables centrales

```
                         ┌─────────────────────── V1 (legacy, JSON + relationnel) ───────────────────────┐
                         │                                                                                │
Space ──< Config ──┬──< Floor ────< SpaceElement (floorId)                                                │
         (data Json│  ├──1 Forecourt ──< SpaceElement (forecourtId)                                       │
          = LE      │  ├──1 ExternalMerch ──< SpaceElement (externalMerchId)                              │
          JSON du   │  └──< Station (legacy dormant) ──< MenuAssignment (stationId)                       │
          builder)  │                                                                                     │
                     └── Config.data JSON = MIROIR des mêmes floors/forecourt/externalMerch/éléments      │
                         (source du builder v1 ; le relationnel sert aux JOINTURES externes)               │
                         └────────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────────── V2 (relationnel pur, table de jointure) ─────────────────┐
                         │                                                                                  │
Space ──< Zone (kind FLOOR|FORECOURT|EXTERNAL, level) ──< SpaceElement (zoneId)                             │
         Config ──< ConfigurationElement (configId, elementId) ──> SpaceElement                             │
         (capacity recalculée serveur = SUM SpaceElement.capacity des membres)                              │
                         └──────────────────────────────────────────────────────────────────────────────────┘

SpaceElement (TABLE UNIQUE, partagée par v1 ET v2 — polymorphe : floorId XOR forecourtId XOR
              externalMerchId XOR zoneId)
   ├──< ElementPerformance   (scopé configId — v1 : config du parent ; v2 : config adhérente)
   ├──< ElementStaff         (idem)
   ├──< ElementInventory     (idem)
   ├──< MenuAssignment       (→ MenuItem, scopé configId — voir 04_MENU_CATALOGUE.md)
   └──< WeezeventLocationShopMapping / LocationShopMapping (Data Integration, FK cascade)
```

**L'invariant central du domaine** : `SpaceElement.id` ne doit **jamais** être régénéré — c'est la
clé stable dont dépendent les mappings Weezevent, les `MenuAssignment` et l'analytique. Toute
l'ingénierie des deux versions (reconcile v1, table de jointure v2) existe pour préserver cet
invariant par des chemins différents.

---

## Le piège n°1 de ce domaine (historique, résolu côté UI le 2026-07-22) : DEUX builders actifs simultanément, même permission

**Résolu au niveau UI** : depuis le retrait du frontend v1, `/spaces/:id/builder` n'existe plus —
`builder2` est l'unique route montée. Le paragraphe suivant décrit l'état tel qu'il était avant ce
retrait (utile pour comprendre pourquoi le backend protège encore les éléments v2 en lecture v1,
cf. plus bas) :

`/spaces/:id/builder` (v1) et `/spaces/:id/builder2` (v2) étaient **tous les deux montés en
production, tous les deux accessibles à tout utilisateur ayant la permission `space.edit`**
(vérifié `router/index.js:147-160` : les deux routes portaient `meta.permission: 'space.edit'`,
aucun flag tenant). Ce n'était pas un plan (`REFONTE_3D_BUILDER_V2.md` §6.2 prévoyait une bascule
"tenant par tenant, jamais les deux actifs à la fois") — **c'était l'état réel du code jusqu'au
2026-07-22**.

**Important — ceci ne résout que le risque de confusion UI.** Le risque de fond décrit ci-dessous
(un espace peut avoir des éléments dans le système v1 relationnel, v2, ou les deux à la fois ;
`Config.data` JSON toujours réécrit par le chemin v1) reste entier côté backend tant que la
migration des données n'est pas faite — voir zones grises en fin de document.

**Différence structurelle qui explique pourquoi ceci est risqué** : v1 garde son état dans
`Floor`/`Forecourt`/`ExternalMerch` + le JSON `Config.data` ; v2 garde le sien dans `Zone` +
`ConfigurationElement`. Les DEUX pointent vers la **même table `SpaceElement`**. Un espace peut
avoir des éléments dans l'un, l'autre, ou les deux systèmes à la fois (ex. : anciens éléments
créés en v1 avec `floorId`, nouveaux créés en v2 avec `zoneId`). Le backend v1 (`getConfiguration`,
`saveConfiguration`) **injecte en lecture** les éléments v2 dans le payload v1 (marqués
`attributes.managedByBuilderV2: true`) et les **protège explicitement** de toute écriture/suppression
par le chemin v1 (`spaces.service.ts:1541-1552` : `stripV2()` retire les éléments v2 du payload
avant le reconcile ; `v2ManagedIds` les exclut du prune). C'est un vrai dual-read v1→v2, pas un
simple "les deux cohabitent sans se voir".

**Conséquence pratique pour un correctif** : avant de modifier un comportement du builder, vérifie
d'abord dans QUEL système l'espace concerné vit réellement (`GET /spaces/:id/shops` avec la config
visée, ou directement `SELECT zoneId FROM "SpaceElement" WHERE ...`) — un correctif posé côté v1
seul ne s'appliquera pas à un espace déjà géré en v2, et réciproquement.

---

## Modèles Prisma

### Space — l'établissement

**Où vit le code** : `api-datafriday-staging/prisma/schema.prisma:462-519`.

Champs notables au-delà de l'identité (nom, adresse, réseaux sociaux) : `maxCapacity` (Int?,
saisi manuellement à la création de l'espace, **distinct** de la capacité calculée par config côté
builder), `timezone` (défaut `Europe/Paris`, utilisé par les agrégations dashboard),
`cachedMetrics` (Json?, cache de métriques calculées). Relations : `configs[]` (v1),
`zones[]` (v2, commentaire explicite dans le schéma *"Builder v2"*), `pinnedByUsers[]`,
`userAccess[]`.

### Config — une configuration/agencement de l'espace

**Où vit le code** : `schema.prisma:521-547`.

| Champ | Sens |
|---|---|
| `data` (Json?) | **v1 seulement** : le blob complet `{ floors[], forecourt, externalMerch }` qui EST le builder v1. En v2 cette colonne existe encore mais n'est plus la source de vérité (elle continue d'être lue/réécrite par les chemins v1 pour compat, cf. piège n°1). |
| `capacity` (Int?) | v1 : calculée côté **client** (somme des `element.capacity` à l'écran, `SpaceBuilderViewRoute.vue`) puis envoyée au save. v2 : recalculée côté **serveur** par SQL à chaque mutation (`BuilderV2Service.recomputeConfigCapacities`, `builder-v2.service.ts:157-169` — `UPDATE Config SET capacity = SUM(...)`). Deux mécanismes différents, mais dans les deux cas **rien dans l'UI ne permet de saisir la capacité d'un élément individuel** (voir zones grises) — la valeur sommée est donc 0 pour toute config n'ayant reçu aucun élément avec une capacité posée par une voie externe. |
| `isSystem` (Boolean) | `true` = config auto-générée par le backend (import Weezevent historique), masquée dans le sélecteur UI. `getConfigurations` trie `isSystem asc` : la 1ʳᵉ config proposée au chargement est toujours une config utilisateur. |
| `version` (Int) | Verrou optimiste sur `data` (JSON), utilisé par `updateConfigDataOptimistic` (v1, écritures hors du save principal : quick-element, assign-floor). |

**Pourquoi `data` existe encore alors que v2 est censé s'en passer** : v2 ne l'utilise pas comme
source de vérité, mais ne l'a pas encore supprimée (P4 de la migration, jamais franchie — voir
Zones grises). Le champ vit en cohabitation, comme le reste.

### Floor / Forecourt / ExternalMerch — les zones v1 (legacy)

**Où vit le code** : `schema.prisma:592-607` (Floor), `749-758` (Forecourt), `761-770`
(ExternalMerch).

- `Floor` : `level` (Int, 0 = RDC, négatif = sous-sol, positif = étage), `width`/`height`/`length`,
  `cornerRadius` (Json?, PAS de colonne `hole` — le trou d'un floor n'existe **que** dans le JSON
  `Config.data`, jamais en relationnel).
- `Forecourt`/`ExternalMerch` : un seul par config (`configId String @unique`), mêmes champs
  géométriques simples (`width`/`length`, pas de `height`).

**Ce qui en dépend** : `SpaceElement.floorId`/`forecourtId`/`externalMerchId` (une des trois FK,
jamais deux à la fois pour un élément v1). `getSpaceShops` (v1) fait un `UNION ALL` sur les trois
FK plus la branche `zoneId` v2 (`spaces.service.ts:842-899`) — modifier la forme d'une des trois
branches sans répercuter sur les 4 casse le contrat `GET /spaces/:id/shops` consommé par
StepMapShops et SpaceMenuView.

### Zone — la zone v2 (source de vérité unique)

**Où vit le code** : `schema.prisma:554-574`.

| Champ | Sens |
|---|---|
| `kind` (enum `ZoneKind`: `FLOOR`\|`FORECOURT`\|`EXTERNAL`) | Remplace les 3 tables v1 par UNE table, un discriminant. |
| `level` (Int, défaut 0) | Sens identique à `Floor.level` pour `kind=FLOOR` ; toujours `0` pour les 2 autres kinds. |
| `geometry` (Json?) | `{ cornerRadius, hole }` — **volontairement JSON** (commentaire du schéma : *"présentation pure, aucune jointure dessus"*) ; c'est la SEULE donnée non-relationnelle du modèle v2, un choix assumé (contrairement au JSON v1 qui portait aussi des données de jointure). |
| `sortIndex` (Int) | Ordre d'affichage dans `ZonePanel.vue`, modifiable par `PATCH /builder-v2/zones/reorder`. |

**Contrainte** : `@@unique([spaceId, kind, level])` — un seul étage par niveau, un seul parvis, une
seule zone externe par espace. `createZone`/`ensureZone` (backend) retournent 409 si violée.

### ConfigurationElement — l'adhésion élément ↔ configuration (v2)

**Où vit le code** : `schema.prisma:578-588`. Table de jointure pure : `@@id([configId,
elementId])`, cascade des deux côtés.

**Pourquoi ce design** : remplace la convention JSON v1 "`configurationIds` vide ou absent =
visible dans toutes les configs" (une string array **dans le JSON de l'élément**, jamais en
relationnel) par une ligne explicite par adhésion. Cocher une config = `INSERT` ; décocher =
`DELETE` ; dupliquer une config = `INSERT SELECT` des lignes existantes — **aucune des trois
opérations ne touche la géométrie de l'élément**, contrairement au v1 où le même geste déclenchait
un GET+PATCH sur la config cible entière (`syncConfigurationIdChanges`, voir section v1 plus bas).

**Invariant posé et vérifié en base** (`BuilderV2Service.removeMembership`,
`builder-v2.service.ts:959-979`) : un élément doit appartenir à **au moins une** configuration ;
retirer la dernière adhésion est un 409 (« supprimez l'élément à la place »).

**Limite assumée du modèle** (confirmée en lisant le code, pas déduite) : **une seule géométrie
(x/y/rotation/dimensions) par élément, partagée par toutes ses configs membres.** Le prototype
React permettait une géométrie différente par config (table `FBElementPlacement` séparée de
l'identité `FBElementRegistry`) ; ni v1 ni v2 ne réintroduisent cette possibilité. Si un même shop
doit être positionné différemment selon l'agencement Concert/Match, ce n'est possible aujourd'hui
qu'en créant deux éléments distincts (perdant alors l'unicité de mapping Weezevent/menu entre les
deux). Voir Zones grises.

### SpaceElement — l'élément (table unique, partagée v1/v2)

**Où vit le code** : `schema.prisma:612-676`.

**Qu'est-ce que c'est** : UN élément dessiné dans le plan — un shop, un stand storage, une entrée,
etc. Polymorphe : exactement une des 4 FK `floorId`/`forecourtId`/`externalMerchId`/`zoneId` est
renseignée (v1 utilise les 3 premières, v2 la 4ᵉ ; un élément ne migre jamais automatiquement de
l'un à l'autre sauf via `assignElementsToFloorLevel` quand l'espace bascule en v2, cf. plus haut).

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `type` (enum `ElementType`) | 19 valeurs : `access`, `hospitality`, `entertainment`, `shop`, `merchshop`, `entrance`, `storage`, `kitchen`, `fnb_food`, `fnb_beverages`, `fnb_bar`, `fnb_snack`, `fnb_icecream`, `seating`, `stage`, `parking`, `restroom`, `office`, `other`. Le "type composite" du front (ex. `fnb-food`, `merch-temporary`) n'est PAS une valeur d'enum : il est conservé dans `attributes.originalType` (v1) et restauré à la lecture (`reverseMapElementType`), pendant que `type` porte la valeur enum canonique. |
| `shopTypes`/`storageTypes`/`hospitalityTypes`/`accessTypes`/`entertainmentTypes`/`entranceTypes`/`kitchenTypes` (String[] × 7) | **v1 seulement** : une colonne de sous-types PAR outil de palette (ex. `shopTypes: ['food','beverages']`). |
| `subtypes` (String[]) | **v2 seulement** : fusionne les 7 colonnes ci-dessus en UNE, le `type` déterminant le vocabulaire valide (`elementTaxonomy.js`, `sectionsForType`/`toolOf`). `getSpaceShops` v1 les réexpose sous le nom `shopTypes` pour compat (`CASE WHEN cardinality(se.subtypes) > 0 THEN se.subtypes ELSE se."shopTypes" END`, `spaces.service.ts:876`). |
| `x`, `y`, `width`, `depth`, `height3d`, `rotation` | Géométrie du plan 2D + hauteur 3D pour la vue iso. **Une seule valeur par élément**, partagée entre toutes ses configs membres (v2) — voir limite ci-dessus. |
| `cornerRadiusTL`/`TR`/`BL`/`BR` (Float, relationnel) | Coins arrondis de l'ÉLÉMENT — **relationnels dans les deux versions** (contrairement au `hole`/`cornerRadius` de ZONE qui est JSON-only en v2, ou au `cornerRadius` de FLOOR qui est JSON en v1). |
| `area` (String?) | **v2 seulement**, colonne promue depuis `attributes.area` (v1). **Toujours un champ texte libre** — aucune table `Area` référentielle (contrairement au prototype React qui avait `Area {id,name,color}` avec sélection exclusive). Consommé par l'analytique (`shopArea` dans l'event-timeline, filtre "Zones", donut "By area"). Voir Zones grises pour le statut exact de l'UI. |
| `capacity` (Int?) | Voir encadré capacity plus haut — sommé partout, saisi nulle part dans le builder. |
| `notes` (String?) | Colonne DB + accepté par les DTO v2 (`CreateElementDto`/`UpdateElementDto`) et par l'endpoint de compat `PATCH /configurations/elements/:elementId` (v1). **Zéro composant front (v1 ou v2) ne le lit ni ne l'écrit.** Vérifié par recherche exhaustive sur `components/spaces/` et `components/integration/` : aucune occurrence. |
| `tags` (String[]) | Colonne DB vivante, sérialisée par `reconcileElement`/`transformElement` (v1). **Zéro UI dans les deux versions** — champ mort côté produit, contrairement à `notes` il n'est même plus dans les DTO v2 (`CreateElementDto`/`UpdateElementDto` ne l'exposent pas du tout). |
| `attributes` (Json?) | Extension libre. v1 : `{ originalType, importedFromWeezevent, area }`. v2 : mêmes clés + `storageShopIds` (voir section Storage plus bas) + `managedByBuilderV2: true` sur les éléments v2 injectés en lecture v1. |
| `version` (Int) | **v2 seulement** — verrou optimiste PAR ÉLÉMENT (`If-Match` header), incrémenté à chaque `PATCH /builder-v2/elements/:id`. Le rayon d'un conflit est un seul élément, contre toute la config en v1 (`Config.version`). |

**Ce qui dépend de SpaceElement (impact si tu modifies son id ou son cycle de vie)** :
- `WeezeventLocationShopMapping`/`LocationShopMapping` (Data Integration étape 2) — FK
  `spaceElementId`, cascade en v2 ; en v1 c'est une **string sans FK** (`WeezeventLocationShopMapping`
  a une vraie FK cascade, mais l'ancien `LocationShopMapping` legacy référencé dans certains
  endroits n'en a pas toujours eu une — c'est précisément le bug historique "PDV démappés" que le
  reconcile v1 corrige).
- `MenuAssignment.elementId` — voir `04_MENU_CATALOGUE.md` section SpaceMenus (déjà détaillée
  là-bas, notamment le scoping `configId` qui protège contre la fuite entre configs).
- `ElementPerformance`/`ElementStaff`/`ElementInventory` — cascade `onDelete`, recréées à chaque
  save v1 (delete+create), diffées côté serveur en v2 (`PUT` = remplacement complet avec diff).

### ElementPerformance / ElementStaff / ElementInventory — scopées par config

**Où vit le code** : `schema.prisma:680-702`, `706-722`, `726-747`.

Les trois modèles partagent le même patron : `elementId` + `configId` (nullable), contrainte
`@@unique([elementId, configId])` (implicite pour Performance ; Staff/Inventory n'ont pas cette
contrainte unique mais suivent le même filtre applicatif). **`configId` existe pour la même raison
que sur `MenuAssignment`** (déjà expliquée en détail dans `04_MENU_CATALOGUE.md`) : un élément v2
partagé entre configurations peut avoir des métriques/staffing/stock différents selon la config
active (ex. plus de personnel en config Concert qu'en config MICE pour le même shop). `configId =
null` marque une ligne "legacy" créée avant le scoping ou un élément sans config adhérente.

**v1** : `reconcileElement` fait un **delete+create** de ces trois relations à CHAQUE save,
scopé au `configId` du floor/forecourt sauvegardé (`spaces.service.ts:1459-1503`) — pas de
reconcile fin, acceptable car aucune FK entrante ne pointe vers ces lignes.

**v2** : `PUT /builder-v2/elements/:id/performance|staff|inventory` fait un remplacement complet
avec **diff côté serveur** (delete puis createMany dans une transaction), résolu sur
`resolveElementConfigId` : `configId` explicite (query param, envoyé par le front = config active
du builder) sinon la 1ʳᵉ adhésion de l'élément par ordre de création (arbitraire si aucun
`configId` n'est fourni — **toujours envoyer `configId`** si tu ajoutes un nouveau consommateur).

### Station / MenuAssignment

**Station** (`schema.prisma:1996-2007`) : legacy dormant, conservé sans évolution ("hors périmètre"
selon `REFONTE_3D_BUILDER_V2.md`). Le flux courant passe par `SpaceElement.id`, jamais par
`Station.id`, sauf sur des configs anciennes jamais migrées.

**MenuAssignment** (`schema.prisma:2009-2035`) : déjà entièrement documenté dans
`04_MENU_CATALOGUE.md` (section "MenuAssignment — cet article est-il activé sur TEL SHOP"). Pour
ce domaine, retenir seulement : `elementId` pointe vers `SpaceElement` (v1 comme v2),
`stationId` est l'alternative legacy, et `configId` est **exactement** le même mécanisme de
scoping que sur `ElementPerformance`/`ElementStaff`/`ElementInventory` ci-dessus — les quatre
modèles ont été scopés par config dans la même migration.

---

## Backend v1 — module `Spaces`

**Où vit le code** : `api-datafriday-staging/src/features/spaces/` — `SpacesController`
(préfixe `/spaces`), `ConfigurationsController` (préfixe `/configurations`), tous deux délégant à
`SpacesService` (3776 lignes — le plus gros service du backend). Guards : `JwtDatabaseGuard` +
`RolesGuard` ; écriture = permission `space.edit` ; `@SpaceIdParam('id')` pour le
`SpaceAccessGuard`.

**Toutes les routes** (`SpacesController`, vérifiées ligne à ligne dans `spaces.controller.ts`) :

| Route | Rôle |
|---|---|
| `POST /spaces` | Créer un espace |
| `GET /spaces` | Liste paginée |
| `GET /spaces/light` | `{id,name}` seulement, cache Redis 60s |
| `GET /spaces/statistics` | Stats globales |
| `GET /spaces/pinned` | Espaces épinglés de l'utilisateur |
| `GET /spaces/:id` (+`?light=`) | Détail (light = sans image) |
| `PATCH /spaces/:id` | Update |
| `PUT /spaces/:id/image` | Update image seule |
| `GET /spaces/:id/configurations` | Liste des configs (cache Redis 30s, tri `isSystem asc, createdAt asc`) |
| `GET /spaces/:id/shops` (+`?configId=`) | Shops légers (UNION floor/forecourt/externalMerch/zone), cache Redis 30s |
| `GET /spaces/:id/shop-details` (+pagination, `?granular=`) | Shops + ventes agrégées, délègue à la RPC Postgres `get_space_shop_details` |
| `GET /spaces/:id/event-timeline` (batch, `?eventIds=`) | Timeline minute×shop×item pour N événements |
| `GET /spaces/:id/event-timeline/:eventId` | Idem pour un seul événement (wrapper du batch) |
| `GET /spaces/:id/weezevent-events` | Liste des WeezeventEvent avec métadonnées d'enrichissement |
| `PATCH /spaces/:id/weezevent-events/:eventId` | Update métadonnées (doorsOpening, team…) |
| `POST /spaces/:id/weezevent-events/:eventId/sync-attendees` | Sync participants WeezPay |
| `DELETE /spaces/:id` | Suppression |
| `POST`/`DELETE /spaces/:id/pin` | Épingler/désépingler |
| `POST /spaces/:id/access`, `DELETE /spaces/:id/access/:userId`, `GET /spaces/:id/users` | Gestion des accès utilisateur par espace |
| `POST /spaces/:id/quick-element` | Créer un shop rapidement (Data Integration étape 2) — **écrit exclusivement en v2** |
| `POST /spaces/:id/quick-elements/bulk` | Créer+mapper en masse — **écrit exclusivement en v2** |
| `POST /spaces/:id/assign-floor` | Assigner des shops à un étage/parvis/externe — v2 si l'espace a déjà ≥1 Zone, sinon v1 legacy |
| `GET /spaces/:id/floor-options` (+`?configId=`) | Zones/étages légers pour le dialogue "Assigner un étage" — v2 zones + complément v1 pour les levels non couverts |

**Toutes les routes** (`ConfigurationsController`, préfixe `/configurations`) :

| Route | Rôle |
|---|---|
| `POST /configurations` | Créer OU sauvegarder une config — `saveConfiguration` (reconcile complet) |
| `GET /configurations/:id` | `getConfiguration` — fusion JSON+relationnel+injection v2 |
| `PATCH /configurations/:id` | Même service que POST (`saveConfiguration({...dto, id})`) — **upsert**, pas un vrai update (voir bugs) |
| `DELETE /configurations/:id` | Suppression (avec rattrapage des éléments v2 orphelins, voir plus bas) |
| `PATCH /configurations/elements/:elementId` | Update ciblé d'un `SpaceElement` (name/image/notes/type/shopTypes) — utilisé par Data Integration, **pas** par le builder v1 lui-même |
| `POST /configurations/:id/quick-element` | Doublon de route pour `quickCreateElement` (même service, montée aussi sur ce contrôleur) |

### `saveConfiguration` — le flux le plus délicat du domaine

Transaction Prisma unique, **timeout 30s / maxWait 10s** (le pooler Supabase ~200ms RTT rend le
défaut de 5s insuffisant — `spaces.service.ts:1850-1855`). Séquence vérifiée dans le code
(`spaces.service.ts:1508-1862`) :

1. **Blindage v2** : les éléments dont l'id appartient à une `Zone` de l'espace sont retirés du
   payload entrant (`stripV2`) — jamais touchés par le chemin v1.
2. Upsert `Config` (⚠️ un `id` fourni inexistant **crée** la config — c'est un upsert, pas un
   update strict, voir bugs).
3. **Ré-injection anti-perte** : les éléments existants porteurs d'un `LocationShopMapping` mais
   absents du JSON entrant sont réinjectés sur le 1ᵉʳ floor du payload (RDC créé si besoin).
4. **Capture** des `MenuAssignment` de la config (non sérialisés en JSON) pour ré-insertion post-reconcile.
5. **Reconcile floors** : match par id sinon par `level` → `update` ; sinon `create` (un id
   étranger n'est jamais honoré, évite les collisions de PK en cas de duplication).
6. **Reconcile éléments** (`reconcileElement`, en `Promise.all` par floor) : update en place si
   l'id appartient déjà à la config, sinon create — **c'est LA correction du bug historique "PDV
   démappés"** (`SpaceElement.id` devient immuable au lieu d'un delete+recreate).
7. **Prune** : éléments retirés du payload supprimés, SAUF les protégés (mapping Weezevent) et les
   éléments v2.
8. Restauration des `MenuAssignment` capturés à l'étape 4 (`skipDuplicates`, respecte
   `@@unique([elementId, menuItemId, configId])`).
9. Réécriture du JSON réconcilié dans `Config.data` (les ids Prisma générés sont propagés dans le
   JSON avant sauvegarde) — c'est ce que le front adopte pour remplacer ses ids temporaires.
10. Hors transaction : `invalidateSpaceCache` (purge Redis shops/configs/detail de l'espace).

### `getConfiguration` — fusion JSON + relationnel + injection v2

Vérifié `spaces.service.ts:2017-2197`. Colonne vertébrale = `level` : un bucket par level, le JSON
fournit la géométrie fine (hole, cornerRadius d'objet), le relationnel injecte les éléments
manquants (dédupliqués par id). L'id canonique émis pour chaque floor est **le floor relationnel
qui détient le plus d'éléments** (pour que le save suivant fusionne les doublons au lieu d'en
garder plusieurs). Puis `fetchZoneElementsForSpace` + `mergeZoneElementsIntoConfigData` injectent
les éléments v2 membres de cette config dans le payload retourné, sérialisés au format v1
(`serializeZoneElementForV1`, marqués `attributes.managedByBuilderV2: true`).

### `quickCreateElement` / `bulkQuickCreateAndMap` — v2 exclusivement (correction du piège n°4)

Vérifié `spaces.service.ts:2711-2905` : les deux méthodes résolvent/créent une `Zone` (`FLOOR`,
`level=0`, "RDC") et y créent le `SpaceElement` avec `zoneId`, puis l'adhèrent à la config cible via
`ConfigurationElement`. **Aucune branche n'écrit plus dans `Floor`/`Config.data` pour ces deux
endpoints** — le commentaire du code documente explicitement que c'est un correctif d'un bug où
les shops importés via Data Integration étaient invisibles dans builder2.

### `assignElementsToFloorLevel` / `Forecourt` / `ExternalMerch` — dual-write CONDITIONNEL

Vérifié `spaces.service.ts:2912-3180` (floor) et confirmé symétrique pour forecourt/externalMerch
(`grep spaceHasZones` → occurrences lignes 2973, 3205, 3426). La bascule se décide par
`spaceHasZones = (await this.prisma.zone.count({ where: { spaceId } })) > 0` :
- **Si l'espace a déjà au moins une Zone** (donc déjà "entré" en v2, même partiellement) : les
  éléments assignés sont routés en v2 (`zoneId` + `ConfigurationElement`).
- **Sinon** (espace jamais touché par v2) : chemin v1 legacy — `Floor` relationnel créé/trouvé +
  sync du JSON `Config.data` (déplace l'élément entre floors JSON, nettoie les floors vides).

**Piège de débogage** : un espace peut basculer de "v1 only" à "mixte" au premier appel à
`assign-floor` qui trouve `spaceHasZones=true` — par exemple juste après qu'un `quick-element` ait
créé la toute première Zone RDC. À partir de ce moment, les assignations suivantes sur CET espace
passent en v2 même si l'utilisateur n'a jamais ouvert `/builder2`.

### `deleteConfiguration` (v1) — rattrapage des orphelins v2

Vérifié `spaces.service.ts:3708-3775`. Supprimer une `Config` v1 cascade ses
`ConfigurationElement` (v2). Pour ne pas laisser d'éléments v2 orphelins invisibles :
- s'il existe une autre config utilisateur dans l'espace → les éléments dont c'était la SEULE
  adhésion y sont rattachés automatiquement ;
- sinon (dernière config utilisateur de l'espace) → purge réelle des `SpaceElement` sans plus
  aucune adhésion, puis des `Zone` vides.

### Caches Redis (`SpacesService`)

| Clé | TTL | Invalidée par |
|---|---|---|
| `spaces:list`/`spaces:light` (par tenant) | 60s | create/update/remove space |
| `spaces:detail:{spaceId}` | 120s | idem + `saveConfiguration` |
| `spaces:shops:{tenant}:{space}[:configId]` | 30s | `saveConfiguration`, `quickCreateElement`, `assign-floor`, `updateSpaceElement`, `deleteConfiguration`, **et toute mutation v2** (`BuilderV2Service.invalidate` appelle le même `invalidateSpaceCache`, de façon non bloquante — `void ... .catch(() => undefined)`) |
| `spaces:configs:{tenant}:{space}` | 30s | idem |
| `spaces:shopids:{tenant}:{space}` | 30s | idem (résolution des shopIds pour l'event-timeline) |

---

## Backend v2 — module `BuilderV2`

**Où vit le code** : `api-datafriday-staging/src/features/builder-v2/` — `BuilderV2Controller`
(264 lignes, préfixe `/builder-v2` **volontairement distinct** de `/configurations` : les chemins
nus PATCH/DELETE `/configurations/:id` sont déjà pris par le contrôleur v1, la bascule sur les
chemins nus est prévue pour P4), `BuilderV2Service` (1112 lignes), `builder-v2.dto.ts` (305
lignes). Module importe `SpacesModule` pour réutiliser `invalidateSpaceCache` — un seul mécanisme
d'invalidation partagé entre v1 et v2.

**Toutes les routes** (vérifiées ligne à ligne, `builder-v2.controller.ts`) :

| Verbe | Route | Rôle |
|---|---|---|
| GET | `/builder-v2/spaces/:spaceId/state` | **Bootstrap unique** : space + zones (avec éléments) + configurations + memberships + usage, en 1 round-trip SQL |
| POST | `/builder-v2/spaces/:spaceId/zones` | Créer une zone — 409 si `(kind, level)` existe déjà |
| PATCH | `/builder-v2/zones/reorder` | Réordonner (sortIndex) — déclarée AVANT `zones/:id` pour ne pas être capturée comme un id |
| PATCH | `/builder-v2/zones/:id` | Modifier nom/dimensions/`geometry` |
| DELETE | `/builder-v2/zones/:id` (`?force=`) | 409 `{blockers}` si éléments utilisés (mapping Weezevent ou menu), sinon suppression cascade |
| POST | `/builder-v2/zones/:id/duplicate` | Dupliquer un étage (zone + éléments + adhésions, PAS les mappings) |
| POST | `/builder-v2/zones/:zoneId/elements` | Créer un élément — id serveur renvoyé, jamais d'id temporaire |
| PATCH | `/builder-v2/elements/batch` | Patch géométrique de plusieurs éléments en 1 transaction — déclarée AVANT `elements/:id` |
| PATCH | `/builder-v2/elements/:id` (header `If-Match`) | PATCH partiel, verrou optimiste par élément — 409 si version obsolète |
| POST | `/builder-v2/elements/:id/duplicate` | Dupliquer (copie adhésions + perf/staff/inventaire, PAS les mappings) |
| DELETE | `/builder-v2/elements/:id` (`?force=`) | 409 `{reasons}` si utilisé |
| PUT | `/builder-v2/elements/:id/performance`\|`/staff`\|`/inventory` (`?configId=`) | Remplacement complet, scopé config |
| POST\|DELETE | `/builder-v2/configurations/:configId/elements/:elementId` | Adhésion (cocher = idempotent, décocher = 409 si dernière adhésion) |
| POST | `/builder-v2/spaces/:spaceId/configurations` | Créer — `cloneFromConfigId` = copie des adhésions en 1 transaction |
| PATCH | `/builder-v2/configurations/:id` | Renommer — **404 stricte, pas d'upsert** (contraste volontaire avec le v1) |
| DELETE | `/builder-v2/configurations/:id` (`?orphanPolicy=`,`?reassignToConfigId=`) | 409 `{orphanCount, orphans}` si des éléments deviendraient orphelins |

### `getBuilderState` — le bootstrap en 1 round-trip

Vérifié `builder-v2.service.ts:189-333` : une seule requête `$queryRaw` (CTE + `json_agg`, même
patron que `getSpaceShops` v1) qui remonte zones + éléments + `performanceByConfig`/
`staffByConfig`/`inventoryByConfig` (objets clé = configId, `''` pour les lignes legacy sans
config) + `configIds` (adhésions) + `weezeventMapped`/`menuItemsCount`/`menuCountsByConfig` par
élément. Le service reshape ensuite ce payload en `{ space, zones, configurations, memberships[],
usage[] }` — c'est EXACTEMENT le contrat que `builderStore.hydrate()` consomme côté front.

### `recomputeConfigCapacities` — capacité recalculée en 1 SQL pour N configs

`builder-v2.service.ts:157-169` : `UPDATE "Config" c SET capacity = COALESCE((SELECT SUM(...) FROM
"ConfigurationElement" ...), 0) WHERE c.id = ANY(...)`. Appelée après CHAQUE mutation touchant une
adhésion ou un `capacity` d'élément (create/delete/duplicate élément, add/removeMembership,
deleteZone, deleteConfiguration). Commentaire explicite : la boucle `findMany+update` par config
explosait le budget de latence (chaque round-trip pooler ~200ms-1s), d'où le SQL unique batché.

### Suppression consciente — jamais de silence

`deleteZone` et `deleteElement` partagent le même patron : sans `force=true`, un 409 détaillé
(`describeElements`, `builder-v2.service.ts:501-529`) énumère PAR ÉLÉMENT s'il est mappé Weezevent
(avec le nom de la location) et/ou combien de menu items lui sont assignés. `deleteConfiguration`
applique la même discipline au niveau des adhésions (409 `{orphanCount, orphans}` si des éléments
n'appartiendraient plus à aucune config, avec choix `reassign`/`delete` explicite côté client).
C'est la mise en œuvre du principe §1.2 de `REFONTE_3D_BUILDER_V2.md` : *"la suppression d'un
élément utilisé est un 409 documenté, jamais un silence"* — vérifiée dans le code, pas seulement
dans le plan.

---

## Frontend v1 (historique — SUPPRIMÉ le 2026-07-22) — `components/spaces/views/builder/`

**Ce code n'existe plus.** Il vivait sous `spaces/views/builder/` (`SpaceBuilderViewRoute.vue` +
5 widgets : `FloorListView`, `ElementPaletteView`, `ElevationBuilderView`, `FloorPlanBuilderView`,
`PropertiesPanelView`) et a été retiré une fois confirmé que `builder2` était l'unique parcours
réellement utilisé (voir [ADR-0002](../adr/0002_builder_v2_relationnel_seul.md)). Résumé conservé
pour le contexte historique :

- **Modèle d'édition** : état local (`floors[]`/`forecourt`/`externalMerch`, copie de travail de
  `config.data`) + bouton Save + verrous de sortie (`beforeRouteLeave`/`beforeunload`) tant qu'il y
  avait des changements non sauvés — l'inverse du modèle v2 (autosave, aucun verrou hors file
  d'attente non vide).
- **Synchro multi-config côté client** (`syncConfigurationIdChanges`, `PropertiesPanelView.vue`) :
  cocher/décocher une config déclenchait, par config affectée, un `GET`+matching par nom+type (pas
  par id stable)+`PATCH /configurations/:id` complet — séquencé côté navigateur, non
  transactionnel. **C'est exactement le problème que `ConfigurationElement` (v2) supprime
  mécaniquement** (1 `INSERT`/`DELETE`, jamais de matching par nom) — cette comparaison reste la
  meilleure explication du "pourquoi" du modèle v2 de jointure.
- **Storage lié à des shops + inventaire consolidé** existait déjà en v1 (`element.selectedShops`
  JSON-only + calcul 100% client `buildConsolidatedInventory`) — voir la section dédiée plus bas
  pour la comparaison précise avec le calcul serveur v2.
- Contenait aussi des résidus du portage React (props/callbacks jamais branchés,
  `menuItems`/`inventoryItems` toujours vides) — supprimés avec le reste, plus de risque de
  confusion pour un futur dev puisque le fichier n'existe plus.

---

## Frontend v2 — `components/spaces/views/builder2/`

**Où vit le code** (arborescence complète, vérifiée fichier par fichier) :

```
builder2/
├── BuilderPage.vue                 (14 l.)  shell de route : monte BuilderWorkspace :key="spaceId"
├── BuilderWorkspace.vue            (216 l.) layout 3 volets + raccourcis clavier undo/redo + toasts
├── stores/builderStore.js          (663 l.) ★ SEULE source de vérité — voir section dédiée
├── constants/elementTaxonomy.js    (202 l.) 8 outils + sous-types + couleurs + sectionsForType
├── composables/
│   ├── useBuilderBootstrap.js      (26 l.)  bootstrap au montage + garde beforeunload (file non vide)
│   ├── useMutationQueue.js         (119 l.) autosave : FIFO + coalescing débounce 500ms par clé
│   ├── useHistory.js               (55 l.)  pile undo/redo, pattern Commande, cap 50
│   ├── usePlanInteractions.js      (178 l.) machine à états du plan 2D (idle/drawing/moving/resizing)
│   ├── useIsoProjection.js         (257 l.) projection iso PURE (toIso, boxFaces, zoneOffset…), testable
│   └── svgShapes.js                (36 l.)  rectangle à coins arrondis PAR COIN, utilisé par PlanElement
├── components/
│   ├── BuilderHeader.vue           (288 l.) teleport header : switcher espace, ConfigSelector, statut save, undo/redo
│   ├── ConfigSelector.vue          (185 l.) select config + menu New/Clone/Rename/Delete
│   ├── panels/
│   │   ├── ZonePanel.vue           (340 l.) liste zones (drag&drop reorder), dialogs édition/suppression
│   │   ├── PalettePanel.vue        (160 l.) 8 outils + sous-types
│   │   └── ElementListPanel.vue    (485 l.) liste des éléments de l'outil actif, filtrable par étage/recherche
│   ├── canvas/
│   │   ├── PlanCanvas.vue          (804 l.) SVG 2D complet : rendu + interactions + hole + pan/zoom
│   │   └── PlanElement.vue         (120 l.) un élément du plan (rectangle svgShapes + poignées resize)
│   ├── iso/
│   │   └── IsoView.vue             (741 l.) SVG isométrique (rendu + navigation), fonctions drawBox internes
│   └── inspector/
│       ├── InspectorPanel.vue      (270 l.) switch par type, monte les sections dans l'ORDRE fixe
│       └── sections/
│           ├── SectionCard.vue          accordéon plat générique
│           ├── IdentitySection.vue      SEUL champ : Name (pas d'image/notes/dupliquer/supprimer ici — ces
│           │                            actions sont dans l'en-tête d'InspectorPanel, pas dans une section)
│           ├── SubtypesSection.vue      checkboxes depuis elementTaxonomy
│           ├── StorageShopsSection.vue  ★ storage seulement — voir section dédiée
│           ├── ConfigsSection.vue       chips d'adhésion, 1 clic = 1 POST/DELETE membership
│           ├── UsageSection.vue         badges "Mappé Weezevent" / "N menu items" (config active)
│           ├── UsageBadges.vue          ⚠ MORT (31 l.) — variante compacte des mêmes badges,
│           │                            ZÉRO importeur dans tout le repo (vérifié) : `PlanElement.vue`
│           │                            et `UsageSection.vue` réimplémentent le même rendu inline
│           │                            au lieu de la réutiliser
│           ├── PerformanceSection.vue   PUT .../performance, scopé config active
│           ├── MenuSection.vue          GET /space-menu/shop/:id/items (enabledOnly), lecture seule
│           ├── InventorySection.vue     GET /space-menu/shop/:id/inventory + PUT .../inventory
│           ├── StorageInventorySection.vue ★ storage seulement — voir section dédiée
│           ├── StaffSection.vue         PUT .../staff, scopé config active
│           └── GeometrySection.vue      x/y/width/depth/height3d + cornerRadius + surface/volume calculés
└── dialogs/
    ├── DeleteElementDialog.vue     rend le 409 { reasons } lisible, ?force=true après confirmation
    ├── DeleteZoneDialog.vue        idem pour une zone, liste les éléments bloquants nommés
    ├── DeleteConfigDialog.vue      orphelins nommés + choix reassign/delete
    └── ZoneEditDialog.vue          dimensions, cornerRadius (lié/indépendant), hole (position+dimensions+radius)
```

### `builderStore.js` — la seule source de vérité (composable réactif, pas Vuex ni Pinia)

Vérifié en entier (`stores/builderStore.js`). **Un store par espace**, conservé dans une `Map`
module-level (`getBuilderStore(spaceId)`) — survit au keep-alive (qui n'est de toute façon pas
activé sur cette route, cf. router). État plat et normalisé : `zones{}`, `elements{}` (à plat,
`zoneId` dedans, PAS imbriqués dans leur zone), `configs{}`, `memberships{elementId: [configId]}`,
`usage{elementId: {...}}`.

**Chaque action suit le même patron en 3 temps** (mutation optimiste → commande undo/redo →
requête dans la `MutationQueue`) :
- Les mutations **géométriques** (drag/resize/rotate) sont coalescées par clé (`el:<id>`) et
  débouncées 500ms — seule la DERNIÈRE valeur part au serveur (`useMutationQueue.js:37-53`).
- Les mutations **structurelles** (create/delete/membership/zone/config) partent immédiatement,
  sérialisées en FIFO (jamais deux requêtes concurrentes sur la même entité).
- Retry ×3 avec backoff exponentiel sur erreur réseau/5xx ; les 4xx (dont 409 verrou optimiste) ne
  sont **jamais** retentés — ils remontent tels quels au `onError` de l'appelant.

**Création optimiste d'élément** (`createElementFromDraw`, lignes 309-358) : l'élément apparaît
INSTANTANÉMENT avec un id local `pending-<timestamp>-<random>` et `pending: true` (non
interactif, cf. `PlanElement.vue` : `cursor: progress`, `stroke-dasharray` pointillé), pendant que
la requête part en parallèle ; le vrai id serveur remplace le placeholder à la réponse. **Aucun id
temporaire n'est jamais envoyé au serveur** — le placeholder ne vit que dans le store, exactement
la garantie que `REFONTE_3D_BUILDER_V2.md` §3.2 visait.

**409 sur PATCH élément** (verrou optimiste) : `queueElementPatch` (lignes 259-283) — la réponse du
serveur n'est fusionnée que sur le champ `version` (pas sur la géométrie entière), pour ne pas
écraser un geste local plus récent survenu pendant l'aller-retour réseau (commentaire explicite
dans le code : sans cette précaution, l'élément "sautait en arrière" après chaque déplacement
rapproché). Sur un vrai 409, `bootstrap()` est rappelé pour tout resynchroniser.

### `usePlanInteractions.js` — machine à états du plan 2D

3 modes exclusifs (`idle` → `drawing`/`moving`/`resizing` → `idle`). Pendant un geste, SEULES des
mutations locales sont appliquées (`patchElementLocal`, rendu fluide sans requête) ; le commit
(historique + autosave) part une seule fois au `pointerup`/`mouseup`, en comparant les valeurs
avant/après pour ne rien envoyer si rien n'a changé.

### `useIsoProjection.js` — fonctions pures, mais PAS totalement réutilisées

Extraites de la v1 pour être testables (`toIso`, `boxFaces`, `zoneOffset`, `zoneBaseZ`,
`containElementInZone`) — **mais `IsoView.vue` n'importe que `containElementInZone`** ; le rendu
réel (`drawBox`, `drawRoundedBox`, `drawRotatedBox`, `drawRotatedRoundedBox`, `drawDoughnutFloor`)
est **réimplémenté inline** dans `IsoView.vue` (lignes 556-657), quasi identique mais dupliqué par
rapport à `boxFaces()` du composable. Ce n'est pas un bug fonctionnel (les deux implémentations
produisent le même rendu, vérifié visuellement par la parité de formules), mais c'est une
duplication de code que `useIsoProjection.js` était censé éliminer — à corriger si tu touches à la
projection iso : les deux copies doivent évoluer ensemble tant que ce n'est pas nettoyé.

### Matrice sections × type (`elementTaxonomy.sectionsForType`)

Vérifiée dans le code (`elementTaxonomy.js:160-178`) — c'est elle qui décide quelles sections
`InspectorPanel.vue` monte pour un type donné :

| Type | configs | usage | performance | menu | inventory | storageShops/storageInventory | staff |
|---|---|---|---|---|---|---|---|
| `shop`/`merchshop`/`hospitality` (vendeurs) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| `storage` | — | — | — | — | — | ✅ | — |
| `entrance` | — | — | ✅ | — | — | — | ✅ |
| `kitchen` | ✅ | — | — | — | — | — | ✅ |
| `entertainment` | ✅ | — | — | — | — | — | ✅ |
| `access` | — | — | — | — | — | — | — |

`subtypes`/`geometry`/`identity` sont toujours affichées (sauf `subtypes` si le type n'a pas de
sous-types dans `TOOLS`).

### `[Area]` — la section jamais montée

**Confirmé** : `InspectorPanel.vue:52` (commentaire) liste l'ordre de sections voulu — *"Name → Shop
Type → [Area] → Configuration → Performance → Menu → Inventory → Staff → Position"* — avec `[Area]`
entre crochets. **Aucun composant `AreaSection.vue` n'existe, n'est importé, ni monté** dans
`InspectorPanel.vue` (vérifié : les imports listent Identity/Subtypes/StorageShops/Configs/
Performance/Menu/Inventory/StorageInventory/Staff/Geometry — pas Area). Le champ `SpaceElement.area`
existe en colonne, le DTO v2 l'accepte (`CreateElementDto.area`/`UpdateElementDto.area`), mais RIEN
dans l'UI v2 ne permet de le saisir. Chantier volontairement différé (le commentaire le liste dans
l'ordre prévu), pas un oubli silencieux — mais un vrai vide fonctionnel aujourd'hui : la valeur
`area` d'un élément ne peut être posée que par un import externe ou en héritant de `attributes.area`
v1 (migré tel quel).

### Storage lié à des shops + inventaire consolidé — comparaison précise v1 vs v2

| | v1 (`PropertiesPanelView.vue`) | v2 (`StorageShopsSection.vue` + `StorageInventorySection.vue`) |
|---|---|---|
| Sélection des shops sources | `element.selectedShops` (array JSON-only, aucune colonne dédiée) | `element.attributes.storageShopIds` (array dans le JSON `attributes`, PATCH `{attributes: {...prev, storageShopIds}}` — remplacement intégral côté backend, jamais un merge partiel) |
| Shops proposés | `relatedFBElements` = tous les éléments `type==='shop'` de la config en cours (calcul client depuis `allFBElements`) | shops F&B **et** Merch de la **config active uniquement**, groupés par zone (la zone du storage en premier), visibles = `store.isVisibleInActiveConfig` |
| Calcul de l'inventaire consolidé | 100% **client** : `buildConsolidatedInventory(menuItems locaux de chaque shop, allMenuItemsData)` (`utils/inventoryUtils.js`) | 100% **serveur** : `GET /space-menu/storage-inventory?shopIds=...&configId=...` → agrège les VRAIES `MenuAssignment` activées de chaque shop, résout les ingrédients/packagings/composants + les articles Merch, avec `usedIn` (shop → menu items) |
| Persistance des quantités | `ElementInventory` (v1, scopé au floor/forecourt de la config) | `ElementInventory` (v2, scopé `configId`) — même table, même contrat `PUT /builder-v2/elements/:id/inventory` que `InventorySection.vue` standard |
| Règle merch vs F&B | Non distinguée explicitement dans le v1 (le code lu ne différencie pas les types dans le calcul consolidé) | Distinguée par `isMerch = normalizeType(shop.type) === 'merchshop'` — un merchshop fournit ses ARTICLES (menu items entiers, `kind: 'article'`), un vendeur F&B décompose ses recettes (`kind: 'ingredient'/'packaging'/'component'`) |

**Verdict** : le v2 ne réintroduit rien — il **remplace un calcul client fragile et non scopé par
config** par un calcul serveur sur la vraie source de vérité (MenuAssignment), en gardant la même
finalité produit. Documente ceci si tu dois un jour migrer les données v1 `selectedShops` vers
`attributes.storageShopIds` v2 : ce n'est pas une simple copie de clé, la finalité "shops
disponibles" a changé (config en cours → config active + tous shops visibles dans cette config).

---

## Client API — qui appelle quoi

> Mis à jour 2026-07-22 après le retrait du frontend v1 (voir ADR-0002) : `configuration.api.js`
> ne contient plus que les 2 fonctions ayant un appelant réel ; les 2 fonctions déjà mortes avant
> le retrait (`getAllConfigurations`, `getConfigurationsBySpace`) et les 2 devenues mortes par le
> retrait (`updateConfiguration`, `deleteConfiguration`, dont l'unique appelant était
> `SpaceBuilderViewRoute.vue`) ont été supprimées — l'ancien "piège n°2" ci-dessous est résolu.

| Fichier | Statut | Consommateurs confirmés |
|---|---|---|
| `src/api/endpoints/space.api.js` (402 l.) | **Vivant**, partagé Data Integration + Analyse | `store/modules/spaces.js`, `spaceShops.js`, `spaceConfigurations.js`, `store/modules/analyse.js`, composables `useSpaceMapping.js`/`useShopMapping.js`/`usePredictiveTimeline.js`/`useSpaceData.js`/`useAnalyseTimeline.js`/`useShopPerformance.js`/`useAnalyseItemRecords.js`, wizard Data Integration (`StepMapSpace.vue`, `StepMapShops.vue`, `StepProcessTimeline.vue`), `SpaceMenuView.vue`, drawers menu-fb, `WorkspaceSpaceSwitcher.vue`, `SpaceCreateDrawer.vue`, `SpaceInventoryView.vue` |
| `src/api/endpoints/configuration.api.js` (16 l., réduit de 91) | **Vivant, 2 fonctions seulement** (`getConfiguration`, `createConfiguration`) | `useInventoryData.js` (`getConfiguration`), `StepMapSpace.vue` (`createConfiguration`), `store/modules/analyse.js` (`getConfiguration` via import dynamique) |
| `src/api/endpoints/builder-v2.api.js` (155 l.) | **Vivant, exclusif à builder2** | `stores/builderStore.js` (toutes les fonctions), sections inspecteur (`PerformanceSection.vue`, `StaffSection.vue`, `InventorySection.vue`, `StorageInventorySection.vue` pour les PUT scopés config) |
| `src/api/endpoints/menu.api.js` (fonctions `getShopMenuItems`/`getShopAvailableMenuItems`/`getShopInventory`/`getStorageInventory`) | **Vivant**, partagé Space Menu + builder2 | `MenuSection.vue` (`getShopAvailableMenuItems`), `InventorySection.vue` (`getShopInventory`), `StorageInventorySection.vue` (`getStorageInventory`) — les 3 endpoints backend vivent dans le module **SpaceMenus**, pas Spaces ni BuilderV2 (`space-menus.controller.ts:364-444` pour `storage-inventory`) |
| `src/utils/api.js` (monolithe legacy 45 Ko) | **`getAllMenuItems()` : plus aucun appelant vivant dans ce domaine** depuis le retrait de `PropertiesPanelView.vue` (v1) | Callers restants (`PropertiesPanel.vue`, `SearchResultsPanel.vue`, `ElevationView.vue`, `MenuItemMarginReport.vue` via `MenuBuilder.vue`) sont un cluster de code mort **préexistant, non lié à builder v1** — `MenuBuilder.vue` lui-même n'a aucun importeur repo-wide, confirmé lors de cette passe. Signalé, non nettoyé ici (hors scope du retrait builder v1, voir note de bas de section "Code mort") |

---

## Router & permissions

**Mis à jour 2026-07-22** : la route v1 (`SpaceBuilder`, `/spaces/:spaceId/builder`) a été retirée
de `router/index.js`. Une seule route reste :

```js
{ name: 'SpaceBuilder2', path: '/spaces/:spaceId/builder2', meta: { title: 'Builder v2', permission: 'space.edit' } }
```

Pas de `keepAlive` (jamais nécessaire : l'autosave signifie qu'il n'y a jamais d'état local "en
attente" à préserver au-delà de la file d'attente, gérée par son propre `beforeunload`). L'ancien
risque "même permission sur deux routes v1/v2 sans flag de rollout" est résolu par construction :
il n'y a plus qu'une route.

---

## Relation avec Data Integration (`/data-integration/fb`)

Le wizard (étape 2, `StepMapShops.vue`/`StepMapSpace.vue`) mappe les locations Weezevent vers des
`SpaceElement` ("shops"). Points de contrat vérifiés dans le code (déjà détaillés plus haut,
récapitulé ici) :

- `resolveTargetConfig` (backend, partagé v1/v2) : config explicite → config utilisateur la plus
  ancienne → **400** si aucune. Jamais de config "Weezevent Import" auto-créée pour ce flux.
- `quickCreateElement`/`bulkQuickCreateAndMap` : écrivent exclusivement en v2 (Zone RDC +
  `ConfigurationElement`), quel que soit l'état de l'espace.
- `assignElementsToFloorLevel`/`Forecourt`/`ExternalMerch` : v2 si l'espace a déjà une Zone, sinon
  v1 legacy (bascule silencieuse au premier `quick-element` de l'espace, cf. piège plus haut).
- `getSpaceShops`/`GET /spaces/:id/shops` : UNION des 4 branches (floor/forecourt/externalMerch/
  zone) — un seul contrat de réponse pour StepMapShops quel que soit le système sous-jacent.
- Suppression d'un mapping côté wizard → `deleteElementIfUnreferenced` (`spaces.service.ts:3634-
  3703`) : si plus aucun mapping ne référence l'élément, il est supprimé — nettoyage du JSON v1
  ET suppression directe si `zoneId` (v2, pas de JSON à nettoyer).

---

## Relation avec Space Menu (`/space-menus`)

- L'unité d'accrochage des menus reste **le `SpaceElement`** (`MenuAssignment.elementId`), scopé
  `configId` — voir `04_MENU_CATALOGUE.md` pour le détail complet du modèle et de son historique
  de bug (fuite entre configs, corrigée par la contrainte `@@unique([elementId, menuItemId,
  configId])`).
- `MenuSection.vue`/`InventorySection.vue` (builder2) lisent/écrivent via les endpoints Space Menu
  **existants** (`GET /space-menu/shop/:id/items`, `GET /space-menu/shop/:id/inventory`, `PUT
  /builder-v2/elements/:id/inventory`) — décision explicite du plan v2 (§0 point 5 : "le menu d'un
  shop = MenuAssignment, point" ; pas de doublon JSON côté élément). Vérifiée dans le code : aucun
  champ `menuItems` n'existe plus sur un élément v2.
  **v1 confirme la double comptabilité** : `PropertiesPanelView.vue` garde un JSON local
  `element.menuItems` (tableau `{id, quantity}` propre à CET élément, alimenté par
  `api.getAllMenuItems()` via `utils/api.js` pour le catalogue de recherche — lignes 1277, 1381,
  1511-1524) et le persiste par le même mécanisme `onUpdate({ menuItems })` que `selectedShops`
  (JSON `Config.data` ; `reconcileElement` ne le mappe à AUCUNE colonne relationnelle ni à
  `MenuAssignment`). Ce JSON local n'est **jamais** lu ni écrit par `saveConfiguration` au-delà du
  blob JSON réconcilié — il n'existe donc **aucun pont automatique** entre "le menu affiché dans le
  builder v1" et "le menu réel qui pilote Space Menu et les ventes" (`MenuAssignment`) : les deux
  peuvent diverger silencieusement, rien dans le code lu ne les réconcilie. C'est précisément ce
  que le v2 corrige en supprimant ce JSON local au profit d'une lecture/écriture directe de
  `MenuAssignment`.
- `GET /space-menu/storage-inventory` (module SpaceMenus, PAS BuilderV2) alimente exclusivement
  `StorageInventorySection.vue` — seul point de couplage direct entre les deux domaines qui vit
  physiquement dans le module SpaceMenus plutôt que Spaces/BuilderV2.

---

## Récapitulatif — bugs actifs et risques confirmés (2026-07-15, mis à jour 2026-07-22)

| # | Sujet | Détail | Fichiers |
|---|---|---|---|
| 1 | ~~Pas de flag de rollout par tenant~~ — **résolu par le retrait du frontend v1** | Une seule route (`builder2`) reste montée ; plus de risque de confusion UI entre deux builders | `router/index.js` |
| 2 | **`PATCH /configurations/:id` (v1) = upsert** — toujours vrai côté backend, plus de caller frontend connu | Un id inexistant CRÉE la config au lieu de renvoyer 404 — contraste volontaire avec v2 (`PATCH /builder-v2/configurations/:id` = 404 stricte). Route conservée (décision humaine à prendre, voir ADR-0002) malgré l'absence de caller frontend identifié | `spaces.controller.ts` (`updateConfiguration`), `spaces.service.ts:1508` (`saveConfiguration` → `config.upsert`) |
| 3 | ~~Synchro cross-config v1 non transactionnelle~~ — **résolu par le retrait du frontend v1** | `syncConfigurationIdChanges` vivait dans `PropertiesPanelView.vue`, supprimé — plus aucun code client ne déclenche ce chemin | (fichier supprimé) |
| 4 | **Bascule silencieuse v1→v2 au 1ᵉʳ `assign-floor`** | Un espace "v1 pur" peut se retrouver à router SES assignations suivantes en v2 dès qu'une seule Zone existe (ex. créée par un `quick-element` antérieur) — invisible pour l'utilisateur, source possible de confusion en debug ("pourquoi ce shop est en Zone alors que je n'ai jamais ouvert builder2 ?"). Toujours d'actualité : ce mécanisme est backend, indépendant du retrait de l'UI v1 | `spaces.service.ts:2973` (`spaceHasZones`) |
| 5 | **`useIsoProjection.js` dupliqué dans `IsoView.vue`** | Les fonctions de dessin (`drawBox` et consorts) sont réimplémentées inline dans `IsoView.vue` au lieu de réutiliser `boxFaces()` du composable — deux copies à maintenir en parallèle. Sans rapport avec builder v1 (composable builder2) | `IsoView.vue:556-657` vs `useIsoProjection.js:120-194` |
| 6 | ~~Props morts hérités du port React (v1)~~ — **résolu par le retrait du frontend v1** | Les fichiers qui les portaient (`SpaceBuilderViewRoute.vue`, `PropertiesPanelView.vue`, `ElevationBuilderView.vue`) sont supprimés | (fichiers supprimés) |

---

## Code mort de ce domaine (preuve : zéro référence externe trouvée)

> **Mis à jour 2026-07-22** : l'entrée `configuration.api.js` ci-dessous a été supprimée pour de
> bon (voir section Client API plus haut). Une nouvelle entrée a été repérée pendant cette passe
> (`utils/api.js: getAllMenuItems()`, cf. Client API) — non nettoyée ici, hors scope du retrait
> builder v1.

- **`src/components/PropertiesPanel.vue`, `SearchResultsPanel.vue`, `ElevationView.vue`** (racine
  de `src/components/`) — **différents** de leurs homonymes vivants sous
  `components/spaces/views/builder/widgets/` (`PropertiesPanelView.vue`, `ElevationBuilderView.vue`)
  et de `SearchResultsPanel` (v1 n'en a pas d'équivalent monté). Preuve : recherche exhaustive de
  chacun des trois noms dans tout `datafriday-web/src` — la SEULE référence externe pour les trois
  est `src/components/appCopy.vue`, lui-même jamais importé nulle part (`grep -rl "appCopy"` sur
  tout `src/` : zéro résultat en dehors du fichier lui-même) et non routé (absent de
  `router/index.js`). Chaîne de code mort complète : `appCopy.vue` (mort) → référence ces 3
  fichiers (morts par transitivité).
- **`builder2/components/inspector/sections/UsageBadges.vue`** (31 lignes) — composant écrit pour
  factoriser le badge "⚡ mappé Weezevent / 🍔 N menu items", mais **zéro importeur** dans tout le
  repo (`grep -rl "UsageBadges" datafriday-web/src` : aucun résultat en dehors du fichier
  lui-même). `PlanElement.vue` (badges inline sur le plan 2D, lignes 28-35) et `UsageSection.vue`
  (chips de l'inspecteur) réimplémentent chacun le même rendu indépendamment au lieu de le
  réutiliser — code mort by design, pas un oubli de câblage ponctuel.
- **`SpaceElement.tags`** (colonne DB) — sérialisée côté backend v1 (`reconcileElement`/
  `transformElement`), **absente des DTO v2** (`CreateElementDto`/`UpdateElementDto` ne l'exposent
  pas du tout) et zéro UI dans les deux versions (recherche exhaustive : aucune occurrence de
  `tags` dans `components/spaces/views/builder/` ni `builder2/`).
- **`SpaceElement.notes`** (colonne DB) — contrairement à `tags`, ENCORE exposée dans les DTO v2 et
  dans l'endpoint de compat v1 `PATCH /configurations/elements/:elementId`, mais **zéro composant
  front (v1 ou v2) ne la lit ni ne l'écrit** — un tuyau backend complet, jamais branché à un
  écran. Statut différent de `tags` (celui-ci pourrait être branché sans aucun travail backend), à
  garder en tête si "ajouter des notes à un shop" remonte comme besoin.

---

## Zones grises restantes (points réellement non tranchés, pas des angles morts)

Chaque point ci-dessous a été activement vérifié dans le code ; ce sont des décisions produit non
encore prises, pas des questions laissées sans réponse.

- **Géométrie unique par élément, partagée entre toutes ses configs membres** (v1 ET v2) : le
  modèle registre/placement du prototype React (une géométrie différente par config pour un même
  élément physique) n'a d'équivalent dans aucune des deux versions actuelles. Décision à prendre :
  la limite est-elle acceptée définitivement, ou faut-il un jour introduire une géométrie
  par-couple-(élément, config) — ce qui casserait l'hypothèse actuelle "un élément = une seule
  ligne `x/y/rotation`" dans les deux backends et forcerait à revoir `PlanCanvas.vue`/`IsoView.vue`
  (qui lisent directement `element.x`/`.y` sans jamais consulter la config active pour la
  géométrie, seulement pour la VISIBILITÉ).
- **`SpaceElement.area` — RÉGRESSION confirmée entre v1 et v2, pas une simple lacune.** v1
  (`PropertiesPanelView.vue:184-204`) a une UI **fonctionnelle** : un champ texte libre "Zone" avec
  autocomplétion (`<datalist>` alimentée par `availableAreas`, la liste des valeurs déjà utilisées
  dans la config, computed `SpaceBuilderViewRoute.vue:787-799`), visible seulement pour
  `element.type` ∈ `{shop, entertainment, kitchen}` (pas tous les types), qui écrit dans
  `attributes.area` (`handleUpdateArea`, ligne 1469-1473 : `onUpdate({ area: value, attributes:
  {...attributes, area: value} })` — persistée via `attributes` puisque `reconcileElement` (v1)
  n'a pas de mapping relationnel dédié pour `area`, seulement pour `attributes`). **v2 a la colonne
  dédiée `SpaceElement.area` + le DTO prêts de bout en bout** (`CreateElementDto.area`/
  `UpdateElementDto.area`, `builder-v2.service.ts` lit/écrit `dto.area`), **mais zéro UI** —
  `InspectorPanel.vue:52` liste `[Area]` entre crochets dans l'ordre de sections prévu, aucun
  composant `AreaSection.vue` n'existe ni n'est importé. Un espace migré de v1 vers v2 perdrait
  donc, dans les faits, la possibilité d'éditer sa zone d'implantation depuis le builder (la valeur
  resterait lisible côté analytique via la colonne promue, mais plus modifiable). Décision à
  prendre : porter le champ "Zone" (texte + datalist) dans `IdentitySection.vue` ou une nouvelle
  section v2, ou accepter la régression le temps de la transition ; au-delà, matérialiser une vraie
  table `Area` référentielle (avec couleur, comme le prototype React) reste une option non tranchée.
- **`SpaceElement.capacity`** : sommé côté client (v1) et recalculé côté serveur par SQL (v2), mais
  **aucune UI dans aucune des deux versions** ne permet de saisir la capacité d'un élément
  individuel — la valeur ne peut être posée que par une voie externe au builder (import, appel API
  direct). Décision à prendre : ajouter un champ de saisie (a priori dans `GeometrySection.vue` v2
  et la section Position v1), ou documenter explicitement que ce champ est réservé à un usage
  hors-builder.
- **`SpaceElement.notes`** : backend complet, zéro UI — décision à prendre : ajouter un champ dans
  `IdentitySection.vue` (v2) à côté de `name`, ou retirer le champ des DTO si le besoin ne se
  présente jamais.
- **`Config.data` (JSON v1) non supprimée malgré la v2** : `REFONTE_3D_BUILDER_V2.md` prévoyait sa
  suppression en phase P4 après "≥ 2 semaines sans écart" de dual-read/dual-write — cette phase
  n'a jamais été franchie (le champ est toujours actif, toujours réécrit à chaque save v1). Pas de
  date ni de critère de décision documenté pour la déclencher.
- **`Station`/`MenuAssignment.stationId`** : legacy dormant, explicitement "hors périmètre" du plan
  v2. Vérifié par recherche exhaustive (`grep -rn "stationId|Station" api-datafriday-staging/src/features/`,
  hors specs) : **aucun controller ni service ne crée ou ne met à jour de `Station`** — la SEULE
  occurrence vivante dans tout le backend est une lecture défensive
  (`menu-items.service.ts:98` : `assignment.station?.config?.spaceId`, un repli pour résoudre le
  `spaceId` d'un `MenuAssignment` scopé par `stationId` plutôt que par `elementId`). Le modèle
  `Station` est donc bien mort en écriture (plus aucun chemin ne le crée), simplement toléré en
  lecture pour ne pas casser d'éventuelles données anciennes. Décision non prise : purger ce repli
  et la table une fois confirmé qu'aucun tenant n'a plus de `MenuAssignment.stationId` non-null.
