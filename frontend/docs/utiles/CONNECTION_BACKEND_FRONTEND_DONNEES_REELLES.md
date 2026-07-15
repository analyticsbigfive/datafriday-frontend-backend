# Connexion Backend → Frontend : Données Réelles

> Objectif : faire afficher dans `AnalyseView` les données réelles de production,  
> sans aucun fallback sur les mocks/démo.

---

## 1. Architecture de bout en bout

```
Weezevent API
    │
    ▼
POST /weezevent/sync  (BullMQ job)
    │  produit
    ▼
WeezeventTransaction / WeezeventProduct / WeezeventEvent  (Prisma)
    │
    ▼  (wizard d'intégration)
WeezeventLocationShopMapping + WeezeventProductMapping
    │
    ▼  (BullMQ aggregation job)
SpaceRevenueMinuteAgg
    │
    ▼
GET /spaces/:id/shop-details  ← endpoint principal
    │
    ▼
useSpaceData.js → Vuex store/modules/analyse.js
    │
    ▼
AnalyseView.vue (composants graphiques)
```

---

## 2. Prérequis backend

| Condition | Pourquoi c'est critique |
|---|---|
| Backend NestJS sur `http://localhost:3000` | URL fixée dans `.env.development` |
| `VUE_APP_API_URL=http://localhost:3000/api/v1` | Si absent → appels vers `undefined` |
| Supabase auth actif, JWT valide | Guard `JwtDatabaseGuard` sur toutes les routes `/spaces/*` |
| Tables Weezevent présentes en DB | `getShopDetails` teste `WeezeventTransaction` — si table absente → fallback mock |
| Wizard d'intégration complété | Sans `WeezeventLocationShopMapping` ni `WeezeventProductMapping`, `shopGranularData` est vide |
| Job d'agrégation exécuté au moins 1x | Sans `SpaceRevenueMinuteAgg`, les timelines sont vides |

---

## 3. Chemin de chargement complet (côté frontend)

### 3.1 Déclenchement

```
AnalyseView.vue (onMounted, ligne 691)
  → store.dispatch('analyse/loadSpace', spaceId)
      → dispatch('useSpaceDataFetch', spaceId)
          → composable fetchSpaceData(spaceId)   ← useSpaceData.js
```

### 3.2 `fetchSpaceData` — ordre d'exécution et conditions de fallback mock

```
1. isDemoMode()  →  si true  → MOCK immédiat (stop ici)
2. Appels parallèles :
   ├── GET /spaces/:id                           → space
   ├── GET /spaces/:id/configurations            → configurations
   ├── GET /spaces/:id/shop-details              → shopGranularData, events, menuItemCostMap
   ├── GET /menu-items?spaceId=...               → menuItems
   ├── GET /menu-components                      → components
   └── GET /ingredients                          → ingredients
3. Si shop-details lève "missing Weezevent table" → hasMissingWeezeventTable = true
4. Si !space                     → MOCK
5. Si hasMissingWeezeventTable   → MOCK
6. Si 0 events ET 0 records      → log warning (plus de mock depuis récente MAJ)
7. catch (401/403)               → bubble up vers login
8. catch (network/timeout/5xx)   → MOCK
```

**Résultat tagué** `_fromMock: false` si et seulement si toutes les étapes 1-8 passent avec succès.

---

## 4. Les couches de fallback mock — résumé et conditions de déclenchement

### Couche 1 — Demo mode (`demoMode.js`)

| Déclencheur | Résolution |
|---|---|
| `?demo=1` dans l'URL | Changer en `?demo=0` ou supprimer le paramètre |
| `localStorage.analyse_demo === '1'` | Passer `?demo=0` une fois (le JS le supprime automatiquement) |

### Couche 2 — `useSpaceData.js` : espace introuvable

| Déclencheur | Résolution |
|---|---|
| `GET /spaces/:id` retourne null / 404 | Vérifier que le spaceId dans l'URL existe bien en DB pour ce tenant |

### Couche 3 — `useSpaceData.js` : table Weezevent absente

| Déclencheur | Résolution |
|---|---|
| `GET /spaces/:id/shop-details` lève l'erreur `missing Weezevent table` | Exécuter les migrations Prisma ; s'assurer que `WeezeventTransaction` est créée |

> **Note** : le backend détecte l'absence de la table et retourne un flag spécial (pas un 5xx).  
> Ce flag est intercepté dans `useSpaceData.js` avant le catch général.

### Couche 4 — `useSpaceData.js` : erreur réseau / serveur

| Déclencheur | Résolution |
|---|---|
| Backend éteint, timeout, 5xx | Démarrer le backend. Vérifier les logs NestJS. |

### Couche 5 — `apiOrMock` dans `analyse.api.js` (chemin SECONDAIRE uniquement)

Ces 4 endpoints sont uniquement appelés par `loadSpaceLightweight` (jamais par `loadSpace`) :

