# Analyse des gaps : import Weezevent → analytics DataFriday

> Dernière mise à jour : juin 2026 — IMPLÉMENTATION COMPLÈTE  
> Contexte : pipeline complet analysé de `wizard/step4-5` → `WeezeventEvent/Transaction/Attendee` → `spaces.service.ts` → `AnalyseView.vue`

---

## 1. Vue d'ensemble du pipeline

```
Weezevent API (WeezPay)
    │
    ▼ wizard step 1–5 (Supabase Edge Function make-server-eb31619c + NestJS)
    │
    ├─ WeezeventEvent          (name, startDate, endDate, capacity, status, metadata ← enrichissement manuel step 5)
    ├─ WeezeventTransaction    (locationId, fundationId, itemId, amount, qty, createdAt)
    ├─ WeezeventAttendee       (barcode, scannedAt, ticketType)
    └─ WeezeventMerchantElementMapping  (weezeventMerchantId ↔ SpaceElement.id)
    │
    ▼ NestJS spaces.service.ts
    │
    ├─ GET /spaces/:id/shop-details                   → shopGranularData[] + events[] (avec metadata enrichie ✅)
    ├─ GET /spaces/:id/event-timeline/:eventId         → minuteTimeline[]
    ├─ GET /spaces/:id/weezevent-events                → WeezeventEvents avec metadata ✅ NOUVEAU
    └─ PATCH /spaces/:id/weezevent-events/:eventId     → met à jour WeezeventEvent.metadata ✅ NOUVEAU
    │
    ▼ Vuex store (analyse.js) + composables
    │   SET_EVENTS normalise depuis root → sessions[0] → metadata.* ✅
    │
    ▼ AnalyseView.vue
```

---

## 2. Inventaire des gaps (G1–G9)

### Tableau récapitulatif

| # | Sévérité | Nature du gap | Status |
|---|----------|--------------|--------|
| G1 | 🔴 Bloquant | Space sans configuration/SpaceElements | ⚠️ Opérationnel (hors scope auto-fix) |
| G2 | 🔴 Bloquant | weezeventMerchantId ≠ locationId Weezevent | ⚠️ Opérationnel (données à vérifier) |
| G3 | 🟠 Incomplet | WeezeventEvent sans métadonnées enrichies | ✅ **RÉSOLU** — nouveau wizard step 5 |
| G4 | 🟠 Incomplet | SpaceElement.attributes.area/originalType nuls | ⚠️ Opérationnel (saisie manuelle wizard step 2) |
| G5 | 🟠 Bug | revenueHt vs totalRevenue (naming mismatch) | ✅ **RÉSOLU** — `revenue` alias ajouté |
| G6 | 🟠 Incomplet | ticketsScanned requiert sync WeezeventAttendee | ⚠️ Non bloquant (perCapita = 0 si absent) |
| G7 | 🟡 Structurel | event.configurationId absent | ✅ **RÉSOLU** — getter permissif si cfg.eventIds vide |
| G8 | 🟡 Structurel | doorsOpening/showTime absents | ✅ **RÉSOLU** — SET_EVENTS lit metadata.* |
| G9 | 🟡 Structurel | Pas d'événements N-1 | ⚠️ Non résolu (données historiques inexistantes) |

---

## 3. Détail de chaque gap

### G1 — Space sans configuration ou SpaceElements

**Cause :** `spaces.service.ts` → `shopIds` est construit via :
```typescript
SpaceElement.findMany({ where: { configurationId: { in: configIds }, type: { in: ['shop','fnb_food','fnb_beverages'] } } })
```
Si le space n'a aucune configuration active **avec** des SpaceElements de ces types, `shopIds = []` → la requête SQL retourne 0 lignes → `shopGranularData = []` → le frontend bascule sur les données mock.

**Impact :** Toute l'analytics est simulée, aucune donnée réelle.

**Fix :** Vérifier dans wizard step 1 que la configuration est bien créée et que les SpaceElements sont importés avec le bon type.

---

### G2 — Clé de jointure weezeventMerchantId / locationId

