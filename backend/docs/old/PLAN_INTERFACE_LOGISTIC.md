# Plan — Interface Logistic (stock temps réel par PDV / Storage)

Date : 2026-07-06. Statut : **IMPLÉMENTÉ (BE + FE, local, non buildé/déployé)**.

**Livré :**
- Migration `20260706120000_logistics_stock_ledger` (StockMovement/StockLevel/
  StockReconciliation + enum StockMovementReason) — appliquée + enregistrée en dev.
- Backend : module `src/features/logistics/` (7 routes : stock, movements, history,
  reset, reconciliations ×2, export CSV) ; permissions `front.fb.logistic` +
  `front.fb.logisticReconcile` au catalogue ; grant additif « Logistic F&B » dans
  `prisma/backfill-rbac.ts` (à lancer : `npm run rbac:backfill`).
- Frontend : route `/spaces/:spaceId/logistic` (`space-logistic`), vue
  `SpaceLogisticView.vue` + `LogisticMovementDialog.vue` + `LogisticHistoryDrawer.vue`,
  store `logistics.js`, api `logistics.api.js`, entrée « Logistic » entre Inventory et
  Restock dans les 2 FilterPanel d'Analyse + toolbox Inventory/Restock/EventPredict,
  `SPACE_SCREENS`, 68 clés i18n `logi*` (en+fr, validées).

**Déploiement** : migration prod (`make prod-migrate`) AVANT le code ; puis
`pnpm rbac:backfill` (additif, sûr) ; FE+BE ensemble.

**Passe de correction de bugs (2026-07-06, review adversariale BE+FE) :**
- BE : ventes filtrées `status='V'` + OR-join WeezeventLocation (mappings à id externe) ;
  reset partiel matérialise la conso des niveaux non couverts (mouvements SALE) avant de
  déplacer l'ancre ; mouvements manuels refusés (400) si stock insuffisant (fin du clamp
  ex nihilo sur transferts) ; clé RFS=Yes ingrédient unique alignée front (mp lié → mp
  par nom → nom du menu item) ; tie-breaker id sur le cursor history ; dédup lignes
  reset ; StockLevel orphelins masqués ; cache recette keyé profondeur ; limit NaN gardé ;
  menuItemId vérifié tenant. Fix backfill (RolePermission sans id → createMany
  skipDuplicates).
- FE : `buildStorageInventory` reçoit `marketPrices` (clé de denrée IDENTIQUE
  shop↔storage — sinon les transferts « disparaissaient ») + items storage enrichis
  (picture/marketPriceId/unit) ; watcher keep-alive gardé par route.name + `activated()`
  (la vue cachée ne recharge plus tout) ; `?configuration` dans la clé de contexte ;
  payload du popup gaté par la raison courante + packed validé entier ; reset inclut
  les niveaux orphelins (0 compté) ; anti-races store/history ; CLEAR complet.
- `pnpm rbac:backfill` exécuté en dev : `front.fb.logistic` posé sur « Logistic F&B »
  de 21 tenants.
- ⚠️ Risque connu NON traité (modèle backend v1) : `saveConfiguration` v1 fait du
  delete+recreate des SpaceElement → un save de config dans le builder ORPHELINE le
  ledger/les niveaux keyés sur ces elementId (même root cause que le démapping Data
  Integration du 2026-06-28). À traiter avant la prod : clé stable ou re-mapping au save.

**Correction de design (2026-07-06)** : la 1ère version aplatissait tout en une liste
(PDV + denrées mélangés, icônes rondes minuscules) — s'écartait de la structure réelle
de Space Inventory. Refonte en **2 niveaux**, validée sur wireframe :
- **Niveau 1** — liste des PDV/Storage, un composant `LogisticElementRow.vue` par ligne
  (miroir `InventoryShopCard`) : nom, denrées suivies, totaux packed/loose, boutons
  Historique + « Gérer le stock → » qui ouvre le niveau 2. Filtres, Réconciliation et
  Reset restent à ce niveau (colonne gauche / header).
- **Niveau 2** — drill-in par PDV : grille de cartes `LogisticItemCard.vue` (miroir
  `si-count-item` de `InventoryCountingInterface`) : image + nom + « Used in », deux
  champs Packed/Loose affichés, valeur comptée grisée, puis **Ajouter/Supprimer en
  boutons pleine largeur en bas de carte** (à la place de MARK COUNTED/RESET).
