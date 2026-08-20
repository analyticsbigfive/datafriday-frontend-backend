# Pre/Post-event Inventory — les écrans d'inventaire et leurs ponts inter-modules

> Domaine cartographie : **Stock** (sous-ensemble : les écrans d'inventaire et ce qui les relie aux
> autres modules). Owner produit : Jean-Luc. Rédaction : **JLH**, 2026-07-20.
> Écrans : `/spaces/:spaceId/inventory` (Post-event) et `/spaces/:spaceId/pre-inventory`
> (Pre-event, § 8).
>
> Établi le 2026-07-20 sur la branche `feat/postEventInventory`, chaque affirmation vérifiée en
> ouvrant le fichier cité (`fichier:ligne`), conformément à la méthode du dossier
> ([00_INDEX.md](00_INDEX.md)). Cette page est **complémentaire** de
> [06_STOCK_INVENTAIRE.md](06_STOCK_INVENTAIRE.md) (le domaine Stock entier : modèles, pièges,
> formules) : elle ne duplique pas les modèles — elle documente **l'écran** et **ses interactions
> avec les autres modules**, ce que 06 ne couvre que par fragments.
>
> La dernière section documente la **réconciliation post-événement**, implémentée le 2026-07-20
> sur la même branche (spec Figma du même jour).
>
> **Mise à jour 2026-07-20 (2ᵉ passe)** : vérification complète de la logique contre la spec
> métier (§ 9), exemple live Auxerre (§ 10), bug [222](../bugs/222_inventory_reconciliation_fallback_plus_vieux_match.md)
> découvert et corrigé au passage.
>
> **Mise à jour 2026-07-24 (§ 13)** : vérification d'implémentation du brief produit contre le code
> réel (front + backend) — brief conforme, **5 écarts nouveaux** fichés
> ([237](../bugs/237_post_event_prerempli_par_comptage_pre_event.md) à
> [241](../bugs/241_getpreeventinventory_repli_legacy_hors_event.md)) **et corrigés le jour même**
> (backend 41/41, front 478 verts). Déploiement conjoint requis : § 13.4.

---

## 1. Vue d'ensemble

| | |
|---|---|
| Route | `/spaces/:spaceId/inventory`, name `space-inventory`, `keepAlive: true` ([router/index.js:169-175](../../src/router/index.js)) |
| Permission | `front.fb.spaceInventory` (route meta + les deux contrôleurs backend `inventory`/`inventory-counts`, [inventory.controller.ts:23](../../../backend/src/features/inventory/inventory.controller.ts)) |
| Composant | `views/SpaceInventoryView.vue` (~2774 l.) |
| Rôle | Compter le stock réel (packed/loose) par PdV et par storage, pour un **événement donné** ; sauvegarder un snapshot ; enchaîner sur le Réarmement |

Arbre de montage réel, composants morts inclus : voir
[06_STOCK_INVENTAIRE.md § « Écran Inventory — arbre de montage réel »](06_STOCK_INVENTAIRE.md)
(`InventoryAggregateView`, `InventoryStorageAggregateView`, `InventoryCountingInterface` ×2,
`InventoryFilterPanel` — seuls vivants ; `InventoryFilterDrawer` et `InventoryMenuCoverageDrawer`
montés mais inatteignables). S'y ajoute le dropdown Tools :
`TOOLBOX_ITEMS` ([SpaceInventoryView.vue:633](../../src/views/SpaceInventoryView.vue)) — mêmes
entrées que les toolbox d'Event Predict / Restock / Logistic, navigation par `navigateToTool()`
(:1621) qui **propage l'event courant** en query (`?event=`) vers Réarmement et Logistic.

⚠️ Ne pas confondre avec `components/InventoryView.vue` — **orphelin total** (0 importeur, seule
occurrence de la formule d'inventaire fautive), documenté dans 06 § Code mort.

---

## 2. Résolution du contexte événement — à quel event l'inventaire est-il rattaché ?

Tout l'écran est event-scopé : les comptages sont chargés/sauvés par couple `(spaceId, eventId)`.
La résolution vit dans `resolveEventContext()`
([SpaceInventoryView.vue:1265-1305](../../src/views/SpaceInventoryView.vue)) :

1. **URL d'abord** : `?event=`/`?eventId=` (posé par Event Predict, Analyse, ou un partage de
   lien) ; config préférée `?configuration=`/`?config=`, repli `event.configurationId`. L'URL ne
   gagne que si l'id existe dans le store. ⚠️ Depuis le durcissement du 2026-07-24 (§ 12.4) :
   en mode **pre**, tout `?event=` est ignoré (prochain futur strict recalculé) ; en mode
   **post**, un `?event=` FUTUR est ignoré (seul un passé explicite est respecté).
2. **Entrée directe** (sidebar, URL nue) : mode **post** → **dernier event FINI** (`past[0]`,
   aucun repli futur) ; mode **pre** → **prochain event futur strict** (aucun repli passé).
   Premier dont la config est résoluble. L'URL est resynchronisée (`router.replace`) pour
   rester partageable. (Avant le 2026-07-24 : futur d'abord pour les deux modes — source du
   décalage comptage/réconciliation, § 11.3 clos.)
3. Aucun event résoluble → état « Aucun évènement sélectionné » (save désactivé).

**Affichage du contexte (2026-08-04, JLH)** : l'événement d'ancrage est désormais **visible** dans
le bandeau rouge `.si-band-title` — nom du match, date localisée (`intlLocale`, jamais `fr-FR` en
dur, cf. BUG-240) et règle d'ancrage (« Dernier match terminé » / « Prochain match »). Lecture
seule : pas de sélecteur (règle owner « un match = un eventId, aucune bascule silencieuse », § 12.4) —
le but est de rendre la bascule *visible*, pas de la permettre. Implémentation :
`contextEventId` posé par `loadForSpace()` (distinct de `selectedEventId`, le filtre de comptage
que le drawer mobile peut mettre à `null`), computeds `contextEvent*` et util pur
[`utils/inventoryEventContext.js`](../../src/utils/inventoryEventContext.js)
(`describeAnchorEvent` normalise `name|eventName` / `date|eventDate` ; `pickAnchorEvent` porte la
règle futur/passé strict, testé dans `tests/unit/inventoryEventContext.spec.js`). Quand le filtre
mobile est sur « Indépendant d'un évènement », une puce `invContextCountsIndependent` signale que
les comptages partent sans eventId alors que la page reste ancrée. Espace sans match passé (mode
post) → `invContextNoPastEvent` ; sans match futur (mode pre) → `preInvNoUpcoming`.

**Point d'attention pour la réconciliation post-event** : ce défaut ancre sur le *futur* d'abord.
Le résolveur « dernier event passé » existe déjà dans le store —
`inventory/resolveLastPastEvent` ([store/modules/inventory.js:319-341](../../src/store/modules/inventory.js)) :
filtre les events du store `analyse` par space, garde `date <= now`, trie décroissant. **Action
actuellement morte** : aucun dispatch dans tout `src/` (grep exhaustif 2026-07-20, seule
occurrence = sa définition). La feature réconciliation la ravive telle quelle plutôt que de
réécrire un résolveur.

---

## 3. Données et persistance — qui écrit quoi, quand

Détail des modèles (champs, pièges, priority-merge) : 06 §§ InventorySnapshot / InventoryCount.
Ici, le **flux vu de l'écran** :

```
   saisie stepper/case         bouton « Enregistrer » (invSave)
        │                                │
        ▼                                ▼
  inventory/upsertCount            inventory/saveInventory
  (store/modules/inventory.js:168) (store/modules/inventory.js:219)
        │ optimiste + fire-and-forget    │ awaité (échec → toast, pas de nav)
        ▼                                ▼
  POST /inventory-counts           POST /inventory        [démo : localStorage
  (1 ligne space×event×shop×item)  (snapshot append-only)  analyse:space-inventory-counts:*]
        └──────────────┬─────────────────┘
                       ▼
     GET /inventory/:spaceId/:eventId — fusion, InventoryCount PRIORITAIRE,
     jamais 404 ({inventoryCounts:{}} à vide) — inventory.service.ts:16-65,
     blob reconstruit par buildInventoryCounts (lignes shopId=null skippées)
```

- Store : state `{ inventoryCounts: {[shopId]:{[itemId]:count}}, currentSpaceId, currentEventId,
  lastEvent, … }` ([inventory.js:39-52](../../src/store/modules/inventory.js)) ; `loadInventory`
  dédupliqué par clé `spaceId::eventId` (in-flight partagé, :103-107).
- Client API : [inventory.api.js](../../src/api/endpoints/inventory.api.js) — `getInventory`,
  `getLatestInventory`, `saveInventory`, `saveInventoryCount`, `getAllPackagingTypes` (toutes
  vivantes, cf. 06 § Client API).
- Formule d'affichage `totalUnits = packedUnits × (inventoryQuantityPackaged || 1) + looseUnits` :
  canonique partout, **jamais persistée** côté backend — voir 06 § Formule (référence
  `useInventoryCounts.js:19-20` ; implémentation locale de l'écran `totalForItem`,
  [SpaceInventoryView.vue:1425](../../src/views/SpaceInventoryView.vue)).
- Sauvegarde (`onSaveAll`, [SpaceInventoryView.vue:1622-1652](../../src/views/SpaceInventoryView.vue)) :
  garde **douce** si comptage incomplet (dialog de confirmation, jamais bloquant) → dispatch
  `saveInventory` → **génération du document de réconciliation** puis ouverture de sa vue (§ 7).
  ⚠️ Historique : jusqu'au 2026-07-20 la sauvegarde naviguait automatiquement vers le Réarmement
  step Stock (décision user 2026-07-06) — remplacé par la spec Post-event Inventory ; le
  Réarmement reste accessible par le dropdown Tools.

---

## 4. Interactions avec les autres modules

### 4.1 Réarmement (SpaceRestockView) — le consommateur principal

- **Unique source de « stock existant » du Réarmement** = les comptages Inventory, lus par
  `apiGetInventory`/`apiGetLatestInventory` (import [SpaceRestockView.vue:1037](../../src/views/SpaceRestockView.vue)) —
  piège n°1 de 06 : le ledger Logistic n'y participe **jamais**.