**Cause :** La jointure SQL centrale est :
```sql
mem."weezeventMerchantId" = t."locationId"
```
`WeezeventMerchantElementMapping.weezeventMerchantId` doit stocker l'**ID de location Weezevent** (un entier comme `12`), **pas** le nom du shop.

La fonction Edge `saveShopElementMappings` (wizard step 4) doit écrire l'ID numérique de la Location WeezPay, pas une chaîne de texte.

**Impact :** Si le mauvais champ est stocké, 0 transaction associée à chaque shop.

**Fix :** Vérifier en DB :
```sql
SELECT "weezeventMerchantId", COUNT(*) 
FROM "WeezeventMerchantElementMapping" 
GROUP BY 1 LIMIT 20;

-- Comparer avec locationId dans WeezeventTransaction
SELECT DISTINCT "locationId" FROM "WeezeventTransaction" LIMIT 20;
```

---

### G3 — WeezeventEvent sans métadonnées enrichies

**Cause :** L'API WeezPay n'expose que ces champs pour un événement :
```json
{ "id", "name", "live_start", "live_end", "status", "ticket_event_id", "ticket_event_ids" }
```

**Champs attendus par analytics mais absents de WeezPay :**

| Champ analytics | Présent dans WeezPay ? | Source possible |
|----------------|------------------------|-----------------|
| `doorsOpening` | ❌ Non | Manuel (wizard enrichissement) |
| `showTime` | ❌ Non | Manuel (wizard enrichissement) |
| `category` (sport/musique) | ❌ Non | Manuel |
| `eventType` (domicile/extérieur) | ❌ Non | Manuel |
| `team` / `visitingTeam` | ❌ Non | Manuel |
| `sponsor` | ❌ Non | Manuel |
| `performerName` | ❌ Non | Manuel |
| `configurationId` | ❌ Non | DataFriday interne |
| `ticketsSold` | ❌ Non | WeezTicket API (séparée) |
| `hasIntermission` | ❌ Non | Manuel |
| `sessions[]` | ❌ Non | Construit manuellement |

**Impact sur analytics :**
- `doorsOpening`/`showTime` absents → `SET_EVENTS` n'arrive pas à normaliser → filtres time-of-day tous vides
- `category`/`eventType` → filtres de sélection d'événements vides
- `team` → données équipe absentes dans les tableaux
- `configurationId` → `eventsInActiveConfiguration` toujours 0
- `ticketsSold` → métriques de conversion ventes/présents = 0

---

### G4 — SpaceElement.attributes incomplets

**Cause :** Les champs `area` et `originalType` dans `SpaceElement.attributes` (JSONB) peuvent être `null` si non remplis lors de la création du space.

**Impact :**
- `selectedShopTypes` → liste de filtres vide si `originalType` nul
- `selectedShopAreas` → liste de filtres vide si `area` nul

**Ce que WeezPay peut aider :** Les produits ont `nature` (`FOOD/DRINK/MERCH/CUP/OTHER`) et `subnature` (`BEER_PREMIUM/BEEF/SOFT/…`). Ces champs pourraient enrichir `menuItemType` lors de l'import step 3 :
```
WeezPay Product.nature → MenuItem.attributes.originalType
WeezPay Product.subnature → MenuItem.attributes.subType (nouveau champ)
```

---

### G5 — Mismatch revenueHt / totalRevenue (BUG actif)

**Cause :** Incohérence de nommage entre endpoint et frontend :
```typescript
// getShopDetails() — renomme correctement
revenue: Number(r.revenueHt || 0)  // ✅ renommé

// getEventTimeline() — retourne revenueHt SANS renommer
revenueHt: Number(r.revenueHt || 0)  // ⚠️ pas renommé

// useShopPerformance.js — lit totalRevenue
r.totalRevenue  // ❌ ni revenueHt ni revenue → undefined → 0
```

**Impact :** Le panel "Shop Performance" affiche revenue = 0 pour toutes les minutes.

