# Référence complète — Module Statistiques (AnalyseView)

> Fichiers couverts :
> - `datafriday-web/src/components/analyse/AnalyseView.vue`
> - `datafriday-web/src/store/modules/analyse.js`
> - `datafriday-web/src/composables/useFilters.js`
> - `datafriday-web/src/composables/useMetricsCalculator.js`
> - `datafriday-web/src/composables/useShopPerformance.js`
> - `datafriday-web/src/composables/useTimelineMode.js`

---

## 1. Données brutes (Store state)

Ces données sont chargées une fois au montage via `store.dispatch('analyse/loadSpace', spaceId)` → `fetchSpaceData(spaceId)`.

| Variable | Type | Description |
|---|---|---|
| `spaceId` | `string` | ID du space courant (depuis la route) |
| `space` | `Object` | Objet complet du space (name, floors…) |
| `configurations` | `Object[]` | Configurations du space (chacune a ses `eventIds`) |
| `shopGranularData` | `ShopGranularRecord[]` | **Source de vérité principale** — un record par (event × shop × menuItem) |
| `menuItemCostMap` | `Record<menuItemId, number>` | Coût par article (pour calcul marge) |
| `menuItems` | `MenuItemData[]` | Articles (avec composants, readyForSale) |
| `suppliers` | `SupplierItem[]` | Fournisseurs |
| `ingredients` | `IngredientItem[]` | Ingrédients |
| `components` | `ComponentDefinition[]` | Composants de recettes |
| `events` | `Event[]` | Tous les events du space (normalisés, voir §1.1) |
| `summary` | `Object \| null` | Résumé fourni par l'API (`totalRevenue`, `totalCost`, `variations`) |
| `fromMock` | `boolean` | `true` si données de démo Adidas Arena |

### 1.1 Structure d'un `Event` (normalisée au commit `SET_EVENTS`)

```js
{
  id: string,
  name: string,
  date: string,           // ISO YYYY-MM-DD
  eventDate: string,      // alias de date (certains endpoints)
  category: string,
  eventType: string,
  team: string,
  sponsor: string,
  subcategory: string,
  session: string,
  performer: string,
  visitingTeam: string,
  openingAct: string,
  doorsOpening: string,   // HH:MM — normalisé depuis sessions[0].doorsOpening
  showTime: string,       // HH:MM — normalisé depuis sessions[0].showTime
  hasIntermission: boolean,
  ticketsSold: number,
  ticketsScanned: number,
  attendees: number,      // alias de ticketsScanned sur certains endpoints
  sessions: Array<{ doorsOpening, showTime }>,
}
```

### 1.2 Structure d'un `ShopGranularRecord`

```js
{
  eventId: string,
  shopName: string,
  shopType: string,
  shopArea: string,
  menuItemId: string,
  menuItemName: string,
  menuItemType: string,
  menuItemCategory: string,
  revenue: number,
  transactionCount: number,
  quantity: number,
  hour: number,           // 0–23 (present dans le mock, utilisé par le filtre plage horaire)
  isPredictive: boolean,  // true = record généré par le moteur predict, pas réel
}
```

---

## 2. État UI (Store state)

| Variable | Type | Valeurs possibles | Description |
|---|---|---|---|
| `loading` | `boolean` | — | Chargement initial en cours |
| `error` | `string \| null` | — | Message d'erreur si fetch KO |
| `chartViewMode` | `string` | `default` / `timeline` | Mode d'affichage du graphe principal |
| `chartGroupBy` | `string` | `by-date` / `shops` / `menu-types` / `average` | Axe de regroupement du graphe |
| `cumulativeRevenue` | `boolean` | — | Affichage CA cumulé |
| `selectedToolbox` | `string` | `analyse` / `predict` / `event-predict` / `inventory` | Outil actif (bandeau header) |
| `activeMobilePanel` | `string` | `left` / `middle` / `right` | Panel mobile actif |
| `pendingAssistantQuery` | `string \| null` | — | Requête injectée dans l'assistant (depuis alerts header) |
| `pendingPredictEventId` | `string \| null` | — | Event pré-sélectionné à l'ouverture de l'overlay EventPredict |
| `timelineStartTime` | `string \| null` | `HH:MM` | Borne gauche de la fenêtre timeline active |
| `timelineEndTime` | `string \| null` | `HH:MM` | Borne droite de la fenêtre timeline active |

---

## 3. Filtres (Store `state.filters`)