- Couleurs/tokens = variables `--fb-*` globales de la charte (`style.css` :
  `--fb-success`/`-soft`, `--fb-danger`/`-soft`, `--fb-primary`, `--fb-radius-*`,
  `--fb-shadow-*`), déjà thème clair/sombre.

**Décisions (2026-07-06) :**
1. Réconciliation gated **par permission** (`front.fb.logisticReconcile`), pas par nom de
   rôle : les tenants ont des rôles custom (ex. « Chef Executive » visible dans l'écran
   Rôles) auxquels l'admin accordera la permission. ADMIN l'a d'office.
2. `unitsPerPack` = `MarketPrice.numberOfUnits` (confirmé).
3. Ventes dérivées read-time pour l'instant, **architecture évolutive** : le reason
   `SALE` de StockMovement est réservé pour une matérialisation future par job sans
   changement de modèle.
4. Front implémenté aussi (exception périmètre accordée).
5. Accès : entrée dans le dropdown de la vue Analyse, **entre Inventory et Restock**
   (comme Event Predict).

## 1. Objectif (spec)

Interface similaire à Space Inventory, mais qui montre à tout moment le **stock attendu**
(packed/loose) de chaque denrée dans chaque PDV et Storage, alimenté par :

1. **Ajouts** (bouton « + » sur chaque item) : choix du market price, packed, loose,
   raison — Delivery (défaut) / Transfert d'un PDV (+ dropdown PDV) / Transfert d'un
   Storage (+ dropdown) / Autre (champ libre).
2. **Suppressions** (bouton « − ») : mêmes champs, raisons — Transfert vers un PDV /
   vers un Storage / Date Limite de Consommation (+ date) / Autre.
3. **Ventes** (automatique) :
   - `readyForSale = Yes` : −1 loose par unité vendue ; si loose = 0, « casser un pack » :
     packed −1 et loose = unitsPerPack − 1 (ex. carton de 4 chips, packed 2 loose 0,
     une vente → packed 1 loose 3).
   - `readyForSale = No` : décrémenter chaque ingrédient/composant de la recette de la
     quantité nécessaire à une unité, avec la même logique de casse de pack.
4. **Historique par PDV** (bouton sur le PDV) : chaque opération loggée ; les ventes
   agrégées **par event, une seule ligne**.
5. **Reset après inventaire** : valeurs comptées affichées en grisé à côté des valeurs
   attendues ; bouton « Inventory Reset » remplace l'attendu par le compté ; un fichier
   d'écarts est archivé par event dans une section **Réconciliation** (colonne gauche),
   visible uniquement super admin / directeur de site / chef executive.

## 2. Existant (état des lieux)

### Ce qui sert de socle

| Brique | Où | Utile pour |
|---|---|---|
| `InventoryCount` (Prisma, schema.prisma:2299) | 1 ligne par (tenant, space, event, shop, item) : `packedUnits Int`, `looseUnits Float`, `isCounted`, `countingStatus`, + `discardedQuantity`/`discardedReason` **déjà en base mais jamais écrits** (absents du DTO/service) | Les « valeurs comptées » à afficher en grisé et la source du reset |
| `InventorySnapshot` (schema.prisma:2283) | Snapshots append-only (blob JSON) | Historique de comptages |
| Module `inventory` (`src/features/inventory/`) | `GET /inventory/:spaceId/latest`, `GET /:spaceId/:eventId`, `POST /inventory`, `POST /inventory-counts` — permission `front.fb.spaceInventory` | Lecture des comptages |
| Inventaire dérivé (`space-menus.controller.ts`) | `GET /space-menu/shop/:shopId/inventory` (références dédupliquées des items activés + `usedIn`), `GET /space-menu/storage-inventory` | La **liste des items** à afficher par PDV/Storage (même référentiel que l'inventaire) |
| `MarketPrice` (schema.prisma:774) | `numberOfUnits`, `unitsPerPurchase`, `purchasePackaging`, `inventoryPackaging`, `pricePerUnit`, taxonomie MarketPriceType/Category | Le dropdown market price des popups + la valeur d'`unitsPerPack` |
| Recettes | `MenuItemIngredient/Component/Packaging.numberOfUnits`, `MenuItem.readyForSale` ('Yes'/'No'), `numberOfPiecesRecipe`, fusion via `/menu-items/:id/recipe` | Décrémentation à la vente pour readyForSale=No |
| Ventes Weezevent | `WeezeventTransactionItem.quantity` → `WeezeventProductMapping` (produit→MenuItem) → `WeezeventLocationShopMapping.spaceElementId` (location→PDV) ; jointures déjà pratiquées dans `aggregation.service.ts:121` | Décrémentation auto + ligne agrégée par event |
| RBAC | Rôles « Logistic F&B », « Technicien Logistic », « PDV Superviseur » (permission-catalog.ts:127-144) ; codes `front.fb.*` ; guard `PermissionsGuard` + `meta.permission` côté front | Gating de l'écran et de la Réconciliation |
| Front modèle | `views/SpaceInventoryView.vue` (orchestrateur 3 colonnes), `InventoryCountingInterface.vue` (cartes + steppers), `InventoryAggregateView.vue` (summary), `InventoryFilterPanel/Drawer.vue`, `useInventoryData.js`, store Vuex `inventory.js`, route `/spaces/:spaceId/inventory` | Clone de départ pour la vue Logistic |

⚠️ L'UI de comptage des captures vit dans **`SpaceInventoryView.vue`** (route
`/spaces/:spaceId/inventory`), PAS dans builder2 — les `InventorySection.vue` de
builder2 sont des panneaux d'inspecteur du plan 3D.