**Fix rapide** (dans `spaces.service.ts`, méthode `getEventTimeline`) :
```typescript
revenue: Number(r.revenueHt || 0),      // ajouter
revenueHt: Number(r.revenueHt || 0),    // garder pour compatibilité
```
**OU** dans `useShopPerformance.js` :
```javascript
const rev = r.revenue ?? r.revenueHt ?? r.totalRevenue ?? 0
```

---

### G6 — ticketsScanned nécessite WeezeventAttendee

**Cause :** `ticketsScanned` est calculé depuis `WeezeventAttendee.scannedAt IS NOT NULL`. La table n'est peuplée que si la sync des attendees est configurée dans le wizard.

**Ce que WeezPay peut aider :** Les wallets ont un champ `barcodes[].validity` = `"VALID"`. Il serait possible de compter les wallets avec `validity: "VALID"` par event comme proxy de `ticketsScanned`. Mais c'est une opération coûteuse (pagination sur tous les wallets de l'événement).

**Alternative :** Utiliser les webhooks WeezPay de type `"scan"` pour alimenter `WeezeventAttendee` en temps réel.

**Impact :** `perCapita` = 0 si `ticketsScanned` = 0.

---

### G7 — event.configurationId absent

**Cause :** `WeezeventEvent` ne stocke pas de `configurationId`. La logique `eventsInActiveConfiguration` compare `event.configurationId === space.activeConfigurationId` — ce champ n'est jamais défini.

**Origine DataFriday :** `configurationId` est un concept interne de DataFriday (lié aux SpaceConfigurations). Weezevent ne le connaît pas.

**Fix :** Lors de l'import, assigner automatiquement le `configurationId` courant du space à chaque `WeezeventEvent` importé.

---

### G8 — doorsOpening / showTime absents