Réinitialisés via `resetFilters()` → `DEFAULT_FILTERS()`.  
Mis à jour via `updateFilter({ key, value })` — **debounce 150 ms** sauf `setFilterImmediate`.

### 3.1 Filtres de sélection directe

| Clé | Type | Description |
|---|---|---|
| `selectedConfigurationId` | `string \| null` | Configuration active (null = toutes) |
| `selectedEventIds` | `string[]` | IDs des events cochés |
| `selectedShopIds` | `string[]` | Noms des shops (shopName) cochés |
| `selectedShopTypes` | `string[]` | Types de shop cochés |
| `selectedShopAreas` | `string[]` | Zones (area) de shop cochées |
| `selectedMenuItemIds` | `string[]` | Noms d'articles cochés |
| `selectedMenuItemTypes` | `string[]` | Types d'articles cochés |
| `selectedMenuItemCategories` | `string[]` | Catégories d'articles cochées |

### 3.2 Filtres événement

| Clé | Type | Description |
|---|---|---|
| `selectedEventCategories` | `string[]` | Catégories d'event |
| `selectedEventTypes` | `string[]` | Types d'event |
| `selectedTeams` | `string[]` | Équipes (sports) |
| `selectedSponsors` | `string[]` | Sponsors (tradeshow) |
| `selectedSubcategories` | `string[]` | Sous-catégories |
| `selectedSessions` | `string[]` | Sessions |
| `selectedPerformerNames` | `string[]` | Artistes/performers (entertainment) |
| `selectedVisitingTeams` | `string[]` | Équipes visiteuses (sports) |
| `selectedOpeningActs` | `string[]` | Premières parties |

### 3.3 Filtres temporels

| Clé | Type | Valeurs / Description |
|---|---|---|
| `timeRange` | `string` | `all` / `today` / `yesterday` / `thisweek` / `lastweek` / `week` / `month` / `quarter` / `thismonth` / `lastmonth` / `nextmonth` / `thisquarter` / `lastquarter` / `nextquarter` / `thisyear` / `lastyear` / `nextyear` / `custom` |
| `startDate` | `string \| null` | ISO — utilisé seulement si `timeRange === 'custom'` |
| `endDate` | `string \| null` | ISO — utilisé seulement si `timeRange === 'custom'` |
| `selectedDoorsOpenings` | `string[]` | Heures d'ouverture des portes (`HH:MM`) |
| `selectedShowTimes` | `string[]` | Heures de show (`HH:MM`) |
| `selectedIntermissions` | `string[]` | `['yes']` / `['no']` / `['yes','no']` / `[]` |

### 3.4 Filtres horaires intra-event (plage timeline)

| Clé | Type | Description |
|---|---|---|
| `selectedTimeRange` | `{ start: string\|null, end: string\|null }` | Plage horaire sélectionnée via le composant EventTimelineChart (ex. `{start:'19:00', end:'21:30'}`). Filtre les `ShopGranularRecord` par leur champ `hour`. |

### 3.5 Filtres d'affluence (sliders)

| Clé | Type | Valeurs par défaut | Description |
|---|---|---|---|
| `ticketsSoldRange` | `[number, number]` | `[0, soldMax]` — auto-calibré sur la data | Plage billets vendus |
| `ticketsScannedRange` | `[number, number]` | `[0, scannedMax]` — auto-calibré | Plage billets scannés |

### 3.6 Mode de comparaison

| Clé | Type | Valeurs | Description |
|---|---|---|---|
| `comparisonMode` | `string` | `previous_period` / `year_over_year` | Détermine quelle variation est affichée sur les KPI cards |
| `searchQuery` | `string` | — | Recherche textuelle sur le nom des events |

---

## 4. Getters (données dérivées)

### 4.1 Filtrage

| Getter | Retourne | Description |
|---|---|---|
| `activeConfiguration` | `Object \| null` | Configuration sélectionnée |
| `eventsInActiveConfiguration` | `Event[]` | Events du space restreints à la config active |
| `dateBounds` | `{ start: Date\|null, end: Date\|null }` | Plage de dates résolue depuis `timeRange` |
| `filteredEvents` | `Event[]` | **Events après application de tous les filtres** (date, catégorie, type, équipe, etc.) — exclut les events futurs en mode `analyse` |
| `filteredShopGranularData` | `ShopGranularRecord[]` | **Records après filtres** (eventIds, shop, menuItem, plage horaire) |
| `activeFilterChips` | `Chip[]` | Badges affichés dans FilterSummary (un par filtre actif) |

