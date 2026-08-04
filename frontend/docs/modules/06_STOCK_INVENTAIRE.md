# Stock — Inventaire, Logistique, Réarmement

> Domaine cartographie : **Stock**. Owners produit : Jean-Luc (Inventory, Réarmement),
> Ulrich (Logistic). Écrans : `/spaces/:id/inventory`, `/spaces/:id/logistic`,
> `/spaces/:id/restock`.
>
> Vérifié exhaustivement le 2026-07-15 : les 6 modèles Prisma du domaine, les 3 contrôleurs
> backend (`InventoryController`+`InventoryCountsController`, `LogisticsController`,
> `RestockStateController`), les 3 stores Vuex, les 3 clients API, les 3 écrans front et
> l'intégralité de leurs composants/composables/utils ont été lus directement (pas de
> citation recopiée d'un rapport tiers). Objectif : qu'un dev ou un agent IA qui doit
> corriger un bug ici sache exactement où regarder et ce qu'il risque de casser ailleurs,
> sans relire le code.
>
> **Ce document remplace le brouillon `docs/utiles/modules/06_STOCK_INVENTAIRE.md`**
> (format audit court, verdict "✅ Formule correcte partout"). Ce verdict reste vrai sur le
> point précis qu'il vérifiait (la formule d'inventaire), mais le brouillon ne couvrait
> qu'un quart du domaine : il ne mentionnait ni Logistic (le ledger temps réel, pourtant
> cité dans son propre périmètre) ni Réarmement en détail, et sa piste "InventoryView.vue
> mort, atteignable via `appCopy.vue`" s'avère **inexacte** en relisant le code aujourd'hui —
> `appCopy.vue` ne référence jamais `InventoryView.vue` (la seule occurrence du nom dans
> `appCopy.vue` est un commentaire sur un flag `showInventoryView`, sans rapport). Ce fichier
> est en réalité un orphelin total, zéro importeur nulle part dans le repo — voir Code mort.

---

## Vue d'ensemble — trois systèmes de stock qui ne se parlent jamais