- **Quantités prédites** (objectif de stock) : le Réarmement lit les `predictedRecords` du pont
  localStorage `datafriday:predicted-records:{spaceId}:{eventId}:{versionId}`
  ([localDb.js:98-110](../../src/data/localDb.js)) écrit par Event Predict, avec repli
  « meilleure version non vide » `getAnyPredictedRecords` (:120) — lectures
  [SpaceRestockView.vue:2271-2289](../../src/views/SpaceRestockView.vue). Repli ultime : recompute
  depuis les ventes d'un event de référence (`aggregateSalesToPredictedRecords`,
  [useShoppingList.js:109](../../src/composables/useShoppingList.js)).
- **Feuille de course** : `objectif (prédiction) − compté (Inventory) = à commander` — moteur
  documenté dans 06 § Réarmement.
- Navigation : le dropdown Tools propage `?event=` vers le Réarmement (la navigation AUTO
  post-save vers Restock a été retirée le 2026-07-20, cf. § 3).

### 4.2 Event Predict — la source du « prédit »

- `EventPredictView.buildPredictedRecords()`
  ([EventPredictView.vue:4265-4302](../../src/components/EventPredictView.vue)) agrège
  `activeTimelineData` + quantités manuelles en records compacts
  `{shopId, shop, menuItemId, mappedMenuItemId, itemName, totalQuantity, totalRevenue}` ;
  persistés (a) en DB dans `EventPredictVersion.predictedRecords` et (b) dans le pont localStorage
  ci-dessus via `persistPredictedRecordsForRestock` (:4229, garde anti-écrasement par payload
  vide).
- Consommateurs recensés : Réarmement (ci-dessus) et mode Predict d'Analyse
  (fiche [190](../bugs/190_predict_vues_article_absentes_grain_shop_level.md)). La réconciliation
  post-event (§ 7) en devient le **3ᵉ consommateur** (colonne Qty Pred).