### 4.2 Options dynamiques (alimentent les selects du FilterPanel)

| Getter | Source field |
|---|---|
| `uniqueShopNames` | `shopGranularData[].shopName` |
| `uniqueShopTypes` | `shopGranularData[].shopType` |
| `uniqueShopAreas` | `shopGranularData[].shopArea` |
| `uniqueMenuItemNames` | `shopGranularData[].menuItemName` |
| `uniqueMenuItemTypes` | `shopGranularData[].menuItemType` |
| `uniqueMenuItemCategories` | `shopGranularData[].menuItemCategory` |
| `uniqueEventCategories` | `events[].category` |
| `uniqueEventTypes` | `events[].eventType` |
| `uniqueTeams` | `events[].team` |
| `uniqueSponsors` | `events[].sponsor` |
| `uniqueSubcategories` | `events[].subcategory` |
| `uniqueSessions` | `events[].session` |
| `uniqueDoorsOpenings` | `events[].doorsOpening` |
| `uniqueShowTimes` | `events[].showTime` |
| `uniquePerformers` | `events[].performer` |
| `uniqueVisitingTeams` | `events[].visitingTeam` |
| `uniqueOpeningActs` | `events[].openingAct` |

### 4.3 Flags de catégorie (rendu conditionnel des filtres avancés)

| Getter | Condition |
|---|---|
| `hasEntertainmentCategory` | event.category contient `entertainment/concert/spectacle/show` |
| `hasSportsCategory` | event.category contient `sport/home team/match` |
| `hasTradeshowCategory` | event.category contient `tradeshow/salon/conference/mice` |

### 4.4 Comparaisons temporelles

| Getter | Description |
|---|---|
| `previousPeriodBounds` | `{ start, end }` — même durée que la période courante, juste avant |
| `yearOverYearBounds` | `{ start, end }` — même période, année N-1 |
| `eventsMatchingFiltersExceptDate` | Events passant tous les filtres sauf la date (base de calcul des comparaisons) |
| `currentPeriodTotals` | KPIs bruts de la période courante |
| `previousPeriodTotals` | KPIs bruts de la période précédente |
| `yearOverYearTotals` | KPIs bruts N-1 |
| `variationsPrev` | Variations (%) vs période précédente |
| `variationsYoY` | Variations (%) vs N-1 |
| `summaryWithComparisons` | Summary final injecté dans les KPI cards — fusionne API + variations recalculées localement |

### 4.5 Divers

| Getter | Description |
|---|---|
| `attendanceBounds` | `{ soldMax, scannedMax }` — max réel pour calibrer les sliders |
| `futureEventsCount` | Nb d'events dont la date est > aujourd'hui |
| `hasPredictiveRecords` | `true` si des records `isPredictive=true` sont en mémoire |

---

## 5. Métriques calculées (`useMetricsCalculator`)

Toutes sont des `computed()` Vue réactifs. Entrées : `filteredShopGranularData`, `filteredEvents`, `menuItemCostMap`.

### 5.1 Totaux bruts

| Variable | Calcul |
|---|---|
| `totalRevenue` | `SUM(record.revenue)` |
| `totalCost` | `SUM(costMap[record.menuItemId] * record.quantity)` |
| `totalTransactions` | `SUM(record.transactionCount)` |
| `totalTicketsScanned` | `SUM(event.ticketsScanned \|\| event.attendees)` |

### 5.2 Métriques dérivées

| Variable | Calcul |
|---|---|
| `eventsWithRevenueCount` | Nb d'events distincts ayant au moins un record avec `revenue > 0` |
| `validEventsCount` | `eventsWithRevenueCount \|\| filteredEvents.length \|\| 1` |
| `avgRevenuePerEvent` | `totalRevenue / eventsWithRevenueCount` |
| `avgPerTransaction` | `totalRevenue / totalTransactions` |
| `perCapita` | `totalRevenue / totalTicketsScanned` |
| `margin` | `(totalRevenue - totalCost) / totalRevenue * 100` (%) |

### 5.3 Valeurs d'affichage (display*)

Identiques aux totaux bruts en mode standard. Préfixées `display` pour permettre une surcharge future (ex. mode timeline).

