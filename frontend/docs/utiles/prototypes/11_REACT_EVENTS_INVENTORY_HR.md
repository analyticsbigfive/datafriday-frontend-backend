# Rapport de confrontation — React legacy vs docs actuelles (Events/Taxonomies, Inventaire, Staff/HR)

> Docs de référence : `DESIGN_TEAMS_SPORT_EVENTS.md`, `GUIDE_PARCOURS_APP.md`,
> `PEPITES_EXTRAITES.md` §2.1, `04_SPACES_EVENTS_MAPPINGS.md` (confrontation du backend KV pour
> events/teams).
>
> Fichiers analysés en entier ou par grep ciblé + lecture : `EventsView.tsx`,
> `EventCategoriesView.tsx`, `EventSubcategoriesView.tsx`, `EventTypesView.tsx`,
> `EventDetailsEditor.tsx`, `SpaceInventory.tsx`, `InventoryView.tsx`, `InventoryLibrary.tsx`,
> `InventoryCountingInterface.tsx`, `InventoryAggregateView.tsx` (non listé initialement mais
> indispensable, trouvé et lu), `HRSuppliersView.tsx`, `StaffPositionsView.tsx`,
> `SettingsMenu.tsx`, `utils/inventoryUtils.ts`, `utils/hrApi.ts`. Chemins sous
> `datafriday-web/old/versionReact/src/app/`.

## 1. Correspondances confirmées

**Inventaire**
- `MAX_DEPTH = 10` confirmé à deux endroits indépendants : `utils/inventoryUtils.ts:16`
  (`expandInventoryItems`) et `:170` (`getAllComponentsAndIngredients`).
- Filtres storage `dry/cold/belowzero/material/merch` : signature exacte à
  `inventoryUtils.ts:712` (`buildStorageInventory(storageElementTypes: ('dry'|'cold'|
  'belowzero'|'material'|'merch')[]...)`), consommée par `SpaceInventory.tsx:313-314` via
  `element.storageType`.