- Contrat de dépendance complet : [01_EVENT_PREDICT_ALGORITHME.md § « Ce qui dépend
  d'EventPredictVersion »](01_EVENT_PREDICT_ALGORITHME.md).
- **CTA « Inventaire » à cible dynamique (2026-08-04, JLH)** : le bouton d'Event Predict
  (ex-`epSpaceInventory`, libellé unique « Inventaire de l'espace ») route désormais selon la date
  de l'event — futur → `space-pre-inventory` (« Inventaire pré-événement »), passé ou date
  illisible → `space-inventory` (« Inventaire post-événement », comportement historique). Décision
  dans [`utils/inventoryRouteTarget.js`](../../src/utils/inventoryRouteTarget.js)
  (`resolveInventoryRouteName`, testé dans `tests/unit/inventoryRouteTarget.spec.js`) ;
  `goToInventory()` reprend aussi le repli `?configuration=` de l'URL courante (parité
  `navigateToTool` — sans lui, un event sans `configurationId` atterrissait sur « Aucun évènement
  sélectionné »). En mode pre, l'event effectivement ancré peut différer du `?event=` transmis
  (§ 2/§ 8.2) — acceptable uniquement parce que le bandeau le rend visible.
- **Retrait du bouton du bandeau Réappro (2026-08-04, JLH)** : le second point d'entrée — le
  bouton « Inventaire pré-événement » du bandeau « Réarmement prêt » (onglet Réappro
  d'EventPredictView) — a été retiré le jour même. Redondant (le réarmement expose déjà
  `space-pre-inventory` dans son sélecteur Outils, et l'onglet Configuration garde son lien
  `goToInventory`) et concerné par la bascule silencieuse d'event documentée en
  [`QUESTIONS_A_BERTRAND.md` #52](../QUESTIONS_A_BERTRAND.md). Le seul point d'entrée Event
  Predict restant est donc le lien de l'onglet Configuration ; `resolveInventoryRouteName` et
  `goToInventory()` (décrits ci-dessus) restent en place pour lui. Clés i18n
  `epPreEventInventory` / `epPostEventInventory` / `epOpenInventoryForEvent` supprimées
  (orphelines).

### 4.3 Analyse — events et ventes réelles

- La liste d'events dans laquelle `resolveEventContext` pioche vient du **store `analyse`**
  (`rootState.analyse.events` — voir `resolveLastPastEvent`, § 2). L'écran Inventory ne charge
  pas ses propres events.
- Les **ventes réelles item×PdV** d'un event (futur besoin Qty Sold de la réconciliation)
  s'obtiennent par `getSpaceEventTimelineBatch` (space.api), le même batch que le mode Predict
  d'Analyse et le moteur Event Predict (fiches 180/193).

### 4.4 Logistic — indépendant, mais porteur du modèle de réconciliation

- **Aucun échange de stock** entre Inventory et Logistic (piège n°1 de 06) : compter dans
  Inventory ne bouge pas `StockLevel`, un mouvement Logistic ne change aucun comptage.
- MAIS Logistic possède déjà **le** modèle d'archive d'écarts :
  `StockReconciliation` ([schema.prisma:2536-2548](../../../backend/prisma/schema.prisma)),
  `lines Json = [{elementId, elementName, itemKey, expectedPacked/Loose, countedPacked/Loose,
  deltaPacked/Loose, deltaUnits, unitsPerPack}]` (construction réelle :
  [logistics.service.ts:1307-1331](../../../backend/src/features/logistics/logistics.service.ts)),
  `eventId`/`eventName` **déjà présents** au modèle.
- Endpoints en place : `GET /logistics/:spaceId/reconciliations`, `GET /logistics/reconciliations/:id`,
  `GET .../export` (CSV à la volée) — [logistics.controller.ts:115-145](../../../backend/src/features/logistics/logistics.controller.ts) ;
  liste déjà rendue dans [SpaceLogisticView.vue:127-137](../../src/views/SpaceLogisticView.vue)
  (gating `front.fb.logisticReconcile`, section masquée sans la permission).
- Création aujourd'hui : **uniquement** l'Inventory Reset (`logistics.service.reset`, :1261+),
  qui fige les écarts ET pose l'ancre temporelle des ventes dérivées (06 § StockReconciliation).
  La réconciliation post-event (§ 7) ajoute un **2ᵉ point de création qui ne touche PAS aux
  StockLevel** — distinction cruciale : documenter ≠ resetter.

### 4.5 Menu & catalogue / Achats

- Les items comptés viennent du contexte config (shops + items par PdV) ; les **coûts unitaires**
  passent par `inventory/loadMarketPrices` ([inventory.js:253](../../src/store/modules/inventory.js),
  cache TTL 15 min) — base de valorisation du futur « Miss € ».
- `packagingTypes` (`GET /packaging`, [inventory.api.js:49](../../src/api/endpoints/inventory.api.js)) :
  libellés de conditionnement des steppers packed.

### 4.6 Builder / Espaces

- Le périmètre compté (PdV F&B, storages) découle de la **configuration** de l'event résolu
  (`ctx.configId`, § 2) — même contexte config que le reste de l'app (06 et 03 pour le détail).

### 4.7 AppHeader / navigation globale

- Titre de section : mapping route→clé [AppHeader.vue:12](../../src/components/AppHeader.vue)
  (`"space-inventory": "hdrSecInventory"`). Liens directs : `MainNav.vue:62`,
  `BurgerMenu.vue:53-55`, loader de transition `RouteTransitionLoader.vue:88` — tous porteurs du
  libellé à renommer (voir plan P1).

---

## 5. Diagramme — l'écran au centre de ses ponts

```
                         store analyse (events, configs)
                                   │ resolveEventContext (§2)
                                   ▼
   Event Predict ──predictedRecords──►  POST-EVENT INVENTORY  ──save──► POST /inventory
   (DB EventPredictVersion             (/spaces/:id/inventory)          POST /inventory-counts
    + pont localStorage                       │                                │
    datafriday:predicted-records:*)           │ navigateToTool(?event=)        ▼
              │                               ▼                    InventorySnapshot/InventoryCount
              │                        Réarmement ◄── GET /inventory/* ────────┘
              │                        (objectif − compté)
              └────────────► (mode Predict d'Analyse — fiche 193)

   Logistic (StockMovement/StockLevel) ── AUCUN lien de stock avec l'écran (piège 06 n°1)
        └── StockReconciliation + endpoints /logistics/reconciliations*
             └── future maison du document de réconciliation post-event (§7)
```

---

## 6. Pièges hérités à connaître avant de toucher l'écran

Tous documentés dans 06 (ne pas dupliquer, s'y référer) :

| Piège | Renvoi 06 |
|---|---|
| Inventory et Logistic = deux stocks indépendants, aucune synchro | Piège n°1 |
| Deux moteurs « reste à commander » (Réarmement vs aperçu feuille de course) | Piège n°2 |
| Rôle « Tableau de Réarmement » ne peut jamais sauvegarder | Piège n°3 (bug actif) |
| `InventoryFilterDrawer` / `InventoryMenuCoverageDrawer` montés mais inatteignables | § arbre de montage |
| Champs morts `storageLocation`, `discardedQuantity/Reason` | § InventoryCount |
| Filtres storage `'material'`/`'merch'` historiquement cassés | § Filtres storage |

S'y ajoute, propre à cette page : `inventory/resolveLastPastEvent` **jamais dispatché** (§ 2) —
un résolveur mort qui devient utile avec la réconciliation.

---

## 7. Réconciliation post-événement — implémentée le 2026-07-20

**Intention produit** : l'écran est l'inventaire d'après-match. Terminer et sauvegarder un
comptage **génère un document de réconciliation** avec le dernier événement ayant eu lieu : pour
chaque article×PdV, l'écart entre ce qui a été compté et ce qui aurait dû rester après les ventes.

### 7.1 Flux (bouton « Générer la réconciliation »)

`onSaveAll` ([SpaceInventoryView.vue:1622](../../src/views/SpaceInventoryView.vue)) : garde douce
comptage incomplet → `inventory/saveInventory` (inchangé) → `createReconciliationAfterSave`
(:1669). L'event réconcilié est résolu par `resolveReconciliationEvent` (:1659) : l'event du
contexte **s'il est passé**, sinon le **dernier** event passé du space (dernier élément de
`pastEvents`, trié ascendant — le fallback prenait `pastEvents[0]` = le plus VIEUX match,
bug [222](../bugs/222_inventory_reconciliation_fallback_plus_vieux_match.md) corrigé le
2026-07-20) — jamais un event futur (l'ancrage par défaut de l'écran vise le futur, § 2). Aucun event passé → toast
`invRecoNoPastEvent`, comptage sauvegardé, pas de document. Succès → le document s'insère en tête
de la section (§ 7.3) et sa vue s'ouvre (§ 7.4). Échec de création → toast `invRecoCreateError`
(le comptage, lui, est déjà sauvegardé).

### 7.2 Construction des lignes — `buildReconciliationLines` (:1716)

Collecte 4 sources puis délègue à l'util pur
[`buildPostEventReconciliationLines`](../../src/utils/postEventReconciliation.js) (11 tests unit,
`tests/unit/postEventReconciliation.spec.js`) :

| Source | Chemin | Absence → |
|---|---|---|
| Compté (post-event) | entries shops+storages+merch de l'écran, formule `totalForItem` | 0 (union des clés) |
| Pré-event | `GET /inventory/:spaceId/pre-event/:eventId` — **le comptage Pre-event Inventory du MÊME event** (snapshot `kind='pre-event'`, cycle fermé § 8 — Q19 résolue), repli **scopé** = comptage post-event du match PRÉCÉDENT, avec `source` renvoyé et archivé (fiche [241](../bugs/241_getpreeventinventory_repli_legacy_hors_event.md), 2026-07-24 — avant : n'importe quel snapshot du space antérieur au jour du match, sans trace) ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts) `getPreEventInventory`) | `leftFromSales`/`missingUnits`/`missingValue` **null** (« — ») |
| Vendu pendant l'event | **Depuis le 2026-07-27 (ex-Q35 tranchée owner, fiche [242](../bugs/242_reco_post_event_ventes_composees_non_explosees.md))** : `GET /inventory/:spaceId/event-consumption/:eventId` — ventes de l'event **explosées en consommation d'ingrédients** par la cascade Logistique (`deriveEventConsumption` → `explodeSalesToConsumption`, mêmes clauses de sélection que le timeline). PdV joint par **id**, article par nom normalisé (`buildSoldUnitsFromConsumption`). Repli grain article (timeline brut, chemin d'avant conservé) si backend antérieur (404) — `meta.salesSource` (`'consumption'`/`'timeline'`) archivé + bandeau sur les documents en repli. Les non-joignables (des deux côtés) restent **comptés et remontés** (`meta.salesUnjoined` + bandeau) — fiche [238](../bugs/238_reco_post_event_ventes_non_jointes_avalees.md) | 0 |
| Prédit | `localDb.getAnyPredictedRecords` (pont § 4.2, même lecture que le Réarmement) | `predictedUnits` **null** ; scénario présent mais article absent → 0 |

Coûts : `store.state.analyse.menuItemCostMap` → `missingValue` **au coût** (défaut à confirmer,
question n°2). Formules : `leftFromSales = préEvent − vendus` ; `missingUnits = leftFromSales −
compté` (négatif = surplus, conservé) ; chips recalculées à l'affichage par
`computeReconciliationSummary` (les manquants négatifs ne « remboursent » jamais les positifs).

### 7.3 Persistance et liste

- `POST /inventory/:spaceId/reconciliations` ([inventory.controller.ts:82](../../../backend/src/features/inventory/inventory.controller.ts),
  service :209) → `StockReconciliation` avec **`kind: 'post-event'`** ; l'event est vérifié
  appartenir au même tenant+space (garde anti cross-tenant). **Ne touche PAS aux StockLevel**
  (≠ reset logistique).
- `GET /inventory/:spaceId/reconciliations` (`listInventoryReconciliations`) — liste **COMMUNE**
  pre + post (`kind IN ('post-event','pre-event')`, décision user 2026-07-20), `kind` dans le
  payload → badge de type dans la section. Lines incluses (un space en compte peu). Routes
  déclarées **avant** `:spaceId/:eventId` (piège de routing Fastify, même raison que `/latest`).
- Colonne `kind` : [schema.prisma](../../../backend/prisma/schema.prisma) + migration idempotente
  [`prisma/sql/2026-07-20_stockreconciliation_kind_post_event.sql`](../../../backend/prisma/sql/2026-07-20_stockreconciliation_kind_post_event.sql).
- **Cloisonnement Logistic** : ses deux requêtes filtrent désormais `kind: null` — la liste de la
  vue Logistic ne montre que les resets, et surtout **l'ancre temporelle des ventes dérivées ne
  peut pas être déplacée par un document post-event** (qui ne matérialise aucun mouvement SALE —
  sinon stock fantôme). `logistics.service.ts` (anchor `lastReco` + `listReconciliations`).
- Front : [`inventory.api.js`](../../src/api/endpoints/inventory.api.js)
  (`createPostEventReconciliation`/`listPostEventReconciliations`/`getPreEventInventory`) ;
  chargement fire-and-forget dans `loadForSpace` (`loadReconciliations`, :1813). Mode démo :
  document local non persisté (`demo-*`).

### 7.4 UI

- **Section colonne gauche** : [`InventoryReconciliationSection.vue`](../../src/components/InventoryReconciliationSection.vue),
  montée sous `InventoryFilterPanel` — titre repliable, badge compteur, un bouton par document
  (nom du match + date), état actif, bouton **supprimer** par document (confirmation puis
  `DELETE /inventory/:spaceId/reconciliations/:id` — « repartir de zéro » = supprimer puis
  regénérer ; pas d'édition, un document est une photo figée. Périmètre serveur strict
  kind pre/post-event : les resets logistiques kind null sont hors d'atteinte).
  **Mobile** : la même section est montée en bas d'`InventoryFilterDrawer` (fiche
  [235](../bugs/235_reconciliation_section_inaccessible_mobile.md) — avant le 2026-07-24, aucun
  accès mobile aux documents).
- **Vue document** : [`InventoryReconciliationView.vue`](../../src/components/InventoryReconciliationView.vue),
  substituée à TOUT le contenu central (`v-if="!activeReconciliation"` autour du bloc
  recherche/onglets/cartes ; computed `activeReconciliation`, SpaceInventoryView:869). Barre :
  retour, chips Écart %/Manquant (€ si valorisable, sinon unités), recherche, toggle
  **Par PdV / Par article** ; table 7 colonnes, groupes expandables (article → détail par PdV et
  inversement), tri manquants d'abord. 100 % self-contained depuis `lines` — aucun recalcul de
  sources à l'affichage.
- Bandeau : sous-titre « Réconciliation : {event} » quand un document est ouvert ; le panneau
  droit (résumé inventaire) reste celui du **contexte courant** — exact pour un document
  fraîchement créé, potentiellement décalé sur un vieux document (limitation assumée, cf. § 7.5).
- i18n : 25 clés `invReco*` (EN/FR) + `invSave` = « Create Reconciliation » / « Générer la
  réconciliation ». Les deux composants suivent le contrat `--fb-*` et la locale de l'app
  depuis le 2026-07-24 (avant : couleurs en littéraux → blocs blancs en thème sombre, dates/nombres
  en `fr-FR` en dur) — fiche [240](../bugs/240_reconciliation_dark_mode_et_formats_fr_fr_en_dur.md).

### 7.5 Limites connues / questions ouvertes (voir `QUESTIONS_A_BERTRAND.md`)

1. **Pré-event** = dernier snapshot **antérieur au jour** de l'event (un comptage fait le jour du
   match est considéré post-match). Définition par défaut à valider — et repli qui ne filtre ni
   l'event ni la phase, donc susceptible de piocher le stock d'un autre match :
   fiche [241](../bugs/241_getpreeventinventory_repli_legacy_hors_event.md).
2. **Miss €** valorisé au **coût** (`menuItemCostMap`) — prix de vente en alternative.
3. **Qty Pred** lue via le pont localStorage (comme le Réarmement) → sur un autre
   navigateur/appareil sans scénario local, colonne « — ». Bascule possible vers
   `EventPredictVersion.predictedRecords` (DB) si le besoin cross-device se confirme.
4. Panneau droit non historisé (cf. § 7.4).
5. L'ancienne navigation auto vers le Réarmement après save est retirée (§ 3).

**Hors périmètre** : l'onglet « Staff » d'Event Predict (Configuration Settings) aperçu dans le
même lot de captures — feature Prévision distincte.

---

## 8. Pre-event Inventory — l'inventaire d'avant-match (implémenté le 2026-07-20, JLH)

### 8.1 Le cycle qui relie les deux écrans

```
        POST-EVENT INVENTORY (événement N-1, passé)
        compté APRÈS le match  →  doc réco post-event (§7)
                │   ce comptage devient la BASE du stock
                ▼
        + MOUVEMENTS LOGISTIC (réappro, transferts, pertes, casse)
          entre le comptage post-event(N-1) et le comptage pre-event(N)
                ▼
        PRE-EVENT INVENTORY (événement N, prochain futur)
        attendu = post-event(N-1) + Σ mouvements     ← visible Directeur/Chef exéc./Admin
        compté AVANT le match  →  doc réco pre-event (attendu vs compté)
                │   ce comptage devient le STOCK DE DÉPART de l'événement N
                ▼
        (ventes de l'événement N)
                ▼
        POST-EVENT INVENTORY (événement N)
        restant théorique = pre-event(N) − ventes(N)   ← boucle fermée (Q19 résolue)
```

Le maillon technique du cycle : **`InventorySnapshot.kind`** (`'pre-event' | 'post-event'`,
null = legacy — [schema.prisma](../../../backend/prisma/schema.prisma), migration
[`2026-07-20_inventorysnapshot_kind.sql`](../../../backend/prisma/sql/2026-07-20_inventorysnapshot_kind.sql)).
Chaque écran sauve son snapshot avec sa phase (`saveInventory` accepte `kind`,
[store/modules/inventory.js:219](../../src/store/modules/inventory.js)) ; `getPreEventInventory`
(réco post-event) lit d'abord le snapshot `kind='pre-event'` du même event (§ 7.2).

### 8.2 L'écran — même composant, deux routes

Route `/spaces/:spaceId/pre-inventory` (name `space-pre-inventory`, permission
`front.fb.spaceInventory`, meta `inventoryMode: 'pre'` — [router/index.js](../../src/router/index.js)) ;
`SpaceInventoryView.vue` lit `route.meta.inventoryMode` (computed `inventoryMode`/`isPreMode`).
keepAlive keyé par `route.path` → deux instances indépendantes. Entrées de nav : MainNav,
toolbox des 4 écrans stock, AppHeader (`hdrSecPreInventory`), loader de route.

**Ancrage événement** (durci le 2026-07-24, règle owner « un match = un eventId », § 12.4) :
mode pre = **prochain futur strict** — `resolveEventContext` ignore TOUT `?event=` (même un
futur lointain) et recalcule le prochain événement à venir ; aucun futur → état vide
`preInvNoUpcoming`. Miroir exact du mode post qui, lui, ancre le **dernier événement fini**
(§ 12.4). Depuis le 2026-08-04 (JLH), l'écran **nomme** son événement d'ancrage dans le bandeau
(§ 2) — l'ignorance du `?event=` devient visible au lieu de silencieuse, et l'en-tête
d'impression reprend le même nom/date (avant : muet en pre-event, `eventOptions` ne listant que
les events passés).