| Variable | Source |
|---|---|
| `displayRevenue` | `totalRevenue` |
| `displayCost` | `totalCost` |
| `displayTransactions` | `totalTransactions` |
| `displayAvgRevenuePerEvent` | `avgRevenuePerEvent` |
| `displayAttendees` | `totalTicketsScanned` |
| `displayPerCapita` | `perCapita` |
| `displayAvgCost` | `totalCost / validEventsCount` |
| `displayAvgRevenue` | `totalRevenue / eventsWithRevenueCount` |
| `displayMargin` | `margin` |
| `displayTransactionRate` | `overrideTransactionRate` si fourni et `> 0`, sinon `totalTransactions / operatingMinutes` |

### 5.4 Flags contextuels

| Variable | Description |
|---|---|
| `isSingleEventMode` | `true` quand exactement 1 event est sélectionné dans les filtres — désactive les variations sur les KPI cards |
| `isTimelineFilterActive` | `true` si `chartViewMode === 'timeline'` |

---

## 6. Shop Performance enrichie (`useShopPerformance`)

Calculée à la demande (appel `enrich(events, synthesizer)`) en chargeant la timeline minute par minute.

### 6.1 Données par shop

Chaque entrée dans `shops.value[]` :

```js
{
  elementId: string,        // = shopName
  elementName: string,
  shopName: string,
  totalRevenue: number,
  totalTransactions: number,
  totalQuantity: number,
  eventCount: number,
  // Métriques timeline (remplies par enrich)
  transactionRate: number,            // txn/min (total transactions / minutes opérationnelles)
  operatingMinutes: number,           // somme des fenêtres (lastMinute - firstMinute + 1) par event
  first60MinTransactionRate: number,  // txn/min sur la 1ère heure après doorsOpening
  first60MinTransactions: number,     // nb total de txn dans la 1ère heure
  peakTransactionRate: number,        // txn/min max sur une fenêtre glissante de 15 min
  peakWindow: {                       // null si pas de données
    eventId: string,
    startMinute: number,
    endMinute: number,
    transactions: number
  } | null,
}
```

### 6.2 État du composable

| Variable | Type | Description |
|---|---|---|
| `shops` | `Ref<ShopPerf[]>` | Liste des shops enrichis |
| `loading` | `Ref<boolean>` | Enrichissement en cours |
| `enriched` | `Ref<boolean>` | `true` après un premier enrichissement réussi |
| `totalTransactionRate` | `Computed<number>` | Somme des `transactionRate` de tous les shops — utilisée comme `overrideTransactionRate` dans `useMetricsCalculator` quand le panneau est ouvert |

### 6.3 Structure d'un record timeline

Retourné par `GET /spaces/:id/event-timeline/:eventId` (NestJS) — source `WeezeventTransaction` en temps réel.

```js
{
  // Identification temporelle
  minute: string,           // "HH:MM"

  // Identification du shop
  shopId: string,
  shopName: string,
  shopType: string | null,
  shopArea: string | null,

  // Identification de l'article
  weezeventProductId: string | null,
  menuItemId: string | null,
  menuItemName: string | null,
  menuItemType: string | null,
  menuItemCategory: string | null,

  // Métriques agrégées sur la minute
  quantity: number,
  transactionCount: number,
  revenueHt: number,
}
```

> **Note :** `eventId` n'est pas dans le payload retourné (il est le paramètre de la route). Les appelants l'injectent manuellement si besoin (`useShopPerformance` boucle sur chaque event et ajoute `eventId` avant de pousser dans le cache).

> **Différence avec `shopGranularData` :** `shopGranularData` contient des agrégats `event × shop × menuItem` (sans dimension temporelle). La timeline ajoute la dimension `minute` pour les graphiques de flux temporel.

---

## 7. Mode timeline (`useTimelineMode`)

| Variable | Type | Description |
|---|---|---|
| `isTimelineActive` | `Computed<boolean>` | `store.state.analyse.chartViewMode === 'timeline'` |
| `timelineStartTime` | `Computed<string\|null>` | Borne gauche active |
| `timelineEndTime` | `Computed<string\|null>` | Borne droite active |

Méthodes exposées :

| Méthode | Action |
|---|---|
| `enterTimeline({ start, end })` | `SET_CHART_VIEW_MODE('timeline')` + `SET_TIMELINE({ start, end })` |
| `exitTimeline()` | `SET_CHART_VIEW_MODE('default')` + remet les bornes à null |

---

## 8. État local de AnalyseView.vue (refs)