- Packaging non hérité des combos, mais inclus si direct : confirmé littéralement
  (`inventoryUtils.ts:180-196` skip explicite pendant l'expansion récursive, `:437-473` ajout
  direct si présent sur l'item lui-même).
- **`totalUnits = packedUnits × (inventoryQuantityPackaged || 1) + looseUnits`** : la formule
  EXACTE n'existe que dans deux endroits — `InventoryCountingInterface.tsx:165` (affichage live)
  et `InventoryAggregateView.tsx:65` (vue agrégée). Voir divergence ci-dessous : **ce n'est PAS
  appliqué partout comme l'affirme PEPITES_EXTRAITES.md §2.1**.

**Teams / homeTeam / visitingTeam**
- Le gating cible unifié du design doc (« isSportType OU EventCategory.hasHomeTeam ») **existait
  déjà mot pour mot** dans le prototype React, à `EventsView.tsx:1616-1618` et `:1629-1631` :
  `((eventCategoryId && getCategoryHasHomeTeam(...)) || (eventTypeId && isSportType(...)))`.
  `getCategoryHasHomeTeam` (`:414-416`) lit `EventCategory.hasHomeTeam`, `isSportType`
  (`:424-427`) compare `type.name === 'Sport'`.
- `EventCategory.hasHomeTeam` confirmé champ optionnel identique dans
  `EventCategoriesView.tsx:39` (CRUD complet avec filtre dédié, export/import CSV).
- Hiérarchie Type→Category→Subcategory confirmée strictement 1-N à chaque niveau
  (`EventSubcategoriesView.tsx:40-44`, `EventCategoriesView.tsx:35-40`).

## 2. Divergences

- **`EventDetailsEditor.tsx` (utilisé par `EventPredictView.tsx`, confirmé par grep) ne gate QUE
  sur `isSportType`** (`:150`, `:330` `{isSportType && (...)}`), sans le fallback `hasHomeTeam`.
  Contrairement à `EventsView.tsx` qui a le OR complet. Ça confirme que l'incohérence entre les
  deux éditeurs pointée par DESIGN_TEAMS_SPORT_EVENTS.md §3 n'est **pas** née pendant le portage
  Vue : elle préexistait déjà dans le split original en deux fichiers React.
- **`homeTeam` du Space comme pré-remplissage, pas comme source unique** : `EventsView.tsx:1363-1367`
  — au changement de Space dans le formulaire event, `selectedSpace.homeTeam` est copié dans
  `editingEvent.homeTeamName` (défaut éditable), qui devient ensuite le champ persistant de
  l'Event. Nuance non capturée par le rapport KV (`04_SPACES_EVENTS_MAPPINGS.md`) ni par le design
  doc : le Space garde un rôle de *défaut suggéré*, l'Event reste la source persistée.
- **Formule d'inventaire NON appliquée partout**, contrairement à PEPITES_EXTRAITES.md §2.1 :
  - `InventoryCountingInterface.tsx:112` (sauvegarde `handleToggleCounted`, dans le MÊME fichier
    que l'affichage correct à `:165`) utilise `count.packedUnits + count.looseUnits` — sans le
    multiplicateur.
  - `SpaceInventory.tsx:781` (`saveInventoryToDatabase`, l'écriture DB réelle) et `:883` (badge
    mini par item) : même formule additive erronée.
  - `InventoryView.tsx` — vue parallèle toujours câblée (`App.tsx` `showInventoryView`, aussi
    montée dans `AnalyseView.tsx:10734`) — a la formule additive fausse aux 4 occurrences
    (`:151`, `:206`, `:264`, `:789`), à l'affichage ET à la sauvegarde.
  - Seuls `InventoryCountingInterface.tsx:165` et `InventoryAggregateView.tsx:65` ont la formule
    correcte.
  **⚠️ À vérifier d'urgence côté Vue actuel : la bonne formule a-t-elle remplacé la mauvaise
  partout, ou seulement à certains endroits comme dans le prototype ?**
- **Filtre storage `material` mort dans les faits** : `getItemStorageTypes`
  (`inventoryUtils.ts:743-766`) a un type de retour `('dry'|'cold'|'belowzero')[]` — il ne renvoie
  jamais `'material'`. Un composant packaging (`storageType==='material'`) qui n'est pas
  explicitement `Dry/Cold/Freezer` retombe silencieusement dans `'dry'` (fallback `:765`). Un
  Storage scopé uniquement `['material']` n'affichera donc jamais rien via `buildStorageInventory`.
- **Filtre storage `merch` non filtrant** : `SpaceInventory.tsx:320` appelle
  `buildMerchStorageInventory(allMerchElements)` **sans condition** sur `element.storageType` —
  chaque Storage element affiche donc systématiquement tout le merch de tous les merch shops, que
  `'merch'` figure ou non dans son `storageType`.

## 3. Pépites nouvelles (staff/HR notamment)

- **Le module HR entier (`hrApi.ts`) est du localStorage pur** — aucun appel réseau,
  contrairement à `eventApi` (make-server KV). Zéro persistance multi-device/multi-tenant. Rien
  de réutilisable côté backend : seule la forme des données (HRSupplier, StaffPosition,
  PositionName) a valeur de référence.
- **Deux domaines « Suppliers » disjoints** coexistent, atteints par deux sous-menus Settings
  différents (`SettingsMenu.tsx:321` « Edit F&B Menu → Suppliers » vs `:525` « Edit HR → HR
  Suppliers ») : fournisseurs d'ingrédients (Market Price) vs agences de staffing
  (`hrApi.HRSupplier{spaceIds[],configurationIds[],sectors[]}`, convention `length===total` pour
  « All »).
- **Taxonomie sectorielle HR incompatible avec les types FBElement** :
  `SECTORS = ['F&B','Hospitality','Merch','Ticketing','Access','Kitchen','Entertainment']`
  (`HRSuppliersView.tsx:26`, `StaffPositionsView.tsx:25`) vs FBElement types
  `shop·storage·kitchen·entrance·hospitality·merchshop·access·entertainment`
  (GUIDE_PARCOURS_APP.md). Pas de correspondance directe (`F&B` généraliste vs shop/storage
  séparés, `Ticketing` sans équivalent FBElement, `entrance`/`storage` sans équivalent sector).
- **Le lien « staffPositions FBElement → coût staff Analyse » affirmé par GUIDE_PARCOURS_APP.md
  §12 n'existe pas dans ce code.** `FBElement.staffPositions` (`App.tsx:64-68`) =
  `{id, position: string libre, count: number}`, édité dans `PropertiesPanel.tsx` — aucun champ
  tarif, aucun `supplierId`, zéro import de `hrApi` en dehors des deux vues HR et de `hrApi.ts`
  lui-même (vérifié par grep global). **Si ce lien existe aujourd'hui côté Vue, il a été
  reconstruit de zéro, pas porté.**
- **Aucune validation sur les champs marqués obligatoires** :
  `HRSuppliersView.handleSaveSupplier` (`:93-114`) et `StaffPositionsView.handleSavePosition`
  (`:80-101`) ne vérifient rien avant sauvegarde malgré les `*` UI
  (Name/Spaces/Configurations/Sectors, Supplier/Sector/PositionName/Rate) — contrairement à
  `EventCategoriesView.handleSaveCategory` qui garde bien `!name.trim()`.
- **Auto-heal destructif silencieux** : `EventCategoriesView.tsx:86-159`
  (`removeDuplicateCategories`) tourne à CHAQUE chargement de la page, détecte les doublons
  `name+eventTypeId`, et **supprime** automatiquement via l'API tous sauf un (le référencé par un
  event, sinon le premier) — sans confirmation utilisateur, juste un toast a posteriori.
- **Outil de diagnostic orphelins non documenté** : `EventTypesView.tsx`
  (`analyzeEventTypes`/`deleteOrphanedEventTypes` de `utils/eventTypeDiagnostics`, `:57-64`,
  `:108-125`) — badge + bouton « Clean Up N Orphans » pour les EventType sans catégorie ni event.
  Fait écho au pattern diagnose→migrate→cleanup déjà valorisé dans le rapport KV.
- **`Team.subcategory` stocke en réalité un ID, pas un nom** : `EventsView.tsx:1639-1641` copie
  `editingEvent.eventSubcategoryId` (un UUID) dans le champ `Team.subcategory: string` lors de la
  création inline — `getFilteredTeams` (`:407-411`) compare ensuite ID à ID sous un nom de champ
  trompeur.
- **Pattern CSV find-or-create en cascade dupliqué verbatim** dans les 3 vues Event référentiels +
  HR (mêmes ~70 lignes de parseur CSV comma/semicolon copiées-collées à chaque fichier) : import
  d'une Subcategory crée à la volée Type/Category manquants par match nom insensible à la casse,
  avec comptage doublons silencieux.
- **`InventoryLibrary.tsx` n'a rien à voir avec l'inventaire de stock** : c'est un picker
  d'ingrédients (Market Price) pour construire des Components/MenuItems (`ComponentEditor`,
  `AddEditComponent`, `AddEditMenuItem`...), avec une taxonomie française hardcodée en JSX
  (`:205-242`, ~29 catégories Aliments/Boissons) — nom source de confusion avec
  `SpaceInventory`/`InventoryView`.

## 4. Mort / hors-sujet

- `hrApi.ts` (localStorage pur) : aucune valeur de portage backend, uniquement la forme des
  données.
- `InventoryView.tsx` : semble être le prédécesseur/doublon de `SpaceInventory.tsx` +
  `InventoryCountingInterface.tsx` + `InventoryAggregateView.tsx` — réimplémente la même UI de
  comptage en plus simple, avec le bug de formule en plus. Toujours câblé (`App.tsx`,
  `AnalyseView.tsx:10734`) donc pas « mort » au sens usage, mais redondant/dépassé — ne pas s'en
  servir comme référence de portage, préférer `SpaceInventory.tsx` (hors bug de sauvegarde).
- Taxonomie française hardcodée d'`InventoryLibrary.tsx` : fixture statique du mockup Figma Make,
  sans valeur de portage littéral.
