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
   gagne que si l'id existe dans le store.
2. **Entrée directe** (sidebar, URL nue) : ancrage par défaut sur le **prochain event FUTUR le
   plus proche** (même règle qu'Event Predict), **repli sur le passé le plus récent** — premier
   dont la config est résoluble. L'URL est resynchronisée (`router.replace`) pour rester
   partageable.
3. Aucun event résoluble → état « Aucun évènement sélectionné » (save désactivé).

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
| Pré-event | `GET /inventory/:spaceId/pre-event/:eventId` — **le comptage Pre-event Inventory du MÊME event** (snapshot `kind='pre-event'`, cycle fermé § 8 — Q19 résolue), repli legacy = dernier snapshot antérieur au jour de l'event ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts) `getPreEventInventory`) | `leftFromSales`/`missingUnits`/`missingValue` **null** (« — ») |
| Vendu pendant l'event | `getSpaceEventTimelineBatch` + `preprocessTimelineRecords`, PdV résolu par nom normalisé, article par `menuItemId` → repli nom | 0 |
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
  (nom du match + date), état actif.
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
  réconciliation ».

### 7.5 Limites connues / questions ouvertes (voir `QUESTIONS_A_BERTRAND.md`)

1. **Pré-event** = dernier snapshot **antérieur au jour** de l'event (un comptage fait le jour du
   match est considéré post-match). Définition par défaut à valider.
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

**Ancrage événement** : mode pre = **futur strictement** (`resolveEventContext` ignore un
`?event=` passé et ne replie jamais sur le passé ; aucun futur → état vide `preInvNoUpcoming`).
Miroir exact du mode post qui, lui, réconcilie le dernier passé.

### 8.3 Quantités attendues — gating serveur

- Permission dédiée **`front.fb.preInventoryExpected`**
  ([permission-catalog.ts](../../../backend/src/core/rbac/permission-catalog.ts)) — attribuée aux
  rôles système « Directeur de site » et « Chef exécutif » (+ ADMIN via ALL_CODES). ⚠️ Ces deux
  rôles reçoivent AUSSI `front.fb.spaceInventory` au passage (ils ne pouvaient pas ouvrir les
  écrans d'inventaire — Q23). Provisioning : seed RBAC idempotent à relancer.
- `GET /inventory/:spaceId/pre-event-baseline/:eventId` — **décorateur méthode**
  `@RequirePermissions('front.fb.preInventoryExpected')` (getAllAndOverride → remplace la
  permission de classe) : un compteur sans le droit reçoit un 403, pas des données masquées.
  Retour : `{ previousEvent, baseline, movements }` ; `baseline: null` si l'événement précédent
  n'a pas de comptage post-event (décision user : « — », pas de mode « mouvements seuls »).
- Front : `fetchPreExpected` (SpaceInventoryView) n'émet l'appel que si `can('front.fb.preInventoryExpected')` ;
  util pur [`buildPreEventExpected`](../../src/utils/preEventExpected.js) (7 tests,
  `tests/unit/preEventExpected.spec.js`) fusionne baseline + mouvements — jointure
  **menuItemId d'abord, repli nom normalisé** (`StockMovement.itemKey` est un NOM libre, piège
  n°1 du domaine contourné explicitement ; mouvement non joignable → ignoré). Deltas négatifs
  **conservés** (signal de mouvement en double, pas une donnée à clamper).
- Affichage : `InventoryCountingInterface` prop additive `expectedFor` → caption « Attendu : N »
  sous chaque champ Packed/Loose ; prop null → rendu post-event strictement inchangé.

### 8.4 Réconciliation pre-event (attendu vs compté)

- « Générer la réconciliation » (même bouton) → `POST /inventory/:spaceId/pre-event-reconciliations`
  `{ eventId }` — **lignes construites CÔTÉ SERVEUR** (`createPreEventReconciliation`) : le client,
  potentiellement sans la permission « attendus », ne les a jamais eues. Compté = fusion
  existante (`getBySpaceAndEvent`), attendu = baseline + mouvements (jointure nom via le miroir
  TS `normalizeName` de `normalizeStr` front, documenté dans le service).