| Variable | Type | Description |
|---|---|---|
| `drawer` | `Ref<boolean>` | Panel FilterPanel ouvert/fermé (défaut: desktop=ouvert, mobile=fermé) |
| `summaryDrawer` | `Ref<boolean>` | Panel SummaryPanel ouvert/fermé |
| `byEventDialog` | `Ref<boolean>` | Dialog GenericByEventChart ouvert |
| `byEventMetric` | `Ref<string>` | Métrique affichée dans le dialog (`revenue`, `cost`, `avgTransaction`, `perCap`, `attendees`) |
| `showTransactionRateShops` | `Ref<boolean>` | Panel ShopPerformanceByTransactionRate visible |
| `selectedEventForTimeline` | `Ref<{eventId, eventName, eventDate}\|null>` | Event courant dans la timeline |
| `eventTimelineData` | `Ref<TimelineRecord[]>` | Données brutes chargées depuis l'API (ou synthétisées) |
| `timelineEventsList` | `Ref<{eventName, eventDate}[]>` | Liste des events affichés (vide si single) |
| `timelineLoading` | `Ref<boolean>` | Chargement timeline en cours |
| `timelinePendingCount` | `Ref<number>` | Nb d'events en attente de chargement |
| `doorsOpeningDialog` | `Ref<boolean>` | Dialog de sélection heure portes (mode moyenne multi-events) |
| `copying` | `Ref<boolean>` | Export PNG en cours |
| `sharing` | `Ref<boolean>` | Partage en cours |
| `snackbar` | `Ref<boolean>` | Snackbar de feedback visible |
| `snackbarText` | `Ref<string>` | Message de la snackbar |
| `snackbarColor` | `Ref<string>` | Couleur de la snackbar (`success` / `error` / `info`) |

---

## 9. Computed locaux de AnalyseView.vue

| Variable | Source | Description |
|---|---|---|
| `loading` | `store.state.analyse.loading` | — |
| `error` | `store.state.analyse.error` | — |
| `space` | `store.state.analyse.space` | — |
| `events` | `store.state.analyse.events` | Tous les events bruts |
| `menuItemCostMap` | `store.state.analyse.menuItemCostMap` | — |
| `summary` | `store.getters['analyse/summaryWithComparisons']` | Summary enrichi avec variations recalculées |
| `fromMock` | `store.state.analyse.fromMock` | — |
| `spaceName` | `space.value?.name \|\| 'Space'` | — |
| `filteredRecords` | `filteredShopGranularData` | Alias de useFilters |
| `shopNames` | `Set(shopGranularData[].shopName)` | — |
| `selectedToolbox` | `store.state.analyse.selectedToolbox` | — |
| `isPredictMode` | `selectedToolbox === 'predict'` | — |
| `showPredictOverlay` | `selectedToolbox === 'event-predict'` | — |
| `futureEventsCount` | Events dont date > today | Utilisé dans le bandeau Predict Mode |
| `timelineHeaderLabel` | `Moyenne sur N évènements` ou `eventName` | Titre du composant timeline |
| `availableDoorsOpenings` | `Set(filteredEvents[].sessions[0].doorsOpening)` | Options du dialog de sélection heure |
| `MAX_TIMELINE_EVENTS` | `50` (constante) | Limite d'events pour le chargement timeline simultané |

---

## 10. Composants statistiques et leurs props/events

### FinancialMetricsGrid
| Prop | Type | Description |
|---|---|---|
| `metrics` | `Object` (retour de useMetricsCalculator) | Toutes les métriques calculées |
| `summary` | `Object` (summaryWithComparisons) | Variations + comparisonMode |

Event émis : `open-chart(kind: string)` où kind ∈ `cost`, `revenue`, `avg-revenue`, `margin`, `transactions`, `avg-trans`, `attendees`, `percap`, `transaction-rate`, `transformation`

**4 KPI cards affichées :**
1. Coût moy./évén. (`displayAvgCost`) + total (`displayCost`)
2. CA moy./évén. (`displayAvgRevenue`) + total (`displayRevenue`)
3. Marge (`displayMargin`%) + bénéfice (`displayRevenue - displayCost`)
4. Transaction Rate (`displayTransactionRate`/min) + moyenne par évén.

### EventRevenueByShopChart
| Prop | Description |
|---|---|
| `records` | `filteredRecords` |
| `events` | `filteredEvents` |
| `is-predict-mode` | `isPredictMode` |

