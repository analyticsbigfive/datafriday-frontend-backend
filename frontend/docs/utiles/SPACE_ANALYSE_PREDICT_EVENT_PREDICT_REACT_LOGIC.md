# Space, Analyse, Predict et Event Predict - logique React a reproduire en Vue

Ce document decrit la logique observee dans l'app React `versionReact/Datafriday-main`, pour pouvoir la reproduire dans l'app Vue. Il se concentre sur la section dediee au `Space`, le mode `Analyse`, le mode `Predict`, et l'ecran `Event Predict`.

## Sources React analysees

- `versionReact/Datafriday-main/src/app/components/SpacesPage.tsx`
- `versionReact/Datafriday-main/src/app/hooks/useSpaceState.tsx`
- `versionReact/Datafriday-main/src/app/hooks/useSpaceManager.ts`
- `versionReact/Datafriday-main/src/app/components/AnalyseView.tsx`
- `versionReact/Datafriday-main/src/app/hooks/analyse/useMetricsCalculator.ts`
- `versionReact/Datafriday-main/src/app/utils/predictiveAnalytics.ts`
- `versionReact/Datafriday-main/src/app/utils/predictiveAnalyticsTimeline.ts`
- `versionReact/Datafriday-main/src/app/hooks/usePredictiveTimeline.ts`
- `versionReact/Datafriday-main/src/app/components/EventPredictView.tsx`
- `versionReact/Datafriday-main/src/app/components/EventPredictMenusSection.tsx`
- `versionReact/Datafriday-main/src/app/utils/api.ts`
- `versionReact/Datafriday-main/src/app/utils/eventApi.ts`

## 1. Modele mental general

La React app est organisee autour d'un `Space`.

Un `Space` contient des `Configurations`. Une configuration contient le plan operationnel: `floors`, `forecourt`, `externalMerch`, et les elements physiques comme les shops F&B. Les events sont rattaches a un `spaceId` et a une `configurationId`. Les ventes F&B sont stockees sous forme granularisee par event, shop et menu item.

Le flux principal est:

1. `SpacesPage` liste les spaces et affiche des metriques all-time.
2. L'ouverture d'un space charge le space, ses configurations, ses areas, puis ouvre `AnalyseView`.
3. `AnalyseView` charge les events du space, les ventes granularisees, les menu items, les mappings shop/menu, puis calcule les KPIs et charts.
4. Le mode `Predict` reutilise `AnalyseView`, mais ajoute des records predictifs pour les events futurs.
5. `EventPredictView` est un ecran dedie a un event futur: il permet de choisir les past events de reference, ajuster les quantites, sauvegarder des versions, et calculer les metriques ajustees.

## 2. Contrats de donnees a reprendre cote Vue

### Space

```ts
type Space = {
  id: string
  name: string
  image?: string
  homeTeam?: string
  createdAt: string
  updatedAt: string
  addressLine1?: string
  city?: string
  country?: string
  spaceType?: string
  maxCapacity?: number
  cachedMetrics?: {
    fbRevenue: number
    merchRevenue: number
    ticketingRevenue: number
    totalRevenue: number
    maxCapacity: number
    configurationCount: number
    transactionCount?: number
    eventsCount?: number
    lastUpdated: string
  }
}
```

### Configuration

```ts
type Configuration = {
  id: string
  spaceId?: string
  name: string
  capacity?: number
  createdAt: string
  updatedAt: string
  data: {
    floors?: Floor[]
    forecourt?: { elements?: FloorElement[] }
    externalMerch?: { elements?: FloorElement[] }
  }
}
```

### Event

```ts
type Event = {
  id: string
  spaceId: string
  configurationId: string
  eventDate: string // DD/MM/YYYY ou YYYY-MM-DD selon source
  eventName: string
  eventTypeId: string
  eventCategoryId: string
  eventSubcategoryId?: string
  performerName?: string
  homeTeamName?: string
  visitingTeamId?: string
  sponsorId?: string
  numberOfSessions: number
  sessions: Array<{
    doorsOpening?: string
    showTime?: string
    intermission?: string
  }>
  ticketsSold?: number
  ticketsScanned?: number
  event_revenue_HT?: number
}
```

### ShopGranularRecord

Source centrale pour Analyse et Predict.

```ts
type ShopGranularRecord = {
  eventId: string
  eventName?: string
  eventDate?: string
  elementId: string
  elementName?: string
  shopName?: string
  menuItemId: string
  menuItemName?: string
  menuItemType?: string
  menuItemCategory?: string
  quantity: number
  revenue: number
  transactionCount?: number
  location?: string
  isPredictive?: boolean
  confidenceScore?: number
  isLowConfidence?: boolean
  basedOnEventIds?: string[]
}
```

### TimelineRecord

Utilise pour les charts minute par minute.

```ts
type TimelineRecord = {
  minute: string // HH:mm
  time?: string
  shopId: string // en pratique: elementId dans beaucoup de flux
  shopName?: string
  menuItemId?: string
  mappedMenuItemId?: string
  itemName?: string
  mappedMenuItemName?: string
  totalRevenue: number
  totalQuantity: number
  transactionCount: number
  eventId?: string
}
```

### Space menu config

Config par space et par configuration. Elle indique quels items sont ouverts dans chaque shop.

```ts
type SpaceMenuConfig = Record<
  string, // elementId
  Record<string, boolean> // menuItemId -> selected
>
```

Dans `EventPredictView`, cette structure est convertie en:

```ts
Map<string, Set<string>> // elementId -> selected menuItemIds
```

### Event Predict version

```ts
type EventPredictVersion = {
  id: string
  name: string
  timestamp: string
  eventSnapshot: Event
  totalRevenue: number
  adjustedTotalRevenue?: number
  perCapita: number
  adjustedPerCapita?: number
  menuConfig: Record<string, string[]> // elementId -> selected menuItemIds
  quantityAdjustments: Record<string, number> // "elementId-menuItemId" -> percent
  selectedPredictionEventIds: string[]
}
```

## 3. Endpoints et cles de persistance

Les appels React passent par `api.ts`, `eventApi.ts`, ou directement par la Edge Function Supabase.

### Space et configuration

- `GET /spaces`
- `GET /spaces/:id`
- `POST /spaces`
- `PATCH /spaces/:id`
- `DELETE /spaces/:id`
- `GET /spaces/:spaceId/configurations`
- `GET /space-menus/:spaceId/:configId`
- `POST /space-menus` avec `{ spaceId, configId, menuItems }`

### Events

- `GET /events`
- `POST /events`
- `PUT /events/:eventId`
- `DELETE /events/:eventId`
- `GET /event-types`
- `GET /event-categories`
- `GET /event-subcategories`
- `GET /teams`

### Donnees Analyse/Predict

- KV `shop-granular-records:${spaceId}`: source rapide des ventes granularisees all-time.
- `GET /shop-performance-by-space/:spaceId/all-details`: fallback API pour les memes records.
- `GET /shop-element-mappings/:spaceId`: map shops importes vers elements de plan.
- `GET /menu-item-mappings/:spaceId`: map items importes vers menu items.
- `GET /event-timeline/:eventId`: timeline minute par minute pour un event.

### Predict / Event Predict

- `GET /predictive-event-selection/:futureEventId`: selection sauvegardee des past events utilises.
- `POST /predictive-event-selection/:futureEventId` avec `{ eventIds }`.
- KV `event-predict-versions:${eventId}`: liste de versions d'un event.
- KV `event-predict-default-version:${eventId}`: `{ defaultVersionId }`.
- KV `event-menu-config:${eventId}`: dernier menu config sauvegarde pour l'event.

## 4. Section Spaces

`SpacesPage` charge:

1. Tous les spaces via `api.getAllSpaces()`.
2. Les configurations de chaque space en parallele.
3. Les spaces pin via `api.getPinnedSpaces()`.
4. Les metriques F&B all-time quand l'onglet courant est `Spaces`, `F&B` ou `Overview`.

Pour les metriques all-time par space:

1. Lire `shop-granular-records:${space.id}`.
2. Si la cle n'existe pas ou n'est pas un tableau, retourner 0.
3. Sommer `record.revenue`.
4. Sommer `record.transactionCount`.
5. Construire `uniqueEventIds`.
6. Charger tous les events, filtrer ceux du space, puis ceux presents dans `uniqueEventIds`.
7. Calculer:

```ts
avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
avgEvent = eventCount > 0 ? totalRevenue / eventCount : 0
perCapita = totalAttendance > 0 ? totalRevenue / totalAttendance : 0
```

`totalAttendance` utilise `ticketsScanned`, avec fallback `ticketsSold`.

Quand un utilisateur ouvre un space:

1. `useSpaceManager.loadSpace(spaceId)` charge le space.
2. Charge les configurations.
3. Charge ou cree les default areas.
4. Definit `currentSpace`, `configurations`, `areas`.
5. Charge la premiere configuration si elle existe.
6. Sinon cree un plan vide avec un floor par defaut.
7. Ouvre `AnalyseView`.

## 5. AnalyseView - chargement des donnees

`AnalyseView` recoit le `space` courant.

Au changement de space:

1. Charger les events via `eventApi.getAllEvents()`, puis filtrer `event.spaceId === space.id`.
2. Charger les configurations du space.
3. Charger les event taxonomies: types, categories, subcategories, sponsors.
4. Charger les menu items, types et categories.
5. Charger les mappings:
   - `api.getShopElementMappings(space.id)`
   - `api.getMenuItemMappings(space.id)`
6. Charger les ventes granularisees:
   - d'abord KV `shop-granular-records:${space.id}`
   - fallback `api.getAllShopDetailsBySpace(space.id)`
   - fallback legacy par location si necessaire.
7. Filtrer les records predictifs stale quand on recharge de la donnee authentique:

```ts
actualRecordsOnly = granularRecords.filter(r => !r.isPredictive)
```

## 6. AnalyseView - filtres events

La logique est construite en plusieurs etages.

### 6.1 `eventPassesFilters(event)`

En mode `analyse`, les events futurs sont exclus:

```ts
if (selectedToolbox === 'analyse' && eventDate > today) return false
```

Puis l'event est filtre sur:

- event type, compare par nom (`getEventTypeName(event.eventTypeId)`)
- category, compare par nom
- subcategory, compare par nom
- home team
- visiting team
- sponsor
- performer
- opening act
- intermission
- number of sessions
- doors opening
- show time
- tickets sold range
- date range preset
- selection explicite d'events

Les presets de date ont une difference importante:

- En `analyse`, `thismonth`, `thisquarter`, `thisyear` s'arretent a `today`.
- En `predict`, ils vont jusqu'a la fin du mois, trimestre ou annee.
- Les presets `nextmonth`, `nextquarter`, `nextyear` ne concernent que le futur.

### 6.2 `finalFilteredEvents`

Applique la selection manuelle d'events:

```ts
finalFilteredEvents =
  selectedEvents.includes('all') || selectedEvents.length === 0
    ? eventsFilteredByDateRange
    : eventsFilteredByDateRange.filter(event => selectedEvents.includes(event.id))
```

### 6.3 `chartFilteredEvents`

Applique les filtres avances sur `finalFilteredEvents`, puis les ranges `ticketsSold` et `ticketsScanned`.

Cette liste est la base des charts, KPIs et performances.

### 6.4 Règles de cohérence des filtres

Pour que les filtres fonctionnent vraiment en Vue, il faut éviter de maintenir plusieurs listes divergentes. Le flux recommandé est strictement unidirectionnel:

```ts
eventsForSpace
  -> eventsFilteredByDateRange
  -> eventsFilteredByAdvancedFilters
  -> finalFilteredEvents
  -> chartFilteredEvents
  -> filteredShopGranularData
  -> metrics/charts/tables
```

Règles importantes:

- `eventsForSpace` ne contient que `event.spaceId === currentSpace.id`.
- `eventsFilteredByDateRange` applique seulement la date et le mode (`analyse` ou `predict`).
- `eventsFilteredByAdvancedFilters` applique les filtres métier event: type, catégorie, sous-catégorie, équipe, sponsor, artiste, sessions, horaires, tickets.
- `finalFilteredEvents` applique la sélection explicite d'events.
- `chartFilteredEvents` applique les filtres numériques finaux: tickets vendus et tickets scannés.
- `filteredShopGranularData` applique les filtres qui concernent les records F&B: shops, types de shop, zones, menu items, type/catégorie de menu item.

Ne pas appliquer un filtre shop/menu directement à `chartFilteredEvents`: un event doit rester visible même si aucun record F&B ne passe les filtres shop/menu. C'est ensuite `filteredShopGranularData` qui peut être vide, et les KPIs doivent alors tomber à 0.