### Ce qui n'existe pas (tout est à créer)

- **Aucun ledger de mouvements de stock** (pas de table movement/adjustment) — l'historique
  actuel se limite aux snapshots de comptage.
- **Aucun état « stock attendu »** : `ElementInventory` (builder) est un stock *prévu* de
  configuration (simple `quantity`, ni packed/loose ni mouvements).
- **Aucune décrémentation à la vente**, aucun historique par PDV, aucune réconciliation,
  aucun reset, aucune trace « logistic » dans le front.
- Les rôles « directeur de site » et « chef executive » **n'existent pas** dans le
  catalogue RBAC (voir §7 / questions ouvertes).

## 3. Modèle de données (nouvelles tables — migration AVANT code)

### `StockMovement` — le ledger (source de vérité de l'historique)

```prisma
enum StockMovementReason {
  DELIVERY            // ajout, défaut
  TRANSFER_SHOP       // depuis/vers un PDV (counterpartyElementId)
  TRANSFER_STORAGE    // depuis/vers un Storage (counterpartyElementId)
  EXPIRY              // DLC (expiryDate)
  SALE                // généré par les ventes (agrégé par event)
  INVENTORY_RESET     // ajustement d'écart posé par le reset
  OTHER               // note libre
}

model StockMovement {
  id                    String   @id @default(uuid())
  tenantId              String
  spaceId               String
  elementId             String   // PDV ou Storage (SpaceElement)
  itemKey               String   // même référence que l'inventaire dérivé (nom normalisé)
  menuItemId            String?  // si l'item est un menu item readyForSale
  marketPriceId         String?  // market price choisi dans le popup
  direction             Int      // +1 entrée / -1 sortie
  packedDelta           Int      @default(0)
  looseDelta            Float    @default(0)
  reason                StockMovementReason
  counterpartyElementId String?  // PDV/Storage source ou destination
  transferGroupId       String?  // relie les 2 mouvements d'un transfert
  expiryDate            DateTime?
  note                  String?
  eventId               String?  // pour SALE et INVENTORY_RESET
  createdBy             String?
  createdAt             DateTime @default(now())

  @@index([tenantId, elementId, createdAt])
  @@index([tenantId, spaceId, eventId])
}
```

### `StockLevel` — l'état courant matérialisé (lecture rapide)

```prisma
model StockLevel {
  id            String  @id @default(uuid())
  tenantId      String
  spaceId       String
  elementId     String
  itemKey       String
  packedUnits   Int     @default(0)
  looseUnits    Float   @default(0)
  unitsPerPack  Int?    // du dernier market price appliqué (sert à la casse de pack)
  marketPriceId String? // dernier market price utilisé
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, elementId, itemKey])
  @@index([tenantId, spaceId])
}
```

Chaque écriture = **une transaction** : insert des `StockMovement` + upsert des
`StockLevel` correspondants (règle projet : un seul `$transaction` pour les écritures,
latence dev oblige). Un transfert crée **2 mouvements** (OUT sur la source, IN sur la
cible) partageant `transferGroupId`, et met à jour les 2 `StockLevel` atomiquement.

### `StockReconciliation` — l'archive d'écarts du reset