Events : `show-average`, `event-click(eventId)`, `period-drilldown({ mode, key })`

### EventTimelineChart
| Prop | Description |
|---|---|
| `event-id` | `selectedEventForTimeline.eventId` |
| `event-name` | `timelineHeaderLabel` |
| `event-date` | `selectedEventForTimeline.eventDate` |
| `timeline-data` | `eventTimelineData` (records minute×shop×article) |
| `selected-shops` | `filters.selectedShopIds` |
| `selected-shop-types` | `filters.selectedShopTypes` |
| `selected-shop-areas` | `filters.selectedShopAreas` |

Events : `close`, `time-range-change({ start, end })`

### ShopPerformanceByTransactionRate
| Prop | Description |
|---|---|
| `shops` | `shopPerformance.shops.value` |
| `loading` | `shopPerformance.loading.value` |
| `selected-shop-ids` | `filters.selectedShopIds` |

Events : `close`, `shop-click(shopName)`

### ShopDistributionPieChart
Events : `shop-click(shopName)`, `shop-type-click(type)`, `shop-area-click(area)`

### MenuItemRevenueDistribution
Events : `item-click(menuItemName)`, `type-click(type)`, `category-click(category)`

---

## 11. Actions store

| Action | Déclencheur | Description |
|---|---|---|
| `loadSpace(spaceId)` | montage + changement de route | Charge toutes les données du space |
| `updateFilter({ key, value })` | useFilters.setFilter / setFilterImmediate | Met à jour un filtre |
| `resetFilters()` | bouton reset | Remet tous les filtres à DEFAULT_FILTERS + recalibre sliders |
| `regeneratePredictions()` | watch toolbox → predict | Génère les records prédictifs pour les events futurs |
| `clearPredictions()` | watch toolbox ← predict | Supprime les records `isPredictive=true` du store |

---

## 12. Mutations store

| Mutation | Payload |
|---|---|
| `SET_SPACE_ID` | `string` |
| `SET_SPACE` | `Object` |
| `SET_CONFIGURATIONS` | `Object[]` |
| `SET_MENU_ITEMS` | `Object[]` |
| `SET_SUPPLIERS` | `Object[]` |
| `SET_INGREDIENTS` | `Object[]` |
| `SET_COMPONENTS` | `Object[]` |
| `SET_SHOP_GRANULAR` | `ShopGranularRecord[]` |
| `SET_EVENTS` | `Event[]` (normalise `doorsOpening` et `showTime` au niveau racine) |
| `SET_MENU_ITEM_COST_MAP` | `Record<string, number>` |
| `SET_SUMMARY` | `Object \| null` |
| `SET_FROM_MOCK` | `boolean` |
| `SET_LOADING` | `boolean` |
| `SET_ERROR` | `string \| null` |
| `SET_CHART_VIEW_MODE` | `'default' \| 'timeline'` |
| `SET_CHART_GROUP_BY` | `'by-date' \| 'shops' \| 'menu-types' \| 'average'` |
| `SET_CUMULATIVE_REVENUE` | `boolean` |
| `SET_TOOLBOX` | `string` |
| `SET_MOBILE_PANEL` | `string` |
| `SET_PENDING_ASSISTANT_QUERY` | `string \| null` |
| `SET_PENDING_PREDICT_EVENT_ID` | `string \| null` |
| `SET_TIMELINE` | `{ start: string\|null, end: string\|null }` |
| `UPDATE_FILTER` | `{ key: string, value: any }` |
| `RESET_FILTERS` | — |

---

## 13. Flux de données complet (résumé)