### 8.3 Quantités attendues — gating serveur

> **⚠️ Refonte du 2026-08-20 (décision JLH, fiche
> [134-01](../../../backend/docs/bugs/134_01_attendus_inventaire_source_etat_logistic.md)) :
> l'attendu des DEUX écrans = l'état Logistic « en l'état » au chargement** (StockLevel − ventes
> dérivées, casse de pack, clamp ≥ 0 — exactement le chiffre de l'écran Logistic, chemin serveur
> partagé `LogisticsService.getExpectedStockIndex`/`getStock`). Le rejeu « comptage d'ancrage +
> mouvements » (BUG-232/239) est supprimé ; les paragraphes historiques ci-dessous sont conservés
> pour la traçabilité des décisions, mais la mécanique d'ancre/fenêtre n'existe plus.

- Permission dédiée **`front.fb.preInventoryExpected`**
  ([permission-catalog.ts](../../../backend/src/core/rbac/permission-catalog.ts)) — attribuée aux
  rôles système « Directeur de site » et « Chef exécutif » (+ ADMIN via ALL_CODES). Ces deux
  rôles reçoivent AUSSI `front.fb.spaceInventory` au passage (ils ne pouvaient pas ouvrir les
  écrans d'inventaire) — élargissement **validé par Bertrand le 2026-07-24**
  ([Question #23](../QUESTIONS_A_BERTRAND.md)). Provisioning : depuis le 2026-08-20, le catalogue
  RBAC est **rejoué à chaque boot du backend** (`RbacCatalogSyncService`, fiche 134-01) — plus de
  seed manuel à rejouer en prod.
- `GET /inventory/:spaceId/pre-event-baseline/:eventId` — **décorateur méthode**
  `@RequirePermissions('front.fb.preInventoryExpected')` (getAllAndOverride → remplace la
  permission de classe) : un compteur sans le droit reçoit un 403, pas des données masquées.
  Retour : `{ source: 'logistic-live', asOf, expected, unjoinedItemKeys }` (+ `baseline: {}` et
  `movements: []` de compat pour un front antérieur). **Plus de cas « no-baseline »** : l'état
  Logistic existe toujours — le bandeau « Aucun comptage post-event sur le match précédent » a
  disparu. Un article jamais suivi par la Logistique (aucun StockLevel) reste « — » (décision
  « jamais de 0 fabriqué », 2026-07-20).
- **Calcul serveur (2026-08-20)** : `computeLogisticExpected` (chemin unique, aussi consommé par
  le GET post-event § 7 et la réconciliation § 8.4) lit l'index Logistic
  (`getExpectedStockIndex` : niveaux − consommation dérivée depuis l'ancre du dernier reset,
  `normalizeLevel` — le MÊME calcul que l'écran Logistic), joint **menuItemId par nom normalisé**
  (`StockMovement.itemKey`/`StockLevel.itemKey` sont des NOMS libres, piège n°1 du domaine) et
  re-découpe en packed/loose dans la taille de paquet de l'**INVENTAIRE**
  (`resolveInventoryUnitsPerPack`, BUG-239 : le hint légende le champ Packed dans SA propre
  unité, `units`/`unitsPerPack` null si conditionnement inconnu — pas de total fabriqué).
  Clé non joignable → ignorée mais **surfacée** (`unjoinedItemKeys` + warning log).
- Front : `fetchPreExpected` (SpaceInventoryView) n'émet l'appel que si
  `can('front.fb.preInventoryExpected')` ; util pur
  [`buildPreEventExpected`](../../src/utils/preEventExpected.js)
  (`tests/unit/preEventExpected.spec.js`) aplatit le blob `expected` serveur — le repli legacy
  « baseline + mouvements » est supprimé (2026-08-20) : blob absent = « serveur non à jour ».
  **Cartouche de provenance** (même gabarit v-alert que les autres bandeaux) : « Attendu = stock
  Logistic au chargement de l'écran » (`invExpectedSource`) dès que des attendus sont affichés.
- Affichage : `InventoryCountingInterface` prop additive `expectedFor` → caption « Attendu : N »
  sous chaque champ Packed/Loose, dans les **deux modes** (réunion Bertrand 19/08, fiche
  [341-01](../bugs/341_01_attendus_inventaire_sources_incorrectes.md)) ; en post-event,
  re-découpage packed/loose de l'indice serveur (`postExpectedFields`) — l'indice est désormais
  **clampé ≥ 0** (c'est le chiffre Logistic ; l'ancien signal « négatif = incohérence de
  sources », décision 2026-07-30 #3, disparaît avec le rejeu). Le chip du total post s'appelle
  « Attendu » (ex-« Doit rester »).
- Badge « Attendu » de section (les deux modes, même agrégateur
  `aggregateExpectedUnitsFromIndex`, groupé par unités des articles réellement présents) :
  source = le blob serveur aplati par `flattenExpectedUnits`. L'ancienne source « cibles du plan
  de réarmement (Stockup) sauvegardé » (retour JLH 13/08) reste retirée — décision Bertrand
  19/08, reconfirmée par JLH le 20/08 (badge = attendu stock, le Stockup vit dans le chip
  « Besoin prédit »).
- **Infobulle de détail (2026-08-20)** : la décomposition « comptage + mouvements − vendu »
  (`buildExpectedCalcDetails`, fiche 343-01) n'existe plus — l'infobulle des hints montre
  l'identité de conversion « packs × conditionnement + vrac = total » (« 15 × 4 + 2 = 62 ») ;
  l'historique par mouvement vit sur l'écran Logistic. La provenance est portée par la cartouche.
- **RBAC du chip « Besoin prédit » (2026-08-19, session 2)** : permission dédiée
  `front.fb.preInventoryPredicted` (ADMIN + Directeur de site — Chef exécutif exclu, réunion
  Bertrand 19/08). `canSeePredicted` gate le fetch ET l'affichage ; `preInventoryExpected` ne
  couvre plus que les attendus. Gating d'affichage : la donnée vient d'Event Predict
  (`front.fb.eventPredict` côté serveur). Fiches 343-01 (web) / 132-01 (backend, propagation
  corrigée par 134-01), Q59 soldée.

### 8.4 Réconciliation pre-event (attendu vs compté)

- « Générer la réconciliation » (même bouton) → `POST /inventory/:spaceId/pre-event-reconciliations`
  `{ eventId }` — **lignes construites CÔTÉ SERVEUR** (`createPreEventReconciliation`) : le client,
  potentiellement sans la permission « attendus », ne les a jamais eues. Compté = fusion
  existante (`getBySpaceAndEvent`), attendu = **état Logistic au moment de la sauvegarde**
  (`computeLogisticExpected`, même chemin que le GET § 8.3 — décision JLH 2026-08-20, fiche
  134-01) — hints à l'écran et lignes de réconciliation ne peuvent plus diverger. Article compté
  mais hors registre Logistic → colonnes attendu/écart à « — » (null), jamais 0 fabriqué ;
  `meta.baseline = { source: 'logistic-live', asOf }`.
- Lignes persistées en **packed/loose bruts** (+ deltas) : le conditionnement
  (`inventoryQuantityPackaged`) est un référentiel front — la vue convertit en unités à
  l'affichage (`unitsPerItemId`), l'Écart € vient de `menuItemCostMap` (`costByItemId`), repli
  « — ». Les lignes portent aussi `unitsPerPack`, `expectedUnits`, `countedUnits` et `deltaUnits`
  depuis le 2026-07-24 : la vue convertit avec le conditionnement **du calcul** (photo figée) et ne
  retombe sur le référentiel courant que pour les documents antérieurs —
  fiche [239](../bugs/239_pre_event_taille_de_paquet_divergente_serveur_front.md). `StockReconciliation` `kind='pre-event'` — exclu de l'ancre et de la liste Logistic
  comme les post-event.
- Vue : `InventoryReconciliationView` bascule sur `reconciliation.kind` — colonnes
  **Attendu · Compté · Écart · Écart €** (delta = compté − attendu, négatif = manquant en rouge,
  positif = surplus en ambre), chips Manquant/Écart € (les surplus ne compensent jamais), mêmes
  groupes By PdV / By article. Section commune : badge Pré/Post par document.

### 8.5 Limites connues

1. **Counts live partagés entre phases** : `InventoryCount` reste keyé (space,event,shop,item) —
   compter le post-event de l'événement N réutilise les mêmes lignes que son pre-event. Les
   archives de chaque phase = les **snapshots kindés** figés au « Générer la réconciliation » ;
   rouvrir l'écran Pre-event après le début du comptage post affiche les saisies post (assumé).
   ⚠️ Le sens inverse était le vrai danger (vérification 2026-07-24, § 13) : l'écran Post-event
   s'ouvrait pré-rempli **et déjà marqué « compté »** par le comptage pre-event du même match. Depuis
   le correctif, `GET /inventory/:spaceId/:eventId?phase=post-event` requalifie en « à compter » toute
   ligne figée avant la clôture du Pre-event (valeurs conservées, bandeau d'avertissement) — la garde
   « comptage incomplet » redevient active. Fiche
   [237](../bugs/237_post_event_prerempli_par_comptage_pre_event.md), arbitrage restant
   [Question #38](../QUESTIONS_A_BERTRAND.md).
2. **Fenêtre des mouvements** bornée au snapshot post-event précédent : un Inventory Reset
   logistique intercalé (qui SET les niveaux) n'est pas déduit — possibles doubles comptages.
   **Tranché le 2026-07-24 (réponse Bertrand — [Question #24](../QUESTIONS_A_BERTRAND.md))** :
   l'inventaire reste attaché à son event, avec un **reset automatique déclenché à l'ouverture des
   portes** (« Door opening »), sa réconciliation étant sauvegardée rattachée à l'événement
   correspondant — l'ancrage devient l'event lui-même plutôt qu'une fenêtre de mouvements ouverte.
   **Non implémenté** : reste à définir le déclencheur technique du reset « Door opening » et à
   articuler avec la fenêtre de mouvements (recoupe Q25, toujours ouverte, et Q31).
3. Attendus figés au chargement de l'écran (pas de refresh live si un mouvement Logistic arrive
   pendant le comptage).
4. Jointure par nom des mouvements sans `menuItemId` : normalisation identique front/back, mais
   un renommage d'article entre le mouvement et le comptage casse la jointure (mouvement ignoré —
   depuis BUG-232, surfacé via `unjoinedItemKeys` + warning log au lieu d'être avalé).
5. **Fuite des attendus via les réconciliations** : `POST pre-event-reconciliations` (réponse) et
   `GET reconciliations` (lignes) exposaient `expectedPacked/Loose` sous la seule permission de
   classe `spaceInventory` — contournait le gating § 8.3
   ([BUG-233](../bugs/233_pre_event_expected_fuite_via_reconciliations.md), **corrigé 2026-07-24** :
   expurgation conditionnelle des réponses — `expected*` ET `delta*` retirés des lignes pre-event
   pour les non-porteurs, document en base complet).
6. Consommation dérivée des ventes (vue Stock Logistic) non rejouée par l'attendu — **« mouvements
   seuls » désormais tranché, ce n'est plus une limite mais une règle** : décision owner (JLH) du
   2026-07-27, [Question #31](../QUESTIONS_A_BERTRAND.md) →
   [`REPONSES_QUESTIONS_2026-07-27.md`](../REPONSES_QUESTIONS_2026-07-27.md) §1. On ne vend pas hors
   match sur l'espace, et une vente hors match (privatisation, kiosque) **ne sort pas du stock
   inventorié** — déduire la consommation dérivée serait donc *faux*, pas seulement superflu.
   `computeExpected` reste `post-event précédent + mouvements Logistic`.
   ⚠️ **Suivi non implémenté** : garde-fou non bloquant (log serveur) quand des ventes existent
   malgré tout dans la fenêtre de calcul — mesuré le 2026-07-27 sur le seul cycle post→pre de la
   base staging : 0 mouvement, mais 661 unités de consommation dérivée calculables. Origine
   vérifiée : élément PARVIS (`shop`) **correctement** mappé, transactions portant l'`eventName`
   « AJ AUXERRE - Saison 26/27 » (event Weezevent **de saison**) → de vraies ventes de match pour un
   match **absent du calendrier `Event`**, pas un PDV mal rattaché. C'est précisément ce qu'un
   garde-fou révélerait. Indépendant du point 2 ci-dessus (Q24/Q25), qui déplacera le point de départ
   du calcul.

---

## 9. Vérification de la logique métier contre la spec (2026-07-20)

Spec de référence (owner produit, session 2026-07-20) : *« les deux écrans comptent le stock réel
par PDV et le comparent à ce qui devrait s'y trouver ; seule différence : quand on compte. »*

### 9.1 Les formules canoniques

```
Cycle :  Post-event (N−1) ──► Logistic ──► Pre-event (N) ──► match N ──► Post-event (N) ──► boucle

Pre-event  : attendu    = post-event du match précédent + livraisons − retraits (Logistic)
             écart      = compté − attendu                        (négatif = manquant)

Post-event : Qty left   = départ (pre-event du même match) − Qty Sold
             Missing    = Qty left − Count                        (négatif = surplus)
             Miss €     = Missing × coût unitaire
             Diff %     = (Qty Sold − Qty Predicted) / Qty Predicted × 100
```

### 9.2 Conformité vérifiée (chaque ligne relue dans le fichier cité)

| Règle de la spec | Code | Verdict |
|---|---|---|
| `Missing = (départ − vendu) − compté` | `leftFromSales = preEvent − sold` ; `missingUnits = leftFromSales − counted` ([postEventReconciliation.js:94-95](../../src/utils/postEventReconciliation.js)) | ✅ exact |
| `Diff % = (vendu − prévu)/prévu`, par ligne et en résumé | ligne : [InventoryReconciliationView.vue:344-347](../../src/components/InventoryReconciliationView.vue) ; résumé : [postEventReconciliation.js:171-174](../../src/utils/postEventReconciliation.js) | ✅ |
| Chips résumé « Diff % / Miss € » | `computeReconciliationSummary` — seuls les manquants **positifs** sont sommés, un surplus ne rembourse jamais une perte (:156-164) | ✅ |
| `attendu = post-event précédent + mouvements Logistic` | calcul **serveur** : baseline = snapshot `kind='post-event'` du dernier event passé, puis **rejeu séquentiel** des `StockMovement` avec `normalizeLevel` (casse de pack + clamp ≥ 0, BUG-[232](../bugs/232_pre_event_expected_non_normalise_negatifs.md)) — `computeExpected` ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)) ; rendu front [preEventExpected.js](../../src/utils/preEventExpected.js) (blob `expected` serveur, somme brute en repli legacy) | ✅ (voir divergences D1/D2) |
| Pas de baseline → pas d'attendu fabriqué | `baseline: null` → « — », jamais 0 ([preEventExpected.js:35-36](../../src/utils/preEventExpected.js)) | ✅ |
| Attendu visible Directeur de site / Admin / Chef exécutif seulement | gate **serveur** 403 via `front.fb.preInventoryExpected` (§ 8.3) — rôles porteurs : ADMIN (ALL_CODES), Directeur de site, Chef exécutif ([permission-catalog.ts:52-59,168-195](../../../backend/src/core/rbac/permission-catalog.ts)) ; les autres comptent à l'aveugle | ✅ |
| Pre-event = prochain match, Post-event = dernier fini | pre : futur strict ; post : contexte passé sinon dernier passé ([SpaceInventoryView.vue:1379-1402](../../src/views/SpaceInventoryView.vue)) — fallback corrigé (bug [222](../bugs/222_inventory_reconciliation_fallback_plus_vieux_match.md)) | ✅ après fix |
| Packed / Loose | canaux séparés de bout en bout, conversion `packed × inventoryQuantityPackaged + loose` à l'affichage seulement | ✅ |

### 9.3 Divergences relevées (pas des bugs tranchés — règles à valider, cf. Questions)

| # | Divergence | Où | Question |
|---|---|---|---|
| D1 | L'attendu rejoue **toutes** les raisons de `StockMovement` (DELIVERY, TRANSFER, EXPIRY, SALE, INVENTORY_RESET, OTHER — signe `direction==='add' ? +1 : −1`), pas seulement livraisons − retraits comme la spec le formule | `computeExpected` ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)), [logistics.service.ts:319-321](../../../backend/src/features/logistics/logistics.service.ts) | Q25 |
| D2 | Fenêtre des mouvements **sans borne haute** (`createdAt > snapshot` seulement) et baseline ancrée au **dernier match passé global** (`eventDate <= now`), pas au match précédant le match cible | `resolvePreEventBaseline` / `computeExpected` ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)) | Q25 (recoupe Q24) |
| D3 | Métriques post-event (`soldUnits`, `predictedUnits`, `leftFromSales`, `missingUnits`, `missingValue`) fournies par le **client** et stockées verbatim — aucun recalcul/contrôle serveur. **Tranché 2026-07-24** ([Question #26](../QUESTIONS_A_BERTRAND.md)) : mettre en place le recalcul/contrôle serveur, résultat visible **uniquement par Directeur de site et Admin** — **non implémenté**. | [create-post-event-reconciliation.dto.ts:19-77](../../../backend/src/features/inventory/dto/create-post-event-reconciliation.dto.ts), service :214-247 | Q26 (tranchée, à coder) |
| D4 | Lignes pre-event serveur : `delta = compté − attendu` (signe inversé vs « missing ») ; la vue reconvertit (`missing = −delta` positifs, `preSummary` [InventoryReconciliationView.vue:223-245](../../src/components/InventoryReconciliationView.vue)) — cohérent à l'affichage, mais deux conventions de signe coexistent en base | schéma de lignes § 8.4 | documenté, pas de question |

Anomalie mineure sous surveillance (pas de fiche) : le repli legacy de
[preEventExpected.js](../../src/utils/preEventExpected.js) ne coerce pas `packedDelta` en
entier — un delta packed fractionnaire côté données fuiterait un compte packed fractionnaire à
l'affichage (chemin nominal : blob `expected` serveur, non concerné).

---

## 10. Exemple live — Auxerre, « Configuration principale », un cycle complet

Fil rouge : space **Auxerre**, config **« Configuration principale »** (le nom par défaut des
configs — il n'existe pas de flag `isMain` en base, c'est un littéral posé par le wizard
d'import, [StepMapShops.vue:1620](../../src/components/integration/wizard/StepMapShops.vue) /
[create-config.dto.ts:15](../../../backend/src/features/spaces/dto/create-config.dto.ts)).
PDV : **Buvette du Parvis** (`SpaceElement` de type shop). Article : **Coca-Cola CAN 33cl**,
Packed = carton de 24 (`inventoryQuantityPackaged = 24`), Loose = canette à l'unité.
Coût unitaire : 2 €.

### Étape 1 — Post-event Auxerre–Monaco (le match précédent est fini)

Écran `/spaces/:spaceId/inventory`. On compte ce qui reste physiquement à la buvette :
**5 packed + 0 loose = 5 × 24 = 120 canettes**. « Générer la réconciliation » →
`POST /inventory` fige le snapshot **`kind='post-event'`** + `POST /inventory/:spaceId/reconciliations`
crée le document post-event du match Monaco. **Ces 120 canettes deviennent la baseline du cycle.**

### Étape 2 — Logistic, entre les deux matchs

Deux mouvements sur la buvette du Parvis :

| Mouvement | Raison | Delta |
|---|---|---|
| Livraison reçue (15 cartons) | `DELIVERY` (add) | **+360** canettes |
| Canettes abîmées retirées | `EXPIRY` (remove) | **−10** canettes |

### Étape 3 — Pre-event Auxerre–Ipswich (le prochain match)

Écran `/spaces/:spaceId/pre-inventory`, ancré sur Auxerre–Ipswich (futur strict, § 8.2).
`GET /inventory/:spaceId/pre-event-baseline/:eventId` renvoie baseline + mouvements, et le front
affiche sous les champs :

```
attendu = 120 (post-event Monaco) + 360 (livraison) − 10 (retrait) = 470 canettes
        soit « Attendu : 19 » sous le champ Packed (19 cartons) et « Attendu : 14 » sous Loose
        (19 × 24 = 456 ; 456 + 14 = 470)
```

Ce « 470 » n'est servi qu'aux porteurs de `front.fb.preInventoryExpected` (Directeur de site,
Chef exécutif, Admin) — un employé de buvette reçoit un **403** et compte à l'aveugle (§ 8.3).

L'employé compte : **468 canettes**. « Générer la réconciliation » →
`POST /inventory/:spaceId/pre-event-reconciliations` (lignes construites côté serveur, § 8.4) :

| | Attendu | Compté | Écart |
|---|---|---|---|
| Coca-Cola CAN 33cl — Buvette du Parvis | 470 | 468 | **−2** (2 manquantes, repérées avant l'ouverture des portes) |

**Les 468 canettes comptées deviennent le stock de départ du match.**

### Étape 4 — Le match (Auxerre–Ipswich)

Les ventes POS enregistrent **380** canettes vendues. L'algo Event Predict avait prévu **400**.

### Étape 5 — Post-event Auxerre–Ipswich

Retour sur `/spaces/:spaceId/inventory`. On recompte : **85 canettes** (3 packed + 13 loose).
Le document de réconciliation post-event affiche, pour le Coca à cette buvette :

| Colonne | Valeur | D'où ça vient |
|---|---|---|
| Qty Predicted | 400 | scénario Event Predict (pont localStorage, § 7.2) |
| Qty Sold | 380 | ventes réelles POS (`getSpaceEventTimelineBatch`) |
| Diff % | **−5 %** | (380 − 400) / 400 |
| Qty left | 88 | 468 (pre-event du même match) − 380 vendues |
| Count | 85 | le comptage de l'écran |
| Missing | **3** | 88 − 85 |
| Miss € | **6 €** | 3 × 2 € (coût `menuItemCostMap`) |

Chips en tête de document : **Diff : −5 %** · **Miss : 6 €**.

### Étape 6 — La boucle repart

Les **85 canettes** du snapshot `kind='post-event'` d'Auxerre–Ipswich deviennent la baseline du
calcul « attendu » du pre-event du prochain match d'Auxerre (§ 8.1).

En une phrase : le Pre-event vérifie qu'on **démarre** le match avec le bon stock (470 vs 468),
le Post-event vérifie qu'on le **finit** avec le bon stock après les ventes (88 vs 85) — les deux
répondent à « combien il manque, et où ».

---

Rédaction §§ 9-10 : **JLH**, 2026-07-20.

---

## 11. Conformité au brief produit (relecture 2026-07-23)

Relecture ligne-à-ligne du brief produit contre le code réel, pour les **deux** écrans. Chaque
verdict est vérifié en ouvrant le fichier cité.

### 11.1 Post-event Inventory

| Exigence du brief | Implémentation | Verdict |
|---|---|---|
| Renommer « Inventory » → « Post-event Inventory » (titre de page) | `invPageTitle` = « Post-event Inventory » / « Inventaire post-événement », rendu bandeau [SpaceInventoryView.vue:127](../../src/views/SpaceInventoryView.vue) ; `hdrSecInventory`, `invPrintInvTitle` alignés | ✅ |
| Renommer le bouton dans le dropdown | `invToolInventory` = « Post-event Inventory » (`TOOLBOX_ITEMS` [SpaceInventoryView.vue:686](../../src/views/SpaceInventoryView.vue)) ; `anToolInventory`, `epToolSpaceInventory`, `srToolSpaceInventory` alignés | ✅ |
| Interface liée au **dernier événement qui a eu lieu** | Réconciliation : `resolveReconciliationEvent` = event courant si passé, sinon **dernier passé** ([SpaceInventoryView.vue:1792-1803](../../src/views/SpaceInventoryView.vue)) ✅. **MAIS** l'ancrage de l'écran de comptage (`resolveEventContext`, [:1402](../../src/views/SpaceInventoryView.vue)) prend le **futur le plus proche** d'abord (`future[0] \|\| past[0]`) : sur entrée directe avec un match à venir, le comptage post-event se rattache au match FUTUR, pas au dernier fini — **corrigé le 2026-07-24** (ancrage strict § 12.4) | ✅ après fix |
| Sauvegarde → document de réconciliation (écart compté vs restant-théorique après ventes, par PdV) | `onSaveAll` → `createReconciliationAfterSave` → `buildReconciliationLines` : `leftFromSales = preEvent − sold`, `missing = leftFromSales − counted` ([postEventReconciliation.js:92-95](../../src/utils/postEventReconciliation.js)), par `elementId\|itemId` | ✅ |
| Section Réconciliation en bas de la colonne gauche, sous les filtres | `InventoryReconciliationSection` rendu **après** `InventoryFilterPanel` dans `.si-left-filters` ([SpaceInventoryView.vue:105-111](../../src/views/SpaceInventoryView.vue)) | ✅ |
| Bouton « Sauvegarder » → lire « Générer la réconciliation » / « Create Reconciliation » | `invSave` = « Générer la réconciliation » / « Create Reconciliation » ([translations.js:1758,5459](../../src/i18n/translations.js)), bouton [SpaceInventoryView.vue:186](../../src/views/SpaceInventoryView.vue) | ✅ |

### 11.2 Pre-event Inventory

| Exigence du brief | Implémentation | Verdict |
|---|---|---|
| Même layout que Post-event | Écran **bi-mode** : même `SpaceInventoryView.vue`, discriminé par `route.meta.inventoryMode` → `isPreMode` ; même `InventoryCountingInterface` | ✅ |
| Affiche toujours le **prochain événement** de l'espace | `resolveEventContext` mode pre : futur **strict**, aucun repli passé (`future[0]?.e \|\| null`, [SpaceInventoryView.vue:1402](../../src/views/SpaceInventoryView.vue)) ; sinon état vide `preInvNoUpcoming` | ✅ |
| Quantités Packed/Loose par défaut = Post-event de l'event précédent + additions/soustractions Logistic depuis | Calcul **serveur** `computeExpected` : baseline snapshot `kind='post-event'` + rejeu séquentiel des `StockMovement` avec `normalizeLevel` (casse de pack, BUG-232) ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)) — cf. § 8.3 | ✅ (fenêtre : D2/Q25) |
| Affichées **sous** les champs Packed et Loose | Caption `si-expected-hint` sous chaque champ ([InventoryCountingInterface.vue:172-177,199-204](../../src/components/InventoryCountingInterface.vue)) | ✅ |
| Visibles **seulement** Directeur de site / Admin / Chef exécutif ; les autres comptent à l'aveugle | Gate serveur 403 + gate client `canSeeExpected` sur `front.fb.preInventoryExpected` (§ 8.3) ; prop `expectedFor=null` pour les autres → caption non rendue | ✅ (fuite via réco : [BUG-233](../bugs/233_pre_event_expected_fuite_via_reconciliations.md)) |
| Bouton Sauvegarder → Réconciliation (écart attendu-par-PdV vs compté) | `onSaveAll` → `createPreReconciliationAfterSave` → `POST pre-event-reconciliations`, lignes **serveur** (`computeExpected`) ([SpaceInventoryView.vue:1722-1752](../../src/views/SpaceInventoryView.vue)) | ✅ |
| Réconciliations disponibles dans la section Réconciliation comme Post-event | Liste commune pré+post, badge de type par document (`InventoryReconciliationSection`) ; sélection bascule `InventoryReconciliationView` sur `reconciliation.kind` | ✅ |

### 11.3 Écart ancrage event du comptage Post-event — CLOS le 2026-07-24

Le brief impose que le Post-event « reste liée au **dernier événement qui a eu lieu** ».
Historiquement, l'écran de comptage en entrée directe s'ancrait sur le prochain match FUTUR
(`future[0] || past[0]`) alors que le document de réconciliation cherchait le dernier passé —
un même clic pouvait sauvegarder le comptage sous MATCH-B et créer la réconciliation sous
MATCH-A (snapshot `kind='post-event'` rattaché au mauvais `eventId` → baseline du pre-event
suivant empoisonnée).

**Tranché par l'owner (2026-07-24)** : règle « un match = un eventId, aucune bascule
silencieuse » — implémentation § 12.4 (ex-question #32 de l'ancienne numérotation du tracker,
absorbée par la décision — note dans `QUESTIONS_A_BERTRAND.md`).

---

Rédaction § 11 : **JLH**, 2026-07-23.

---

## 12. Contre-audit externe (2026-07-24) — verdict et suites

Un contre-audit externe de la feature a été vérifié **claim par claim contre le code réel**
(session 2026-07-24). Verdict : largement exact sur les faits, mais ~7 points sur 10 étaient
déjà documentés dans ce dossier (§ 8.5, § 9.3, § 11.3, BUG-232/233, Q24–Q26, Q31–Q32) — le
contre-audit les présentait comme des découvertes.

### 12.1 Findings réellement nouveaux (confirmés puis traités)

| Finding | Vérif | Traitement |
|---|---|---|
| Fuite des attendus via les réponses réconciliation | = BUG-233 (déjà fiché) | **Corrigé** : expurgation conditionnelle (fiche 233) |
| Section Réconciliation inaccessible sur mobile | `showLeftFilters` exige `!isMobile`, drawer sans section | **Corrigé** : section montée dans le drawer ([BUG-236](../bugs/236_reconciliation_section_inaccessible_mobile.md)) |
| Échec du chargement des ventes → `sold=0` → fausses pertes **persistées** | catch qui continuait ([SpaceInventoryView.vue](../../src/views/SpaceInventoryView.vue) `buildReconciliationLines`) | **Corrigé** : hors démo, échec ventes = pas de création (toast `invRecoSalesError`, comptage sauvegardé, recliquer retente) |
| Ventes d'articles composés jamais décomposées vers les ingrédients (faux manquants sur stock d'ingrédients) | jointure directe `menuItemId`/nom, aucune explosion BOM | Ex-Q35, **tranchée owner 2026-07-27 (Option 1)** et **corrigée** : la réco consomme `explodeSalesToConsumption` via `GET event-consumption` (fiche [242](../bugs/242_reco_post_event_ventes_composees_non_explosees.md)) |

### 12.2 Claims du contre-audit réfutés ou nuancés

- « Dernier correctif uniquement sur la branche feature » — **faux** : le HEAD de
  `feat/postEventInventory` est contenu dans `origin/develop` ET `origin/staging` (git vérifié).
- « Un inventaire incomplet peut produire un document » — exact mécaniquement, mais c'est la
  **garde douce décidée** (2026-07-06/20) ; requalifié en question métier (Q36), pas en bug.
- « 24/25 tests backend » — exact au moment de l'audit : l'échec était un **mock obsolète** de la
  spec (`spaceElement.findMany` non câblé après l'ajout du filtre orphelins BUG-235), corrigé le
  2026-07-24 (30/30 avec les nouveaux tests d'expurgation).

### 12.3 Ajouts de la même session (hors contre-audit)

- **Suppression d'un document de réconciliation** (demande user 2026-07-24) :
  `DELETE /inventory/:spaceId/reconciliations/:id`, bouton corbeille dans la section
  (desktop + drawer), confirmation. « Repartir de zéro » = supprimer puis recliquer « Générer la
  réconciliation » — pas d'édition (un document est une photo figée, l'éditer fausserait
  l'archive). Périmètre strict kind pre/post-event (resets logistiques intouchables). Qui a le
  droit de supprimer reste à trancher (Q37 — aujourd'hui : tout porteur de `spaceInventory`).

### 12.4 Ancrage strict « un match = un eventId » (décision owner 2026-07-24)

Règle imposée : *un seul match par cycle — prédiction, pre, ventes, post et réconciliations
portent le MÊME `eventId` ; aucune étape ne bascule silencieusement vers un autre match.*
Implémentation (`resolveEventContext` / `resolveReconciliationEvent`, SpaceInventoryView) :

| Cas | Avant | Après |
|---|---|---|
| Post, entrée directe | `future[0] \|\| past[0]` (futur d'abord !) | **dernier passé strict** (`past[0]`), aucun repli futur |
| Post, `?event=` futur (deep-link Event Predict) | accepté → comptage tagué sur un match à venir | **ignoré** → repli dernier passé, URL resynchronisée |
| Post, `?event=` passé explicite | accepté | accepté (réconcilier un vieux match = choix délibéré, pas une bascule) |
| Pre, `?event=` quelconque | futur lointain accepté (ex-Q35, absorbée par la décision) | **ignoré** — toujours le prochain futur strict |
| Réco post | event de l'écran si passé, sinon repli silencieux « dernier passé » (source du décalage MATCH-B/MATCH-A) | **event de l'écran strictement** ; non fini → refus explicite (toast `invRecoEventNotFinished`), comptage sauvegardé |

Reste ouvert (chantiers non retenus dans cette passe, à planifier) : « passé » = date de FIN
d'événement (`eventEndDate`) et non de début ; séparation physique des `InventoryCount`
pre/post ; baseline de l'attendu ancrée au match précédant le match CIBLE (+ borne haute des
mouvements) — recoupe Q24/Q25.

Rédaction § 12 : **JLH**, 2026-07-24.

---

## 13. Vérification d'implémentation (2026-07-24, 2ᵉ passe du jour)

Relecture du **brief produit d'origine** contre le code réel — front ET backend — sans s'appuyer sur
les verdicts des §§ 11-12 (chaque ligne rouverte dans le fichier cité). Objectif : confirmer que les
correctifs du 2026-07-24 (ancrage strict § 12.4, suppression § 12.3, accès mobile fiche 236) n'ont
rien cassé, et chercher ce que le dossier ne recensait pas encore.

### 13.1 Conformité du brief — reconfirmée

| Exigence du brief | Vérifié dans | Verdict |
|---|---|---|
| « Inventory » → « Post-event Inventory » (titre de page) | `invPageTitle` [translations.js:1760](../../src/i18n/translations.js) / [:5484](../../src/i18n/translations.js), rendu [SpaceInventoryView.vue:133](../../src/views/SpaceInventoryView.vue) (bi-mode `preInvPageTitle`/`invPageTitle`) ; `hdrSecInventory` :2027/:5751 | ✅ |
| Bouton du dropdown renommé | `invToolInventory` [translations.js:1830](../../src/i18n/translations.js)/[:5554](../../src/i18n/translations.js) ; `hdrSecPreInventory` :1778/:5502 | ✅ |
| Post-event lié au **dernier événement qui a eu lieu** | [SpaceInventoryView.vue:1386-1421](../../src/views/SpaceInventoryView.vue) : `?event=` futur ignoré, ancrage `past[0]` strict | ✅ |
| Save → document de réconciliation (compté vs restant-théorique après ventes) | [SpaceInventoryView.vue:1698-1732](../../src/views/SpaceInventoryView.vue) → `:1812-1973` → [postEventReconciliation.js](../../src/utils/postEventReconciliation.js) | ✅ (réserves 238/241) |
| Section Réconciliation sous les filtres, colonne gauche | [SpaceInventoryView.vue:110-117](../../src/views/SpaceInventoryView.vue) (après `InventoryFilterPanel`) ; mobile [InventoryFilterDrawer.vue:241](../../src/components/InventoryFilterDrawer.vue) | ✅ |
| Bouton « Générer la réconciliation » / « Create Reconciliation » | `invSave` [translations.js:1774](../../src/i18n/translations.js)/[:5498](../../src/i18n/translations.js), bouton [SpaceInventoryView.vue:185-200](../../src/views/SpaceInventoryView.vue) | ✅ |
| Pre-event : même layout, toujours le **prochain** événement | Écran bi-mode (`route.meta.inventoryMode`), [router/index.js:168-180](../../src/router/index.js) ; futur strict [SpaceInventoryView.vue:1415](../../src/views/SpaceInventoryView.vue) | ✅ |
| Attendus = post-event précédent + mouvements Logistic, **sous** les champs Packed/Loose | `computeExpected` ([inventory.service.ts:413-520](../../../backend/src/features/inventory/inventory.service.ts)) → [preEventExpected.js](../../src/utils/preEventExpected.js) → caption `InventoryCountingInterface` | ✅ (réserve 239) |
| Attendus visibles Directeur de site / Chef exécutif / Admin seulement | Gate **serveur** : `@RequirePermissions('front.fb.preInventoryExpected')` [inventory.controller.ts:99-115](../../../backend/src/features/inventory/inventory.controller.ts) + `PermissionsGuard` bien enregistré en `APP_GUARD` global ([app.module.ts:189](../../../backend/src/app.module.ts)) ; miroir client `canSeeExpected` [SpaceInventoryView.vue:907-911](../../src/views/SpaceInventoryView.vue) ; expurgation des réponses réco identique à la logique du guard ([inventory.controller.ts:38-43](../../../backend/src/features/inventory/inventory.controller.ts)) | ✅ |
| Save Pre-event → réconciliation attendu vs compté, même section | `createPreEventReconciliation` [inventory.service.ts:569-687](../../../backend/src/features/inventory/inventory.service.ts) ; liste commune `kind IN ('post-event','pre-event')` `:261-277` ; badge [InventoryReconciliationSection.vue:29-33](../../src/components/InventoryReconciliationSection.vue) | ✅ |

Tests rejoués : `npx jest tests/unit/postEventReconciliation.spec.js tests/unit/preEventExpected.spec.js`
→ **21/21 PASS** (2026-07-24).

### 13.2 Écarts nouveaux — 5 fiches, toutes corrigées le jour même

Trouvés puis corrigés le 2026-07-24 sur `feat/postEventInventory` (statut 🟡 **Corrigé non
déployé**). Le détail de chaque correctif vit dans sa fiche ; § 13.4 donne le mode d'emploi du
déploiement, qui est **conjoint** (migration SQL + `prisma generate` + redémarrage backend).

| Fiche | Sév. | Écart constaté → correctif | Section |
|---|---|---|---|
| [237](../bugs/237_post_event_prerempli_par_comptage_pre_event.md) | 🟠 ✅ | Le Post-event s'ouvrait **pré-rempli et « 100 % compté »** avec les saisies du Pre-event du même match (`InventoryCount` keyé sans la phase, même `eventId` depuis § 12.4) : garde « comptage incomplet » neutralisée, un clic archivait un snapshot `kind='post-event'` égal au comptage d'avant-match, baseline du cycle suivant empoisonnée. → **Phase de comptage** `?phase=pre-event\|post-event` : toute ligne figée avant la clôture du Pre-event revient « à compter » (valeurs conservées, drapeau `carriedFromPreEvent`, bandeau `invPostCarriedHint`). | § 8.5 limite 1 |
| [238](../bugs/238_reco_post_event_ventes_non_jointes_avalees.md) | 🟠 ✅ | Ventes dont le PdV (nom normalisé) ou l'article ne joignait pas le référentiel compté : `continue` silencieux → `soldUnits = 0` → faux manquants persistés, alors que le chemin pre-event remontait déjà `unjoinedItemKeys`. → **Compteurs + `console.warn`**, archivés dans `StockReconciliation.meta` et affichés en bandeau sur le document ; la jointure article vérifie en plus que l'id existe dans le référentiel compté. | § 7.2 |
| [239](../bugs/239_pre_event_taille_de_paquet_divergente_serveur_front.md) | 🟠 ✅ | Deux chaînes de résolution de la **taille de paquet**, priorités inverses (serveur : MarketPrice d'abord ; front : fiche menu item d'abord) → attendus, hints « Attendu : N » et écarts faux dès qu'elles divergent. → **Calcul en unités** : baseline convertie avec le conditionnement inventaire, mouvements avec celui de la Logistique, `units`/`unitsPerPack` transportés jusqu'à la vue (régime inchangé quand aucun conditionnement n'est connu). | § 8.3, § 8.4 |
| [240](../bugs/240_reconciliation_dark_mode_et_formats_fr_fr_en_dur.md) | 🟡 ✅ | Section + vue Réconciliation : 44 couleurs en littéraux, **0** `var(--fb-*)` → deux blocs blancs en thème sombre ; `toLocaleString('fr-FR')` en dur malgré l'i18n maison. → **Contrat `--fb-*`** (couleurs sémantiques comprises) + locale de l'app. | § 7.4 |
| [241](../bugs/241_getpreeventinventory_repli_legacy_hors_event.md) | 🟠 ✅ | `getPreEventInventory` : repli `createdAt < jour de l'event` **sans filtre `eventId` ni `kind`** (contrairement à son commentaire) → stock de départ possiblement issu d'un autre match, non tracé, contre § 12.4. → **Repli scopé** au post-event du match précédent, `source` renvoyé, archivé dans `meta` et affiché en bandeau ; sinon « — ». | § 7.2, § 7.5 limite 1 |

Arbitrages produit encore demandés — les correctifs ne les préemptent pas, ils rendent le
comportement actuel juste et lisible : [Question #38](../QUESTIONS_A_BERTRAND.md) (le pre-event
doit-il pré-remplir le post-event ? un stock de départ de repli est-il acceptable, ou faut-il « — »
strict ?) et [#39](../QUESTIONS_A_BERTRAND.md) (quel référentiel fait foi pour la quantité par
paquet : fiche menu item ou MarketPrice).

### 13.3 Anomalies mineures sous surveillance (pas de fiche)

- **Double `loadForSpace` à l'entrée directe** : `resolveEventContext` resynchronise l'URL
  (`router.replace({ query: { …, event } })`, [SpaceInventoryView.vue:1416-1420](../../src/views/SpaceInventoryView.vue)),
  ce qui change `routeContextKey` (`:862-865`) et redéclenche le watcher `immediate` (`:2099-2106`)
  alors que le premier chargement est encore en cours. `loadInventory` est dédupliqué en vol
  ([inventory.js:111-118](../../src/store/modules/inventory.js)), mais `loadContext` et les
  chargements de référentiels repassent. Coût réseau, pas de faute fonctionnelle.
- **`invRecoEventNotFinished` quasi inatteignable** ([:1820](../../src/views/SpaceInventoryView.vue)) :
  depuis l'ancrage strict, le mode post ne peut plus s'ancrer sur un événement futur, donc
  `resolveReconciliationEvent` ne renvoie null que sur un event introuvable. Branche défensive
  conservée volontairement — à ne pas prendre pour un chemin vivant lors d'un futur refactor.

### 13.4 Déploiement des correctifs — dans cet ordre

Les cinq correctifs partent ensemble. Le seul point dur est la nouvelle colonne :

1. `prisma/sql/2026-07-24_stockreconciliation_meta.sql` (idempotent) — ajoute
   `StockReconciliation.meta`, qui porte le contexte de fabrication du document.
2. `prisma generate` — sans ça le client Prisma ne sélectionne pas la colonne : `meta` remonte
   `undefined` et les bandeaux ne s'affichent jamais (aucune erreur, juste un silence).
3. Redémarrage/redéploiement backend (nouveaux champs de DTO + `?phase=`).
4. Front : rien de particulier — tant que le backend n'est pas à jour, le POST de réconciliation
   **retombe automatiquement** sur la version sans contexte (400 « property … should not exist »
   intercepté) plutôt que d'échouer, réflexe
   [BUG-228](../bugs/228_inventory_snapshot_kind_rejete_backend_perime.md).

Vérifications après déploiement : (a) ouvrir le Post-event d'un match dont le Pre-event a été
clôturé → bandeau « recomptez » et onglet « À compter » non vide ; (b) générer une réconciliation
post-event sans comptage d'avant-match → bandeau de provenance ; (c) un article dont
`inventoryNumberOfUnits` diffère du `packedUnits` MarketPrice → attendu cohérent avec la Logistique
en unités.

Tests : backend **41/41** (`npx jest src/features/inventory`, +11 cas), front **478 verts**
(`npx jest` ; 4 échecs préexistants hors périmètre — `apiOrMock`, `spaceMenusInventory`,
`eventDetailsEditor` — identiques avant/après, vérifié par `git stash`).

Rédaction § 13 : **Claude** (session de vérification puis correction 2026-07-24), méthode
`modules/00_INDEX.md` (chaque affirmation ouverte dans le fichier cité).

### 13.5 §13.4 n'a jamais été exécuté en production — et son étape 2 est fausse

Constaté le 2026-07-30, remonté par l'utilisateur : `GET /inventory/:spaceId/reconciliations`
renvoie **500** en production — « The column `StockReconciliation.meta` does not exist ». La
migration `prisma/sql/2026-07-24_stockreconciliation_meta.sql` n'a jamais été jouée sur la base.
Fiche [248-01](../bugs/248_01_stockreconciliation_meta_non_appliquee_prod.md).

Deux corrections à §13.4 :

- **L'étape 2 (`prisma generate`) n'est pas une étape sur Render.** Render construit depuis le
  dépôt, dont le schéma déclare déjà `meta` : le client déployé sélectionne donc la colonne — c'est
  exactement pour ça que la requête échoue. La regénération n'est utile qu'en local, quand
  `node_modules/.prisma` date d'avant la colonne.
- **Le mode de panne prédit est faux.** §13.4 annonçait « `meta` remonte `undefined`, aucune erreur,
  juste un silence ». La réalité est un **P2022, donc un 500 dur** sur 6 requêtes, dont le reset
  logistique et l'export.

Le DDL doit passer par la connexion **directe** (`DIRECT_URL`, port 5432), pas par le pooler :
`prisma db execute` résout `DATABASE_URL` et vise donc le pooler s'il n'est pas forcé. Commandes
exactes dans la fiche.

---

## 14. Indices attendus — spécification complète (2026-07-30, JLH)

Entretien de cadrage avec l'owner. Trois écrans, trois nombres, tous confirmés en séance.

### 14.1 Les trois indices

| Écran | Emplacement | Formule |
|---|---|---|
| Pre-event | sous **Packed** et sous **Loose** | post-event du match précédent ± mouvements Logistic (inchangé, § 8.3) |
| Pre-event | à côté du **Total** de l'article | **besoin prédit** Event Predict (ventes prédites × ajustements, explosées au grain inventaire) |
| Post-event | à côté du **Total** de l'article | comptage **pre-event du même match** + mouvements de la fenêtre − ventes |
| Logistic | **colonne séparée**, sous le stock attendu | besoin prédit **brut** (le stock attendu `StockLevel − ventes` reste inchangé) |

Le netting « besoin − stock restant = à ramener » n'est ajouté **nulle part** : il reste l'écran
Réarmement. L'y dupliquer donnerait deux écrans répondant à la même question avec deux stocks de
référence différents (comptage d'un côté, `StockLevel` de l'autre — le « piège n°1 » du domaine).

### 14.2 Règles de calcul tranchées

- **Source du prédit** : `EventPredictVersion.predictedRecords` de la version marquée **`isDefault`**,
  lue par l'API (`GET /events/:eventId/predict-versions`, triée `isDefault desc`). Miroir
  localStorage en repli si l'API tombe. Aucune version par défaut → « — » et une invite, jamais un 0
  fabriqué. « La plus récente » a été écartée : le chiffre de référence changerait dès qu'un
  scénario de test est sauvegardé.
- **Fenêtre des mouvements de l'indice post-event** : `eventDate → eventEndDate + 1 j`, **la même
  borne que les ventes** (`deriveEventConsumption`). Les deux termes de la formule doivent parler de
  la même période, sinon le réarmement du match suivant gonfle l'indice.
- **Mouvements `reason: SALE` exclus du rejeu.** `logistics.reset()` matérialise les ventes des
  niveaux non couverts en mouvements `SALE` ; les compter en plus des ventes dérivées les déduirait
  deux fois.
- **Résultat non clampé.** Un indice négatif signale une incohérence de sources (vente non
  rattachée, mouvement oublié, comptage pre-event faux) — c'est le signal utile pour le directeur de
  site, un 0 le masquerait. Le clamp ≥ 0 du rejeu de mouvements, lui, reste.
- **Permission** : `front.fb.preInventoryExpected` couvre les deux écrans (libellé élargi dans
  `permission-catalog.ts:52`). Pas de nouvelle permission, pas de re-seed.
- **Libellés distincts** (`invPredictedNeedHint` « Besoin prédit » / `invPostExpectedHint` « Doit
  rester ») : les deux modes n'affichent pas la même grandeur, les légender du même mot fabriquerait
  une fausse comparaison.

### 14.3 Réconciliation — les deux documents complétés

Chaque document n'avait que la moitié de la comparaison :

- **post-event** avait le prédit et les ventes, pas les mouvements → un transfert entre PdV pendant
  le match se lisait comme un manquant d'un côté et un surplus de l'autre. `leftFromSales` devient
  `pre-event − vendu + mouvements` ; le terme est archivé par ligne (`movementUnits`) et sa
  provenance dans `meta.movementsSource`. **Sans le paramètre, la formule historique est conservée
  à l'identique** — les documents déjà en base ne changent pas de sens.
- **pre-event** avait l'écart vs attendu logistique, pas vs Event Predict → `predictedUnits` et
  `deltaVsPredicted` par ligne, `meta.predictedSource`. Le besoin prédit est **fourni par le
  client** (le scénario vit côté front ; le réimplémenter côté serveur donnerait deux moteurs qui
  divergeraient) et `redactPreEventDoc` masque les deux nouveaux champs pour les non-porteurs —
  sinon `counted − deltaVsPredicted` reconstruirait le prédit.

### 14.4 Diagnostic — plus de tirets muets

`fetchPreExpected` avalait tout en `console.warn` : 403, 404, absence de comptage de référence et
bug réel produisaient **le même écran de tirets**. C'est ce qui a rendu le symptôme d'origine
(« je ne vois pas les quantités attendues ») indiagnosticable sans ouvrir l'onglet Réseau. L'écran
nomme désormais la cause (`expectedUnavailable`), sauf pour `no-permission` : un utilisateur non
habilité ne doit pas apprendre que la donnée existe (BUG-233).

### 14.5 Vérifié contre l'API de production (2026-07-30)

Sondes read-only, 401 = route existante, 404 = absente (calibrage : route bidon → 404) :
`pre-event-baseline` **401**, `post-event-baseline` **404** (nouvelle route, à déployer),
`pre-event` 401, `event-consumption` 401, `reconciliations` 401, `events/:id/predict-versions` 401,
`logistics/:id/stock` 401. **Le backend de production est donc à jour** : le « — » observé en
pre-event est un 403 ou une baseline vide, pas une route manquante.

Rédaction § 14 : **JLH**.