```prisma
model StockReconciliation {
  id         String   @id @default(uuid())
  tenantId   String
  spaceId    String
  eventId    String?
  createdBy  String?
  createdAt  DateTime @default(now())
  lines      Json     // [{ elementId, elementName, itemKey, expectedPacked, expectedLoose, countedPacked, countedLoose, deltaUnits }]

  @@index([tenantId, spaceId, createdAt])
}
```

Le « fichier » de la spec = export CSV/XLSX généré à la volée depuis `lines`
(`GET .../reconciliations/:id/export`), pas un fichier stocké sur disque.

## 4. Backend — module `logistics` (nouveau, `src/features/logistics/`)

Toutes les routes sous `JwtDatabaseGuard` + `@RequirePermissions('front.fb.logistic')`
(nouveau code, voir §7).

| Route | Rôle |
|---|---|
| `GET /logistics/:spaceId/stock?configId=` | État attendu par élément (PDV + Storage) × item : fusion `StockLevel` + référentiel dérivé (`getShopInventory`/`getStorageInventory` réutilisés pour la liste d'items et `usedIn`) + **consommation ventes calculée** (voir §5) + valeurs comptées `InventoryCount` du dernier inventaire (le « grisé »). Lectures en `Promise.all`. |
| `POST /logistics/movements` | Corps : `{ elementId, itemKey, marketPriceId, packed, loose, direction, reason, counterpartyElementId?, expiryDate?, note? }`. Valide la raison (counterparty requis pour TRANSFER_*, date pour EXPIRY, note pour OTHER), crée mouvement(s) + met à jour StockLevel. Transfert → double mouvement atomique. |
| `GET /logistics/element/:elementId/history?cursor=` | Historique paginé du PDV : mouvements manuels ligne à ligne + **une ligne agrégée par event** pour les ventes. |
| `GET /logistics/:spaceId/market-prices?itemKey=` | Dropdown du popup : market prices candidats pour l'item (match par nom/ingrédient → `Ingredient.marketPriceId`, sinon recherche par `itemName`). |
| `POST /logistics/:spaceId/reset` | Reset après inventaire (voir §6). Permission dédiée réconciliation. |
| `GET /logistics/:spaceId/reconciliations` + `GET /reconciliations/:id/export` | Section Réconciliation (listing + export). Permission `front.fb.logisticReconcile`. |

## 5. Décrémentation à la vente

**Recommandation v1 : dérivation read-time, pas de mouvement SALE matérialisé par vente.**

- Le stock attendu affiché = `StockLevel` (opérations manuelles + resets) **moins** la
  consommation ventes calculée depuis la dernière ancre (dernier reset, sinon création de
  la ligne).
- Calcul de la consommation : une requête SQL agrégée (même famille que
  `aggregation.service.ts`) : `WeezeventTransactionItem.quantity` × mapping produit→MenuItem
  × mapping location→`spaceElementId`, bornée par `createdAt > lastResetAt`, groupée par
  (elementId, menuItem, eventId).
  - `readyForSale = Yes` → consommation = quantité vendue en unités loose de l'item lui-même.
  - `readyForSale = No` → explosion de recette côté serveur (réutilise la fusion de
    `/menu-items/recipe`) : quantité vendue × `numberOfUnits` de chaque ingrédient/
    composant/packaging → consommation par `itemKey`.
- **La casse de pack est une règle d'affichage/normalisation**, appliquée au rendu :
  on convertit (packed, loose, consommation totale) en unités totales via `unitsPerPack`,
  puis on re-décompose : `loose < 0` → emprunter des packs (`packed −1, loose += unitsPerPack`).
  `unitsPerPack` = `StockLevel.unitsPerPack` (posé au dernier ajout depuis
  `MarketPrice.numberOfUnits` / `unitsPerPurchase`).
- L'historique affiche les ventes **groupées par event en une ligne** — trivial en read-time.

Pourquoi read-time : pas de job ni d'idempotence de sync à gérer (la sync Weezevent
re-upserte), cohérent avec le précédent `deriveSalesPrices` (read-time, indexé, ~20 ms),
et le reset fige les compteurs donc la fenêtre de calcul reste courte. Si la fenêtre
devient trop chère, bascule v2 vers des mouvements SALE matérialisés par un job
incrémental avec checkpoint — le modèle `StockMovement.reason=SALE` est déjà prévu pour ça.

## 6. Reset après inventaire & Réconciliation

`POST /logistics/:spaceId/reset` (body : `{ eventId?, configId? }`) :

1. Lit l'**attendu** courant (StockLevel − ventes dérivées) et le **compté**
   (`InventoryCount` du space/event).