- Lignes persistées en **packed/loose bruts** (+ deltas) : le conditionnement
  (`inventoryQuantityPackaged`) est un référentiel front — la vue convertit en unités à
  l'affichage (`unitsPerItemId`), l'Écart € vient de `menuItemCostMap` (`costByItemId`), repli
  « — ». `StockReconciliation` `kind='pre-event'` — exclu de l'ancre et de la liste Logistic
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
2. **Fenêtre des mouvements** bornée au snapshot post-event précédent : un Inventory Reset
   logistique intercalé (qui SET les niveaux) n'est pas déduit — possibles doubles comptages
   (Q24, défaut : deltas seuls).
3. Attendus figés au chargement de l'écran (pas de refresh live si un mouvement Logistic arrive
   pendant le comptage).
4. Jointure par nom des mouvements sans `menuItemId` : normalisation identique front/back, mais
   un renommage d'article entre le mouvement et le comptage casse la jointure (mouvement ignoré).

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
| `attendu = post-event précédent + mouvements Logistic` | calcul **serveur** : baseline = snapshot `kind='post-event'` du dernier event passé + Σ deltas signés `StockMovement` ([inventory.service.ts:342-415](../../../backend/src/features/inventory/inventory.service.ts)) ; rendu front [preEventExpected.js](../../src/utils/preEventExpected.js) | ✅ (voir divergences D1/D2) |
| Pas de baseline → pas d'attendu fabriqué | `baseline: null` → « — », jamais 0 ([preEventExpected.js:35-36](../../src/utils/preEventExpected.js)) | ✅ |
| Attendu visible Directeur de site / Admin / Chef exécutif seulement | gate **serveur** 403 via `front.fb.preInventoryExpected` (§ 8.3) — rôles porteurs : ADMIN (ALL_CODES), Directeur de site, Chef exécutif ([permission-catalog.ts:52-59,168-195](../../../backend/src/core/rbac/permission-catalog.ts)) ; les autres comptent à l'aveugle | ✅ |
| Pre-event = prochain match, Post-event = dernier fini | pre : futur strict ; post : contexte passé sinon dernier passé ([SpaceInventoryView.vue:1379-1402](../../src/views/SpaceInventoryView.vue)) — fallback corrigé (bug [222](../bugs/222_inventory_reconciliation_fallback_plus_vieux_match.md)) | ✅ après fix |
| Packed / Loose | canaux séparés de bout en bout, conversion `packed × inventoryQuantityPackaged + loose` à l'affichage seulement | ✅ |

### 9.3 Divergences relevées (pas des bugs tranchés — règles à valider, cf. Questions)

| # | Divergence | Où | Question |
|---|---|---|---|
| D1 | L'attendu somme **toutes** les raisons de `StockMovement` (DELIVERY, TRANSFER, EXPIRY, SALE, INVENTORY_RESET, OTHER — signe `direction==='add' ? +1 : −1`), pas seulement livraisons − retraits comme la spec le formule | [inventory.service.ts:368-391](../../../backend/src/features/inventory/inventory.service.ts), [logistics.service.ts:319-321](../../../backend/src/features/logistics/logistics.service.ts) | Q25 |
| D2 | Fenêtre des mouvements **sans borne haute** (`createdAt > snapshot` seulement) et baseline ancrée au **dernier match passé global** (`eventDate <= now`), pas au match précédant le match cible | [inventory.service.ts:344-348,369](../../../backend/src/features/inventory/inventory.service.ts) | Q25 (recoupe Q24) |
| D3 | Métriques post-event (`soldUnits`, `predictedUnits`, `leftFromSales`, `missingUnits`, `missingValue`) fournies par le **client** et stockées verbatim — aucun recalcul/contrôle serveur | [create-post-event-reconciliation.dto.ts:19-77](../../../backend/src/features/inventory/dto/create-post-event-reconciliation.dto.ts), service :214-247 | Q26 |
| D4 | Lignes pre-event serveur : `delta = compté − attendu` (signe inversé vs « missing ») ; la vue reconvertit (`missing = −delta` positifs, `preSummary` [InventoryReconciliationView.vue:223-245](../../src/components/InventoryReconciliationView.vue)) — cohérent à l'affichage, mais deux conventions de signe coexistent en base | schéma de lignes § 8.4 | documenté, pas de question |

Anomalie mineure sous surveillance (pas de fiche) : [preEventExpected.js](../../src/utils/preEventExpected.js)
ne coerce pas `packedDelta` en entier — un delta packed fractionnaire côté données fuiterait un
compte packed fractionnaire à l'affichage.

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
