# Sources de données par rapport (Analyse, Predict, Event Predict, Inventory, Restock)

> **Principe directeur** : le front **ne touche jamais la base de données directement**.
> Toute donnée transite par l'**API REST** via la couche `src/api/endpoints/*`.
> Le `localStorage` n'est qu'un **fallback** (mode démo ou API injoignable), jamais
> une source de vérité. L'API est toujours prioritaire en lecture.

---

## 0. Architecture de l'accès aux données

```
Vue (View / Component)
      │  props, events
      ▼
Composable  (src/composables/use*.js)  ── état réactif, cache, fallback
      │
      ▼
Store Vuex  (src/store/modules/*.js)   ── source de vérité applicative
      │
      ▼
API endpoint (src/api/endpoints/*.api.js)  ── 1 fonction = 1 route HTTP
      │
      ▼
client Axios (src/api/client.js)  baseURL = process.env.VUE_APP_API_URL
      │
      ▼
Backend REST  ──►  Base de données (jamais accédée par le front)
```

- **Client unique** : [src/api/client.js](../src/api/client.js) — instance Axios, `baseURL = VUE_APP_API_URL`, timeout 30 s, injection token.
- **Couche endpoints** : chaque fichier `src/api/endpoints/*.api.js` expose des fonctions nommées qui mappent **1:1** une route HTTP. C'est la **seule** porte d'entrée autorisée vers le backend.
- **Fallback localStorage** : clés centralisées dans [src/data/localDb.js](../src/data/localDb.js). Utilisé uniquement si `isDemoMode()` ou API down.

---

## 1. Rapport ANALYSE (`space-analyse`)

Entrée : [AnalyseView.vue](../src/components/analyse/AnalyseView.vue) → `store.dispatch('analyse/loadSpace', spaceId)` → `fetchSpaceData()` ([useSpaceData.js](../src/composables/useSpaceData.js)).

### Phase 1 — bloquant (premier rendu)

| Donnée | Endpoint (fonction) | Route HTTP |
|---|---|---|
| Métadonnées space | `getSpace()` | `GET /spaces/:spaceId` |
| Configurations | `getSpaceConfigurations()` | `GET /spaces/:spaceId/configurations` |
| Synthèse boutiques + coûts | `getSpaceShopDetails()` | `GET /spaces/:spaceId/shop-details?granular=0` |
| Événements DataFriday | `getEvents()` | `GET /events` |

### Phase 2 — enrichissement (asynchrone, arrière-plan)

| Donnée | Endpoint | Route HTTP |
|---|---|---|
| Ventes granulaires | `getSpaceShopGranular()` | `GET /spaces/:spaceId/shop-details?granular=1` |
| Menu items | `getAllMenuItems()` | `GET /menu-items?page=1&limit=500` (paginé) |
| Composants menu | `getMenuComponents()` | `GET /menu-components` |
| Ingrédients | `getIngredients()` | `GET /ingredients` |
| Types produit | `getProductTypes()` | `GET /product-types` |
| Catégories produit | `getProductCategories()` | `GET /product-categories` |
| Produits Weezevent | `getWeezeventProducts()` | `GET /weezevent/products` |
| Mappings produit↔menu | `getProductMappings()` | `GET /mappings/product-menu` |

### À la demande — timeline par événement

| Composable | Endpoint | Route HTTP |
|---|---|---|
| [useAnalyseItemRecords.js](../src/composables/useAnalyseItemRecords.js) (**Item performance**) | `getSpaceEventTimeline()` | `GET /spaces/:spaceId/event-timeline/:eventId` |
| [useAnalyseTimeline.js](../src/composables/useAnalyseTimeline.js) (graphes minute) | `getSpaceEventTimeline()` | idem |
| [useShopPerformance.js](../src/composables/useShopPerformance.js) (taux transfo/boutique) | `getSpaceEventTimeline()` | idem |

> La section **« Item performance »** (SummaryPanel) provient de
> `GET /spaces/:spaceId/event-timeline/:eventId`, agrégé sur les `filteredEvents`,
> cache mémoire par `eventId` (max 50 événements). **Aucun accès DB direct.**

**Fallback / dégradé** : si `event-timeline` renvoie 404/500 → `[]` (timeline masquée).
Table Weezevent absente → `{ __softFailureReason: 'missing-weezevent-table' }`.

---

## 2. Rapport PREDICT (`space-predict`)

Entrée : [SpacePredictView.vue](../src/views/SpacePredictView.vue) → **même** `analyse/loadSpace` que l'Analyse (overlay sur space-analyse, cf. trap dual-route). Donc **mêmes sources Phase 1/2** que §1.

Predict = couche de scoring/prédiction par-dessus les ventes Analyse. Pas de nouvel endpoint « ventes » propre ; il réutilise `shop-details` + `event-timeline`.

---

## 3. Rapport EVENT PREDICT

Logique : [EventPredictView.vue](../src/components/EventPredictView.vue), [useEventPredictVersions.js](../src/composables/useEventPredictVersions.js), [usePredictiveTimeline.js](../src/composables/usePredictiveTimeline.js).
Endpoints : [eventPredict.api.js](../src/api/endpoints/eventPredict.api.js).

### Versions de prédiction (persistance)

| Action | Route HTTP |
|---|---|
| Lister versions | `GET /events/:eventId/predict-versions` |
| Créer version | `POST /events/:eventId/predict-versions` |
| Modifier version | `PATCH /predict-versions/:versionId` |
| Supprimer version | `DELETE /predict-versions/:versionId` |
| Définir défaut | `PUT /events/:eventId/predict-versions/default` |