2. Écrit une `StockReconciliation` avec toutes les lignes d'écart.
3. Pour chaque item : mouvement `INVENTORY_RESET` du delta + `StockLevel` ← valeurs comptées.
4. Tamponne l'ancre ventes (`lastResetAt` — porté par la réconciliation ou un champ sur
   StockLevel) pour que les ventes antérieures ne soient plus décomptées.

Affichage : dans la vue Logistic, chaque item montre `attendu` (éditable via +/−) et,
en grisé à droite, `compté` du dernier inventaire — directement depuis le GET stock.

## 7. RBAC

- Nouveaux codes dans `SYSTEM_PERMISSIONS` (permission-catalog.ts) :
  - `front.fb.logistic` (écran + mouvements) — ajouté aux rôles « Logistic F&B »,
    « Technicien Logistic »(?), « PDV Superviseur »(?), ADMIN (auto).
  - `front.fb.logisticReconcile` (reset + section Réconciliation).
- ⚠️ Le catalogue ne resynchronise les permissions des rôles existants **qu'à la
  création** (sauf ADMIN) → prévoir un mini backfill (script ou extension du seed) pour
  accorder les nouveaux codes aux rôles métier des tenants existants.
- **Question ouverte** : « super admin, directeur de site, chef executive » — seuls
  ADMIN et le flag `isSuperAdmin` existent. Deux options : (a) créer les rôles
  « Directeur de site » et « Chef Executive » dans `SYSTEM_ROLES` avec
  `front.fb.logisticReconcile`, (b) mapper sur des rôles existants. À trancher.

## 8. Frontend (datafriday-web — exception périmètre à confirmer, sinon handoff)

Clone du trio Space Inventory :

- Route `/spaces/:spaceId/logistic` (`meta.permission: 'front.fb.logistic'`,
  + `SPACE_SCREENS` dans guards.js, + entrée toolbox dans les vues sœurs).
- `views/SpaceLogisticView.vue` : même layout 3 colonnes ; cartes item avec valeurs
  attendues + compté en grisé ; boutons **+ / −** ouvrant les popups ; bouton
  historique par PDV ; bouton rouge « Reset inventory » (gated réconciliation) ;
  section « Réconciliation » en bas du panneau de filtres gauche
  (`v-if="can('front.fb.logisticReconcile')"`).
- `LogisticMovementDialog.vue` (un composant, mode add/remove) : dropdown market price
  (endpoint §4), champs Loose (float 2) / Packed (int), dropdown raison avec champs
  conditionnels (PDV/Storage/date/texte).
- `LogisticHistoryDrawer.vue` : liste paginée, ventes = 1 ligne/event.
- Store Vuex `logistics.js` + `api/endpoints/logistics.api.js` (optimistic UI comme
  `inventory.js`).
- i18n : bloc de clés plates `logi*` dans les DEUX objets `en` et `fr` de
  `i18n/translations.js`.

## 9. Phasage & déploiement

1. **P1 — Socle backend** : migration (3 tables + enum), module logistics : GET stock
   (sans ventes), POST movements (+ transferts), GET history, GET market-prices.
2. **P2 — Ventes** : dérivation read-time (Yes puis No/recettes), agrégation par event
   dans stock + history.
3. **P3 — Reset & réconciliation** : POST reset, reconciliations + export, permissions
   RBAC + backfill rôles.
4. **P4 — Front** : vue + popups + historique + réconciliation + i18n + RBAC.

Règles projet : migration **avant** code (Render n'applique rien, `make prod-migrate`) ;
FE+BE déployés ensemble ; pas de build par Claude ; API locale = `pnpm build` + restart
par l'utilisateur.

## 10. Questions ouvertes

1. **Rôles Réconciliation** : créer « Directeur de site » / « Chef Executive » ou mapper
   sur l'existant ?
2. **`unitsPerPack`** : confirmé = `MarketPrice.numberOfUnits` (unités par pack acheté) ?
   Que faire si l'item a plusieurs market prices avec des conditionnements différents
   (on garde celui du dernier ajout) ?
3. **Fraîcheur des ventes** : la décrémentation dépend de la sync Weezevent (pas du
   temps réel strict) — acceptable ?
4. **Périmètre du reset** : bouton global par espace (comme sur la maquette) — un reset
   par PDV individuel est-il aussi souhaité ?
5. **Front** : exception périmètre (comme builder2/space-menus) ou handoff ?