Quand un filtre parent change, réinitialiser ou recalculer les enfants dépendants:

- Changement de `space`: vider selected events, selected shops, selected menu items, timeline data, predictions.
- Changement de date range: recalculer min/max tickets, clear predictions, fermer timeline si l'event sélectionné sort de la plage.
- Changement de selected events: recalculer `chartFilteredEvents`, puis `filteredShopGranularData`.
- Changement de shop type ou shop area: ne pas modifier `chartFilteredEvents`, seulement `filteredShopGranularData`.
- Changement de menu item type: recalculer les catégories disponibles avant de garder une catégorie devenue invalide.

Pour les multi-selects, utiliser cette convention:

```ts
[] = aucun filtre actif
['all'] = tous les éléments explicitement sélectionnés, équivalent à aucun filtre actif pour le calcul
['id-1', 'id-2'] = filtre actif
```

Dans l'UI, afficher `Tous` quand la valeur logique est `[]` ou `['all']`, mais stocker une seule convention en interne si possible. Le plus sûr côté Vue est `[] = tous`.

## 7. AnalyseView - filtres records et KPIs

### 7.1 `filteredShopGranularData`

Filtre `shopGranularData` sur:

- events dans `chartFilteredEvents`
- shops selectionnes (`elementId`)
- shop types (`elementIdToTypesMap`)
- shop areas (`elementIdToAreaMap`)
- menu items
- menu item type
- menu item category

Matching event:

1. Preferer `record.eventId`.
2. Fallback legacy: `record.eventName === event.eventName && record.eventDate === event.eventDate`.

### 7.2 Formules KPIs

Le hook React `useMetricsCalculator` calcule:

```ts
totalRevenue = sum(filteredShopGranularData.revenue)

totalCost = sum(
  filteredShopGranularData.quantity * menuItemCostMap.get(record.menuItemId)
)

totalTransactions = sum(filteredShopGranularData.transactionCount)

avgPerTransaction =
  totalTransactions > 0 ? totalRevenue / totalTransactions : 0

totalTicketsScanned = sum(chartFilteredEvents.ticketsScanned)

perCapita =
  totalTicketsScanned > 0 ? totalRevenue / totalTicketsScanned : 0
```

`avgRevenuePerEvent` ne divise pas par tous les filtered events, mais par les events qui ont effectivement du revenue dans `shopGranularData`.

En mode timeline avec un time range actif:

```ts
displayRevenue = timelineFilteredRevenue
displayCost = timelineFilteredCost
displayTransactions = timelineFilteredTransactions
displayPerCapita = timelineFilteredRevenue / totalTicketsScanned
```

Les attendees restent toujours ceux de l'event complet, pas de la tranche timeline.

### 7.3 Event performance

`calculateEventPerformance(records, filteredEvents)`:

1. Groupe les records par `eventId`.
2. Somme revenue, transactions, quantity, cost.
3. Marque un event comme non predictif si au moins un record `!isPredictive`.
4. Retourne une ligne pour chaque event filtre, meme sans transaction.
5. Calcule:

```ts
perCap = ticketsScanned > 0 ? eventRevenue / ticketsScanned : 0
```

6. Trie par revenue descendant.

## 8. Mode Predict dans AnalyseView

Le mode `Predict` est active par:

```ts
selectedToolbox === 'predict'
```

Il garde la meme vue que l'analyse, mais change:

- les presets de dates
- l'inclusion des events futurs
- les KPIs et charts, qui voient des records `isPredictive`
- les cards events, qui peuvent afficher un etat predictif
- la timeline, qui peut etre predictive pour un event futur

### 8.1 Conditions de generation predictive

React genere les predictions seulement si:

```ts
events.length > 0
shopGranularData.length > 0
selectedToolbox === 'predict'
!shopGranularData.some(record => record.isPredictive)
eventTypes.length > 0
eventCategories.length > 0
eventSubcategories.length > 0
```

Quand on change de date range, custom range, ou que l'on quitte le mode predict, React supprime les records predictifs:

```ts
shopGranularData = shopGranularData.filter(record => !record.isPredictive)
```

### 8.2 Enrichissement des events avant scoring

Avant d'appeler le moteur predictif:

- `eventTypeId` devient `eventType` via lookup.
- `eventCategoryId` devient `category`.
- `eventSubcategoryId` devient `subcategory`.
- `homeTeamName` devient `team`.
- `sessions[0].showTime` est conserve.
- Pour un event futur sans show time, `showTime = '19:00'`.

### 8.3 Moteur `predictiveAnalytics.ts`

Fonction principale:

```ts
generatePredictionsForAllFutureEvents(allEvents, shopGranularData)
```

Elle separe:

- `futureEvents`: events apres today.
- events de today sans data reelle: traites comme predictibles.
- `pastEvents`: events passes ou today avec data reelle.

Les records existants `isPredictive` sont ignores pour construire l'historique.

### 8.4 Scoring similarite

Fonction:

```ts
findAndScorePastEvents(targetEvent, allEvents, shopGranularData)
```

Elle ne considere que les past events ayant de la data reelle:

```ts
eventsWithDataIds = new Set(shopGranularData.filter(d => !d.isPredictive).map(d => d.eventId))
```

Poids:

```ts
eventType: 100
category: 100
subcategory: 800
visitingTeam: 800
sponsor: 400
performer: 800
attendance: 200
dayOfWeek: 500
showTime: 400
```

Hard filters:

- Si `eventType` existe des deux cotes et differe: rejet.
- Si `category` existe des deux cotes et differe: rejet.
- Si show time differe de plus de 180 minutes: rejet.
- Si attendance past < 50% du target ou > 200% du target: rejet.

Scoring:

- Subcategory identique: +800.
- Performer identique si target a un performer: +800.
- Visiting team identique si target a une visiting team: +800.
- Sponsor identique si target a un sponsor: +400.
- Jour:
  - vendredi/samedi = weekend.
  - meme jour: +500.
  - meme groupe weekend ou weekday mais jour different: +250.
  - weekend vs weekday: +0.
- Show time:
  - exact: +400.
  - <= 60 min: +300.
  - <= 120 min: +100.
  - <= 180 min: +0 mais garde.
- Attendance:

```ts
diffPercent = abs(targetTickets - pastTickets) / targetTickets
attendanceScore = round((1 - diffPercent) * 200)
scalingFactor = targetTickets / pastTickets
```

`targetTickets` utilise `target.ticketsSold`. `pastTickets` utilise `past.ticketsSold || past.ticketsScanned`.

Les events scores sont tries par score descendant.

### 8.5 Generation de records predictifs granularises

Pour un future event:

1. Selectionner les top 10 scored events.
2. Si aucun event ne matche, choisir 3 random past events avec data. Ces predictions sont marquees `isLowConfidence: true`.
3. Calculer les poids:

```ts
weight = scoredEvent.score / totalScore
```

4. Prendre les records des events retenus.
5. Construire la liste unique des items par cle:

```ts
`${shopName}-${elementName}-${menuItemId}`
```

6. Pour chaque item et chaque event retenu:

```ts
scaledQty = itemData.quantity * scoredEvent.scalingFactor
scaledRev = itemData.revenue * scoredEvent.scalingFactor
predictedQty += scaledQty * weight
predictedRev += scaledRev * weight
```

Si un item n'est pas vendu dans un past event, sa contribution est 0.

7. Creer un record futur:

```ts
{
  ...baseRecord,
  eventId: targetEvent.id,
  eventName: targetEvent.eventName,
  eventDate: targetEvent.eventDate,
  quantity: round(predictedQty),
  revenue: round(predictedRev),
  transactionCount: 0,
  isPredictive: true,
  confidenceScore,
  isLowConfidence,
  basedOnEventIds
}
```

8. Merger dans `shopGranularData`:

```ts
shopGranularData = [...actualRecords, ...predictiveRecords]
```

### 8.6 Règles de rendu en mode Predict (`EventRevenueByShopChart`)

Source verifiée : `versionReact/Datafriday-main/src/app/components/EventRevenueByShopChart.tsx`
(props `isPredictMode`, helpers `isEventInPast`, `hexToRgba`, `getBarColor`, lignes ~960-995, tooltip ~1100-1115, badge legend ~1357-1360).

Le composant reçoit `isPredictMode: boolean` (vrai uniquement quand `selectedToolbox === 'predict'`).

**Couleur des barres (`getBarColor(itemName, eventData)`)** — appliquée par segment de barre via `shape={(props) => <rect fill={getBarColor(...)} />}` :

