# Data Integration Pipeline — Documentation complète

> Analyse du modèle d'intégration Weezevent, des 4 étapes du wizard, des éléments manquants et des marches à suivre pour que les statistiques fonctionnent.

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Les 4 étapes du wizard d'intégration](#2-les-4-étapes-du-wizard-dintégration)
3. [Pipeline complet : de la transaction au graphique](#3-pipeline-complet--de-la-transaction-au-graphique)
4. [État actuel de la DB (Stade Français)](#4-état-actuel-de-la-db--stade-français)
5. [Problèmes identifiés et éléments manquants](#5-problèmes-identifiés-et-éléments-manquants)
6. [Marche à suivre — actions prioritaires](#6-marche-à-suivre--actions-prioritaires)
7. [Référence : schéma des tables clés](#7-référence--schéma-des-tables-clés)

---

## 1. Vue d'ensemble de l'architecture

```
Weezevent API
    │
    ▼
WeezeventIntegration     ← credentials API + state sync
    │
    ├── WeezeventEvent       ← "saisons" (ex: Stade Français 23-24)
    ├── WeezeventLocation    ← points de vente côté Weezevent (merchants)
    ├── WeezeventProduct     ← produits / articles vendus
    │
    └── WeezeventTransaction ← transactions brutes (341 000 lignes, 690 MB)
            ├── integrationId → WeezeventIntegration.id
            ├── eventId       → WeezeventEvent.id  (saison)
            ├── locationId    → WeezeventLocation.id (PDV Weezevent)
            ├── transactionDate (TIMESTAMPTZ, POPULÉ)
            └── WeezeventTransactionItem (× 1.3 items/tx)

─── MAPPINGS (créés par l'admin via le wizard) ─────────────────────────────────

WeezeventLocationSpaceMapping   : integration.id  →  Space.id  (étape 1)
WeezeventLocationShopMapping    : locationId      →  SpaceElement.id (étape 2)
WeezeventProductMapping         : productId       →  MenuItem.id     (étape 3)

─── EVENTS DataFriday (créés manuellement en étape 4) ──────────────────────────

Event                           : date + spaceId → PONT entre tx et UI
    └── pas de FK vers WeezeventEvent ni WeezeventTransaction

─── AGRÉGATS (peuplés par le moteur d'agrégation après étape 4) ────────────────

SpaceRevenueMinuteAgg
    ├── weezeventEventId → Event.id  ← attention : c'est DataFriday Event, pas WeezeventEvent
    ├── weezeventLocationId          ← locationId Weezevent (PDV)
    ├── spaceElementId               ← MenuItem.id
    ├── minute                       ← TIMESTAMPTZ tronqué à la minute
    ├── revenueHt, transactionsCount, itemsCount
    └── filtré par date de l'Event DataFriday (transactionDate BETWEEN eventDate AND eventDate+1j)

─── CONSOMMATION UI ─────────────────────────────────────────────────────────────

AnalyseView
    ├── Phase 1 : GET /spaces/:id/shop-details    (< 400ms, cache en store)
    └── Phase 2 : GET /spaces/:id/shop-granular   (background, ~31s)
          └── lit depuis SpaceRevenueMinuteAgg (pré-agrégé) → ~1.3s ✅

```

---

## 2. Les 4 étapes du wizard d'intégration

### Étape 1 — Mapper l'intégration → Space

**Composant** : `StepMapSpace.vue`  
**Endpoint** : `POST /mappings/location-space`  
**Table écrite** : `WeezeventLocationSpaceMapping`

| Champ source | Champ destination |
|---|---|
| `WeezeventIntegration.id` | `weezeventLocationId` |
| (sélection admin) | `spaceId → Space.id` |

**Rôle** : Associe un compte Weezevent (intégration) à un stade/lieu DataFriday. C'est le `integrationId` stocké sur chaque `WeezeventTransaction` — le filtre de base pour toutes les requêtes d'agrégation.

**Condition de passage à l'étape 2** : Au moins un mapping enregistré.

---

### Étape 2 — Mapper les Points de Vente (locations → shops)

**Composant** : `StepMapShops.vue`  
**Endpoint** : `POST /mappings/location-shop` (bulk ou individuel)  
**Table écrite** : `WeezeventLocationShopMapping`

| Champ source | Champ destination |
|---|---|
| `WeezeventTransaction.locationId` | `weezeventLocationId` |
| (sélection admin) | `spaceElementId → SpaceElement.id` |

**Rôle** : Associe chaque point de vente Weezevent (buvette Nord, buvette Sud…) à un `SpaceElement` (shop) du plan du stade DataFriday. Sans ce mapping, les transactions du PDV sont **exclues de l'agrégation**.

**Auto-suggestions** : L'UI propose des correspondances par similarité de nom.

**Impact si manquant** : Le champ `transactionStats.unmappedLocationIds` dans l'étape 4 liste les PDV dont les transactions seront ignorées dans les agrégats.

---

### Étape 3 — Mapper les produits (products → menu items)

**Composant** : `StepMapMenuItems.vue`  
**Endpoint** : `POST /mappings/product` (bulk)  
**Table écrite** : `WeezeventProductMapping`

| Champ source | Champ destination |
|---|---|
| `WeezeventTransactionItem.productId` | `weezeventProductId` |
| (sélection admin) | `menuItemId → MenuItem.id` |

**Rôle** : Associe les articles vendus côté Weezevent (bière Kronenbourg 33cl, sandwich jambon…) aux `MenuItem` du catalogue DataFriday. Sans ce mapping, `JOIN "WeezeventProductMapping"` dans la requête d'agrégation exclut les lignes non mappées → les transactions apparaissent dans les totaux mais sans décomposition par article.

**Condition de passage à l'étape 4** : l'UI vérifie que le mapping est cohérent (les erreurs ne bloquent pas strictement, mais des produits non mappés = données incomplètes).

---

### Étape 4 — Timeline des événements et agrégation

**Composant** : `StepProcessTimeline.vue`  
**Endpoints utilisés** :
- `GET /aggregation/events-timeline/:spaceId?integrationId=...` — charge la liste des `Event` DataFriday + statut d'agrégation
- `GET` (interne) des transactions brutes → détecte les **dates sans événement** (`unregisteredDates`)
- `POST /aggregation/process-events` — déclenche l'agrégation d'un ou plusieurs `Event`
- `GET /aggregation/progress/:jobId` — polling de la progression (BullMQ)
- `GET /aggregation/event-breakdown/:spaceId/:eventId` — vue détaillée post-agrégation

**Ce que fait cette étape** :

1. **Détection des dates non couvertes** : Elle compare les dates de `transactionDate` dans `WeezeventTransaction` avec les `eventDate` des `Event` DataFriday existants. Les dates avec transactions mais sans `Event` remontent dans l'onglet "Non couvertes".

2. **Création des Event DataFriday** : L'admin peut créer un `Event` depuis une date non couverte (bouton "Créer un événement") ou mapper une date existante (bouton "Mapper à un événement").

3. **Déclenchement de l'agrégation** : Pour chaque `Event` avec statut `pending` ou `failed`, bouton "Agréger" → `POST /aggregation/process-events`. Le service :
   - Enqueue un job BullMQ
   - `AggregationProcessor` exécute `executeProcessEvents()`
   - Pour chaque `Event`, `DELETE` les anciennes lignes de `SpaceRevenueMinuteAgg`, puis `INSERT … SELECT` DB-level (aucune donnée chargée en Node.js)
   - Met à jour `AggregationJobLog.status = 'completed'`

**Query d'agrégation (cœur du pipeline)** :

```sql
INSERT INTO "SpaceRevenueMinuteAgg" (...)
SELECT
  gen_random_uuid(),
  tenantId, spaceId,
  date_trunc('minute', t."transactionDate"),
  'Europe/Paris',
  event.id,                    -- ← DataFriday Event.id (PAS WeezeventEvent.id)
  t."locationId",
  t."locationId",              -- weezeventMerchantId = locationId
  pm."menuItemId",
  SUM(ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)),
  COUNT(ti."id")::int,
  SUM(ti."quantity")::int,
  NOW(), NOW()
FROM "WeezeventTransaction" t
JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
JOIN "WeezeventProductMapping" pm ON pm."weezeventProductId" = ti."productId"
WHERE t."tenantId" = ?
  AND t."integrationId" = ?          -- filtre par intégration (étape 1)
  AND t."transactionDate" >= eventDate
  AND t."transactionDate" < nextDay  -- fenêtre de 24h (ou eventEndDate)
GROUP BY date_trunc('minute', t."transactionDate"), t."locationId", pm."menuItemId"
ON CONFLICT (...) DO UPDATE SET ...
```

**Données produites** : Chaque ligne de `SpaceRevenueMinuteAgg` = CA HT + nb transactions + quantités pour une combinaison unique `(minute × PDV × article × événement)`.

---

## 3. Pipeline complet : de la transaction au graphique

```
SYNC Weezevent API
  → WeezeventTransaction.integrationId ✓ (populé)
  → WeezeventTransaction.locationId    ✓ (populé)
  → WeezeventTransaction.transactionDate ✓ (populé)
  → WeezeventTransaction.eventId       → WeezeventEvent.id (saison, JAMAIS utilisé pour les stats)
  → WeezeventEvent.startDate           ✗ NULL sur toutes les saisons

WIZARD ADMIN
  Étape 1 → WeezeventLocationSpaceMapping  ← [doit être fait]
  Étape 2 → WeezeventLocationShopMapping   ← [doit être fait par PDV]
  Étape 3 → WeezeventProductMapping        ← [doit être fait par produit]
  Étape 4 → Event (DataFriday)             ← [CRÉER UN EVENT PAR MATCH]
           → trigger processEvents()
           → SpaceRevenueMinuteAgg peuplé  ← [TABLE VIDE ACTUELLEMENT]

REQUÊTE STATS (Analyse UI)
  Phase 1 : get_space_shop_details() RPC    → ~400ms ✅ (shops + WeezeventEvents)
  DataFriday Events (matchs)                → GET /events?spaceId= en Phase 1 ✅
  Phase 2 (granulaire) : depuis SpaceRevenueMinuteAgg → ~1.3s ✅ (était 31s)
  Timeline /event-timeline/:eventId         → filtre par transactionDate + accepte UUID ou CUID ✅
  /aggregation/event-stats                  → SpaceRevenueMinuteAgg → < 50ms ✅
```

---

## 4. État actuel de la DB (Stade Français)

| Table | Lignes | État |
|---|---|---|
| `WeezeventTransaction` | ~341 000 | ✅ Peuplé, `transactionDate` populé |
| `WeezeventTransactionItem` | ~447 000 | ✅ Peuplé |
| `WeezeventEvent` | 6 | ⚠️ Saisons (pas des matchs), `startDate = NULL` |
| `Event` (DataFriday) | 7 | ✅ Matchs individuels, `eventDate` peuplé |
| `WeezeventLocationShopMapping` | 112 | ✅ Complet |
| `WeezeventProductMapping` | 1 335 | ✅ Complet |
| `SpaceRevenueMinuteAgg` | **7 973** | ✅ Peuplé (7 490 pour le 19 mai 2024) |
| `AggregationJobLog` | 24 | ✅ 22 completed, 2 running (zombie 2019) |

### Transactions par saison (WeezeventEvent)

| Season | Transactions | Dates distinctes |
|---|---|---|
| Saison 23-24 | ~121 000 | ~30 dates de match |
| Saison 22-23 | ~89 000 | ~28 dates de match |
| Saison 21-22 | ~74 000 | ~26 dates de match |
| Autres | ~57 000 | — |

---

## 5. Problèmes identifiés et éléments manquants

### ✅ Problème A — RÉSOLU : `SpaceRevenueMinuteAgg` était vide

**Symptôme** : L'étape 4 du wizard est la seule manière de peupler cette table, mais elle n'a jamais été exécutée pour les 7 `Event` existants.

**Impact** :
- `GET /aggregation/event-stats/:spaceId/:eventId` retourne `revenueHt: 0` pour tous les événements
- `getEventBreakdown()` retourne vide
- Le graphique "CA/minute" de l'onglet Analyse est vide
- Le chip "data points" dans l'étape 4 affiche `—` pour tous les events

**Cause** : Les 7 `Event` ont été créés directement en DB ou via un import, sans passer par le bouton "Agréger" du wizard.

**Résolu** : Les 7 `Event` ont été agrégés. 7 973 lignes présentes dans `SpaceRevenueMinuteAgg`.

---

### ✅ Problème B — RÉSOLU : `getEventTimeline` accepte les deux types d'ID

**Symptôme** : `GET /spaces/:id/event-timeline/:eventId` retourne toujours `[]`.

**Cause** : Le service `spaces.service.ts` filtre `WHERE t."eventId" = ${eventId}` où `eventId` est un `Event.id` DataFriday (CUID généré par Prisma). Mais `WeezeventTransaction.eventId` pointe vers `WeezeventEvent.id` (saison Weezevent) — deux espaces d'IDs complètement différents.

```typescript
// spaces.service.ts ligne ~870 — FAUX
WHERE t."eventId" = ${eventId}  // ← eventId = DataFriday Event.id, jamais dans WeezeventTransaction.eventId
```

**Résolu** : `getEventTimeline` fait maintenant une requête parallèle sur `Event` (UUID DataFriday) ET `WeezeventEvent` (CUID). La fenêtre de dates est résolue depuis la table qui répond. Le filtre SQL utilise `transactionDate` + `integrationId`, jamais le champ `eventId` erroné.

---

### Problème C — `WeezeventEvent.startDate = NULL` (cosmétique/fonctionnel)

**Symptôme** : Les 6 saisons Weezevent n'ont pas de `startDate`. Certaines vues qui tentent d'afficher une date de saison montrent `null`.

**Cause** : La sync Weezevent (`catalog-sync.service.ts` ou `weezevent-sync.service.ts`) ne peuple pas ce champ, ou l'API Weezevent ne retourne pas cette info pour les saisons.

**Impact** : Faible — les stats utilisent `Event.eventDate` (DataFriday) pour les filtres. `WeezeventEvent.startDate` n'est pas critique pour le pipeline d'agrégation.

**Fix** : Script SQL one-shot pour dériver `startDate` depuis la première `transactionDate` de chaque saison :
```sql
UPDATE "WeezeventEvent" we
SET "startDate" = sub.min_date
FROM (
  SELECT t."eventId", MIN(t."transactionDate") AS min_date
  FROM "WeezeventTransaction" t
  WHERE t."eventId" IS NOT NULL
  GROUP BY t."eventId"
) sub
WHERE we."id" = sub."eventId"
  AND we."startDate" IS NULL;
```

---

### Problème D — Aucun lien FK `Event` ↔ `WeezeventEvent` (architectural)

**Symptôme** : Il est impossible de naviguer programmatiquement d'un match DataFriday (`Event`) à la saison Weezevent (`WeezeventEvent`) correspondante, ni de retrouver les transactions d'un match via son ID DataFriday.

**Cause** : `Event` n'a pas de champ `weezeventEventId` ni de relation vers `WeezeventEvent`. La seule passerelle est la `transactionDate` (filtre par plage de dates).

**Impact** :
- Le wizard "détection des dates non couvertes" compare les dates de transactions avec les dates des `Event` — fonctionne mais fragile (pas de fuseau horaire, matchs qui commencent à 20h et se terminent après minuit)
- Impossible de faire un lien cliquable "Match → Saison" dans l'UI

**Fix recommandé (migration additive)** :
```sql
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "weezeventEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "weezeventIntegrationId" TEXT;
-- Puis backfill depuis les matchs existants si l'information est connue.
```

---

### ✅ Problème E — RÉSOLU : Phase 2 maintenant < 2s

**Symptôme** : La phase 2 background de `useSpaceData.js` appelle `getSpaceShopGranular()` → RPC `get_space_shop_details(p_include_granular=true)` → 31s, 2.7 MB.

**Cause** : La RPC SQL scanne `WeezeventTransactionItem` de toute la saison pour les 5 WeezeventEvent via un gros JOIN. En l'absence d'un `SpaceRevenueMinuteAgg` peuplé, il n'existe pas d'alternative rapide.

**Résolu** : La RPC `get_space_shop_details(p_include_granular=true)` lit maintenant depuis `SpaceRevenueMinuteAgg` au lieu de scanner `WeezeventTransactionItem`. Temps mesuré : **1.3s** (était 31s+).

---

## 6. Marche à suivre — actions prioritaires

### ✅ PRIORITÉ 1 — FAIT : `SpaceRevenueMinuteAgg` peuplé (7 973 lignes)

**Prérequis** :
- Vérifier que les mappings étapes 1, 2, 3 sont complets pour le tenant
- Connaître l'`integrationId` de l'intégration Weezevent du Stade Français

**Action** : Dans le wizard, aller à l'étape 4 → cliquer "Agréger" pour chacun des 7 événements.

**Ou via API** (avec un token admin) :
```bash
curl -X POST https://api.datafriday.fr/api/v1/aggregation/process-events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "spaceId": "cmovqympl033l13qq53v86jax",
    "integrationId": "<weezevent-integration-id>",
    "eventIds": ["<event1_id>", "<event2_id>", "..."]
  }'
```

**Résultat attendu** : `SpaceRevenueMinuteAgg` peuplé avec ~8 000 lignes par événement (8 000+ minutes distinctes observées en base).

---

### ✅ PRIORITÉ 2 — FAIT : `getEventTimeline` corrigé (dual-ID + fenêtre de dates)

**Fichier** : `api-datafriday-staging/src/features/spaces/spaces.service.ts`

Requête parallèle sur `Event` (UUID DataFriday) ET `WeezeventEvent` (CUID). La fenêtre de dates est résolue depuis la table qui répond, le filtre SQL utilise `transactionDate` + `integrationId`.

---

### ✅ PRIORITÉ 3 — FAIT : Phase 2 granulaire depuis SpaceRevenueMinuteAgg (~1.3s)

Une fois `SpaceRevenueMinuteAgg` peuplé, modifier `spaces.service.ts` `getShopDetails` (ou créer un endpoint dédié) pour lire depuis `SpaceRevenueMinuteAgg` au lieu de scaner les tables brutes.

**Requête optimisée** :
```sql
SELECT
  srma."spaceElementId",
  se.name AS "shopName",
  srma."weezeventEventId" AS "eventId",
  SUM(srma."revenueHt")           AS "revenueHt",
  SUM(srma."transactionsCount")   AS "transactionsCount",
  SUM(srma."itemsCount")          AS "itemsCount"
FROM "SpaceRevenueMinuteAgg" srma
JOIN "SpaceElement" se ON se.id = srma."spaceElementId"
WHERE srma."tenantId" = ? AND srma."spaceId" = ?
GROUP BY srma."spaceElementId", se.name, srma."weezeventEventId"
```

**Performance attendue** : < 200ms (index `idx_tenantId_spaceId_weezeventEventId_minute`).

---

### PRIORITÉ 4 — Ajouter la colonne `weezeventEventId` sur `Event`

**Migration SQL (additive, sans reset)** :
```sql
-- Fichier: supabase/migrations/YYYYMMDDHHMMSS_add_weezevent_event_id_to_event.sql
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "weezeventEventId"       TEXT,
  ADD COLUMN IF NOT EXISTS "weezeventIntegrationId" TEXT;

CREATE INDEX IF NOT EXISTS idx_event_weezevent_event_id
  ON "Event"("weezeventEventId")
  WHERE "weezeventEventId" IS NOT NULL;
```

**Prisma schema à ajouter** dans `model Event` :
```prisma
weezeventEventId       String?
weezeventIntegrationId String?
```

---

### PRIORITÉ 5 — Backfill `WeezeventEvent.startDate`

```sql
UPDATE "WeezeventEvent" we
SET "startDate" = sub.min_date
FROM (
  SELECT t."eventId", MIN(t."transactionDate") AS min_date
  FROM "WeezeventTransaction" t
  WHERE t."eventId" IS NOT NULL
  GROUP BY t."eventId"
) sub
WHERE we."id" = sub."eventId"
  AND we."startDate" IS NULL;
```

---

## 7. Référence : schéma des tables clés

### `WeezeventLocationSpaceMapping` (étape 1)
```
id, tenantId, weezeventLocationId (= integrationId), spaceId, createdAt, updatedAt
```

### `WeezeventLocationShopMapping` (étape 2)
```
id, tenantId, weezeventLocationId (= locationId de WeezeventTransaction), spaceElementId, createdAt, updatedAt
```

### `WeezeventProductMapping` (étape 3)
```
id, tenantId, weezeventProductId, menuItemId, createdAt, updatedAt
```

### `Event` (DataFriday — créé en étape 4)
```
id, name, eventDate, eventEndDate, spaceId, tenantId,
eventTypeId, eventCategoryId, revenue, transactionCount
```

### `SpaceRevenueMinuteAgg` (produit par l'agrégation — étape 4)
```
id, tenantId, spaceId,
minute (TIMESTAMPTZ tronqué à la minute),
timezone,
weezeventEventId    ← Event.id (DataFriday, PAS WeezeventEvent.id)
weezeventLocationId ← WeezeventTransaction.locationId
weezeventMerchantId ← WeezeventTransaction.locationId (dupliqué)
spaceElementId      ← MenuItem.id
revenueHt, transactionsCount, itemsCount,
UNIQUE (tenantId, spaceId, minute, weezeventEventId, weezeventLocationId, weezeventMerchantId, spaceElementId)
```

### `AggregationJobLog`
```
id, tenantId, spaceId,
jobType (full | incremental | rebuild),
status (pending | running | completed | failed),
fromDate, toDate,
transactionsProcessed,
metadata (JSON: { eventIds: [...] })
```

---

## Annexe — Confusion de nomenclature

> **Attention** : Le champ `SpaceRevenueMinuteAgg.weezeventEventId` stocke en réalité un `Event.id` (DataFriday), **pas** un `WeezeventEvent.id` (saison Weezevent). Cette confusion de nommage est un piège systémique.

| Terme | Table | Ce que c'est vraiment |
|---|---|---|
| `WeezeventEvent` | `WeezeventEvent` | Une **saison** Weezevent (ex: "Stade Français 23-24") |
| `Event` | `Event` | Un **match individuel** DataFriday (ex: "SF vs Pau 15/02/2024") |
| `weezeventEventId` dans `SpaceRevenueMinuteAgg` | `SpaceRevenueMinuteAgg` | → `Event.id` (match DataFriday) |
| `eventId` dans `WeezeventTransaction` | `WeezeventTransaction` | → `WeezeventEvent.id` (saison Weezevent) |

Ces deux espaces d'IDs ne sont **jamais directement comparables**. La seule passerelle est la date : `Event.eventDate` ↔ `WeezeventTransaction.transactionDate` (fenêtre 24h).