### Timeline / scoring événements passés

| Donnée | Route HTTP |
|---|---|
| Timeline minute | `GET /spaces/:spaceId/event-timeline/:eventId` |
| Poids événements passés (lecture) | `GET …/functions/v1/make-server-eb31619c/predictive-event-selection/:eventId` (Supabase Edge) |
| Poids événements passés (écriture) | `POST` même route Supabase Edge |
| Édition métadonnées event | `PATCH /spaces/:spaceId/weezevent-events/:eventId` |
| Sync attendees WeezPay | `POST /spaces/:spaceId/weezevent-events/:eventId/sync-attendees` |

### Fallback Event Predict

`useApi()` arbitre REST vs localStorage. Si démo / API down → versions en localStorage,
puis `reconcileLocalToDb()` (idempotent) remonte le local vers la DB quand l'API revient.

> **Filtre dur** : `configurationId` filtre le scoring (les 2 événements doivent
> le porter). Éditer une config doit recalculer le CA. Source de vérité = **Vue**, pas React.

---

## 4. Section INVENTORY (comptages de stock)

Endpoints : [inventory.api.js](../src/api/endpoints/inventory.api.js). Store : [store/modules/inventory.js](../src/store/modules/inventory.js). Vue : [SpaceRestockView.vue](../src/views/SpaceRestockView.vue).

| Donnée | Endpoint (fonction) | Route HTTP |
|---|---|---|
| Inventaire d'un event | `getInventory(spaceId, eventId)` | `GET /inventory/:spaceId/:eventId` *(toujours 200, `{ inventoryCounts }` même vide)* |
| Dernier inventaire | `getLatestInventory(spaceId)` | `GET /inventory/:spaceId/latest` *(404 → null)* |
| Sauver snapshot complet | `saveInventory(data)` | `POST /inventory` |
| Sauver 1 comptage (item×shop) | `saveInventoryCount(data)` | `POST /inventory-counts` |
| Types de packaging | `getAllPackagingTypes()` | `GET /packaging` *(404 → [])* |

- **Source de vérité** : API. Store `inventory.js` = `loadInventory()` / `upsertCount()` / `saveInventory()`.
- **Fallback localStorage** : clé `analyse:space-inventory-counts:{spaceId}:{eventId}` ([localDb.js:32](../src/data/localDb.js#L32)). Utilisé si `isDemoMode()` ou échec API.

> ⚠️ **Gotcha backend** : `GET /inventory` peut renvoyer 500 si mismatch Prisma
> (code interroge `InventorySnapshot`, table prod = `Inventory`) → corriger
> `@@map("Inventory")` côté backend. Front non concerné (fallback LS).

---

## 5. Section RESTOCK (réarmement)

Endpoints : [restock.api.js](../src/api/endpoints/restock.api.js). Vue : [SpaceRestockView.vue](../src/views/SpaceRestockView.vue) (`restoreRestockState()`, `persistRestockState()`).

| Donnée | Endpoint (fonction) | Route HTTP |
|---|---|---|
| Lire état réarmement | `getRestockState(spaceId)` | `GET /spaces/:spaceId/restock-state` → `{ state }` ou `null` |
| Upsert état réarmement | `putRestockState(spaceId, snapshot)` | `PUT /spaces/:spaceId/restock-state` (snapshot 9 champs à plat, jsonb) |

- **Lecture** : API prioritaire, fallback localStorage `datafriday:restock-state:{spaceId}` ([localDb.js:58](../src/data/localDb.js#L58)).
- **Écriture** : dual — localStorage immédiat + `PUT` API débouncé 500 ms.
- **Flag « API down »** : `isRestockApiDown()` — sur 5xx/réseau/timeout, la session reste sur localStorage sans re-tenter. **Jamais** sur 4xx (= API joignable, erreur applicative).

### Champs NON envoyés à l'API (localStorage seulement)

Le DTO backend est strict (`forbidNonWhitelisted`). Ces 2 champs restent **locaux** :
- `stockExcluded`
- `currentStep`

→ À ajouter au DTO backend si on les veut cross-machine.

### Records prédits (Event Predict → Restock)

- **Source** : localStorage **uniquement** (pas d'API).
- **Clé** : `datafriday:predicted-records:{spaceId}:{eventId}:{versionId}` ([localDb.js:99](../src/data/localDb.js#L99)).
- **Lecture** : `readSavedRecords()` (SpaceRestockView).

> ⚠️ **Gotcha backend** : `GET/PUT /spaces/:id/restock-state` peut renvoyer 500 si
> table `public.RestockState` absente (migration non jouée sur Render) → backend
> `prisma migrate deploy`. Front non bloqué (fallback localStorage).

---

## 6. Récapitulatif fallbacks localStorage

| Domaine | Clé | Source primaire (API) |
|---|---|---|
| Inventory counts | `analyse:space-inventory-counts:{spaceId}:{eventId}` | `GET /inventory/:spaceId/:eventId` |
| Restock state | `datafriday:restock-state:{spaceId}` | `GET /spaces/:spaceId/restock-state` |
| Records prédits | `datafriday:predicted-records:{spaceId}:{eventId}:{versionId}` | *(aucune — local only)* |

**Règle** : localStorage = cache/fallback hors-ligne. L'API reste la source de vérité.
Le seul cas « local only » assumé = les **records prédits** Event Predict→Restock.