1. Si `eventData.isPredictive && eventData.isLowConfidence` → couleur fixe `#ef4444` (rouge), quel que soit `isPredictMode`. Les prédictions « low confidence » (basées sur 3 events random faute de matchs) sont toujours signalées en rouge.
2. Sinon, si `isPredictMode && eventData.eventDate dans le passé && !eventData.isPredictive` → couleur de base à `rgba(r,g,b,0.5)` (50% d'opacité). C'est le SEUL cas d'opacité réduite : il atténue les events passés non prédits pour mettre en avant les prédictions futures.
3. Sinon → couleur de base pleine. Cela couvre :
   - mode Analyse (jamais d'opacité),
   - events passés en mode Analyse,
   - events futurs prédits normaux (`isPredictive && !isLowConfidence`) en mode Predict : ils gardent leur couleur shop pleine.

**Important** : React n'atténue jamais les events prédits normaux. Le badge `PREDICTED` suffit pour les distinguer visuellement, l'opacité reste à 100%.

**Helper `isEventInPast(eventDate)`** : parse `eventDate` en tant que `DD/MM/YYYY` ou `YYYY-MM-DD`, ramène l'heure à 00:00, retourne `date < today`.

**Helper `hexToRgba(hex, alpha)`** : conversion `#RRGGBB` → `rgba(r,g,b,alpha)`.

**Tooltip header** (au-dessus du nom d'event) :

- `eventData.isPredictive && eventData.isLowConfidence` → badge rouge `LOW CONFIDENCE`, suivi d'un sous-titre italique rouge : `Based on 3 random events (insufficient matching data)`.
- `eventData.isPredictive && !eventData.isLowConfidence` → badge violet `PREDICTED {confidenceScore}%` (le pourcentage n'est affiché que si `confidenceScore > 0`).
- Aucun badge sinon.

**Header du graphe** : pastille violette `Includes Predictions` à gauche du titre quand `chartData.some(e => e.isPredictive)`.

**Propagation des champs au niveau event-row** (depuis `shopGranularData`) :

```ts
{
  isPredictive: record.isPredictive || false,
  confidenceScore: record.confidenceScore || 0,
  isLowConfidence: record.isLowConfidence || false, // OR-aggregé sur tous les records de l'event
}
```

`isLowConfidence` est l'OR logique sur tous les records de l'event : si un seul record est low confidence, tout l'event passe en rouge.

**Mapping recommandé en Vue** (Chart.js) — comme Chart.js v4 ne supporte pas un shape custom par segment, il faut passer `backgroundColor` sous forme d'array (un par bar) au lieu d'une string :

```js
datasets.push({
  label: item,
  data: chartData.map((d) => d[item] || 0),
  backgroundColor: chartData.map((d) => getBarColor(item, d)),
  borderColor: chartData.map((d) => getBarColor(item, d)),
  // …
})
```

Et la propriété `isLowConfidence` doit être ajoutée à la liste des clés filtrées dans `allItems` / `itemsToDisplay`, sinon elle sera prise pour un nom de shop.

## 9. Timeline predictive

Il y a deux implementations proches:

- Une ancienne logique directement dans `AnalyseView.handleEventBarClick`.
- Une logique extraite dans `usePredictiveTimeline`, reutilisee par `EventPredictView`.

Pour Vue, reproduire `usePredictiveTimeline` comme source de verite.

### 9.1 Entrees du composable Vue

```ts
usePredictiveTimeline({
  events,
  getEventTypeName,
  getCategoryName,
  getSubcategoryName,
  shopGranularData
})
```

### 9.2 Etats produits

- `timelineLoading`
- `predictedTimelineData`
- `candidateEvents`
- `excludedSameSubcategoryEvents`
- `excludedSameCategoryEvents`
- `selectedPredictionEventIds`
- `predictiveShowTime`
- `predictiveIsDefaultShowTime`
- `predictiveFutureEventId`
- `timelineEventsList`
- `isLowConfidencePrediction`
- `lowConfidenceBasedOnEventIds`

### 9.3 Chargement d'une timeline predictive

Fonction:

```ts
loadPredictiveTimeline(event, overridePredictionIds?)
```

Etapes:

1. Determiner `targetShowTime = event.sessions[0].showTime || '19:00'`.
2. Enrichir le future event avec les noms type/category/subcategory.
3. Enrichir tous les events.
4. Choisir la data de scoring:
   - si `shopGranularData` est authentique, la cacher dans `originalGranularDataRef`;
   - si la data courante est predictive, reutiliser le cache authentique.
5. Appeler `findAndScorePastEvents`.
6. `candidateEvents = top 50`.
7. Construire `excludedSameSubcategoryEvents`:
   - past events de meme subcategory;
   - non presents dans les top candidates;
   - score manuel 30% si pas deja score.
8. Construire `excludedSameCategoryEvents`:
   - meme category;
   - subcategory differente;
   - non presents dans les top candidates;
   - score manuel 30% si pas deja score.
9. Charger la selection sauvegardee `predictive-event-selection/:futureEventId`, sauf si `overridePredictionIds` est fourni.
10. Si selection sauvegardee: utiliser ces IDs.
11. Sinon: utiliser top 10.
12. Si aucun match:
    - si low confidence deja connu, reprendre `basedOnEventIds`;
    - sinon choisir 3 random past events avec data.

### 9.4 Poids 70/30

`usePredictiveTimeline` distingue:

- Group A: events avec `score > 0`.
- Group B: selections manuelles ou low-confidence avec `score === 0`.

Si A et B existent:

```ts
groupAWeight = (score / totalScoreGroupA) * 0.7
groupBWeight = 0.3 / groupB.length
```

Si A seul:

```ts
weight = score / totalScoreGroupA
```

Si B seul:

```ts
weight = 1 / groupB.length
```

### 9.5 Alignement temporel et scaling attendees

Pour chaque past event retenu:

```ts
offset = targetShowTimeMinutes - pastShowTimeMinutes
attendeeRatio = predictedAttendees / pastEventAttendees
combinedFactor = weight * attendeeRatio
```

Chaque record timeline est transforme:

```ts
minute = formatTime(parseTime(record.minute) + offset)
totalRevenue = record.totalRevenue * combinedFactor
totalQuantity = record.totalQuantity * combinedFactor
transactionCount = record.transactionCount * combinedFactor
eventId = pastEventId
```

Puis tous les records sont agreges par:

```ts
`${minute}_${shopId}_${menuItemId || itemName || 'unknown'}`
```

Sortie:

```ts
{
  minute,
  shopId,
  menuItemId,
  itemName,
  mappedMenuItemId,
  mappedMenuItemName,
  totalRevenue,
  totalQuantity: round(totalQuantity),
  transactionCount: round(transactionCount)
}
```

## 10. Event Predict

`EventPredictView` est un ecran dedie a un `currentSpace`.

### 10.1 Chargement initial

Charger:

1. Tous les events, puis filtrer `event.spaceId === currentSpace.id`.
2. Exclure les dates invalides.
3. Auto-selectionner le premier event futur par date.
4. Types, categories, subcategories, teams.
5. Ventes granularisees du space, sans `isPredictive`.
6. Tous les menu items.
7. Configurations du space.
8. Shop-element mappings et menu-item mappings.
9. Pour l'event selectionne, le `spaceMenuConfig` de sa `configurationId`.
10. Les versions et default version de l'event selectionne.

### 10.2 Selection event

Si un seul event est selectionne:

- Si date >= today: charger `predictiveTimeline.loadPredictiveTimeline(event)`.
- Si date < today: charger `event-timeline/:eventId` et afficher les donnees reelles.

Si plusieurs events sont selectionnes:

- React n'affiche pas de timeline detaillee.
- Il affiche une liste des events selectionnes et demande de revenir a un seul event.

### 10.3 Metriques Event Predict

Pour un event futur:

```ts
totalRevenue = sum(predictedTimelineData.totalRevenue || revenue)
totalTransactions = sum(predictedTimelineData.transactionCount)
avgPerTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
transformationRate = ticketsScanned > 0 ? totalTransactions / ticketsScanned * 100 : 0
perCapita = ticketsScanned > 0 ? totalRevenue / ticketsScanned : 0
```

Pour le revenue ajuste:

1. Indexer la timeline:

```ts
timelineIndex["shopKey|menuItemId"] += record.totalQuantity
```

2. Pour chaque element F&B de la configuration (`shop`, `hospitality`, `kitchen`), chercher ses items selectionnes dans `eventMenuConfig`.
3. Predicted quantity:

```ts
shopKeys = [element.name, element.registryId, element.id]
predictedQty = sum(timelineIndex[`${shopKey}|${menuItemId}`])
```

4. Price:

```ts
price = menuItem.basePrice || 0
if menuItem.spaceSpecificPrices contains currentSpace.id:
  price = matchingRule.price
```

5. Ajustement:

```ts
adjustment = quantityAdjustments.get(`${element.id}-${menuItemId}`) || 100
adjustedQty = round(predictedQty * adjustment / 100)
adjustedTotalRevenue += adjustedQty * price
```

6. Metriques ajustees:

```ts
quantityRatio = totalPredictedQty > 0 ? totalAdjustedQty / totalPredictedQty : 1
adjustedTransactions = round(totalTransactions * quantityRatio)
adjustedAvgPerTransaction =
  adjustedTransactions > 0 ? adjustedTotalRevenue / adjustedTransactions : 0
adjustedTransformationRate =
  ticketsScanned > 0 ? adjustedTransactions / ticketsScanned * 100 : 0
adjustedPerCapita =
  ticketsScanned > 0 ? adjustedTotalRevenue / ticketsScanned : 0
```

Pour un event passe:

- Filtrer `shopGranularData` par `eventId`, fallback `eventName + eventDate`.
- Calculer revenue, transactions, avg transaction, transformation rate, per capita.
- `adjusted* = raw*`.

### 10.4 Gestion des versions

Actions:

- Save version
- Load version
- Update version
- Rename version
- Duplicate version
- Delete version
- Set / clear default version
- Reset

Persistance:

```ts
PUT kv/event-predict-versions:${eventId}
body = EventPredictVersion[]

PUT kv/event-predict-default-version:${eventId}
body = { defaultVersionId }

PUT kv/event-menu-config:${eventId}
body = {
  menuItems: Record<string, string[]>,
  quantityAdjustments: Record<string, number>
}
```

Sauvegarde:

1. Convertir `eventMenuConfig: Map<string, Set<string>>` en object `{ [elementId]: string[] }`.
2. Convertir `quantityAdjustments: Map<string, number>` en object.
3. Stocker le snapshot de l'event courant.
4. Stocker les metriques courantes.
5. Stocker `predictiveTimeline.selectedPredictionEventIds`.

Load:

1. Remplacer l'event courant par `version.eventSnapshot`.
2. Reconstruire `eventMenuConfig` en `Map<string, Set<string>>`.
3. Reconstruire `quantityAdjustments`.
4. Mettre `pendingPredictionEventIds` avec `version.selectedPredictionEventIds`.
5. Definir cette version comme `currentEditingVersionId`.
6. Stocker des copies originales pour detecter les changements.

Detection de changements:

- Comparer taille et contenu de `eventMenuConfig`.
- Comparer taille et valeurs de `quantityAdjustments`.
- Comparer les IDs de past events selectionnes, apres tri.

Default version:

- Au changement d'event, charger les versions et la default version.
- Si une default version existe, ne pas charger le `spaceMenuConfig`.
- Auto-loader la default version une seule fois par ouverture d'event.

Reset:

- Restaurer `originalEventState[eventId]`.
- Restaurer `originalMenuConfig[eventId]`, qui correspond au menu config du space.
- Vider `currentEditingVersionId`, les copies originales et `pendingPredictionEventIds`.

## 11. EventPredictMenusSection

Ce composant est controle par le parent.

Props cles:

- `configuration`
- `menuItems`
- `ingredients`
- `components`
- `marketPrices`
- `suppliers`
- `spaceId`
- `spaceMenuConfig`
- `eventId`
- `predictedTimelineData`
- `selectedMenuItems`
- `quantityAdjustments`
- `viewMode: 'shop' | 'item'`

### 11.1 Elements F&B

Extraire de:

- `configuration.data.floors[].elements`
- `configuration.data.forecourt.elements`
- `configuration.data.externalMerch.elements`

Garder les types:

```ts
el.type === 'shop' || el.type === 'hospitality' || el.type === 'kitchen'
```

### 11.2 Predicted quantity par shop/item

Construire un index:

```ts
timelineDataIndex["shopKey|menuItemId"] += record.totalQuantity
```

`shopKey` vient de `record.shop || record.shopId`.

Pour un element:

```ts
shopKeys = [element.name, element.registryId, element.id]
quantity = sum(timelineDataIndex[`${shopKey}|${menuItemId}`])
```

### 11.3 Adjustments

Le niveau atomique est:

```ts
quantityAdjustments["elementId-menuItemId"] = percent
```

Un ajustement shop applique le meme percent a tous les items selectionnes du shop.

Un ajustement item applique le meme percent a cet item dans tous les shops ou il est selectionne.

Quantite ajustee:

```ts
adjustedQty = round(predictedQty * percent / 100)
```

### 11.4 Revenue predicted vs adjusted

Revenue predicted shop:

```ts
predictedRevenue = sum(predictedTimelineData records matching shop)
```

Revenue adjusted shop:

```ts
adjustedRevenue = sum(
  adjustedQty(elementId, menuItemId) * displayPrice(menuItem, spaceId)
)
```

`displayPrice` utilise `basePrice`, puis override par `spaceSpecificPrices` si une regle contient le `spaceId`.

### 11.5 Disponibilite d'un menu item dans un space

Regles:

1. Si `menuItem.spaceIds` existe et non vide: disponible seulement si `spaceId` est inclus.
2. Si pas de components: indisponible.
3. Recupere tous les ingredients du menu item, en resolvant recursivement les components.
4. Recupere les suppliers des ingredients.
5. Si un supplier n'a aucun site, il sert tous les spaces.
6. Sinon, tous les suppliers requis doivent inclure `spaceId` dans `sites` ou legacy `spaces[].spaceId`.

### 11.6 Compatibilite shop type / menu item type

Pour chaque element, filtrer les menu items par `element.shopType`.

Regles:

- `gppremium` ou `temporary`: peut avoir tous les items.
- Food: shop doit avoir `food`.
- Beverage: shop doit avoir `beverages` ou `drinkee`.
- Beer category: shop doit avoir `beer`, `beverages` ou `drinkee`.
- Combo: shop doit avoir `food` et `beverages`.

Tri:

1. Items selectionnes d'abord.
2. Dans les selectionnes: category puis nom.
3. Dans les non-selectionnes: predicted quantity descendant, puis nom.

## 12. Localisation française

La version Vue doit afficher les dates, les menus et les libellés fonctionnels en français, tout en conservant les valeurs techniques attendues par les APIs.

### 12.1 Format de date

Stockage et APIs:

- Conserver `event.eventDate` dans le format reçu: souvent `DD/MM/YYYY`, parfois `YYYY-MM-DD`.
- Toujours parser en local midnight, jamais via `new Date('YYYY-MM-DD')` sans parsing manuel, pour éviter les décalages timezone.
- Les heures restent en `HH:mm`.

Affichage français:

```ts
const FR_LOCALE = 'fr-FR'

formatDateShort(date)      // "04/05/2026"
formatDateMedium(date)     // "4 mai 2026"
formatDateLong(date)       // "lundi 4 mai 2026"
formatMonthYear(date)      // "mai 2026"
formatWeekday(date)        // "lundi"
formatTime(time)           // "19:30"
```

Implémentation recommandée:

```ts
function parseEventDate(value) {
  if (!value) return null

  const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, year, month, day] = iso
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatFrDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const date = value instanceof Date ? value : parseEventDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('fr-FR', options).format(date)
}
```

Presets de date en français:

| Valeur technique | Libellé français | Mode |
|---|---|---|
| `today` | Aujourd'hui | Analyse |
| `yesterday` | Hier | Analyse |
| `thisweek` | Cette semaine | Analyse |
| `lastweek` | Semaine dernière | Analyse |
| `thismonth` | Ce mois-ci | Analyse + Predict |
| `lastmonth` | Mois dernier | Analyse |
| `nextmonth` | Mois prochain | Predict |
| `thisquarter` | Ce trimestre | Analyse + Predict |
| `lastquarter` | Trimestre dernier | Analyse |
| `nextquarter` | Trimestre prochain | Predict |
| `thisyear` | Cette année | Analyse + Predict |
| `year` | Année dernière | Analyse |
| `nextyear` | Année prochaine | Predict |
| `custom` | Période personnalisée | Analyse + Predict |
| `all` | Tout l'historique | Analyse |

### 12.2 Libellés de navigation et menus

Menu principal:

| Valeur React/technique | Libellé français recommandé |
|---|---|
| `Spaces` | Espaces |
| `Events` | Évènements |
| `Overview` | Vue d'ensemble |
| `F&B` | Restauration |
| `Hospitality` | Hospitalité |
| `Merch` | Boutiques |
| `Ticketing` | Billetterie |
| `Storage` | Stockage |
| `Analyse` | Analyse |
| `Predict` | Prévision |
| `Event Predict` | Prévision évènement |
| `Inventory` | Inventaire |
| `Stockup` | Réassort |
| `Live` | Live |
| `Menu` | Menus |
| `Space Inventory` | Inventaire espace |

Filtres events:

| Technique | Libellé français |
|---|---|
| Event Type | Type d'évènement |
| Category | Catégorie |
| Subcategory | Sous-catégorie |
| Home Team | Équipe à domicile |
| Visiting Team | Équipe visiteuse |
| Sponsor | Sponsor |
| Performer | Artiste |
| Opening Act | Première partie |
| Intermission | Entracte |
| Sessions | Sessions |
| Doors Opening | Ouverture des portes |
| Show Time | Heure du show |
| Tickets Sold | Billets vendus |
| Tickets Scanned | Billets scannés |
| Date Range | Période |

Filtres F&B:

| Technique | Libellé français |
|---|---|
| Shops | Points de vente |
| Shop Types | Types de point de vente |
| Shop Areas | Zones |
| Menu Items | Articles |
| Menu Item Type | Type d'article |
| Menu Item Category | Catégorie d'article |
| Food | Nourriture |
| Beverage | Boisson |
| Beer | Bière |
| Combo | Menu combo |

KPIs:

| Technique | Libellé français |
|---|---|
| Total Revenue | Chiffre d'affaires |
| Total Cost | Coût total |
| Margin | Marge |
| Margin % | Taux de marge |
| Per Capita | Dépense par participant |
| Avg / Transaction | Panier moyen |
| Avg / Event | CA moyen par évènement |
| Transformation Rate | Taux de transformation |
| Attendees | Participants |
| Transactions | Transactions |
| Quantity | Quantité |
| Adjusted | Ajusté |
| Predicted | Prévu |
| Actual | Réel |

Actions Event Predict:

| Technique | Libellé français |
|---|---|
| Back | Retour |
| Reset | Réinitialiser |
| Save Version | Enregistrer une version |
| Load | Charger |
| Update | Mettre à jour |
| Rename | Renommer |
| Duplicate | Dupliquer |
| Delete | Supprimer |
| Set as default | Définir par défaut |
| Clear default | Retirer le défaut |
| Save | Enregistrer |
| Cancel | Annuler |
| Confirm | Confirmer |

### 12.3 Règles d'affichage des nombres

Utiliser `fr-FR` pour les nombres et monnaies:

```ts
currencyEUR(12345.67) // "12 345,67 €"
integer(12345)        // "12 345"
percent(12.345)       // "12,35 %"
decimal(2.58)         // "2,58"
```

Les données internes restent numériques. Ne jamais parser une valeur depuis son texte affiché.

## 13. Layout fonctionnel précis

Cette section décrit le layout à reproduire en Vue. Les noms sont donnés en français, mais les états techniques doivent rester alignés avec React.

### 13.1 Layout `SpacesPage`

Structure desktop:

1. Header global en haut:
   - titre `Espaces`;
   - accès notifications/profil/settings;
   - bouton de création `+`.
2. Navigation latérale ou menu hamburger:
   - groupe `Accueil`: Espaces, Évènements, Vue d'ensemble;
   - groupe `Analyse`: Restauration, Hospitalité, Boutiques, Billetterie, Stockage.
3. Zone de contenu:
   - si `Espaces`: barre de recherche + bouton ajouter;
   - grille responsive de cards spaces;
   - si `F&B` ou `Vue d'ensemble`: mêmes cards + graphiques agrégés si disponibles.

Card space:

1. Zone image/placeholder en haut, ratio stable.
2. Overlay ou bandeau compact avec:
   - capacité max;
   - nombre de configurations.
3. Actions en haut de card:
   - épingler;
   - dupliquer;
   - supprimer.
4. Corps de card:
   - nom du space;
   - CA F&B all-time;
   - dépense par participant;
   - panier moyen;
   - CA moyen par évènement.
5. Clic sur la card:
   - affiche un loading local sur la card;
   - charge le space;
   - ouvre `AnalyseView`.

Responsive:

- Desktop: grille multi-colonnes.
- Tablette: 2 colonnes.
- Mobile: 1 colonne, navigation dans un sheet, recherche pleine largeur.

### 13.2 Layout `AnalyseView`

Structure réelle React:

1. Header `AppHeader`:
   - nom du space cliquable pour changer de space;
   - menu burger mobile;
   - au centre sur desktop: `metricsContent`.
2. Corps en 3 colonnes:
   - gauche: filtres et toolbox;
   - centre: métriques financières, graphes et tables;
   - droite: insights et listes de performance.
3. Mobile:
   - 3 panneaux glissables `left`, `middle`, `right`;
   - `metricsContent` devient une ligne horizontale scrollable sous le header.

Colonne gauche:

1. Configuration:
   - select `All Configurations` + configurations du space.
2. Toolbox:
   - `Analyse`;
   - `Predict`;
   - `Event Predict`;
   - `Inventory`;
   - `Space Inventory`;
   - `Stockup`;
   - `Live`;
   - `Menu`.
3. Events:
   - recherche event;
   - checkbox `All Events`;
   - checkboxes par event, tri chronologique.
4. Date range:
   - presets de période;
   - custom range avec deux calendriers.
5. Attendance:
   - slider `Tickets Sold`;
   - slider `Attendees`.
6. Advanced filters:
   - type, catégorie, sous-catégorie, teams, sponsors, intermissions, sessions.
7. Filtres F&B:
   - shops;
   - shop types;
   - shop areas;
   - menu item types;
   - menu item categories.

`metricsContent` dans le header:

1. `Revenue`: valeur simple, non cliquée.
2. `Avg/Event`: valeur simple, non cliquée.
3. `Cost`: bouton qui ouvre `CostByEventChart`.
4. `Transac.`: bouton qui ouvre `TransactionsByEventChart`.
5. `Avg/Trans`: bouton qui ouvre `AvgTransactionByEventChart`.
6. `Attendees`: bouton qui ouvre `AttendeesByEventChart`.
7. `Transfo`: bouton qui ouvre `TransformationRateByEventChart`.
8. `PerCap`: bouton qui ouvre `PerCapByEventChart`.

Un seul de ces graphes event-level est ouvert à la fois. Les valeurs utilisent les métriques filtrées. En timeline mode, si une plage horaire est active, les métriques sont recalculées sur la plage.

Colonne centrale, ordre React:

1. Section `financial-metrics`:
   - `Avg Cost`, rouge, masqué sur mobile;
   - `Avg Revenue`, vert, masqué sur mobile;
   - `Margin`, bleu;
   - `Transaction Rate`, violet, cliquable, charge les transaction rates à la demande.
2. Graphes event-level conditionnels:
   - `TransactionsByEventChart`;
   - `CostByEventChart`;
   - `AvgTransactionByEventChart`;
   - `AttendeesByEventChart`;
   - `TransformationRateByEventChart`;
   - `PerCapByEventChart`.
3. Panneau `Shop Performance by Transaction Rate`:
   - ouvert en cliquant `Transaction Rate`;
   - cards shops triées par revenue total;
   - export Excel;
   - affiche revenue, avg/event, transactions, txn/min, first hour, pre-show, post-show.
4. Section `event-chart`:
   - si `chartViewMode === 'overview'`: `EventRevenueByShopChart`;
   - sinon: `EventTimelineChart`.
5. Section `shop-distribution`:
   - `ShopDistributionPieChart`.
6. Section `menu-item-distribution`:
   - `MenuItemQuantityPieChart`.
7. Section `menu-items-table`:
   - `MenuItemsByShopTable`.

Colonne droite:

1. `Data Insights`:
   - input de question;
   - bouton `Analyze`;
   - zone réponse masquable.
2. `Shops Performance`:
   - toggle `Total` / `Avg`;
   - top 5 shops puis bouton `View All Shops`;
   - clic shop = sélection visuelle et filtre shop.
3. `Menu Items Performance`:
   - toggle `Total` / `Avg`;
   - top 5 items puis expansion;
   - clic item = sélection visuelle et filtre item.
4. `Events Performance`:
   - top 5 events puis expansion;
   - clic event = sélection event;
   - en Predict, les events passés peuvent être grisés avec badge `Past`.

Comportement des filtres dans le layout:

- Les filtres actifs doivent être visibles dans un résumé compact.
- Chaque filtre actif doit pouvoir être retiré individuellement.
- Le bouton `Réinitialiser les filtres` doit remettre:
  - période par défaut du mode courant;
  - selected events à `all` ou `[]`;
  - selected shops/menu items/types/categories à vide;
  - timeline et prediction details à vide.
- Les filtres shops/menu ne doivent pas retirer les events des graphiques event-level; ils doivent seulement changer les montants calculés.
- `chartFilteredEvents` reste la source de vérité des events visibles.
- `filteredShopGranularData` reste la source de vérité des montants F&B.
- Les graphes overview reçoivent les deux: events filtrés + records F&B filtrés.
- La timeline applique aussi les filtres shops/menu/type/category à l'intérieur de `EventTimelineChart`.

### 13.3 Layout mode `Predict` dans `AnalyseView`

Le mode `Prévision` ne doit pas ouvrir un écran séparé. Il reste dans `AnalyseView`.

Différences visuelles:

1. Toolbox sélectionnée: `Prévision`.
2. Date presets future-friendly:
   - Ce mois-ci;
   - Mois prochain;
   - Ce trimestre;
   - Trimestre prochain;
   - Cette année;
   - Année prochaine;
   - Période personnalisée.
3. Les events futurs ont des records `isPredictive`.
4. Les events passés restent disponibles pour les périodes mixtes, mais ils sont visuellement grisés dans certains graphes.
5. Les charts doivent différencier visuellement réel/prévu, sans changer les formules.

Graphes réels en Predict:

1. `EventRevenueByShopChart` reste le graphe overview principal.
   - C'est un `BarChart` empilé Recharts.
   - Il reçoit `isPredictMode={true}`.
   - Il affiche un badge `Predictions` si `chartData.some(event => event.isPredictive)`.
   - En mode predict, les events passés non prédictifs sont grisés.
   - Il garde les toggles `Shops` / `Menu Types`.
   - Il garde l'agrégation `Per Event`, `Monthly`, `Quarterly`, `Yearly`.
   - En `Per Event`, il garde le tri `By Date` / `By Revenue`.
   - En tri date, il affiche aussi une ligne `Cumulative Revenue` sur l'axe droit.
   - Le bouton `Average` ouvre la timeline moyenne.
2. `EventTimelineChart` remplace le graphe overview seulement quand:
   - l'utilisateur clique un event dans `EventRevenueByShopChart`;
   - ou l'utilisateur clique `Average`.
3. Les deux pie sections restent présentes sous le graphe:
   - `ShopDistributionPieChart`;
   - `MenuItemQuantityPieChart`.
4. La table `MenuItemsByShopTable` reste présente.
5. Les graphes event-level ouverts depuis les KPIs restent les mêmes:
   - transactions, coûts, panier moyen, attendees, transformation, PerCap.

Layout prediction details:

- Depuis un event futur, l'utilisateur peut ouvrir la timeline prédictive.
- Le panneau timeline affiche:
  - l'event cible;
  - les past events utilisés;
  - leurs scores;
  - leurs poids;
  - le show time aligné;
  - un indicateur low confidence si besoin.
- Le mode Predict n'utilise pas `EventPredictMenusSection`.
- Le mode Predict ne possède pas les sliders d'ajustement menu; ces sliders existent seulement dans `Event Predict`.

### 13.4 Layout `EventPredictView`

Écran plein, dédié à `Prévision évènement`.

Desktop:

1. Header sticky:
   - bouton `Retour`;
   - titre `Prévision évènement - {space.name}`;
   - pas de graphe overview par event dans ce header.
2. Colonne gauche fixe, largeur environ 320 à 380 px:
   - calendrier;
   - card event sélectionné;
   - versions sauvegardées.
3. Colonne centrale flexible:
   - éditeur de détails event;
   - timeline chart;
   - `EventPredictMenusSection`.
4. Colonne droite fixe, largeur environ 400 px:
   - KPIs de l'event;
   - raw vs ajusté.

Important: `EventPredictView` ne rend pas `EventRevenueByShopChart`, `ShopDistributionPieChart`, `MenuItemQuantityPieChart` ni `MenuItemsByShopTable`. Le seul graphe central y est `EventTimelineChart`.

Mobile:

- Header sticky.
- La colonne gauche devient un sheet `Évènements`.
- Les KPIs passent sous forme de cards empilées.
- La grille menus doit passer en accordéons par shop ou par article.

Colonne gauche détaillée:

1. Calendrier:
   - jours avec events marqués;
   - clic jour: sélection du premier event du jour;
   - tooltip ou liste courte au hover/clic.
2. Event card:
   - nom;
   - date longue française;
   - heure du show;
   - tickets scannés;
   - badge `Défaut` ou `Version active`;
   - boutons `Réinitialiser` et `Enregistrer sous`.
3. Versions:
   - liste par event sélectionné;
   - indicateur rond `Défaut`;
   - actions charger, renommer, dupliquer, supprimer;
   - bouton update visible si version modifiée.

Zone centrale détaillée:

1. `EventDetailsEditor`:
   - nom event;
   - date;
   - type/catégorie/sous-catégorie;
   - tickets sold/scanned;
   - show time;
   - configuration.
2. Timeline:
   - pour futur: `predictedTimelineData`;
   - pour passé: endpoint `event-timeline/:eventId`;
   - si aucune donnée: état vide expliquant la cause probable.
3. Sélection des past events:
   - elle est dans les dialogs de `EventTimelineChart`, pas dans une section séparée permanente;
   - bouton/listing des events utilisés si `averagedEventsList` ou `candidateEvents` existe;
   - checkbox pour inclure/exclure les candidates;
   - les low-confidence events peuvent être personnalisés via dialog.
4. `Configuration settings`:
   - tabs `Shop View` et `Item View`;
   - filtres article;
   - quantités prévues et ajustées;
   - revenue prévu et ajusté;
   - sliders d'ajustement.

Colonne droite KPIs:

React affiche une grille 2 x 2:

1. `Total Revenue`;
2. `PerCap`;
3. `Avg/Trans.`;
4. `Transformation`.

Chaque card affiche la valeur brute. Si une valeur ajustée existe, elle apparaît dans un bloc `Adjusted` sous la valeur brute.

### 13.5 Layout `EventPredictMenusSection`

Header de section:

1. Le titre et le toggle `Shop View` / `Item View` sont rendus par `EventPredictView`, pas par `EventPredictMenusSection`.
2. En `shop` view, `EventPredictMenusSection` commence par:
   - tabs `Open` / `Closed` avec compteurs;
   - search `Search shops or menu items...`.
3. En `item` view, il commence par:
   - tabs `All`, `Food`, `Beverage`, `Combo` avec compteurs;
   - search `Search menu items or shops...`.

Vue `Par point de vente`:

1. Regrouper les shops par combinaison de types F&B:
   - Food;
   - Beverages;
   - Beer;
   - GP Premium;
   - Temporary;
   - Drinkee;
   - No Shop Type.
2. Dans chaque groupe, afficher les shops en accordéons.
3. Header shop:
   - image ou placeholder;
   - nom shop;
   - badges de types avec compteurs, cliquables pour filtrer les items du shop;
   - `predicted revenue - Adjusted: adjusted revenue`;
   - slider `Shop Adjustment`.
4. Contenu shop:
   - scroll area hauteur 400 px;
   - checkbox `Select All Menu Items`;
   - liste des menu items compatibles;
   - checkbox inclusion;
   - `predicted quantity - Adjusted: adjusted quantity`;
   - prix affiché;
   - slider par item si la quantité prédite est > 0;
   - input numérique `Manual Qty` si la quantité prédite est 0;
   - badge indisponible si suppliers non compatibles.

Vue `Par article`:

1. Filtrer les menu items par tab `All` / `Food` / `Beverage` / `Combo`.
2. Header article:
   - nom;
   - type/catégorie;
   - quantité prévue totale;
   - quantité ajustée totale;
   - nombre de shops sélectionnés;
   - slider `Item Adjustment`.
3. Contenu article:
   - scroll area hauteur 400 px;
   - checkbox `Select All Shops`;
   - liste des shops compatibles;
   - checkbox shop;
   - quantité prévue/ajustée par shop;
   - slider par shop si la quantité prédite est > 0;
   - input numérique `Manual Qty` si la quantité prédite est 0;
   - disponibilité.

Sliders réels:

1. `Shop Adjustment`:
   - `min=0`;
   - `max=500`;
   - `step=5`;
   - valeur par défaut `100%`;
   - bouton reset vers `100%`;
   - applique le pourcentage à tous les items sélectionnés du shop.
2. `Item Adjustment`:
   - `min=0`;
   - `max=500`;
   - `step=5`;
   - valeur par défaut `100%`;
   - bouton reset vers `100%`;
   - applique le pourcentage à cet item dans tous les shops où il est sélectionné.
3. Slider atomique shop/item:
   - `min=0`;
   - `max=500`;
   - `step=10`;
   - valeur par défaut `100%`;
   - bouton reset vers `100%`;
   - désactivé si l'item est indisponible.
4. Input `Manual Qty`:
   - affiché quand `predictedQty === 0`;
   - React le stocke dans `quantityAdjustments`, qui est normalement un pourcentage;
   - attention: dans le code React actuel, `getAdjustedQuantity` reste `round(baseQty * percent / 100)`, donc une base à 0 donne encore 0. Pour Vue, si l'input manuel doit réellement fonctionner, stocker une quantité absolue séparée ou ajouter une branche explicite `baseQty === 0`.

États vides:

- Pas de configuration: `Aucune configuration sélectionnée`.
- Pas de shop F&B: `Aucun point de vente F&B dans cette configuration`.
- Pas de timeline predictive: quantités à 0, mais garder les menus sélectionnables.
- Pas d'article compatible: afficher un état vide dans le shop, ne pas masquer le shop.

### 13.6 Inventaire exact des graphes et sliders à porter

Graphes `Analyse` / `Predict`:

| Composant React | Type visuel | Où | Particularités |
| --- | --- | --- | --- |
| `EventRevenueByShopChart` | `BarChart` empilé + ligne cumulative | `AnalyseView`, `Predict` overview | Modes `Shops/Menu Types`, agrégations `Per Event/Monthly/Quarterly/Yearly`, tri date/revenue, bouton `Average`, badge predictions |
| `EventTimelineChart` | `AreaChart` empilé | timeline d'un event ou moyenne | Modes `Revenue/Quantity`, breakdown `Menu Item/Shop`, slider plage horaire, dialogs events utilisés |
| `ShopDistributionPieChart` | 3 donuts | sous graphe principal | `Shop Distribution`, `By Shop Type`, `By Shop Area`, toggle partagé `Quantity/Revenue` |
| `MenuItemQuantityPieChart` | 3 donuts + widgets type | sous shops distribution | `Top Menu Items`, `By Menu Item Type`, `By Menu Item Category`, clic type/category = filtre |
| `TransactionsByEventChart` | `BarChart` | ouvert depuis KPI `Transac.` | un seul graphe KPI ouvert à la fois |
| `CostByEventChart` | `BarChart` | ouvert depuis KPI `Cost` | un seul graphe KPI ouvert à la fois |
| `AvgTransactionByEventChart` | `BarChart` | ouvert depuis KPI `Avg/Trans` | un seul graphe KPI ouvert à la fois |
| `AttendeesByEventChart` | `BarChart` | ouvert depuis KPI `Attendees` | un seul graphe KPI ouvert à la fois |
| `TransformationRateByEventChart` | `BarChart` | ouvert depuis KPI `Transfo` | un seul graphe KPI ouvert à la fois |
| `PerCapByEventChart` | `BarChart` | ouvert depuis KPI `PerCap` | en Predict peut griser les past events ou afficher le mode future |

Graphes `Event Predict`:

| Composant React | Type visuel | Où | Particularités |
| --- | --- | --- | --- |
| `EventTimelineChart` | `AreaChart` empilé | centre de l'écran | seul graphe de l'écran Event Predict |
| Cards KPI | cards 2 x 2 | colonne droite | pas un graphe Recharts |
| `EventPredictMenusSection` | accordéons + sliders | centre sous timeline | pas un graphe, mais contrôle les quantités ajustées |

Sliders à porter:

1. `AnalyseView` / filtres attendance:
   - `Tickets Sold`: range slider `[minTicketsSold, maxTicketsSold]`, `step=1`;
   - `Attendees`: range slider `[minTicketsScanned, maxTicketsScanned]`, `step=1`;
   - ces deux filtres agissent sur `eventPassesFilters`, donc sur `finalFilteredEvents` puis `chartFilteredEvents`.
2. `EventTimelineChart`:
   - deux inputs `type="range"` superposés;
   - valeurs `timeRangeStart` et `timeRangeEnd` en pourcentage `0..100`;
   - minimum logique de 15 minutes entre start et end;
   - popovers de saisie heure/minute pour start et end;
   - sur mobile, le slider horizontal est masqué et les inputs time restent le moyen principal;
   - bouton `Reset` remet `0..100`;
   - quand `EventTimelineChart` est utilisé dans `AnalyseView`, `onTimeRangeChange` remonte la plage pour recalculer metrics/tables.
3. `EventPredictMenusSection`:
   - shop-level, item-level et shop/item sliders;
   - tous les sliders manipulent `quantityAdjustments`;
   - les valeurs doivent rester contrôlées par le parent.

Règle de parité importante:

- `Predict` = mêmes graphes que `AnalyseView`, avec records `isPredictive`.
- `Event Predict` = écran dédié, seulement `EventTimelineChart` + menus ajustables + cards KPI.
- Ne pas réutiliser le layout graphique de `Predict` pour `Event Predict`.

### 13.7 Explication simple et implémentation des modes `Prédire` / `Prévision évènement`

#### 13.7.1 Différence métier entre les deux modes

`Prédire` répond à la question:

> Sur la période choisie, combien les prochains events devraient-ils générer en F&B ?

Il travaille sur une liste d'events futurs et injecte des records prédictifs dans les graphes d'analyse.

`Prévision évènement` répond à la question:

> Pour cet event précis, quels shops et quels articles dois-je prévoir, et comment ajuster les quantités ?

Il travaille sur un seul event actif, montre les past events utilisés, affiche une timeline prédictive, puis permet d'ajuster les quantités shop/item avec des sliders et de sauvegarder des versions.

#### 13.7.2 Implémenter `Prédire`

État minimal:

```ts
selectedToolbox = 'predict'
dateRangePreset = 'thisyear' | 'nextmonth' | 'nextquarter' | ...
events = []
shopGranularData = []
predictiveRecords = []
chartFilteredEvents = []
filteredShopGranularData = []
```

Pipeline:

1. Charger les données de base:
   - events du space;
   - ventes réelles `shopGranularData`;
   - taxonomies event;
   - menu items;
   - mappings shops/menu items.
2. Filtrer les events du space:

```ts
eventsForSpace = events.filter(e => e.spaceId === currentSpace.id)
```

3. Appliquer la période:
   - en `analyse`, les périodes courantes s'arrêtent en général à aujourd'hui;
   - en `predict`, `thismonth`, `thisquarter`, `thisyear` vont jusqu'à la fin de la période pour inclure les events futurs.

4. Séparer les events:

```ts
actualRecordsOnly = shopGranularData.filter(r => !r.isPredictive)
eventsWithRealData = new Set(actualRecordsOnly.map(r => r.eventId))

futureEvents = eventsFilteredByDateRange.filter(e => isFutureOrTodayWithoutData(e, eventsWithRealData))
pastEvents = eventsForSpace.filter(e => isPastOrTodayWithData(e, eventsWithRealData))
```

5. Pour chaque future event:
   - scorer les past events similaires;
   - garder les top 10;
   - fallback low-confidence avec 3 past events si aucun match;
   - scaler les quantités/revenues selon `futureTickets / pastTickets`;
   - faire la moyenne pondérée par score;
   - produire des records `isPredictive: true`.

6. Merger les prédictions:

```ts
shopGranularDataForDisplay = [
  ...actualRecordsOnly,
  ...predictiveRecords,
]
```

7. Les graphes restent ceux d'Analyse:
   - `EventRevenueByShopChart`;
   - `EventTimelineChart` si clic event ou `Average`;
   - pies shops/menu items;
   - table menu items;
   - graphes KPI event-level.

Important: ne pas recalculer les prédictions à chaque render. Utiliser un guard:

```ts
if (selectedToolbox === 'predict' && !hasExistingPredictiveRecords) {
  predictiveRecords = generatePredictionsForAllFutureEvents(eventsForSpace, actualRecordsOnly)
}
```

#### 13.7.3 Implémenter `Prévision évènement`

État minimal:

```ts
selectedEventId = null
selectedPredictionEventIds = []
candidateEvents = []
predictedTimelineData = []
eventMenuConfig = new Map<ElementId, Set<MenuItemId>>()
quantityAdjustments = new Map<'elementId-menuItemId', number>()
currentEditingVersionId = null
```

Pipeline:

1. Charger les datasets:
   - events du space;
   - ventes réelles du space;
   - configurations;
   - menu items;
   - space menu config de la configuration de l'event;
   - versions sauvegardées.
2. Auto-sélectionner le premier event futur.
3. Scorer les past events:

```ts
candidateEvents = findAndScorePastEvents(selectedEvent, pastEvents, actualRecordsOnly).slice(0, 50)
selectedPredictionEventIds = candidateEvents.slice(0, 10).map(c => c.event.id)
```

4. Charger la timeline prédictive:
   - récupérer les timelines des past events sélectionnés;
   - aligner les minutes sur le show time du futur event;
   - appliquer le ratio d'affluence;
   - appliquer les poids;
   - agréger par `minute + shopId + menuItemId`.

```ts
alignedMinute = pastMinute + (futureShowTime - pastShowTime)
combinedFactor = eventWeight * (futureAttendees / pastAttendees)

predictedTimelineRecord.totalRevenue = past.totalRevenue * combinedFactor
predictedTimelineRecord.totalQuantity = past.totalQuantity * combinedFactor
```

5. Construire les menus ajustables:
   - extraire les éléments F&B de la configuration;
   - convertir le `spaceMenuConfig` en `Map<elementId, Set<menuItemId>>`;
   - indexer la timeline par `shopKey|menuItemId`;
   - calculer `predictedQty`;
   - appliquer `quantityAdjustments`.

```ts
percent = quantityAdjustments.get(`${elementId}-${menuItemId}`) || 100
adjustedQty = Math.round(predictedQty * percent / 100)
adjustedRevenue = adjustedQty * displayPrice
```

6. Calculer les KPIs:
   - `Total Revenue`;
   - `PerCap`;
   - `Avg/Trans.`;
   - `Transformation`;
   - puis les variantes ajustées si des sliders ont changé.

7. Versions:
   - sauvegarder event snapshot;
   - sauvegarder `eventMenuConfig`;
   - sauvegarder `quantityAdjustments`;
   - sauvegarder `selectedPredictionEventIds`;
   - sauvegarder les métriques brutes et ajustées.

#### 13.7.4 Implémenter le filtre/chip comme dans la capture

La zone visible dans la capture correspond au `Filter Summary` de `AnalyseView`. Elle existe en `Analyse` et `Predict`.

Ligne 1:

1. `53 Events selected`:
   - vient de `filteredEventCount`;
   - doit refléter `chartFilteredEvents.length`, pas le nombre brut d'events chargés.
2. Icône `X`:
   - appelle `clearAllFilters()`;
   - remet events, shops, menu items, filtres avancés, ranges tickets et timeline à leur état par défaut.
3. Chip date `This Year`:
   - vient de `dateRangePreset`;
   - label depuis `DATE_RANGE_PRESETS` ou `PREDICT_DATE_RANGE_PRESETS`;
   - si `custom`, afficher `from - to` en `fr-FR`.
4. Mini toggle `Prev / Year` dans la chip:
   - stocke `comparisonMode`;
   - `Prev` = période précédente séquentielle;
   - `Year` = même période l'année précédente;
   - ce toggle ne filtre pas les events courants, il change les métriques de comparaison.

État Vue recommandé:

```ts
const filterState = reactive({
  selectedEvents: ['all'],
  dateRangePreset: 'thisyear',
  comparisonMode: 'previous_period',
  selectedEventTypes: [],
  selectedCategories: [],
  selectedSubcategories: [],
  selectedTeams: [],
  selectedSponsors: [],
  selectedShops: [],
  selectedShopTypes: [],
  selectedShopAreas: [],
  selectedMenuItems: [],
  selectedMenuTypes: [],
  selectedMenuCategories: [],
  ticketsSoldRange: [minTicketsSold, maxTicketsSold],
  ticketsScannedRange: [minTicketsScanned, maxTicketsScanned],
})
```

Computed pour les chips:

```ts
const activeFilterChips = computed(() => {
  const chips = []

  if (filterState.dateRangePreset !== 'all') {
    chips.push({
      id: 'date-range',
      kind: 'date',
      label: labelForDatePreset(filterState.dateRangePreset),
      clear: () => filterState.dateRangePreset = 'all',
    })
  }

  filterState.selectedCategories.forEach(category => {
    chips.push({
      id: `category-${category}`,
      kind: 'event-category',
      label: `Catégorie: ${category}`,
      clear: () => removeValue(filterState.selectedCategories, category),
    })
  })

  filterState.selectedShops.forEach(shopId => {
    chips.push({
      id: `shop-${shopId}`,
      kind: 'shop',
      label: `Point de vente: ${shopName(shopId)}`,
      clear: () => removeValue(filterState.selectedShops, shopId),
    })
  })

  return chips
})
```

Le pipeline doit rester strict:

```ts
eventsForSpace
  -> eventsFilteredByDateRange
  -> eventsFilteredByAdvancedFilters
  -> finalFilteredEvents
  -> chartFilteredEvents

shopGranularData
  -> recordsMatchingChartEvents
  -> recordsFilteredByShopAndMenu
  -> filteredShopGranularData
```

Règle capitale: les filtres shop/menu ne changent pas `chartFilteredEvents`. Ils changent uniquement `filteredShopGranularData`, donc les montants du graphe peuvent devenir 0 mais les events restent visibles.

#### 13.7.5 Implémenter les contrôles de graphe visibles dans la capture

La capture montre le header de `EventRevenueByShopChart`.

État local du composant:

```ts
aggregationMode = 'event' // event | monthly | quarterly | yearly
sortMode = 'revenue'      // date | revenue
viewMode = 'menuItemType' // shop | menuItemType
```

Titre:

```ts
title =
  `${aggregationPrefix} Event Revenue by ${viewMode === 'shop' ? 'Shop' : 'Menu Types'} (HT)`
```

Contrôles:

1. Chevron à côté du titre:
   - ouvre le menu d'agrégation;
   - choix: `Per Event`, `Monthly`, `Quarterly`, `Yearly`.
2. Bouton `By Revenue` / `By Date`:
   - visible seulement si `aggregationMode === 'event'`;
   - inverse `sortMode`;
   - `By Revenue` trie les events par CA décroissant;
   - `By Date` trie par date et active la ligne cumulative.
3. Segmented control `Shops / Menu Types`:
   - `Shops` groupe les barres par shop;
   - `Menu Types` groupe les barres par type d'article.
4. Bouton `Average`:
   - déclenche `onShowAverage`;
   - charge une timeline moyenne basée sur les events filtrés;
   - limite pratique: ne pas charger plus de 50 events à la fois.

Pseudo-implémentation:

```ts
const chartRows = computed(() => {
  const rows =
    viewMode.value === 'shop'
      ? buildRevenueByShopRows(filteredEvents.value, filteredShopGranularData.value)
      : buildRevenueByMenuTypeRows(filteredEvents.value, filteredShopGranularData.value)

  const aggregated = aggregateRows(rows, aggregationMode.value)

  if (aggregationMode.value === 'event' && sortMode.value === 'revenue') {
    return aggregated.sort((a, b) => b.totalRevenue - a.totalRevenue)
  }

  const byDate = aggregated.sort((a, b) => a.dateTs - b.dateTs)
  let cumulative = 0
  return byDate.map(row => {
    cumulative += row.totalRevenue
    return { ...row, cumulativeRevenue: cumulative }
  })
})
```

UI Vue:

```vue
<div class="chart-header">
  <button @click="aggregationOpen = !aggregationOpen">
    {{ chartTitle }}
    <ChevronRight />
  </button>

  <button v-if="aggregationMode === 'event'" @click="toggleSortMode">
    {{ sortMode === 'date' ? 'Par date' : 'Par CA' }}
  </button>

  <SegmentedControl
    v-model="viewMode"
    :items="[
      { value: 'shop', label: 'Points de vente' },
      { value: 'menuItemType', label: 'Types menu' },
    ]"
  />

  <button @click="showAverageTimeline">
    Moyenne
  </button>
</div>
```

### 13.8 Analyse dediee au mode `Prédire` / `Predict` uniquement

Cette section ne décrit pas `Prévision évènement`. Elle décrit seulement le mode `Predict` de `AnalyseView`, c'est-a-dire la vue qui reprend les graphes d'analyse et y injecte des ventes prédites pour les events futurs.

#### 13.8.1 Objectif exact du mode

Le mode `Predict` sert a afficher, sur une période choisie, un mélange contrôlé de:

1. events passés avec données réelles;
2. events futurs avec records synthétiques `isPredictive: true`;
3. events du jour:
   - considérés comme réels s'ils ont déjà des records F&B réels;
   - considérés comme prédictibles s'ils n'ont pas encore de données réelles.

Dans React, `Predict` n'est pas une page séparée. `AnalyseView` rend la même structure que `Analyse`, mais passe `isPredictMode={selectedToolbox === 'predict'}` au graphe principal `EventRevenueByShopChart`.

Conséquence pour Vue: ne pas créer un layout totalement différent. Créer un mode `predict` dans la vue d'analyse, avec le même pipeline de filtres, les mêmes KPIs, les mêmes graphes, et une couche `predictiveRecords` ajoutée aux records réels.

#### 13.8.2 États React a porter

États globaux nécessaires:

```ts
selectedToolbox: 'analyse' | 'predict'
dateRangePreset: string
customDateRange: { from?: Date, to?: Date }
comparisonMode: 'previous_period' | 'year_over_year'

events: Event[]
shopGranularData: ShopGranularRecord[]       // réel + prédictif dans React
originalGranularDataRef: ShopGranularRecord[] // copie des données réelles
attemptedPredictiveEventIdsRef: Set<string>

selectedConfigurations: string[]
selectedEvents: string[]
selectedEventTypes: string[]
selectedCategories: string[]
selectedSubcategories: string[]
selectedTeams: string[]
selectedSponsors: string[]
selectedDoorsOpenings: string[]
selectedShowTimes: string[]
selectedPerformerNames: string[]
selectedVisitingTeams: string[]
selectedOpeningActs: string[]

selectedShops: string[]
selectedShopTypesFilter: string[]
selectedShopAreasFilter: string[]
selectedMenuItems: string[]
selectedTypeFilter: string[]
selectedCategoryFilter: string[]

ticketsSoldRange: [number, number]
ticketsScannedRange: [number, number]
```

En Vue, la version la plus propre est de ne pas mélanger physiquement les données réelles et prédites dans la source principale:

```ts
const actualGranularRecords = computed(() =>
  rawShopGranularData.value.filter(r => !r.isPredictive)
)

const predictiveRecords = ref<ShopGranularRecord[]>([])

const shopGranularDataForPredict = computed(() =>
  selectedToolbox.value === 'predict'
    ? [...actualGranularRecords.value, ...predictiveRecords.value]
    : actualGranularRecords.value
)
```

Règle capitale: le scoring doit toujours utiliser `actualGranularRecords`, jamais les records prédits. Sinon les prévisions peuvent se nourrir de prévisions déjà générées.

#### 13.8.3 Presets de dates en Predict

React utilise une liste spécifique:

```ts
PREDICT_DATE_RANGE_PRESETS = [
  'thismonth',
  'nextmonth',
  'thisquarter',
  'nextquarter',
  'thisyear',
  'nextyear',
  'custom',
]
```

Labels français recommandés pour Vue:

| Valeur | Label Vue |
| --- | --- |
| `thismonth` | Ce mois-ci |
| `nextmonth` | Mois prochain |
| `thisquarter` | Ce trimestre |
| `nextquarter` | Trimestre prochain |
| `thisyear` | Cette année |
| `nextyear` | Année prochaine |
| `custom` | Période personnalisée |

Différence essentielle avec `Analyse`:

- en `analyse`, `thismonth`, `thisquarter`, `thisyear` s'arrêtent a aujourd'hui;
- en `predict`, ces mêmes périodes vont jusqu'a la fin du mois, du trimestre ou de l'année pour inclure les events futurs.

Pseudo-code:

```ts
function resolvePredictDateRange(preset, today) {
  switch (preset) {
    case 'thismonth':
      return [startOfMonth(today), endOfMonth(today)]
    case 'nextmonth':
      return [startOfNextMonth(today), endOfNextMonth(today)]
    case 'thisquarter':
      return [startOfQuarter(today), endOfQuarter(today)]
    case 'nextquarter':
      return [startOfNextQuarter(today), endOfNextQuarter(today)]
    case 'thisyear':
      return [new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31)]
    case 'nextyear':
      return [new Date(today.getFullYear() + 1, 0, 1), new Date(today.getFullYear() + 1, 11, 31)]
    case 'custom':
      return [customDateRange.from, customDateRange.to]
  }
}
```

Format de dates:

- parser les deux formats acceptés par React: `DD/MM/YYYY` et `YYYY-MM-DD`;
- afficher les dates utilisateur avec `toLocaleDateString('fr-FR')`;
- pour un intervalle custom: `01/05/2026 - 31/05/2026`;
- dans les tooltips, React affiche `eventData.eventDate` tel quel. Pour Vue, normaliser en `DD/MM/YYYY` améliore la cohérence.

#### 13.8.4 Pipeline de filtres Predict

Le pipeline logique a reproduire est:

```txt
events du space
  -> filtre configuration
  -> filtre date Predict
  -> filtres event avancés
  -> sélection explicite d'events
  -> filtres tickets sold / attendees
  = chartFilteredEvents

shopGranularDataForPredict
  -> records dont eventId appartient a chartFilteredEvents
  -> filtres shops / shop types / shop areas
  -> filtres menu items / menu type / menu category
  = filteredShopGranularData
```

Important pour que les filtres fonctionnent vraiment:

- les filtres event modifient `chartFilteredEvents`;
- les filtres shop/menu ne doivent pas supprimer les events de `chartFilteredEvents`, ils réduisent seulement les records F&B utilisés par les graphes;
- si `chartFilteredEvents.length === 0`, Vue doit retourner `[]` pour `filteredShopGranularData`. Le code React a un fallback qui peut retourner toutes les données dans certains calculs internes; pour un portage logique, ne pas reproduire ce comportement ambigu.

Pseudo-code Vue:

```ts
const chartFilteredEvents = computed(() => {
  return applyTicketRanges(
    applyAdvancedEventFilters(
      applySelectedEvents(
        eventsFilteredByPredictDate.value
      )
    ),
    ticketsSoldRange.value,
    ticketsScannedRange.value
  )
})

const filteredShopGranularData = computed(() => {
  const eventIds = new Set(chartFilteredEvents.value.map(e => e.id))
  if (eventIds.size === 0) return []

  return shopGranularDataForPredict.value.filter(record => {
    if (!eventIds.has(record.eventId)) return false
    if (selectedShops.value.length && !selectedShops.value.includes(record.elementId)) return false
    if (selectedShopTypesFilter.value.length && !recordHasOneShopType(record)) return false
    if (selectedShopAreasFilter.value.length && !recordHasShopArea(record)) return false
    if (selectedMenuItems.value.length && !selectedMenuItems.value.includes(record.menuItemId)) return false
    if (selectedTypeFilter.value.length && !selectedTypeFilter.value.includes(record.menuItemType)) return false
    if (selectedCategoryFilter.value.length && !selectedCategoryFilter.value.includes(record.menuItemCategory)) return false
    return true
  })
})
```

#### 13.8.5 Génération des records prédictifs

React a deux chemins de génération:

1. génération globale via `generatePredictionsForAllFutureEvents(enrichedEvents, shopGranularData)`;
2. génération lazy pour la table/performance via `loadPredictiveDataForTable(futureEvents)`, qui tente de remplir les events futurs filtrés et évite les boucles avec `attemptedPredictiveEventIdsRef`.

Pour Vue, le chemin recommandé est:

1. garder les données réelles dans `actualGranularRecords`;
2. identifier les events prédictibles;
3. générer les records prédits dans `predictiveRecords`;
4. concaténer seulement pour l'affichage.

Identification des events:

```ts
const today = startOfDay(new Date())
const eventsWithActualData = new Set(actualGranularRecords.value.map(r => r.eventId))

const futureEvents = eventsForScoring.filter(event => {
  const date = parseEventDate(event.eventDate)
  if (date > today) return true
  if (date.getTime() === today.getTime() && !eventsWithActualData.has(event.id)) return true
  return false
})

const pastEvents = eventsForScoring.filter(event => {
  const date = parseEventDate(event.eventDate)
  if (date < today) return true
  if (date.getTime() === today.getTime() && eventsWithActualData.has(event.id)) return true
  return false
})
```

Enrichissement avant scoring:

- convertir `eventTypeId` en nom;
- convertir `eventCategoryId` en nom;
- convertir `eventSubcategoryId` en nom;
- conserver sponsor, performer, visiting team;
- si un event futur n'a pas de show time, utiliser `19:00`.

Scoring React:

| Critère | Règle |
| --- | --- |
| Event type | match obligatoire si les deux events ont un type; sinon exclusion |
| Catégorie | match obligatoire si les deux events ont une catégorie; sinon exclusion |
| Sous-catégorie | bonus fort si identique |
| Performer | bonus si identique |
| Visiting team | bonus si identique |
| Sponsor | bonus si identique |
| Jour de semaine | week-end comparé au week-end, semaine comparée a la semaine |
| Show time | exclusion si écart > 3h |
| Affluence | exclusion si le passé est < 50% ou > 200% de l'affluence future |

Génération:

```ts
topMatches = scorePastEvents(futureEvent, pastEvents, actualGranularRecords)
  .sort(byScoreDesc)
  .slice(0, 10)

if (topMatches.length === 0) {
  topMatches = pickThreeRandomPastEvents()
  isLowConfidence = true
}

totalScore = sum(topMatches.score)
weight = match.score / totalScore
scalingFactor = futureTickets / pastTickets

predictedRevenue =
  sum(pastRevenueForSameShopAndMenuItem * scalingFactor * weight)
```

Chaque record généré doit contenir:

```ts
{
  ...baseRecord,
  eventId: futureEvent.id,
  eventName: futureEvent.eventName,
  eventDate: futureEvent.eventDate,
  quantity: Math.round(predictedQuantity),
  revenue: Math.round(predictedRevenue),
  transactionCount: 0,
  isPredictive: true,
  confidenceScore,
  isLowConfidence,
  basedOnEventIds,
}
```

#### 13.8.6 Layout Predict a reproduire

Le layout visible en Predict est celui d'Analyse:

1. barre de filtres/menus en haut;
2. `Filter Summary` sous la barre:
   - compteur `{n} Events selected`;
   - bouton `X` pour `clearAllFilters`;
   - chip date avec icône calendrier;
   - mini toggle `Prev / Year`;
   - deuxième ligne de chips pour catégories, types, shops, areas, menus, doors, show times.
3. grille KPIs:
   - desktop: 4 colonnes;
   - mobile: 2 colonnes, certains widgets masqués comme dans React;
   - les moyennes en Predict comptent les futurs seulement s'ils ont des records `isPredictive`.
4. graphes KPI optionnels ouverts depuis les KPIs:
   - transactions;
   - cost;
   - average transaction;
   - attendees;
   - transformation rate;
   - per cap.
5. graphe principal `EventRevenueByShopChart`;
6. distributions shops/menu items;
7. tables shops/menu items/events.

Le graphe principal est dans une card:

```txt
Card min-height 500
  CardHeader
    gauche: titre + chevron menu agrégation
    droite: tri + segmented control + bouton moyenne
  CardContent
    inner panel blanc, bordure, radius 8, padding 16
      ligne labels: Event Revenue + pill Predictions / Cumulative Revenue
      ResponsiveContainer height 400
      legend personnalisée sous le graphe
```

Libellés français recommandés:

| React | Vue |
| --- | --- |
| Predict | Prédire |
| Event Revenue | CA évènement |
| Predictions | Prévisions |
| Cumulative Revenue | CA cumulé |
| Event Total | Total évènement |
| PREDICTED 43% | PRÉVU 43% |
| LOW CONFIDENCE | CONFIANCE FAIBLE |
| Based on 3 random events | Basé sur 3 events aléatoires |
| By Date | Par date |
| By Revenue | Par CA |
| Shops | Points de vente |
| Menu Types | Types menu |
| Average | Moyenne |
| Per Event | Par event |
| Monthly | Mensuel |
| Quarterly | Trimestriel |
| Yearly | Annuel |
| Others | Autres |

#### 13.8.7 Graphe principal: données, tri, agrégations

`EventRevenueByShopChart` construit deux vues depuis les mêmes records filtrés:

1. `viewMode = 'shop'`:
   - groupe par `eventId`;
   - puis par `elementName`;
   - calcule le top 10 shops par event;
   - tout le reste va dans `Others`.
2. `viewMode = 'menuItemType'`:
   - groupe par `eventId`;
   - retrouve le menu item via `menuItemId`;
   - groupe par `menuItem.type`;
   - calcule le top 10 types par event;
   - tout le reste va dans `Others`.

Chaque ligne event contient:

```ts
{
  eventId,
  eventName,
  eventDate,
  displayName: `${eventName} (${eventDate})`,
  totalRevenue,
  cumulativeRevenue,
  Others,
  _shopDetails: Map<string, number>,
  _typeDetails: Map<string, number>,
  isPredictive,
  confidenceScore,
  isLowConfidence,
  [shopOrTypeName]: revenue,
}
```

Tri:

- par défaut `sortMode = 'date'`;
- si `sortMode === 'date'`, les events sont triés par date croissante et la ligne `cumulativeRevenue` est affichée sur l'axe droit;
- si `sortMode === 'revenue'`, les events sont triés par `totalRevenue` décroissant et la ligne cumulative disparaît.

Agrégations:

- `event`: une barre par event;
- `monthly`: une barre par mois;
- `quarterly`: une barre par trimestre;
- `yearly`: une barre par année.

Point de précision React: les agrégations mensuelle/trimestrielle/annuelle ne propagent pas clairement `isPredictive`, `confidenceScore` et `isLowConfidence` sur la ligne agrégée. Pour un portage fidèle, le badge `PRÉVU` et le tooltip de confiance sont surtout fiables en mode `Par event`. Pour un portage amélioré, ajouter:

```ts
row.hasPredictions = eventsInBucket.some(e => e.isPredictive)
row.predictedRevenue = sum(predicted event revenue)
row.actualRevenue = sum(actual event revenue)
```

#### 13.8.8 Opacité, couleur et état prédit

C'est le point visuel le plus important.

React ne réduit pas directement l'opacité des events prédits en confiance normale. La règle exacte de `getBarColor(itemName, eventData)` est:

1. si `eventData.isPredictive && eventData.isLowConfidence`, tous les segments de la barre deviennent rouges `#ef4444`;
2. sinon, si `isPredictMode && !eventData.isPredictive && eventData.eventDate` est dans le passé, la couleur du segment devient `rgba(baseColor, 0.5)`;
3. sinon, le segment garde sa couleur normale.

Donc dans la capture:

- les events prédits ressortent parce qu'ils gardent les couleurs pleines et affichent le badge `PREDICTED xx%`;
- les events passés non prédits sont atténués a 50% d'opacité en mode Predict;
- les prédictions low confidence sont rouges, pas violettes.

Pseudo-code Vue:

```ts
function getPredictBarFill(itemName, row) {
  const baseColor = itemColor(itemName)

  if (row.isPredictive && row.isLowConfidence) {
    return '#ef4444'
  }

  if (
    selectedToolbox.value === 'predict' &&
    row.eventDate &&
    !row.isPredictive &&
    isPastDate(row.eventDate)
  ) {
    return hexToRgba(baseColor, 0.5)
  }

  return baseColor
}
```

Ne pas faire en Vue:

```ts
// Mauvais si on veut reproduire React:
if (row.isPredictive) return hexToRgba(baseColor, 0.5)
```

Ce serait l'inverse du comportement React.

#### 13.8.9 Tooltip Predict

Le tooltip utilise la première payload Recharts pour récupérer la ligne event:

```ts
const eventData = payload[0].payload
```

Contenu:

1. ligne titre:
   - `eventData.eventName`;
   - badge `PREDICTED {confidenceScore}%` si `isPredictive && !isLowConfidence`;
   - badge `LOW CONFIDENCE` si `isPredictive && isLowConfidence`.
2. date:
   - `eventData.eventDate`.
3. message low confidence:
   - affiché seulement si `isPredictive && isLowConfidence`.
4. détail top 10:
   - en vue shops: `_shopDetails`;
   - en vue menu types: `_typeDetails`;
   - tri décroissant par revenue.
5. ligne `Others` si des items existent au-delà du top 10.
6. `Event Total` en bleu.
7. `Cumulative Revenue` en orange seulement si `sortMode === 'date'`.

Montants:

```ts
value.toLocaleString('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
```

En Vue, garder la séparation entre couleur de légende et couleur de barre:

- la légende affiche la couleur de base;
- la barre peut être rendue en `rgba(..., 0.5)` si event passé en Predict;
- le tooltip affiche les couleurs de base des shops/types, comme React.

#### 13.8.10 Contrôles et sliders en Predict

Contrôles visibles sur le graphe principal:

```ts
viewMode: 'shop' | 'menuItemType'        // Points de vente / Types menu
aggregationMode: 'event' | 'monthly' | 'quarterly' | 'yearly'
sortMode: 'date' | 'revenue'
legendExpanded: boolean
```

Le bouton `Moyenne` n'est pas un slider. Il bascule vers une timeline moyenne via `onShowAverage`.

Sliders présents dans le mode Predict:

1. filtres `Tickets Sold` et `Attendees`:
   - sliders de range;
   - impactent `chartFilteredEvents`;
   - bornes recalculées quand la liste d'events filtrables change.
2. timeline `Average` ou clic event:
   - `EventTimelineChart` affiche un slider de plage horaire;
   - il recalcule les métriques si une plage est sélectionnée.

Sliders absents du mode Predict:

- pas de sliders d'ajustement shop;
- pas de sliders d'ajustement item;
- pas de `Manual Qty`;
- pas de sauvegarde de version.

Ces éléments appartiennent uniquement a `Prévision évènement` / `EventPredictMenusSection`.

#### 13.8.11 Checklist Vue Predict-only

- [ ] Au switch vers `Prédire`, charger `defaultPredictDateRangePreset` ou utiliser `thismonth`.
- [ ] Réinitialiser les filtres events, shops, menu items et attendance comme React.
- [ ] Utiliser les presets Predict, pas ceux d'Analyse.
- [ ] En `thismonth`, `thisquarter`, `thisyear`, inclure les futurs jusqu'a la fin de période.
- [ ] Générer les prédictions uniquement en mode `predict`.
- [ ] Ne jamais scorer avec des records `isPredictive`.
- [ ] Traiter un event du jour sans données réelles comme prédictible.
- [ ] Ajouter `isPredictive`, `confidenceScore`, `isLowConfidence`, `basedOnEventIds` sur chaque record prédit.
- [ ] Faire passer `isPredictMode` au graphe principal.
- [ ] Afficher le pill `Prévisions` si au moins une ligne event contient `isPredictive`.
- [ ] Dans le tooltip, afficher `PRÉVU xx%` ou `CONFIANCE FAIBLE`.
- [ ] Appliquer l'opacité 50% aux events passés non prédits, pas aux prédictions normales.
- [ ] Colorer en rouge `#ef4444` les prédictions low confidence.
- [ ] Garder la ligne `CA cumulé` uniquement en tri `Par date`.
- [ ] Garder le tri `Par CA` sans ligne cumulative.
- [ ] Porter les vues `Points de vente` et `Types menu`.
- [ ] Porter les agrégations `Par event`, `Mensuel`, `Trimestriel`, `Annuel`.
- [ ] Porter la logique top 10 par event + `Autres`.
- [ ] S'assurer que les filtres shop/menu filtrent les records, pas la liste des events.
- [ ] Retourner `[]` si aucun event ne passe les filtres.
- [ ] Ne pas rendre `EventPredictMenusSection` dans ce mode.

## 14. Structure conseillee pour Vue

### Composables

Creer ou verifier:

- `src/composables/useSpaceData.js`
  - charge spaces, configurations, areas, menu config.
- `src/composables/useAnalyseFilters.js`
  - porte `eventPassesFilters`, `finalFilteredEvents`, `chartFilteredEvents`.
- `src/composables/useMetricsCalculator.js`
  - doit rester aligne sur le hook React.
- `src/composables/usePredictiveTimeline.js`
  - port direct de `usePredictiveTimeline.ts`.
- `src/composables/useEventPredictVersions.js`
  - CRUD versions + default + reset/change detection.
- `src/composables/useEventPredictMenus.js`
  - extraction fbElements, availability, quantity/revenue adjustments.

### Utils

- `src/utils/predictiveAnalytics.js`
  - port du moteur scoring.
- `src/utils/predictiveAnalyticsTimeline.js`
  - optionnel si `usePredictiveTimeline` couvre tout, mais utile pour batch predictions.
- `src/constants/dateRangePresets.js`
  - inclure les presets Analyse et Predict.

### Components

- `src/components/analyse/AnalyseView.vue`
  - mode analyse + predict.
- `src/components/EventPredictView.vue`
  - ecran dedie Event Predict.
- `src/components/EventPredictMenusSection.vue`
  - grille shop/item controlee.
- `src/components/charts/EventRevenueByShopChart.vue`
  - graphe overview Analyse/Predict: barres empilees, modes shops/menu types, aggregations, tri, ligne cumulative.
- `src/components/charts/EventTimelineChart.vue`
  - graphe timeline Analyse/Predict/Event Predict: area empilee, revenue/quantity, menu item/shop, slider horaire.
- `src/components/charts/ShopDistributionPieChart.vue`
  - 3 donuts shops/types/areas avec metric `quantity/revenue`.
- `src/components/charts/MenuItemQuantityPieChart.vue`
  - 3 donuts menu items/types/categories avec filtres type/category.
- Charts KPI event-level:
  - `TransactionsByEventChart`;
  - `CostByEventChart`;
  - `AvgTransactionByEventChart`;
  - `AttendeesByEventChart`;
  - `TransformationRateByEventChart`;
  - `PerCapByEventChart`.

## 15. Checklist de reproduction Vue

### Space

- [ ] Charger `spaces` et `configurations` en parallele.
- [ ] Lire `shop-granular-records:${spaceId}` pour les metriques all-time.
- [ ] Calculer `perCapita`, `avgTransaction`, `avgEvent` avec les memes formules.
- [ ] Ouvrir un space en chargeant space, configs, areas, premiere config, menu items.
- [ ] Afficher les libellés français de navigation et les montants en format `fr-FR`.
- [ ] Respecter le layout card: image, stats capacité/configurations, actions, KPIs.

### Analyse

- [ ] Exclure les futurs uniquement en mode `analyse`.
- [ ] Reproduire tous les filtres events.
- [ ] Filtrer les records par eventId puis fallback eventName/eventDate.
- [ ] Calculer KPIs depuis `filteredShopGranularData`.
- [ ] En timeline mode, utiliser les metriques timeline-filtered.
- [ ] `calculateEventPerformance` doit creer une ligne meme pour les events sans data.
- [ ] Garder le pipeline de filtres unidirectionnel: events puis records F&B.
- [ ] Ne jamais laisser un filtre shop/menu retirer un event de `chartFilteredEvents`.
- [ ] Afficher le résumé des filtres actifs et permettre la suppression individuelle.
- [ ] Porter les sliders `Tickets Sold` et `Attendees` avec bornes dynamiques et `step=1`.
- [ ] Porter `EventRevenueByShopChart` comme graphe overview principal, pas comme simple bar chart.
- [ ] Porter les toggles `Shops/Menu Types`, `Per Event/Monthly/Quarterly/Yearly`, `By Date/By Revenue`.
- [ ] Porter la ligne cumulative revenue sur l'axe droit quand le tri est `By Date`.
- [ ] Porter les 6 graphes KPI event-level ouverts depuis les métriques header.
- [ ] Porter `ShopDistributionPieChart` avec 3 donuts shops/types/areas.
- [ ] Porter `MenuItemQuantityPieChart` avec 3 donuts menu items/types/categories et filtres cliquables.
- [ ] Porter `EventTimelineChart` avec `Revenue/Quantity`, `Menu Item/Shop`, slider horaire et `onTimeRangeChange`.

### Predict

- [ ] Activer via `selectedToolbox === 'predict'`.
- [ ] Utiliser les presets future-friendly.
- [ ] Enrichir events avant scoring.
- [ ] Generer predictions seulement quand data + taxonomies sont chargees.
- [ ] Ne jamais regenarer si des records `isPredictive` sont deja presents.
- [ ] Nettoyer les records predictifs quand on change de date range ou quitte predict.
- [ ] Porter les hard filters et poids de scoring a l'identique.
- [ ] Merger `predictiveRecords` dans `shopGranularData`.
- [ ] Gerer low confidence avec 3 random past events.
- [ ] Afficher dates, badges et libellés en français: `Prévu`, `Réel`, `Mode prévision`.
- [ ] Les périodes `Ce mois-ci`, `Ce trimestre`, `Cette année` doivent aller jusqu'à la fin de période en Predict.
- [ ] Garder exactement le même stack de graphes qu'Analyse: overview, timeline, pies, table et graphes KPI.
- [ ] Passer `isPredictMode` au graphe overview pour griser les past events non prédictifs.
- [ ] Afficher le badge predictions quand des records `isPredictive` sont présents.
- [ ] Ne pas rendre `EventPredictMenusSection` dans le mode Predict.

### Timeline Predict

- [ ] Port `usePredictiveTimeline`.
- [ ] Sauvegarder/charger `predictive-event-selection`.
- [ ] Gerer candidates top 50, excluded same subcategory/category, manual 30%.
- [ ] Appliquer les poids 70/30.
- [ ] Aligner les show times par offset.
- [ ] Scaler revenue/quantity/transactions par `predictedAttendees / pastAttendees`.
- [ ] Agreger par minute/shop/item.
- [ ] Abandonner les anciennes requetes via `AbortController` ou equivalent.
- [ ] Afficher les past events utilisés avec score, poids et date française.
- [ ] Porter le slider horaire double handle `0..100`, gap minimum 15 minutes, reset et popovers heure/minute.
- [ ] En mobile, ne pas dépendre du slider horizontal: conserver une saisie time utilisable.

### Event Predict

- [ ] Auto-selectionner le premier event futur.
- [ ] Charger timeline predictive pour futur, timeline reelle pour passe.
- [ ] Charger `spaceMenuConfig` de `selectedEvent.configurationId`.
- [ ] Convertir config object vers `Map<elementId, Set<menuItemId>>`.
- [ ] Calculer raw + adjusted metrics.
- [ ] Port complet des versions: save/load/update/rename/duplicate/delete/default.
- [ ] Auto-loader la default version une seule fois par event.
- [ ] Reset vers event library + default space menu config.
- [ ] Port `EventPredictMenusSection` avec shop view et item view.
- [ ] Respecter le layout 3 zones: sidebar events/versions, contenu timeline/menus, KPIs.
- [ ] Tous les dialogs versions doivent utiliser les libellés français.
- [ ] Les quantités ajustées restent des pourcentages appliqués aux quantités prévues.
- [ ] Ne pas porter `EventRevenueByShopChart`, les pie charts ni `MenuItemsByShopTable` dans `EventPredictView`.
- [ ] Porter uniquement `EventTimelineChart` comme graphe central.
- [ ] Porter les cards KPI 2 x 2: Total Revenue, PerCap, Avg/Trans., Transformation.
- [ ] Porter les sliders `Shop Adjustment` et `Item Adjustment`: `0..500`, `step=5`, reset `100%`.
- [ ] Porter le slider atomique shop/item: `0..500`, `step=10`, reset `100%`, disabled si item indisponible.
- [ ] Traiter `Manual Qty` pour predicted quantity 0: soit reproduire React tel quel, soit corriger avec un stockage absolu explicite.

## 16. Points d'attention

- Les dates sont heterogenes: supporter `DD/MM/YYYY` et `YYYY-MM-DD` en local midnight.
- L'affichage des dates doit être français, mais le stockage ne doit pas convertir les valeurs API en texte localisé.
- `shopId` dans les timeline records correspond souvent a `elementId`, pas au nom du shop.
- Les mappings legacy peuvent manquer: toujours prevoir fallback par nom.
- Ne pas utiliser les records `isPredictive` pour scorer les predictions futures.
- Les predictions granulaires et timeline n'ont pas exactement le meme role:
  - granular = alimente les KPIs/charts globaux de `AnalyseView`.
  - timeline = alimente les charts minute par minute et les quantites ajustables d'Event Predict.
- Pour `EventPredictMenusSection`, le prix affiche doit toujours tenir compte de `spaceSpecificPrices`.
- La default version ne doit pas etre ecrasee par le `spaceMenuConfig` au chargement de l'event.
- Les ajustements sont des pourcentages, pas des quantites absolues.
- Exception à décider: l'input React `Manual Qty` suggère une quantité absolue, mais le calcul actuel reste en pourcentage; Vue doit choisir explicitement le comportement voulu.
- Un item absent d'un past event contribue 0 dans le weighted average.
- Ne pas mélanger les graphes: `Predict` réutilise `AnalyseView`; `Event Predict` utilise seulement `EventTimelineChart` côté graphes.
- Les filtres doivent être testés avec au moins: aucun filtre, un seul event, plusieurs events, event futur, shop sans data, menu item absent d'un past event.