```
Route /analyse/:spaceId
  └── onMounted → store.dispatch('loadSpace')
        └── fetchSpaceData(spaceId)
              ├── SET_EVENTS
              ├── SET_SHOP_GRANULAR
              ├── SET_MENU_ITEM_COST_MAP
              └── SET_SUMMARY

Filtres (FilterPanel)
  └── setFilterImmediate(key, value) → UPDATE_FILTER
        └── getters.filteredEvents         ← réactif
        └── getters.filteredShopGranularData ← réactif

useMetricsCalculator(filteredRecords, filteredEvents, costMap)
  └── computed KPIs (revenue, cost, margin, perCapita, txnRate…)
        └── FinancialMetricsGrid → KPI Cards

useShopPerformance.enrich(filteredEvents)
  └── GET /spaces/:id/event-timeline/:eventId (×N events — NestJS)
        └── computeRatesFromTimeline → shops[] avec transactionRate/peakRate
              └── ShopPerformanceByTransactionRate panel

selectedEventIds watch → loadTimelineForEvents(events)
  └── GET /spaces/:id/event-timeline/:eventId (NestJS)
        └── eventTimelineData.value
              └── EventTimelineChart (graphe minute/minute)

comparisonMode (previous_period | year_over_year)
  └── getters.summaryWithComparisons
        ├── variationsPrev (buildVariations(current, previous))
        └── variationsYoY  (buildVariations(current, yoy))
              └── KPI Cards (flèche ↑↓ + %)

---

## 14. Origine des données depuis le wizard Weezevent

> **Les options des filtres de statistiques sont directement produites par les mappings saisis dans le wizard.**

### 14.1 Pipeline complet

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WIZARD LocationIntegrationWizard.vue                                   │
│  (appelle les Supabase Edge Functions via utils/api.js)                 │
└─────────────────────────────────────────────────────────────────────────┘

Step 1 — map-space
  └── api.saveLocationSpaceMapping(location, spaceId, spaceName)
        POST /location-space-mappings  → Edge Function
              └── DB: WeezeventLocationSpaceMapping
                       { weezeventLocationId → spaceId }

Step 2 — map-shops
  └── api.saveShopElementMappings(spaceId, mappings)
        POST /shop-element-mappings  → Edge Function
              └── DB: WeezeventMerchantElementMapping
                       { weezeventMerchantId → spaceElementId }
          api.rebuildShopMappings(spaceId)
        POST /rebuild-shop-mappings  → Edge Function (recompile le cache)

Step 3 — menu-mapping
  └── api.saveMenuItemMapping(fnbItem, menuItemId, menuItemName, spaceId)
        POST /menu-item-mappings  → Edge Function
              └── DB: WeezeventProductMapping
                       { weezeventProductId → menuItemId }
          api.rebuildMenuMappings(spaceId)
        POST /rebuild-menu-mappings  → Edge Function

Step 4 — process-timeline
  └── supabase POST /process-single-event-timeline  (Edge Function)
        Reads : WeezeventTransaction + WeezeventTransactionItem
                + WeezeventMerchantElementMapping
        Writes: SpaceRevenueDailyAgg
                 (tenantId, spaceId, day, weezeventEventId, spaceElementId,
                  revenueHt, transactionsCount, itemsCount)
        ⚠️  Agrégat journalier uniquement — pas de granularité minute/menuItem

Step 5 — synchronize-data
  └── supabase POST /process-event-shop-performance (×event)
        Reads : SpaceRevenueDailyAgg
        Writes: ShopPerfEvent ou tables dérivées (cache step 5)
  └── supabase POST /finalize-shop-performance
        Agrège les performances finales

┌─────────────────────────────────────────────────────────────────────────┐
│  NestJS API (api-datafriday-staging)                                    │
└─────────────────────────────────────────────────────────────────────────┘

GET /spaces/:id/shop-details  →  SpacesService.getShopDetails()
  ├── Prisma : SpaceElement.findMany()  (shops définis dans les configs)
  ├── Prisma : SpaceRevenueDailyAgg.groupBy(spaceElementId)  (totaux par shop)
  ├── Prisma : WeezeventMerchantElementMapping.findMany()
  └── Prisma $queryRaw (jointure 7 tables) :
        WeezeventTransaction
          INNER JOIN WeezeventTransactionItem
          INNER JOIN WeezeventMerchantElementMapping  ← mapping Step 2
          INNER JOIN SpaceElement
          LEFT  JOIN WeezeventEvent
          LEFT  JOIN WeezeventProduct
          LEFT  JOIN WeezeventProductMapping           ← mapping Step 3
          LEFT  JOIN MenuItem
          LEFT  JOIN ProductType
          LEFT  JOIN ProductCategory
        WHERE status = 'completed' AND eventId IS NOT NULL
        GROUP BY event × shop × product

  Returns → {
    shops[],            // liste des shops de la config (avec totaux)
    shopGranularData[], // un record par (event × shop × menuItem)
    events[],           // events dédupliqués (avec ticketsScanned)
    menuItemCostMap     // { menuItemId → totalCost }
  }

GET /spaces/:id/event-timeline/:eventId  →  SpacesService.getEventTimeline()
  └── Prisma $queryRaw (jointure 7 tables) :
        WeezeventTransaction
          INNER JOIN WeezeventTransactionItem
          INNER JOIN WeezeventMerchantElementMapping  ← mapping Step 2
          INNER JOIN SpaceElement
          LEFT  JOIN WeezeventProduct
          LEFT  JOIN WeezeventProductMapping           ← mapping Step 3
          LEFT  JOIN MenuItem + ProductType + ProductCategory
        WHERE tenantId = ? AND weezeventEventId = ? AND status = 'completed'
        GROUP BY DATE_TRUNC('minute', transactionDate) × shop × product
        ORDER BY minute ASC

  Returns → TimelineRecord[] (minute × shopId × menuItemId)
  ⚠️  Source directe : WeezeventTransaction (PAS SpaceRevenueDailyAgg)
      → Indépendant du Step 4. Disponible dès que les transactions
        sont synchronisées et les mappings Steps 2+3 complétés.

┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend — useSpaceData.js  →  store analyse                          │
└─────────────────────────────────────────────────────────────────────────┘

fetchSpaceData(spaceId)
  └── getSpaceShopDetails(spaceId)
        └── réponse → store SET_SHOP_GRANULAR(shopGranularData)
                           SET_EVENTS(events)
                           SET_MENU_ITEM_COST_MAP(menuItemCostMap)

Getters (analyse.js) extraient les options des filtres depuis shopGranularData :
  shopGranularData[].shopName      → options.uniqueShopNames
  shopGranularData[].shopType      → options.uniqueShopTypes
  shopGranularData[].shopArea      → options.uniqueShopAreas
  shopGranularData[].menuItemName  → options.uniqueMenuItemNames
  shopGranularData[].menuItemType  → options.uniqueMenuItemTypes
  shopGranularData[].menuItemCategory → options.uniqueMenuItemCategories
  shopGranularData[].eventId       → options.uniqueEventIds
```