```
┌─────────────────────────── INVENTORY (comptage manuel périodique) ───────────────────────────┐
│                                                                                                │
│  InventorySnapshot (blob JSON, append-only)   InventoryCount (1 ligne = space×event×shop×item) │
│         ▲ POST /inventory (bouton Save)              ▲ POST /inventory-counts (par saisie)     │
│         └──────────────────┬─────────────────────────┘                                        │
│                     GET /inventory/:spaceId/:eventId  (fusion : InventoryCount prioritaire,     │
│                                                         sinon dernier InventorySnapshot)        │
└─────────────────────────────────────┬──────────────────────────────────────────────────────────┘
                                       │ lu par (SEULE dépendance de stock du Réarmement)
                                       ▼
┌─────────────────────────── RÉARMEMENT (planification, pas une source de stock) ──────────────┐
│  RestockState (blob JSON opaque, 1 ligne par tenant×space — snapshot UI, pas du stock)          │
│  Moteur : objectif (prédiction Event Predict) − comptage Inventory = feuille de course          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────── LOGISTIC (ledger temps réel, indépendant) ────────────────────────┐
│                                                                                                │
│  StockMovement (append-only, deltas signés) ──► StockLevel (état matérialisé packed/loose)      │
│         │ POST /logistics/movements (+/− manuel), transferts, reset                            │
│         │                                                                                       │
│         └─ Consommation ventes : PAS matérialisée — dérivée READ-TIME depuis                    │
│            WeezeventTransaction/Item bornée par la dernière StockReconciliation                 │
│            (StockReconciliation = archive des écarts figés par un Inventory Reset)              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Aucune flèche ne relie Logistic à Inventory/Réarmement, ni dans un sens ni dans l'autre** —
voir piège n°1. Les 6 modèles Prisma : `InventorySnapshot`, `InventoryCount` (Inventory) ;
`StockMovement`, `StockLevel`, `StockReconciliation` (Logistic) ; `RestockState` (Réarmement).

---

## Règle n°0 : on découpe une recette d'un seul cran, jamais deux

Règle métier fondatrice du domaine (owner, 2026-08-04 ; décision Bertrand du même jour sur les
combos, Question #18). Elle gouverne **quatre** écrans, et une exception en concerne **un seul**.

| Ce qu'on demande à l'écran | Niveau de décomposition |
|---|---|
| Stock-up (« qu'est-ce qu'on charge ? ») | 1 cran |
| Inventaire pré-event (« qu'est-ce qu'on compte ? ») | 1 cran — **la même liste** |
| Inventaire post-event | 1 cran — la même liste |
| Réarmement (`predict − compté`) | 1 cran — la même liste |
| **Feuille de course** (« qu'est-ce qu'on achète ? ») | **jusqu'aux ingrédients** |

Concrètement, pour un menu item :

- `readyForSale='Yes'` → on stocke **l'article tel quel**, packaging non séparé (il arrive emballé) ;
- `readyForSale='No'` → on stocke **toute sa recette** : ingrédients + composants + packaging ;
- un **composant** n'est jamais ouvert : la sauce pickle arrive prête de la cuisine centrale, on
  stocke « sauce pickle », jamais son ail ;
- un **combo** est un panier, pas un article : on l'ouvre, et chaque constituant redevient un menu
  item ordinaire soumis aux règles ci-dessus. La récursion dépend donc de la nature du **parent**,
  jamais du `readyForSale` de l'enfant.

L'exception de la feuille de course n'est pas une incohérence : on n'achète pas un composant à un
fournisseur. C'est **le seul endroit** où les composants sont éclatés en ingrédients, agrégés et
groupés par fournisseur.

**Où vit la règle** : `src/utils/menuItemExpansion.js` — une implémentation unique, que les écrans
consomment. Elle a existé en **cinq** copies divergentes jusqu'au 2026-08-04
([BUG-292-01](../bugs/292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md)) ;
si vous vous apprêtez à écrire une sixième expansion de recette, c'est le signe qu'il faut étendre ce
module. L'éclatement composant → ingrédients vit dans `src/utils/bomPlanning.js`, et sa recette est
hydratée par `src/utils/componentCatalog.js` (la LISTE `/menu-components` ne porte pas
`subComponents` — seul le détail les a).

**Exception documentée** : l'inventaire compte **en plus** le packaging des articles
`readyForSale='Yes'` (`inventoryUtils.js:311-334`, décision owner du 2026-08-04). Les trois listes
sont donc « identiques + ce packaging », et c'est voulu.

---

## ⚠️ Piège n°1 : Inventory et Logistic sont deux représentations du stock totalement indépendantes

Ce domaine a **deux écrans qui répondent chacun à "combien de stock reste-t-il ?"**, avec des
modèles de données, des formules et des permissions distincts, et **zéro synchronisation entre
les deux** :

| | **Inventory** (`/spaces/:id/inventory`) | **Logistic** (`/spaces/:id/logistic`) |
|---|---|---|
| Nature | Comptage **manuel périodique** (photo à un instant T, par event) | **Ledger temps réel** (mouvements append-only + niveau matérialisé) |
| Table(s) | `InventorySnapshot` (blob), `InventoryCount` (par item) | `StockMovement`, `StockLevel`, `StockReconciliation` |
| Ventes prises en compte ? | Non — c'est un comptage physique, les ventes ne sont pas déduites automatiquement | Oui — déduites **read-time** depuis Weezevent, bornées par la dernière réconciliation |
| Consommé par | Réarmement (`SpaceRestockView.vue`, seule dépendance de stock) | Rien d'autre que l'écran Logistic lui-même |
| Permission | `front.fb.spaceInventory` | `front.fb.logistic` (+`front.fb.logisticReconcile` pour reset/réconciliation/simulation) |

**Conséquence pratique vérifiée dans le code** : `views/SpaceRestockView.vue` (moteur du
Réarmement) n'importe **jamais** `api/endpoints/logistics.api.js` ni ne lit
`store.state.logistics` — grep exhaustif confirmé, la seule occurrence du mot "logistic" dans ce
fichier est l'entrée de navigation vers l'écran Logistic (`TOOLBOX_ITEMS`). Si un opérateur
ajuste le stock via Logistic (transfert, vente simulée, reset) **sans recompter dans Inventory**,
le Réarmement ne le voit jamais — et réciproquement, un comptage Inventory n'alimente jamais
`StockLevel`. Si tu dois "corriger une incohérence de stock", vérifie D'ABORD lequel des deux
écrans l'utilisateur regardait — un correctif posé sur l'un ne s'applique jamais à l'autre.

---

## ⚠️ Piège n°2 : deux moteurs de calcul du "reste à commander", pas un seul

- **`utils/shoppingList.js` (`buildShoppingList` + `countedRemaining`)**, via
  `composables/useShoppingList.js` — **n'est utilisé que par
  `components/InventoryAggregateView.vue`** (un mode secondaire "Aperçu feuille de course" à
  l'intérieur de l'écran **Inventory**, basé sur un event de référence choisi). Ce n'est **pas**
  le moteur du Réarmement.
- **Le moteur réel du Réarmement** est une logique inline propre à
  `views/SpaceRestockView.vue` (computeds `restockRows`/`nettedShopping`) appuyée sur
  `utils/stockPlanning.js` (explosion recette + ajustements %) et `utils/stockNetting.js`
  (`preparePool`/`consumeFromPool`, cascade de rapprochement stock shop → stock storage). Cette
  logique est plus riche (matching par id puis par nom, tracking du stock Storage non consommé)
  et **totalement indépendante** de `shoppingList.js`.

Les deux implémentations ne partagent qu'**une seule fonction commune** :
`countedRemaining()` (`utils/shoppingList.js:22-26`), importée directement par
`SpaceRestockView.vue:1035` et appelée dans `remainingQuantityForRow()`/`remainingFromCount()`
— donc pas une 3ᵉ divergence, juste une formule partagée entre deux moteurs par ailleurs
différents. **Si tu dois documenter ou corriger "le calcul du réarmement", ne le cherche pas dans
`shoppingList.js`** : c'est `stockPlanning.js` + `stockNetting.js` + la logique inline de
`SpaceRestockView.vue`.

---

## 🔴 Piège n°3 (bug actif confirmé) : le rôle "Tableau de Réarmement" ne peut jamais sauvegarder, sans le savoir

Deux rôles métier réels (`api-datafriday-staging/src/core/rbac/permission-catalog.ts:145-156`)
portent la permission `front.fb.restockBoard` **sans** `front.fb.restock` :

- **Technicien Logistic** : `['nav.spaces', 'front.fb.restockBoard']`
- **PDV Superviseur** : `['nav.spaces', 'front.fb.spaceInventory', 'front.fb.restockBoard']`

La route front `/spaces/:id/restock` (`router/index.js:187`) et l'entrée `TOOLBOX_ITEMS`
(`SpaceRestockView.vue:1054`) acceptent bien les deux permissions en **OR**
(`front.fb.restock` OU `front.fb.restockBoard`) — ces utilisateurs ouvrent donc l'écran sans
problème et peuvent éditer normalement (aucun gating supplémentaire côté front, RestockView ne
distingue pas les deux permissions dans l'UI).

Mais côté backend, `RestockStateController` (`restock-state.controller.ts:29-74`) gate
différemment par verbe : `@Get()` accepte les deux permissions (ligne 35), tandis que `@Put()`
et `@Delete()` exigent **exclusivement** `front.fb.restock` (lignes 44, 67) — `restockBoard` seul
ne suffit pas. Or `persistRestockState()` (`SpaceRestockView.vue:2154-2165`) avale l'erreur du
`PUT` **silencieusement** (`.catch((err) => onRestockApiError(err))`, pas de toast), et
`onRestockApiError` (`restock.api.js:18-22`) ne bascule le flag "API down" que sur une erreur
**non-4xx** — un 403 reste donc considéré comme "API joignable" et le code **retente à chaque
frappe, indéfiniment, sans jamais prévenir l'utilisateur**.

**Repro exacte** : se connecter avec le rôle "Technicien Logistic" (ou "PDV Superviseur") →
ouvrir `/spaces/:id/restock` → modifier n'importe quel ajustement de stock → observer l'onglet
réseau : chaque `PUT /spaces/:id/restock-state` répond **403**, aucun toast ni bandeau
d'erreur n'apparaît. L'état est persisté en `localStorage` (donc "semble" fonctionner sur la
même machine/navigateur) mais **ne traverse jamais vers l'API** : changement de poste, de
navigateur ou purge du cache = perte silencieuse de tout le travail de réarmement de ce rôle.

**Statut (2026-07-15)** : documenté, non corrigé. Corrections possibles : élargir
`RequirePermissions` du `PUT`/`DELETE` à `('front.fb.restock', 'front.fb.restockBoard')` (si
`restockBoard` doit pouvoir éditer, ce que son usage réel suggère), ou distinguer le nom du rôle
("Tableau de Réarmement" sonne comme "lecture seule") et gater le front en conséquence.

---

## 🟡 Piège n°4 : deux fonctions du Réarmement pointent vers un ancien backend Supabase distinct de l'API NestJS

`views/SpaceRestockView.vue` et `composables/useShoppingList.js` importent
`getShopElementMappings` depuis **`@/utils/api`** — le monolithe legacy (45 Ko). Ce fichier ne
parle **pas** à `api-datafriday-staging` : sa `baseUrl` (`utils/api.js:5`) est
`https://${projectId}.supabase.co/functions/v1/make-server-eb31619c`, où `projectId`
(`utils/supabase/info.js`, fichier "AUTOGENERATED — DO NOT EDIT") référence un **projet Supabase
distinct** de celui du backend actuel — un reliquat de l'ancien prototype Edge Function
(pré-NestJS). **Vérifié : aucune route `/shop-element-mappings` n'existe dans
`api-datafriday-staging`** (grep exhaustif du nom sur tout `src/`, zéro résultat). Que cette
Edge Function legacy soit encore déployée ou non n'a pas pu être vérifié depuis la lecture du
code seule (pas d'accès réseau) — mais **tous les appelants traitent déjà l'échec comme
attendu** : `useShoppingList.js:103-108` et `SpaceRestockView.vue:2591-2593` encapsulent l'appel
dans un `try/catch` qui retombe sur `[]`. Fonctionnellement, l'enrichissement "nom de shop
Weezevent ↔ élément" que cette fonction devait apporter à la réconciliation des ventes est donc
**au mieux best-effort, au pire toujours vide** — sans que cela casse quoi que ce soit d'autre
(juste des suggestions de shop non-mappé potentiellement absentes).

Deux autres fonctions du même monolithe, `getSalesForSpace`/`getSalesSummaryForSpace`
(`utils/api.js:680-743`), pointent vers ce même projet Supabase (fonctions `/sales` et
`/make-server-eb31619c/sales/summary`) et alimentent `composables/useReferenceSales.js` — le
pipeline "ventes de référence" du mode `objectiveSource='sales'` du Réarmement. **Ce mode est
actuellement inaccessible depuis l'UI** (voir section Réarmement, `v-if="false"` sur le
sélecteur) : si ces Edge Functions sont mortes, cela ne se voit donc nulle part aujourd'hui — mais
le code degradé existe et remonte un bandeau d'avertissement visible (`referenceSalesDegraded`)
si jamais ce mode était réactivé et que l'appel échouait.