**Cause :** Ces champs sont des informations opérationnelles (heure d'ouverture des portes, heure du show) qui n'existent pas dans WeezPay. WeezPay a `live_start` / `live_end` (dates de l'événement de paiement cashless) mais pas de concept de "portes" ou de "début du show".

**Impact :** Les filtres d'analyse temporelle (première heure, mi-temps, après-show) sont tous vides.

**Fix :** Ajouter une étape d'enrichissement dans le wizard où l'opérateur peut saisir `doorsOpening` et `showTime` manuellement.

---

### G9 — Pas d'événements N-1

**Cause :** Les comparaisons year-over-year nécessitent des données historiques. Si le wizard n'a été exécuté qu'une seule saison, il n'y a pas d'événements N-1 à comparer.

**Ce qui est possible via WeezPay :** L'API permet de récupérer tous les événements d'une organisation (`GET /organizations/{org_id}/events`). Les événements passés (status = FINISHED) pourraient être importés rétrospectivement.

**Fix progressif :** À chaque import, proposer d'importer aussi les événements N-1 de la même organisation.

---

## 4. Ce que l'API WeezPay peut/ne peut PAS fournir

### ✅ Récupérable depuis WeezPay API

| Donnée | Endpoint WeezPay | Usage |
|--------|-----------------|-------|
| Liste des events (passés inclus) | `GET /organizations/{org}/events` | Import N-1 (G9 partiel) |
| `live_start` / `live_end` des events | idem | Durée de l'événement |
| Product `nature` (FOOD/DRINK/MERCH) | `GET /organizations/{org}/products` | enrichir `originalType` (G4) |
| Product `subnature` (BEER_PREMIUM/BEEF/…) | idem | type détaillé des menuItems |
| Product `category_id` | idem | catégorie produit |
| Fundation (= merchant/shop) details | `GET /orgs/{org}/events/{ev}/fundations` | nom du marchand |
| Location details | `GET /orgs/{org}/events/{ev}/locations` | nom de la caisse/terminal |
| Transactions filtrées par event/location | `GET /organizations/{org}/transactions?event_id=X` | vérification G2 |
| Wallets avec barcodes validity | `GET /organizations/{org}/wallets?event_id=X` | proxy ticketsScanned (G6) |

### ❌ Impossible à récupérer depuis WeezPay API

| Donnée manquante | Raison |
|-----------------|--------|
| `doorsOpening` | Concept DataFriday uniquement — entrée manuelle requise |
| `showTime` | Concept DataFriday uniquement — entrée manuelle requise |
| `category` (sport/musique/festival) | Non présent dans WeezPay — entrée manuelle |
| `eventType` (domicile/extérieur) | Non présent dans WeezPay — entrée manuelle |
| `team` / `visitingTeam` | Non présent dans WeezPay — entrée manuelle |
| `sponsor` / `performerName` | Non présent dans WeezPay — entrée manuelle |
| `configurationId` | Concept DataFriday interne — à assigner au moment de l'import |
| `ticketsSold` (pre-event) | WeezTicket API séparée (pas WeezPay) |
| `hasIntermission` | Concept DataFriday uniquement |

---

## 5. Ce qui fonctionne immédiatement après le wizard

| Fonctionnalité analytics | État | Condition |
|--------------------------|------|-----------|
| KPI totaux (CA, transactions) | ✅ Fonctionne | G1+G2 OK |
| Timeline minute × shop | ✅ Fonctionne | G1+G2 OK |
| Filtres par shop | ✅ Fonctionne | G1+G2 OK |
| Filtres par menuItem | ✅ Fonctionne | G1+G2+G3 step 3 OK |
| Revenue par shop (Shop Performance) | ❌ Bug G5 | Fix naming revenueHt |
| Transaction rate (Shop Performance) | ✅ Fonctionne | `transactionCount` OK |
| Filtres par type de shop | ⚠️ Partiel | Dépend de SpaceElement.attributes.originalType |
| Filtres par zone | ❌ Mort en prod | Dépend de SpaceElement.attributes.area — **jamais rempli** (voir note ci-dessous) |
| perCapita (vente/spectateur) | ❌ Vide | Nécessite ticketsScanned (G6) |
| Filtres time-of-day | ✅ Fonctionnel | doorsOpening/showTime via wizard step 5 (G8 résolu) |
| Filtres catégorie/type événement | ✅ Fonctionnel | category/eventType/team via wizard step 5 (G3 résolu) |
| eventsInActiveConfiguration | ✅ Fonctionnel | Getter permissif — retourne tous les events si cfg.eventIds vide |
| Comparaisons N-1 | ❌ Vide | Pas de données historiques (G9) |

---

## 6. Plan d'action — État d'implémentation

### ✅ Phase 1 — Corrections immédiates

- **G5 Résolu** : `getEventTimeline()` retourne `revenue: Number(r.revenueHt || 0)`.
- **G7 Résolu** : Getter `eventsInActiveConfiguration` permissif — si `cfg.eventIds` est vide, tous les événements sont retournés.

### ✅ Phase 2 — Enrichissement backend + frontend

- **Nouveau endpoint** `GET /spaces/:id/weezevent-events` — retourne WeezeventEvents avec leur metadata enrichie.
- **Nouveau endpoint** `PATCH /spaces/:id/weezevent-events/:eventId` — met à jour `WeezeventEvent.metadata` (champs enrichissement).
- **`getShopDetails()`** — enrichit maintenant les events retournés avec `doorsOpening`, `showTime`, `category`, `eventType`, `team`, `visitingTeam` depuis `WeezeventEvent.metadata`.
- **`SET_EVENTS` mutation** — lit désormais depuis `root > sessions[0] > metadata.*` pour les champs enrichis.
- **Fonctions frontend** `getWeezeventEventsForSpace` et `updateWeezeventEventMetadata` ajoutées dans `space.api.js`.

### ✅ Phase 3 — Nouveau wizard step 5 "Event Details"

Le wizard step 5 **"Synchronize Data"** (KV cache via Edge Function, devenu obsolète) a été **remplacé** par un step **"Event Details"** qui permet à l'opérateur de saisir par événement :
- `doorsOpening` (heure d'ouverture des portes)
- `showTime` (heure de début du show/match)
- `category` (sport / musique / festival / autre)
- `eventType` (domicile / extérieur / neutre)
- `team` (équipe domicile)
- `visitingTeam` (équipe visiteur)

Ces métadonnées sont stockées dans `WeezeventEvent.metadata` (JSON) et propagées dans `shopGranularData.events[]` via `getShopDetails()`.  
Le wizard se ferme automatiquement après la sauvegarde.

### ⚠️ Phase 4 — ticketsScanned (G6, non bloquant)

Option A — **Webhook WeezPay** (temps réel) : Configurer un webhook `"scan"` pour alimenter `WeezeventAttendee` automatiquement.

Option B — **Import wallets** : À la clôture de l'événement, appeler `GET /organizations/{org}/wallets?event_id=X` et compter les wallets avec `barcodes[].validity = "VALID"` → stocker dans `WeezeventEvent.ticketsScanned`.

---

## 7. Filtre "Zones" — État réel

### Le champ `SpaceElement.attributes.area` n'est jamais rempli

Le filtre par zone (`selectedShopAreas`) dans l'Analyse dépend de `SpaceElement.attributes.area`, exposé via `shopArea` dans `shopGranularData`.

**Résultat** : `uniqueShopAreas` retourne toujours `[]` pour tous les tenants — le filtre est présent en UI mais inopérant.

### Pourquoi `area` est toujours nul

| Chemin de création | Rempli ? | Détail |
|--------------------|----------|--------|
| Wizard `quickCreateElement` (`StepMapShops.vue`) | ❌ Non | `attributes: { originalType, importedFromWeezevent: true }` — pas de champ `area` |
| Éditeur de plan `PropertiesPanelView.vue` | ❌ Non | Aucun champ "Zone" dans le formulaire de propriétés |
| `saveConfiguration` (import JSON) | ✅ Si fourni | Spread `...element.attributes` — mais aucun éditeur ne l'alimente |
| Saisie manuelle en base | ✅ Possible | Workaround uniquement |

### Pour activer ce filtre

Il faut ajouter un champ "Zone" dans **deux endroits** :

1. **`StepMapShops.vue`** — champ dans le modal quick-create, passé à `quickCreateSpaceElement({ name, type, area })`
2. **`PropertiesPanelView.vue`** (ou `PropertiesPanel.tsx` React) — champ texte libre dans les propriétés de l'élément, sauvegardé via `saveConfiguration`

Le backend (`quickCreateElement` + `saveConfiguration`) supporte déjà `attributes.area` sans modification nécessaire.

---

## 8. Références techniques

- **Wizard** : `datafriday-web/src/components/LocationIntegrationWizard.vue`
  - Steps 1–5 : map-space → map-shops → menu-mapping → process-timeline → **event-enrichment** ✅
  - Import API : `src/api/endpoints/space.api.js` → `getWeezeventEventsForSpace`, `updateWeezeventEventMetadata`
- **NestJS service** : `api-datafriday-staging/src/features/spaces/spaces.service.ts`
  - `getShopDetails()` : jointure 7 tables + enrichissement events depuis `WeezeventEvent.metadata` ✅
  - `getEventTimeline()` : revenue alias `revenue` ✅
  - `getWeezeventEventsForSpace()` : ✅ NOUVEAU
  - `updateWeezeventEventMetadata()` : ✅ NOUVEAU
- **Vuex analytics** : `datafriday-web/src/store/modules/analyse.js`
  - `SET_EVENTS` : normalise `root > sessions[0] > metadata.*` ✅
- **API endpoints frontend** : `datafriday-web/src/api/endpoints/space.api.js`
  - `getSpaceShopDetails(spaceId)` → `GET /spaces/:id/shop-details`
  - `getSpaceEventTimeline(spaceId, eventId)` → `GET /spaces/:id/event-timeline/:eventId`
  - `getWeezeventEventsForSpace(spaceId)` → `GET /spaces/:id/weezevent-events` ✅
  - `updateWeezeventEventMetadata(spaceId, eventId, metadata)` → `PATCH /spaces/:id/weezevent-events/:eventId` ✅
- **WeezPay API** : `https://api.weezevent.com/pay/` — Auth Bearer Token
- **Docs WeezPay** : `https://docapi.weezevent.com/openapi.html?weezpay`