### 14.2 Ce que chaque étape du wizard alimente comme filtres

| Étape wizard | Table DB modifiée | Filtre stats impacté |
|---|---|---|
| Step 1 — map-space | `WeezeventLocationSpaceMapping` | Rattache la location au space (prérequis général) |
| Step 2 — map-shops | `WeezeventMerchantElementMapping` | `selectedShopIds`, `selectedShopNames`, `selectedShopTypes`, `selectedShopAreas` |
| Step 3 — menu-mapping | `WeezeventProductMapping` | `selectedMenuItemIds`, `selectedMenuItemTypes`, `selectedMenuItemCategories` |
| Step 4 — process-timeline | `SpaceRevenueDailyAgg` | Agrégat journalier pour totaux (shop-details). **Pas utilisé** par la timeline minute via `event-timeline/:eventId` qui lit `WeezeventTransaction` directement. |
| Step 5 — synchronize-data | cache ShopPerfEvent | (optionnel — transaction rate historique) |
| Sync transactions (auto) | `WeezeventTransaction`, `WeezeventTransactionItem` | Données brutes — source réelle des chiffres et de la timeline |

### 14.3 Comportement si les mappings sont absents ou incomplets

- **Aucun mapping shop (Step 2 absent)** : `WeezeventMerchantElementMapping` vide → la jointure SQL retourne 0 lignes → `shopGranularData = []` → fallback mock "Weezevent not yet synchronized"
- **Mapping shop présent, mapping menu absent (Step 3 absent)** : les lignes existent mais `menuItemName = null`, `menuItemType = null`, `menuItemCategory = null` → les filtres menu sont vides mais les filtres shop fonctionnent
- **Produit non mappé** : `menuItemId = weezeventProductId` (fallback), `menuItemName = null` — visible dans les stats comme article "sans nom"
- **Transactions non synchronisées** : si `WeezeventTransaction` est vide, tout `shopGranularData` est vide même si les mappings sont corrects

### 14.4 Différence d'API : Wizard vs Statistiques

| | Wizard (steps 1–5) | Statistiques (AnalyseView) |
|---|---|---|
| **Client JS** | `utils/api.js` | `api/endpoints/space.api.js` |
| **Serveur cible** | Supabase Edge Functions (`make-server-eb31619c`) | NestJS (`api-datafriday-staging`) |
| **Auth** | `publicAnonKey` (Supabase JWT) | Axios avec cookie/JWT NestJS |
| **Writes DB** | Oui (mappings, aggrégats) | Non (lecture seule) |
| **Reads DB** | Via Edge Functions | Via Prisma ORM direct |
```