---

## InventorySnapshot — le blob complet (bouton "Enregistrer")

**Qu'est-ce que c'est** : une photo horodatée, append-only, de **tout** l'inventaire d'un
space+event au moment où l'utilisateur clique sur Enregistrer. Ce n'est pas la source de vérité
"live" — `InventoryCount` (ci-dessous) la remplace dès qu'au moins une ligne existe.

**Où vit le code** :
- Modèle : `schema.prisma:2417-2430`
- Service/contrôleur : `api-datafriday-staging/src/features/inventory/inventory.service.ts` /
  `inventory.controller.ts`
- Store Vuex : `datafriday-web/src/store/modules/inventory.js`
- Client API : `datafriday-web/src/api/endpoints/inventory.api.js`

**Routes** (`@Controller('inventory')`, permission `front.fb.spaceInventory`) :

| Route | Rôle |
|---|---|
| `GET /inventory/:spaceId/latest` | Dernier snapshot **tous events confondus** — doit être déclarée avant `:eventId` (sinon Fastify route `"latest"` vers le param `eventId`, commentaire explicite `inventory.controller.ts:30-31`) |
| `GET /inventory/:spaceId/:eventId` | Snapshot d'un event précis — **toujours 200** (jamais 404, cf. champs clés) |
| `POST /inventory` | Créer un nouveau snapshot (append-only, aucun update) |

**Champs clés** :

| Champ | Sens |
|---|---|
| `inventoryCounts` (Json) | `{ [shopId]: { [itemId]: {packedUnits, looseUnits, isCounted, ...} } }` — le blob complet au moment du save |
| `eventId` (nullable) | Sans event, le snapshot est "hors campagne" — rare en pratique (le front résout toujours un event avant de compter) |

**Pourquoi ce design (Priority merge)** : `getBySpaceAndEvent`/`getLatestBySpace`
(`inventory.service.ts:16-112`) donnent **toujours priorité aux lignes `InventoryCount`** (plus
granulaires, toujours à jour) sur le dernier `InventorySnapshot`, et **ne renvoient jamais 404** —
même sans aucune donnée, la réponse est `{ inventoryCounts: {} }`. Commentaire explicite du code :
"prevents localStorage fallback on front". C'est un choix délibéré pour que l'API reste
toujours la source de vérité prioritaire, y compris à vide.

---

## InventoryCount — le comptage unitaire (source de vérité "live")

**Qu'est-ce que c'est** : une ligne = un comptage d'UN item, dans UN shop, pour UN event —
upsertée à chaque saisie (steppers +/−, cases à cocher) sans attendre le bouton Enregistrer.

**Où vit le code** : modèle `schema.prisma:2433-2456` ; même service/contrôleur
qu'`InventorySnapshot` (`@Controller('inventory-counts')`, même fichier).

**Route** : `POST /inventory-counts` — upsert par `findFirst` puis `create`/`update` (pas
`prisma.upsert` : commentaire explicite du code, Prisma 5.x ne supporte pas les valeurs `null`
dans une clause `where` composite, or `eventId`/`shopId` sont tous deux nullable).

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `packedUnits` (Int) / `looseUnits` (Float) | Emballé (cartons/packs entiers) et vrac (unités détachées). Validation backend `@Min(0)` sur les deux — le front clampe déjà côté `sanitizeCountPatch` (`store/modules/inventory.js:25-31`) pour ne jamais déclencher le 400. |
| `isCounted` (Boolean) | Article marqué "compté" — pilote le statut binaire à l'écran (voir Formule d'inventaire). |
| `countingStatus` (`'pending'\|'in-progress'\|'counted'`) | Écrit en synchronie avec `isCounted` (`SpaceInventoryView.vue:1534-1539`) — **jamais lu à l'écran** en tant que tel côté Inventory (aucun affichage direct de sa valeur), c'est un champ dérivé/redondant avec `isCounted`. |
| `storageLocation` (String?) | **Champ mort côté front** : colonne DB vivante, acceptée par le DTO, mais **aucun composant du repo ne le saisit ni ne l'affiche** (`onCountInput`/`onCountValue` de `SpaceInventoryView.vue:1515-1531` testent bien `field === 'storageLocation'`, mais rien n'appelle jamais ces fonctions avec ce champ — `InventoryCountingInterface.vue` n'émet que `packedUnits`/`looseUnits`). Reste à `null` en pratique. |
| `discardedQuantity` (Int, défaut 0) / `discardedReason` (String?) | **Champs morts de bout en bout** : présents en base (`schema.prisma:2445-2446`), **absents du DTO** `CreateInventoryCountDto` (jamais écrits par le service), **absents du type canonique front** `types/inventoryCount.js` — dont le commentaire dit explicitement *"no 'discarded / jetés' concept exists"*. Aucune UI, aucun DTO, aucun service ne les manipule — les seules mentions du repo sont un commentaire de garde dans `store/modules/inventory.js:188-190` documentant *pourquoi* on ne les envoie pas (whitelist stricte du DTO → 400 sinon). |