| Endpoint frontend | Route backend | Fallback si erreur |
|---|---|---|
| `GET /analyse/dashboard` | `AnalyseController.getDashboard` ✅ existe | `ANALYSE_DASHBOARD_MOCK` |
| `GET /analyse/kpis/menu` | `AnalyseController.getMenuKpis` ✅ existe | `ANALYSE_KPIS_MENU_MOCK` |
| `GET /analyse/kpis/events` | `AnalyseController.getEventKpis` ✅ existe | `ANALYSE_KPIS_EVENTS_MOCK` |
| `GET /analyse/cost-breakdown` | `AnalyseController.getCostBreakdown` ✅ existe | `ANALYSE_COST_BREAKDOWN_MOCK` |

> ⚠️ Ces endpoints existent mais retournent des **statistiques catalogue tenant-niveau** (nombre d'articles, marges moyennes) et **non** des données revenue par event.  
> Les données financières principales (CA, transactions, etc.) proviennent toutes de `GET /spaces/:id/shop-details` et sont **calculées côté client** dans le store Vuex.

### Couche 6 — `loadTimelineForEvent` : timeline par event (TODO backend)

```js
// store/modules/analyse.js ~ligne 1130
// TODO : remplacer par un endpoint réel `/analyse/timeline/{eventId}`
// dès qu'il existe côté backend. Pour l'instant on lit le mock.
const data = getTimelineByEventMock(eventId) || []
```

> ⚠️ **Point bloquant connu** : `loadTimelineForEvent` est hardcodé sur mock.  
> La timeline minute-par-minute dans `EventTimelineChart` passe par `useAnalyseTimeline.js`  
> qui appelle `GET /spaces/:id/event-timeline/:eventId` (route qui **existe** dans `spaces.controller.ts`).  
> La version dans le store (`loadTimelineForEvent`) est différente et toujours sur mock.

---

## 5. Ce que doit retourner `GET /spaces/:id/shop-details`

C'est l'endpoint qui alimente 95 % des graphiques. Il doit retourner :

```typescript
{
  shops: Shop[],            // liste des shops du space
  shopGranularData: {       // enregistrements revenue × shop × event × menuItem
    eventId: string,
    shopName: string,
    menuItemId: string,
    menuItemName: string,
    revenue: number,
    quantity: number,
    transactionCount: number,
  }[],
  events: {                 // events liés aux données Weezevent
    id: string,
    eventName: string,
    eventDate: string,
    attendees: number,
    ticketsScanned: number,
  }[],
  menuItemCostMap: {        // coût par menuItem (pour le calcul de marge)
    [menuItemId: string]: number
  },
  meta: {
    hasMissingWeezeventTable: boolean,
    // ...autres flags de santé
  }
}
```

Si `shopGranularData` est vide (0 enregistrements), tous les graphiques afficheront zéro mais **aucun mock ne sera déclenché** (comportement correct post-MAJ récente).

---

## 6. Données dont le frontend a besoin — checklist par graphique

| Composant | Source de données | Condition pour afficher réel |
|---|---|---|
| `FinancialMetricsGrid` (CA, marge…) | `shopGranularData` + `events` (calcul Vuex) | `shop-details` retourne des records |
| `EventRevenueByShopChart` | `shopGranularData` filtré | idem |
| `EventTimelineChart` (minute par minute) | `GET /spaces/:id/event-timeline/:eventId` | Job d'agrégation + timeline endpoint |
| `ShopDistributionPieChart` | `shopGranularData` | idem |
| `MenuItemRevenueDistribution` | `shopGranularData` + `menuItems` | idem |
| `MenuItemsByShopTable` | `shopGranularData` + `menuItems` | idem |
| `ShopPerformanceByTransactionRate` | `getSpaceEventTimeline` (multi-appels) | Timeline endpoint |
| `SummaryPanel` (KPIs header) | `shopGranularData` + `events` | idem |

---

## 7. Étapes pour activer les données réelles

### Étape 1 — Vérifier la configuration

```bash
# Frontend (.env.development)
cat datafriday-web/.env.development
# Doit contenir : VUE_APP_API_URL=http://localhost:3000/api/v1

# Backend
cd api-datafriday-staging
pnpm run start:dev
# Vérifier : Listening on port 3000
```

### Étape 2 — Migrations DB

```bash
cd api-datafriday-staging
npx prisma migrate dev
# S'assurer que WeezeventTransaction, WeezeventProduct,
# WeezeventLocationShopMapping, WeezeventProductMapping existent
```

### Étape 3 — Compléter le wizard Weezevent

Le wizard (`/spaces/:id/weezevent-setup`) doit avoir validé :
- **StepMapShops** : chaque `WeezeventLocation` mappée à un Shop (`WeezeventLocationShopMapping`)
- **StepMapProducts** : chaque produit Weezevent mappé à un MenuItem (`WeezeventProductMapping`)

Sans ces mappings, `getShopDetails` retourne `shopGranularData: []`.

### Étape 4 — Synchroniser les données Weezevent

```bash
# Via l'API (nécessite credentials Weezevent configurés)
POST /weezevent/sync  { spaceId: "...", tenantId: "..." }

# Ou directement depuis le dashboard admin
# Settings → Intégrations → Weezevent → Synchroniser
```

### Étape 5 — Déclencher l'agrégation

```bash
# BullMQ job — via l'API ou en forçant manuellement
POST /spaces/:id/aggregate
# OU attendre le cron (fréquence configurée dans BullMQ)
```

### Étape 6 — Ouvrir l'URL sans demo mode

```
http://localhost:8080/spaces/<SPACE_ID>
```

Pas de `?demo=1`. Si vous avez utilisé `?demo=1` avant, passer `?demo=0` une fois pour nettoyer le localStorage.

---

## 8. Debugging : comment savoir d'où viennent les données

### Badge orange dans l'UI

`AnalyseView.vue` affiche un banner orange "Données démo" quand `fromMock === true` (store state `analyse.fromMock`).  
Si le banner est absent, les données sont réelles.

### Console browser

```
[useSpaceData] ✅ Real data loaded for space <id>   ← réel
[useSpaceData] ⚠️ Falling back to mock for space <id>  ← mock
[apiOrMock] falling back to mock for analyse/dashboard  ← mock secondaire
```

### Vérifier en Network tab

| URL | Status attendu | Si autre |
|---|---|---|
| `GET /api/v1/spaces/:id` | 200 | 401 = JWT expiré, 404 = spaceId inconnu |
| `GET /api/v1/spaces/:id/shop-details` | 200 | 500 = table Weezevent absente |
| `GET /api/v1/spaces/:id/event-timeline/:eventId` | 200 | 404 = aucune agrégation pour cet event |

### Vérifier le JWT

```js
// Console browser
import { supabase } from '@/lib/supabase'
const { data: { session } } = await supabase.auth.getSession()
console.log(session?.access_token ? '✅ JWT valide' : '❌ pas de session')
```

---

## 9. Schéma décisionnel : pourquoi je vois encore des mocks ?

```
fromMock === true ?
│
├─ isDemoMode() retourne true ?
│   └─ → Supprimer ?demo=1 et localStorage.analyse_demo
│
├─ GET /spaces/:id retourne null / 404 ?
│   └─ → Vérifier que le spaceId existe pour ce tenant
│
├─ shop-details lève "missing Weezevent table" ?
│   └─ → Exécuter migrations Prisma
│
├─ shop-details retourne 5xx ?
│   └─ → Vérifier logs NestJS (erreur de query Prisma)
│
├─ Pas de réseau (backend éteint) ?
│   └─ → Démarrer api-datafriday-staging
│
└─ shop-details retourne 200 mais shopGranularData = [] ?
    └─ → Wizard non complété OU données Weezevent non synchronisées
       → Pas de mock, mais graphiques vides (comportement correct)
```

---

## 10. Cas particulier : `/analyse/timeline/{eventId}` (TODO en cours)

Le store contient un TODO explicite (ligne ~1130 de `store/modules/analyse.js`) :

```js
// TODO : remplacer par un endpoint réel `/analyse/timeline/{eventId}`
// dès qu'il existe côté backend. Pour l'instant on lit le mock.
```

L'endpoint **`GET /spaces/:id/event-timeline/:eventId`** existe côté backend (`spaces.controller.ts`).  
`useAnalyseTimeline.js` l'appelle déjà correctement via `getSpaceEventTimeline`.  
C'est uniquement le chemin `store/modules/analyse.js → loadTimelineForEvent` qui reste sur mock.

**Action requise** : remplacer dans `store/modules/analyse.js` (`loadTimelineForEvent`) :
```js
// AVANT
const data = getTimelineByEventMock(eventId) || []

// APRÈS
const spaceId = state.space?.id
const data = await getSpaceEventTimeline(spaceId, eventId) || []
```

---

## 11. Variables d'environnement critiques

| Variable | Fichier | Valeur dev | Impact |
|---|---|---|---|
| `VUE_APP_API_URL` | `datafriday-web/.env.development` | `http://localhost:3000/api/v1` | Base URL de tous les appels API |
| `VUE_APP_SUPABASE_URL` | `.env.development` | URL Supabase projet | Auth JWT |
| `VUE_APP_SUPABASE_ANON_KEY` | `.env.development` | Clé anon Supabase | Auth JWT |
| `DATABASE_URL` | `api-datafriday-staging/.env` | Connexion Postgres | Prisma |
| `SUPABASE_JWT_SECRET` | `api-datafriday-staging/.env` | Secret JWT Supabase | Validation tokens |

Pour surcharger sans modifier le fichier committé :
```bash
# datafriday-web/.env.development.local  (git-ignored)
VUE_APP_API_URL=http://localhost:3000/api/v1
```