**Ce qui en dépend** : `Réarmement` (`SpaceRestockView.vue`) lit ces comptages via
`apiGetInventory`/`apiGetLatestInventory` comme **unique** source de stock existant (voir piège
n°1) — modifier la forme de `InventoryCount` sans répercuter sur `buildInventoryCounts()`
(`inventory.service.ts:175-192`, qui reconstruit le blob `{shopId:{itemId:...}}` consommé par le
front) casse silencieusement le Réarmement.

---

## Formule d'inventaire — canonique, confirmée identique partout où elle est réellement utilisée

```
totalUnits = packedUnits × (inventoryQuantityPackaged || 1) + looseUnits
```

Confirmée **identique** dans le code vivant à ces emplacements exacts :
- `composables/useInventoryCounts.js:19-20` (`totalForItem`, référence canonique)
- `views/SpaceInventoryView.vue:1397-1400` (`totalForItem`)
- `components/InventoryAggregateView.vue:340-343` et `:391-394`
- `components/InventoryStorageAggregateView.vue:183-186`
- `utils/shoppingList.js:22-26` (`countedRemaining`, même formule réutilisée par le mode
  "Aperçu feuille de course" d'Inventory — voir piège n°2)

**Backend : jamais persisté tel quel.** `grep totalUnits` sur `api-datafriday-staging/src/` ne
retourne rien — seuls `packedUnits`/`looseUnits` sont stockés séparément ; `totalUnits` est un
pur concept d'affichage/calcul front, recalculé à chaque lecture. Le risque "mauvais total
persisté en base" ne se matérialise donc jamais.

**Seule occurrence fautive (formule additive `packedUnits + looseUnits`, sans multiplicateur)** :
`src/components/InventoryView.vue:870` — mais ce fichier est un **orphelin total** (voir Code
mort), donc sans impact en production.

---

## StockMovement / StockLevel — le ledger Logistic

**Qu'est-ce que c'est** : `StockMovement` est un journal append-only de deltas signés (positif =
entrée, négatif = sortie) ; `StockLevel` est l'état courant matérialisé (packed/loose) par
(élément × denrée), recalculé transactionnellement à chaque mouvement.

**Où vit le code** :
- Modèles : `schema.prisma:2473-2515`
- Service : `api-datafriday-staging/src/features/logistics/logistics.service.ts` (1417 lignes —
  le plus gros service du domaine)
- Contrôleur : `logistics.controller.ts` (`@Controller('logistics')`, permission
  `front.fb.logistic` au niveau classe)
- Store Vuex : `datafriday-web/src/store/modules/logistics.js`
- Client API : `datafriday-web/src/api/endpoints/logistics.api.js`
- Écran : `datafriday-web/src/views/SpaceLogisticView.vue` + 6 composants (voir section Frontend)

**Toutes les routes** (vérifiées ligne à ligne, `logistics.controller.ts`) :

| Route | Permission | Rôle |
|---|---|---|
| `GET :spaceId/stock` (+`?configId=&eventId=`) | `front.fb.logistic` (classe) | Référentiel complet auto-suffisant : éléments (PDV+Storage) avec leurs denrées nommées, `StockLevel`, consommation ventes dérivée — le front n'a plus besoin du catalogue complet |
| `GET :spaceId/market-prices` (`?itemKey=`) | idem | Market prices candidats pour le dropdown du popup +/− d'une denrée |
| `POST movements` | idem | Mouvement manuel (+/−, transfert) |
| `GET element/:elementId/history` | idem | Historique paginé (cursor) + ventes agrégées par event |
| `POST :spaceId/reset` | **`front.fb.logisticReconcile`** (override méthode — remplace, n'ajoute pas, la permission classe, cf. subtilité RBAC plus bas) | Inventory Reset : fige les écarts en réconciliation, pose les mouvements d'ajustement |
| `GET :spaceId/reconciliations` | `front.fb.logisticReconcile` | Liste des réconciliations |
| `GET reconciliations/:id` | `front.fb.logisticReconcile` | Détail (lignes d'écart) — **export mort côté front**, voir Client API |
| `GET reconciliations/:id/export` | `front.fb.logisticReconcile` | Export CSV (séparateur `;`, BOM UTF-8 pour Excel FR) |
| `POST :spaceId/simulate-sale` | `front.fb.logisticReconcile` | QA — crée une vraie `WeezeventTransaction` marquée `isSimulated`, consommée par `getStock` exactement comme une vente réelle |
| `DELETE :spaceId/simulate-sale` (`?elementId=`) | `front.fb.logisticReconcile` | Purge les ventes simulées d'un PDV |

**Subtilité RBAC à connaître avant d'ajouter une route** : `RequirePermissions` utilise
`Reflector.getAllAndOverride` (`permissions.guard.ts:20-23`) — un décorateur au niveau
**méthode** remplace entièrement celui de la **classe**, il ne s'y ajoute pas. Les 5 routes
`front.fb.logisticReconcile` ci-dessus n'exigent donc **pas aussi** `front.fb.logistic` côté
backend (seul le front les fait cohabiter, en pratique aucun rôle actuel n'a
`logisticReconcile` sans `logistic` — voir `permission-catalog.ts:157-170`, "Directeur de site"
et "Chef exécutif" ont toujours les deux). Si un futur rôle recevait `logisticReconcile` seul,
il pourrait appeler ces 5 routes en API directe sans jamais pouvoir ouvrir l'écran Logistic.

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `itemKey` (String, sur les 2 modèles) | **Clé = NOM** du référentiel d'inventaire (pas un id) — `itemName` d'un `MarketPrice`, ou nom d'ingrédient/composant/menu item. Même convention que `ElementInventory` (Builder v2). Un renommage d'entité côté Menu Catalogue casse silencieusement le rapprochement avec le stock déjà suivi sous l'ancien nom. |
| `reason` (enum `StockMovementReason`) | `DELIVERY`/`TRANSFER_SHOP`/`TRANSFER_STORAGE`/`EXPIRY`/`OTHER` = **manuelles**, exposées à l'API ; `SALE`/`INVENTORY_RESET` = **réservées serveur** (dérivation ventes, reset) et rejetées si un client les envoie (`CreateMovementDto`, `MANUAL_MOVEMENT_REASONS`). |
| `packedDelta`/`looseDelta` | Signés — un transfert crée **2 lignes miroir** (source négative, cible positive) liées par `transferGroupId`. |
| `counterpartyElementId` | PDV/storage source ou destination d'un transfert. |
| `unitsPerPack` (sur `StockLevel`) | `MarketPrice.packedUnits` du dernier mouvement ayant fixé ce niveau — pilote la "casse de pack" (voir plus bas). |

**Casse de pack (`normalizeLevel`, `logistics.service.ts:141-152`)** : un vrac qui deviendrait
négatif emprunte des packs entiers (`packed -= 1, loose += unitsPerPack`) tant que possible, puis
clampe à 0 (le vrac excédentaire n'est jamais re-packé). **Dupliquée à l'identique côté front**
dans `normalizeExpected()` (`store/modules/logistics.js:27-39`, commentaire explicite "miroir").
Les mouvements **manuels stricts** (`applyLevelDelta(..., strict=true)`) refusent un delta qui
rendrait le niveau négatif (400 "Stock insuffisant") — la dérivation des **ventes**, elle, ne
peut jamais échouer (une vente déjà enregistrée ne doit pas planter la lecture), elle clampe
silencieusement.

**Consommation ventes — dérivée read-time, jamais matérialisée** (`deriveSalesRaw` +
`explodeSalesToConsumption`, `logistics.service.ts:814-987`) : requête SQL brute joignant
`WeezeventTransactionItem`→`WeezeventTransaction`→`WeezeventLocation`→
`WeezeventLocationShopMapping`→`WeezeventProductMapping`, filtrée `status='V'` (validées
uniquement) et bornée par `since` (la dernière `StockReconciliation`, ou le tout premier
mouvement si aucune réconciliation n'existe encore). L'explosion recette
(`readyForSale`/`comboItem`, combos dépliés par nom profondeur ≤4) **duplique volontairement**
la même logique que `buildConsolidatedInventory` côté front (`inventoryUtils.js`) — le commentaire
du service dit explicitement : "code dupliqué à dessein pour ne jamais toucher au chemin ventes
déjà validé en prod". Si tu corriges une règle d'explosion recette d'un côté (ex. le bug combo
documenté dans `04_MENU_CATALOGUE.md`), vérifie si l'autre copie doit suivre.

**Ce qui dépend de ce ledger** : rien d'autre que l'écran Logistic lui-même (voir piège n°1) —
ni Inventory ni Réarmement ne le lisent.

---

## StockReconciliation — l'archive de l'Inventory Reset

**Qu'est-ce que c'est** : une ligne = un "reset" figé (attendu vs compté, par élément×denrée),
posée par `POST /logistics/:spaceId/reset`. La plus récente sert d'**ancre temporelle** : toute
vente postérieure à `createdAt` est comptée dans la consommation dérivée, toute vente antérieure
est considérée "déjà absorbée" par ce reset.

**Où vit le code** : modèle `schema.prisma:2517-2533` ; logique `reset()`
(`logistics.service.ts:1002-1164`).

**Champs clés** : `lines` (Json) = `[{elementId, elementName, itemKey, expectedPacked,
expectedLoose, countedPacked, countedLoose, deltaUnits}]` — l'export CSV
(`exportReconciliationCsv`) est généré à la volée depuis ce JSON, pas depuis un fichier stocké.

**Subtilité du reset** : seules les lignes **envoyées** par l'utilisateur sont réconciliées
(nouvelle ancre) ; les niveaux existants **non couverts** par l'envoi voient leur consommation
dérivée **matérialisée** en un mouvement `SALE` avant que l'ancre ne bouge pour tout l'espace —
sinon un reset partiel réinjecterait leurs ventes en "stock fantôme" au prochain calcul
(commentaire explicite du code, `logistics.service.ts:991-1001`).

**Voir aussi** : [10_POST_EVENT_INVENTORY.md](10_POST_EVENT_INVENTORY.md) — l'écran Inventory et
ses ponts inter-modules ; sa section 7 spécifie un **2ᵉ point de création** de
`StockReconciliation` (document post-événement depuis la sauvegarde d'inventaire, **sans** toucher
aux StockLevel — à ne pas confondre avec le reset ci-dessus).

---

## RestockState — le snapshot UI du Réarmement (PAS une source de stock)

**Qu'est-ce que c'est** : un blob JSON opaque, une ligne par (tenant, space), qui persiste l'état
d'écran du Réarmement (objectif choisi, ajustements %, lignes confirmées...) — **ce n'est pas du
stock**, c'est de la mémorisation de session pour reprendre le travail sur une autre machine.

**Où vit le code** : modèle `schema.prisma:2583-2595` ; `restock-state.controller.ts`/
`restock-state.service.ts` (`@Controller('spaces/:spaceId/restock-state')`).

**Routes** :

| Route | Permission | Rôle |
|---|---|---|
| `GET` | `front.fb.restock` **OU** `front.fb.restockBoard` | Lire l'état (`null` si aucun) |
| `PUT` | `front.fb.restock` **seul** (voir piège n°3) | Upsert idempotent, `state` accepté comme objet JSON libre |
| `DELETE` | `front.fb.restock` **seul** | Reset (idempotent) |

**Pourquoi le body n'est PAS typé en DTO strict côté contrôleur** : le `ValidationPipe` global
(`whitelist`+`forbidNonWhitelisted`) s'exécute **avant** tout pipe de route et stripperait/
rejetterait tout champ hors DTO — le contrôleur type donc volontairement le body en
`Record<string, unknown>` (`restock-state.controller.ts:59`, commentaire explicite) pour rester
un blob tolérant. `RestockStateDto` existe uniquement pour Swagger, jamais appliqué en
validation réelle.

**Champ réel envoyé — 11 clés, pas 9** : le "contrat 9 champs" documenté dans le commentaire du
modèle Prisma (`schema.prisma:2580-2582`) et dans `docs/utiles/DATA_SOURCES.md` correspond au
DTO Swagger, mais `restockPersistSnapshot` (`SpaceRestockView.vue:1888-1902`, ce qui part
**réellement** dans le `PUT`) contient en plus `currentStep` et `stockExcluded` — 11 clés au
total. Rien ne les rejette (blob JSON sans schema strict), donc pas un bug, juste une
documentation antérieure obsolète sur ce point précis : **tous les champs de
`restockPersistSnapshot` sont bien envoyés à l'API** (contrairement à ce qu'un ancien commentaire
du code laissait entendre pour `currentStep` — sa *restauration* est ignorée au chargement,
volontairement, mais son *envoi* a toujours lieu).

**Persistance dual-write** (`persistRestockState()`/`restoreRestockState()`,
`SpaceRestockView.vue:2108-2165`) : localStorage immédiat (jamais de perte si l'onglet ferme
avant les 500ms de debounce) + `PUT` API débouncé. Le flag `isRestockApiDown()` bascule
uniquement sur non-4xx (réseau/5xx/timeout) — voir piège n°3 pour la conséquence sur un 403
permanent.

---

## Réarmement — le moteur de calcul (`SpaceRestockView.vue`, 5853 lignes)

C'est l'écran le plus gros du domaine. 3 étapes pilotées par `currentStep` + synchronisées dans
l'URL (`?step=stock|restock|shopping`) :

1. **"Éléments à stocker"** — agrégat par item tous shops confondus, inclusion/exclusion
   (`stockExcluded`), ajustement % (`stockAdjustments`, slider 0–200%, presets 80/100/120%), mode
   "colis" (`stockPackedModes`).
2. **"Réarmement"** — par shop×item : cible / restant / à déposer, confirmation ligne à ligne
   (`restockedRows`). La bascule "Par shop" / "Par article" est **masquée depuis le 2026-08-04**
   (`restockViewMode` forcé à `'item'`, segmented retiré du slot `#filters`) : la vue "Par shop"
   porte le split « Non rattachés au menu — à remapper » qui bascule des PdV entiers en rouge
   ([BUG-293-01](../bugs/293_01_rearmement_vue_par_shop_non_rattaches_faux_positifs.md)). Le rendu
   "Par shop" reste dans le template, inaccessible.
3. **"Feuille de course"** — regroupée par fournisseur, bascule produits finis / ingrédients,
   export CSV, impression, email fournisseur.

**Objectif (source de la demande)** : `objectiveSource` peut valoir `'forecast'` ou `'sales'`,
mais **le sélecteur UI est masqué en dur** (`v-if="false"`, `SpaceRestockView.vue:56,925`,
commentaire explicite *"objectiveSource forcé 'forecast'"*). Le mode `'sales'` (ventes réelles
d'un event de référence, via `fetchReferenceSales`+`getShopElementMappings` — voir piège n°4)
reste fonctionnel en code mais **inaccessible depuis l'UI actuelle**. En pratique, l'objectif
vient donc toujours d'un ou plusieurs `selectedEventIds` résolus en 3 niveaux de repli
(`refreshSelectedPredictions()`) : records pré-calculés localStorage EventPredict → version BDD
(`listEventPredictVersions`) → reconstruction locale (`generatePredictionsForEvent`, marquée
dégradée si aucun record n'a de `menuItemId`).

**Stock existant soustrait — Inventory uniquement** (voir piège n°1) :
- Niveau shop (étape 2) : `remainingQuantityForRow()` lit `store.state.inventory.inventoryCounts`
  (alimenté par `inventory/loadInventory`), avec repli sur le snapshot de l'event précédent
  (`apiGetInventory`/`apiGetLatestInventory`).
- Niveau Storage (étape 3, feuille de course) : cascade `stockNetting.js` — le stock shop agrégé
  d'abord, puis le stock Storage. **"Le Storage ne réduit jamais le restock d'un shop précis"**
  — règle affirmée à 3 endroits distincts du code (`stockNetting.js`, `stockPlanning.js`,
  `SpaceRestockView.vue`), le Storage n'intervient que dans l'agrégat final.

**Règle `readyForSale` (identique à Menu Catalogue)** : `'Yes'` (article livré prêt de la cuisine
centrale) → réarmé tel quel, packaging jamais séparé ; `'No'` avec composants → explosion recette
complète (`stockPlanning.js`, packaging traité comme un ingrédient ordinaire, jamais filtré ici —
contrairement à Inventory où le packaging est bien distingué, cf. `isPackagingComponent`).

**Filet de sécurité anti-0-ligne** : si l'explosion d'un menu item ne produit aucune ligne
exploitable, repli sur l'article lui-même (jamais 0 ligne pour un article vendu) —
`stockPlanning.js:280-306`.

---

## Filtres storage cassés (Inventory) — `'material'` et `'merch'`

Dans l'écran **Inventory** (pas Logistic, qui n'a pas cette notion de filtre), un Storage peut
être configuré avec un ou plusieurs sous-types (`storageType`, palette du builder v1/v2 —
`elementTaxonomy.js`, `PropertiesPanelView.vue` proposent bien `'material'` comme option réelle,
sélectionnable par un utilisateur).

- **`'material'` ne matche jamais aucun article** : `getItemStorageTypes()`
  (`utils/inventoryUtils.js:907-935`) ne mappe que `Dry→'dry'`, `Cold→'cold'`, `Freezer→'belowzero'`
  (`mapStorageType`, lignes 895-904) — pas de branche retournant `'material'`, et le défaut final
  est `['dry']`. Un Storage filtré sur `'material'` affiche donc une carte **vide en
  permanence**, quel que soit son contenu réel.
- **`'merch'` n'a aucun filtre du tout** : `buildMerchStorageInventory()`
  (`inventoryUtils.js:1033-1073`) agrège **tous** les `merchItems` de **tous** les éléments
  `merchshop` de la config, sans condition sur un `storageType`, dans un agrégat synthétique
  unique et fixe `{ id: 'merch-aggregate', name: 'Merch Aggregate' }`
  (`composables/useInventoryData.js:386-396`). Le concept "Storage scopé à merch" n'existe donc
  pas architecturalement côté Inventory.

**Nuance importante** : ce bug est spécifique au calcul **100% client** d'Inventory. Le backend
Logistic (`getSpaceElementsWithItems`, `logistics.service.ts:523-617`) construit le référentiel
d'un Storage par simple union des items des shops liés (`attributes.selectedShops`), **sans
aucune notion de filtre par sous-type de storage** — le même Storage physique se comporte donc
différemment selon l'écran (Inventory le filtre, cassé, sur `'material'`/`'merch'` ; Logistic ne
filtre pas du tout).

**Statut (mis à jour 2026-07-18)** : **corrigés** (fiches 20 et 21). `'material'` : branche
ajoutée dans `getItemStorageTypes` (composant `storageType === 'material'` → `['material']`,
même convention que `isPackaging`). `'merch'` : `merchWithInventory` (`useInventoryData.js`)
produit une carte par Storage typé `'merch'`, scopée à ses `selectedShops` (vide = tous) ;
l'agrégat « Merch Aggregate » ne subsiste qu'en repli quand aucun Storage `'merch'` n'existe.
La nuance Logistic ci-dessus reste vraie : le backend Logistic ne filtre toujours pas par
sous-type de storage.

---

## Frontend — routes et permissions

| Écran | Route | Composant | Permission | keepAlive |
|---|---|---|---|---|
| Space Inventory | `/spaces/:spaceId/inventory` | `SpaceInventoryView.vue` | `front.fb.spaceInventory` | oui |
| Logistique | `/spaces/:spaceId/logistic` | `SpaceLogisticView.vue` | `front.fb.logistic` | oui |
| Réarmement | `/spaces/:spaceId/restock` | `SpaceRestockView.vue` | `front.fb.restock` **OU** `front.fb.restockBoard` | oui |

(`router/index.js:170-188`). Le gating OR d'un tableau de permissions est géré par
`router/guards.js:430` (`Array.isArray(permission) ? permission.some(can) : can(permission)`) —
même sémantique OR que le guard backend `PermissionsGuard` (`.some`).

### Écran Inventory — arbre de montage réel

`SpaceInventoryView.vue` monte : `InventoryAggregateView.vue` (onglet Shops),
`InventoryStorageAggregateView.vue` (onglet Storage **et** Merch), `InventoryShopCard.vue`,
`InventoryStorageCard.vue`, `InventoryCountingInterface.vue` (×2 : inline desktop + dialog
fullscreen mobile), `InventoryFilterPanel.vue` (le **seul** panneau de filtres réellement
utilisable en desktop).

**Deux composants montés mais fonctionnellement morts** (jamais ouverts par une interaction
utilisateur visible dans le code actuel) :
- `InventoryFilterDrawer.vue` — piloté par `filterDrawerOpen`, initialisé `false`
  (`SpaceInventoryView.vue:683`) et **jamais mis à `true` nulle part** (grep exhaustif). La
  classe CSS `.si-mobile-filter-btn` qui devait l'ouvrir existe toujours dans le style mais
  aucun élément du template ne la porte — le bouton mobile a été retiré, le drawer est resté.
- `InventoryMenuCoverageDrawer.vue` — même situation avec `coverageDrawerOpen` (init `false`,
  jamais basculé) ; sa logique de calcul (`menuCoverageReports`, `utils/inventoryCoverage.js`)
  tourne bien (computed vivant) mais n'a plus de bouton pour être affichée.

### Écran Logistic — arbre de montage réel

`SpaceLogisticView.vue` monte : `LogisticElementRow.vue` (liste PDV/Storage, niveau 1),
`LogisticItemCard.vue` (drill-in par denrée, niveau 2), `LogisticAggregateView.vue` (colonne
agrégat transversal, visible uniquement niveau 1), `LogisticMovementDialog.vue` (popup +/−),
`LogisticHistoryDrawer.vue`, `LogisticSimulateSaleDialog.vue`. Les 6 sont vivants, aucun mort.

**Gating `front.fb.logisticReconcile` répercuté côté UI** (pas juste laissé au backend) :
`canReconcile` (computed `SpaceLogisticView.vue:550`) **masque** (pas juste désactive) la
section Réconciliation, le bouton "Simuler une vente" et le bouton "Reset" pour un rôle sans
cette permission — un utilisateur sans `logisticReconcile` ne voit même pas ces contrôles,
contrairement au piège n°3 du Réarmement où l'UI ne distingue pas les deux permissions.

**Validation des raisons de mouvement dupliquée côté front** (`LogisticMovementDialog.vue`) : le
formulaire reproduit les mêmes contraintes conditionnelles que le backend
(`counterpartyElementId` requis pour un transfert, `expiryDate` pour `EXPIRY`, `note` pour
`OTHER`) et **désactive le bouton d'envoi** tant qu'elles ne sont pas remplies — le front ne
laisse pas le backend tout rejeter en 400. Un garde-fou de quantité supplémentaire
(`exceedsCap`) compare au stock affiché mais le commentaire du code précise explicitement qu'il
est indicatif, "le backend reste juge de paix final (casse de pack exacte)".

---

## Client API — qui appelle quoi (statut vivant/mort)

| Fichier | Fonctions | Statut |
|---|---|---|
| `api/endpoints/inventory.api.js` | `getInventory`, `getLatestInventory`, `saveInventory`, `saveInventoryCount`, `getAllPackagingTypes` | Toutes vivantes — appelées par `store/modules/inventory.js` et directement par `SpaceRestockView.vue` (les 2 fonctions `get*`) |
| `api/endpoints/logistics.api.js` | `getLogisticsStock`, `createStockMovement`, `getElementHistory`, `resetLogisticsInventory`, `getReconciliations`, `getMarketPricesForItem`, `simulateSale`, `purgeSimulatedSales`, `downloadReconciliationCsv` | Toutes vivantes via `store/modules/logistics.js`, sauf `downloadReconciliationCsv` qui **contourne le store** — appelée directement par `SpaceLogisticView.vue` |
| ↳ `getReconciliation` (singulier) | — | **Mort** — export inutilisé, zéro importeur nulle part dans `src/` (grep exhaustif confirmé) |
| `api/endpoints/restock.api.js` | `getRestockState`, `putRestockState`, `isRestockApiDown`, `onRestockApiError` | Toutes vivantes, exclusivement dans `SpaceRestockView.vue` |
| `utils/api.js` (legacy monolithe, backend Supabase Edge distinct) | `getShopElementMappings` | Vivant **au sens "appelé"**, mais cible un backend qui n'implémente pas cette route dans le NestJS actuel — voir piège n°4 |
| ↳ `getSalesForSpace`/`getSalesSummaryForSpace` | — | Vivants au sens "appelés" par `useReferenceSales.js`, mais alimentent un mode (`objectiveSource='sales'`) actuellement masqué de l'UI — voir piège n°4 |
| `composables/useInventoryApi.js` | Wrapper de `inventory.api.js`+`market.price.api.js` | **Mort** — zéro importeur dans tout le repo en dehors de sa propre définition |
| `composables/useInventoryExpansion.js` | Wrapper de `buildConsolidatedInventory`/`expandInventoryItems` | **Mort** — zéro importeur ; les fonctions qu'il enveloppe sont utilisées **directement** depuis `utils/inventoryUtils.js` par tous leurs vrais appelants |
| `composables/useInventoryFilters.js` | Logique de filtrage générique | **Mort** — zéro importeur ; `SpaceInventoryView.vue` réimplémente sa propre logique de filtrage inline (`filteredCards`) au lieu de l'utiliser |

---

## Tableau récapitulatif — bugs actifs confirmés (2026-07-15 ; statuts mis à jour 2026-07-18)

> **Mise à jour 2026-07-18** : #2 corrigé (branche `'material'`, fiche 20) ; #3 corrigé (carte par
> Storage 'merch' scopée `selectedShops`, fiche 21) ; #4 corrigé (déclencheurs des drawers ET de la
> bottom-sheet mobile restaurés + entrée desktop couverture, fiche 22) ; #5 corrigé
> (court-circuitées vers leur repli vide, appelants vivants conservés, fiche 23) ; #7 corrigé
> (export supprimé, fiche 24). Restent : #1 (volet front alerté, décision RBAC →
> `QUESTIONS_A_BERTRAND.md` #10, fiche 19) et #6 (colonnes DB mortes, décision backend).

| # | Bug | Fichiers | Repro |
|---|---|---|---|
| 1 | Rôle "Technicien Logistic"/"PDV Superviseur" (`front.fb.restockBoard` sans `front.fb.restock`) : PUT/DELETE `restock-state` 403 silencieux permanent, aucun toast, retenté à l'infini | `restock-state.controller.ts:44,67`, `restock.api.js:18-22`, `SpaceRestockView.vue:2154-2165` | Se connecter avec ce rôle → `/restock` → éditer → réseau : `PUT .../restock-state` = 403, aucune UI d'erreur |
| 2 | Filtre storage `'material'` (Inventory) : jamais aucun article ne matche | `utils/inventoryUtils.js:895-935` | Storage configuré avec sous-type `'material'` (option réelle du builder) → carte toujours vide |
| 3 | Filtre storage `'merch'` (Inventory) : aucun filtre, agrégat fixe unique | `utils/inventoryUtils.js:1033-1073`, `useInventoryData.js:386-396` | Toujours un seul agrégat "Merch Aggregate", jamais scopé par storage |
| 4 | `InventoryFilterDrawer.vue`/`InventoryMenuCoverageDrawer.vue` montés mais inatteignables (bouton mobile disparu) | `SpaceInventoryView.vue:683-684` (init jamais basculée) | Grep `filterDrawerOpen`/`coverageDrawerOpen` = 2 occurrences chacun (déclaration + bind), aucun setter |
| 5 | `getShopElementMappings`/`getSalesForSpace`/`getSalesSummaryForSpace` ciblent un ancien projet Supabase Edge Function, pas l'API NestJS actuelle | `utils/api.js:5,680-743`, `utils/supabase/info.js` | Backend `api-datafriday-staging` : zéro route `/shop-element-mappings` (grep confirmé) |
| 6 | `discardedQuantity`/`discardedReason` (`InventoryCount`) : colonnes DB mortes de bout en bout | `schema.prisma:2445-2446`, `create-inventory-count.dto.ts`, `types/inventoryCount.js` | Jamais dans le DTO, jamais dans le type front — commentaire front l'affirme explicitement |
| 7 | `getReconciliation` (singulier, `logistics.api.js`) : export mort | `logistics.api.js:80` | Zéro importeur nulle part |

---

## Code mort de ce domaine (preuve à l'appui, ne pas modifier en pensant que ça sert)

- **`components/InventoryView.vue`** — orphelin **total** : zéro importeur nulle part dans le
  repo (grep exhaustif du nom de fichier, en excluant sa propre définition). **Correction d'un
  ancien état des lieux** : contrairement à ce que `docs/utiles/modules/00_INDEX.md` affirmait
  ("atteignable via `appCopy.vue`"), `appCopy.vue` ne référence **jamais** `InventoryView.vue` —
  sa seule occurrence du mot dans ce fichier est un commentaire sur un flag `showInventoryView`
  sans rapport (`components/appCopy.vue:1037`). Contient la formule d'inventaire fautive
  (`InventoryView.vue:870`, additive sans multiplicateur) mais sans aucun risque de production vu
  qu'il n'est jamais monté.
- **`components/InventoryFilterDrawer.vue`**, **`components/InventoryMenuCoverageDrawer.vue`** —
  vivants au sens "importés et montés", morts au sens "atteignables par un utilisateur" (voir
  bug #4 ci-dessus).
- **`composables/useInventoryApi.js`**, **`composables/useInventoryExpansion.js`**,
  **`composables/useInventoryFilters.js`** — zéro importeur, voir tableau Client API.
- **`api/endpoints/logistics.api.js::getReconciliation`** (singulier) — zéro importeur.
- **`InventoryCount.discardedQuantity`/`discardedReason`** — colonnes DB sans aucune
  représentation applicative (DTO, service, front) — voir bug #6.
- **Duplication inoffensive** : `store/modules/inventory.js` déclare deux fois les actions
  `invalidateMarketPrices`/`invalidatePackagingTypes` (lignes 310-316 et 318-324, corps
  identique) — la 2ᵉ définition écrase silencieusement la 1ʳᵉ en JS, sans effet observable, mais
  à nettoyer si ce fichier est retouché.

---

## Zones grises restantes (pas des angles morts — des points réellement non tranchés)

- **Liveness de l'Edge Function Supabase legacy** (`make-server-eb31619c` et la fonction
  `/sales`) : confirmé qu'aucune route équivalente n'existe dans `api-datafriday-staging`, mais
  impossible de vérifier depuis la lecture du code seule si le projet Supabase distinct qui
  héberge ces fonctions répond encore réellement (pas d'accès réseau depuis cette passe). Sans
  impact fonctionnel immédiat : tous les appelants ont déjà un repli gracieux, et le mode qui en
  dépend le plus (`objectiveSource='sales'`) est actuellement masqué de l'UI.
- **`countingStatus` sur `InventoryCount`** : colonne vivante, écrite en synchronie avec
  `isCounted`, mais jamais lue/affichée indépendamment côté Inventory — reste à déterminer si
  c'est un champ réellement redondant à supprimer, ou une préparation pour un futur état
  "in-progress" distinct (la valeur `'in-progress'` existe dans l'enum front `COUNTING_STATUS`
  mais n'est jamais produite par le code actuel, qui n'écrit que `pending`/`counted`).
- **Format `el.storageType`** lu par `useInventoryData.js:376` depuis le JSON `Config.data` (v1) :
  nom de champ singulier côté élément de plan, à ne pas confondre avec la colonne relationnelle
  `SpaceElement.storageTypes` (pluriel) documentée dans `03_BUILDER_ESPACES.md` — la relation
  exacte entre les deux représentations (JSON v1 vs colonne relationnelle) n'a pas été retracée
  caractère près dans cette passe, focalisée sur le domaine Stock plutôt que Builder.
