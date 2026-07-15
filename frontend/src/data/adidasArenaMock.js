/**
 * Mock Adidas Arena — calibré pour reproduire les chiffres exacts de la maquette Figma.
 *
 * Cibles :
 *   Revenue      1 517 025 €  (+39,3 %)
 *   Avg/Event    34 478 €     (+14,0 %)
 *   Cost         208 729 €    (+36,9 %)
 *   Transactions 193 499      (+58,1 %)
 *   Avg/Trans    7,84 €       (-8,0 %)
 *   Attendees    266 556      (+14,8 %)
 *   Transfer     74,3 %       (+29,0 %)  (193499/266556 ≈ 72,6 %)
 *   Per Cap      5,82 €       (+21,3 %)
 *   Margin       86,2 %
 *   Avg Cost     4 744 €
 *
 *   44 events, 23 shops
 *   FOOD $598 188  /  BEVERAGE $780 417  /  BEER $392 229
 */

const TARGETS = {
  revenue: 1517025,
  cost: 208729,
  transactions: 193499,
  attendees: 266556,
  events: 44,
  eventsWithRevenue: 44,
  foodRevenue: 598188,
  beverageRevenue: 780417,
  beerRevenue: 392229,
}

// ============================================================================
// Shops (23) — hiérarchie Ground Floor / Forecourt
// ============================================================================
const SHOPS = [
  { name: '5 - Comptoir Sud',           type: 'food, beverages', area: 'Ground Floor', weight: 22 },
  { name: '3 - Burger Sud',             type: 'food',            area: 'Ground Floor', weight: 14 },
  { name: '8 - Container (Paris)',      type: 'food, beverages', area: 'Ground Floor', weight: 13.5 },
  { name: '2 - Burger Nord',            type: 'food',            area: 'Ground Floor', weight: 12 },
  { name: '6 - Bodega (RDC)',           type: 'beverages, beer', area: 'Ground Floor', weight: 10.5 },
  { name: '1 - MHD',                    type: 'food, beverages', area: 'Forecourt',    weight: 6 },
  { name: '4 - Bud',                    type: 'beverages',       area: 'Forecourt',    weight: 5 },
  { name: '9 - Fosse',                  type: 'beverages, beer', area: 'Ground Floor', weight: 3.5 },
  { name: '7 - Click & Collect (RDC)',  type: 'food, beverages', area: 'Ground Floor', weight: 2.5 },
  { name: 'N3 SUD',                     type: 'beverages',       area: 'Ground Floor', weight: 2 },
  { name: 'Module 2 (Ouest)',           type: 'food, beverages', area: 'Forecourt',    weight: 1.5 },
  { name: 'Module 3 (Sud/Sud)',         type: 'food, beverages', area: 'Forecourt',    weight: 1.2 },
  { name: 'Bar à Champagne',            type: 'beverages',       area: 'Ground Floor', weight: 1.1 },
  { name: 'Dinette 3 (Sud Sud)',        type: 'food',            area: 'Forecourt',    weight: 0.9 },
  { name: 'Déssoiffeurs',               type: 'beverages',       area: 'Forecourt',    weight: 0.9 },
  { name: 'Dinette 2 (Burger Nord)',    type: 'food',            area: 'Forecourt',    weight: 0.9 },
  { name: 'Dinette Crêpes',             type: 'food',            area: 'Forecourt',    weight: 0.6 },
  { name: 'Module 4 RDC',               type: 'food, beverages', area: 'Forecourt',    weight: 0.5 },
  { name: 'Module 1 (MHD)',             type: 'food, beverages', area: 'Forecourt',    weight: 0.4 },
  { name: 'Dinette Fosse',              type: 'food',            area: 'Ground Floor', weight: 0.3 },
  { name: 'Bar à Cocktail / Bar à vin', type: 'beverages',       area: 'Ground Floor', weight: 0.3 },
  { name: 'N3 TERRASSE',                type: 'beverages',       area: 'Ground Floor', weight: 0.2 },
  { name: 'N3 NORD',                    type: 'beverages',       area: 'Ground Floor', weight: 0.2 },
]

// ============================================================================
// Menu items (11) — dispatched pour atteindre les cibles FOOD/BEVERAGE/BEER
// ============================================================================
const MENU_ITEMS = [
  // Beers
  { id: 'budweiser-45',  name: 'Budweiser 45cl',        type: 'Beverage', category: 'Beer',      price: 9,  cost: 2.2 },
  { id: 'heineken-33',   name: 'Heineken 33cl',         type: 'Beverage', category: 'Beer',      price: 8,  cost: 1.9 },
  // Food
  { id: 'frites',        name: 'Frites',                type: 'Food',     category: 'Sides',     price: 6,  cost: 1.2 },
  { id: 'burger-chick',  name: 'Burger Pulled Chicken', type: 'Food',     category: 'Main',      price: 14, cost: 4.1 },
  { id: 'hot-dog',       name: 'Hot Dog',               type: 'Food',     category: 'Main',      price: 10, cost: 2.8 },
  { id: 'nachos',        name: 'Nachos',                type: 'Food',     category: 'Snack',     price: 7,  cost: 1.6 },
  // Beverages (non-beer)
  { id: 'coca',          name: 'Coca-Cola BB 50cl',     type: 'Beverage', category: 'Soft Drink',price: 5,  cost: 0.9 },
  { id: 'water',         name: 'Eau plate 50cl',        type: 'Beverage', category: 'Water',     price: 4,  cost: 0.5 },
  { id: 'champagne',     name: 'Champagne flûte',       type: 'Beverage', category: 'Champagne', price: 15, cost: 4 },
  { id: 'mojito',        name: 'Cocktail Mojito',       type: 'Beverage', category: 'Mixology',  price: 12, cost: 3 },
  { id: 'glass',         name: 'Verre réutilisable',    type: 'Glasses',  category: 'Glasses',   price: 2,  cost: 0.6 },
]

// ============================================================================
// 44 événements — étalés sur 12 mois
// ============================================================================
const EVENT_TEMPLATES = [
  { name: 'Afreudh',                   color: '#5B8DEF', attendanceFactor: 1.05, category: 'Culture', eventType: 'Concert',   team: null,                   sponsor: 'Live Nation' },
  { name: 'Meeting Politique',         color: '#66BB6A', attendanceFactor: 1.1,  category: 'Corporate', eventType: 'Meeting', team: null,                   sponsor: null },
  { name: 'ARES 40',                   color: '#FF8A65', attendanceFactor: 1.0,  category: 'Sport',   eventType: 'MMA',       team: 'ARES',                 sponsor: 'Adidas' },
  { name: 'PSB vs Maccabi',            color: '#AB47BC', attendanceFactor: 0.95, category: 'Sport',   eventType: 'Basket',    team: 'Paris Basketball',     sponsor: 'EuroLeague' },
  { name: 'PSB vs Nanterre',           color: '#EF5350', attendanceFactor: 0.9,  category: 'Sport',   eventType: 'Basket',    team: 'Paris Basketball',     sponsor: 'LNB' },
  { name: 'PSB vs Milan',              color: '#FFD54F', attendanceFactor: 1.0,  category: 'Sport',   eventType: 'Basket',    team: 'Paris Basketball',     sponsor: 'EuroLeague' },
  { name: 'Coupe de France de Volley', color: '#4DD0E1', attendanceFactor: 0.8,  category: 'Sport',   eventType: 'Volley',    team: null,                   sponsor: 'FFVB' },
  { name: 'Concert Live Nation',       color: '#7C4DFF', attendanceFactor: 1.15, category: 'Culture', eventType: 'Concert',   team: null,                   sponsor: 'Live Nation' },
]

function seededRandom(seed = 1337) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function subtractMinutes(timeStr, minutes) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m - minutes
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60)
  const mm = (((total % 60) + 60) % 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function buildAdidasArenaMock() {
  const rand = seededRandom(42)
  // Année courante : permet au filtre `timeRange: 'this_year'` (par défaut)
  // de capter tous les events du mock, sinon les filtres date / affluence
  // n'auraient rien à filtrer.
  const today = new Date()
  const baseYear = today.getFullYear()
  const todayMs = new Date(baseYear, today.getMonth(), today.getDate()).getTime()

  // Heures de show possibles (utilisées pour le scoring prédictif)
  const SHOW_TIMES = ['18:00', '19:00', '20:00', '20:30', '21:00']

  // ---- Generate events ---------------------------------------------------
  // Stratégie : 36 events passés répartis sur les mois écoulés de l'année,
  // + 8 events futurs sur les 6 mois à venir.
  // Cela garantit toujours un mélange events passés + futurs quel que soit
  // le moment de l'année (mode Predict opérationnel sur Arena).
  const FUTURE_EVENTS_COUNT = 8
  const PAST_EVENTS_COUNT = TARGETS.events - FUTURE_EVENTS_COUNT
  const currentMonth = today.getMonth()
  // Si on est en janvier, on n'a pas de mois passés dans l'année — fallback
  // sur l'année précédente pour les events passés.
  const pastSpread = Math.max(currentMonth, 1)

  const events = []
  for (let i = 0; i < TARGETS.events; i++) {
    const tpl = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length]
    const isFutureSlot = i >= PAST_EVENTS_COUNT
    let monthIndex
    let yearOffset = 0
    if (isFutureSlot) {
      // Étalé sur les 6 prochains mois (ou jusqu'à fin d'année + début d'année suivante)
      const offset = Math.floor((i - PAST_EVENTS_COUNT) / FUTURE_EVENTS_COUNT * 6) + 1
      monthIndex = currentMonth + offset
      if (monthIndex > 11) {
        yearOffset = 1
        monthIndex -= 12
      }
    } else if (currentMonth === 0) {
      // Janvier : tous les passés sur l'année précédente
      yearOffset = -1
      monthIndex = Math.floor((i / PAST_EVENTS_COUNT) * 12)
    } else {
      monthIndex = Math.floor((i / PAST_EVENTS_COUNT) * pastSpread)
      if (monthIndex >= currentMonth) monthIndex = currentMonth - 1
    }
    const eventYear = baseYear + yearOffset
    const day = 1 + Math.floor(rand() * 27)
    const baseAttendees = Math.round(TARGETS.attendees / TARGETS.events) // ~6058
    const jitter = 0.8 + rand() * 0.4
    const attendees = Math.round(baseAttendees * tpl.attendanceFactor * jitter)

    const isoDate = `${eventYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const ddmmyyyy = `${String(day).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}/${eventYear}`
    const showTime = SHOW_TIMES[Math.floor(rand() * SHOW_TIMES.length)]
    const isFuture = new Date(eventYear, monthIndex, day).getTime() > todayMs

    events.push({
      id: `evt-${String(i + 1).padStart(3, '0')}`,
      name: `${tpl.name} #${i + 1}`,
      eventName: `${tpl.name} #${i + 1}`,
      date: isoDate,
      eventDate: ddmmyyyy,
      color: tpl.color,
      attendees,
      ticketsSold: attendees,
      ticketsScanned: isFuture ? 0 : attendees,
      category: tpl.category,
      eventType: tpl.eventType,
      team: tpl.team,
      homeTeamName: tpl.team,
      visitingTeam: tpl.team ? `Adversaire #${(i % 6) + 1}` : null,
      sponsor: tpl.sponsor,
      sponsorName: tpl.sponsor,
      performerName: tpl.eventType === 'Concert' ? tpl.name : null,
      subcategory: tpl.eventType,
      sessions: [{ showTime, doorsOpening: showTime ? subtractMinutes(showTime, 60) : null }],
      isFuture,
      configurationId: 'cfg-all',
      // Pas de spaceId codé en dur : useSpaceData injecte dynamiquement
      // l'id de la route dans `space.id`, et EventPredictView filtre par
      // `!ev.spaceId || ev.spaceId === this.space.id`. Laisser le champ
      // absent garantit que les events passent quel que soit le spaceId.
    })
  }

  // Normalize attendance to hit target
  const attSum = events.reduce((a, e) => a + e.attendees, 0)
  const attFactor = TARGETS.attendees / attSum
  for (const e of events) {
    e.attendees = Math.round(e.attendees * attFactor)
    e.ticketsScanned = e.attendees
  }

  // ---- Precompute quantity allocation per (shop, category) ---------------
  // We want: FOOD revenue / BEVERAGE revenue / BEER revenue to hit targets.
  // Strategy: assign each menu item a target share of its category bucket.
  const categoryBuckets = {
    FOOD:     { target: TARGETS.foodRevenue,     itemIds: ['frites', 'burger-chick', 'hot-dog', 'nachos'] },
    BEVERAGE: { target: TARGETS.beverageRevenue, itemIds: ['coca', 'water', 'champagne', 'mojito', 'glass'] },
    BEER:     { target: TARGETS.beerRevenue,     itemIds: ['budweiser-45', 'heineken-33'] },
  }

  // For each item, compute total target revenue across all shops/events
  const itemTargetRevenue = {}
  for (const [, bucket] of Object.entries(categoryBuckets)) {
    // Unequal split: first item gets larger share (like Budweiser dominating Beer)
    const weights = bucket.itemIds.map((_, idx) => 1 / (idx + 1))
    const wSum = weights.reduce((a, b) => a + b, 0)
    bucket.itemIds.forEach((id, idx) => {
      itemTargetRevenue[id] = (weights[idx] / wSum) * bucket.target
    })
  }

  // Shops share of each item's revenue proportional to shop.weight
  const shopWeightSum = SHOPS.reduce((a, s) => a + s.weight, 0)

  // ---- Generate granular records ----------------------------------------
  // Important : on ne génère PAS de records pour les events futurs. Cela
  // permet au moteur Predict (`generatePredictionsForAllFutureEvents`) de
  // créer ses propres records prédictifs sans double comptage.
  const records = []
  let totalTransactions = 0

  for (const event of events) {
    if (event.isFuture) continue
    // Each event gets a fraction of total revenue (with variance)
    const eventShare = 1 / TARGETS.events
    const eventJitter = 0.6 + rand() * 0.8 // 0.6-1.4
    const eventWeight = eventShare * eventJitter

    SHOPS.forEach((shop, shopIdx) => {
      const shopShare = shop.weight / shopWeightSum
      // Vendre TOUS les items applicables au shopType de la boutique. Sans ça
      // chaque event ne couvrait que 3-6 items random sur 11, donc lors de la
      // prédiction la pondération par item descendait à ~0.3-0.5 (item présent
      // dans ~30-50 % des past events) → revenue prédit ~1/6 du réel. En
      // peuplant systématiquement tous les items applicables, la prédiction
      // pondérée par score converge vers la moyenne des past events.
      const shopTypes = shop.type.split(',').map((s) => s.trim().toLowerCase())
      const hasFood = shopTypes.includes('food')
      const hasBeverages = shopTypes.includes('beverages') || shopTypes.includes('drinkee')
      const hasBeer = shopTypes.includes('beer') || hasBeverages
      const shopItems = MENU_ITEMS.filter((mi) => {
        const cat = (mi.category || '').toLowerCase()
        if (mi.type === 'Food') return hasFood
        if (mi.type === 'Beverage' && cat === 'beer') return hasBeer
        if (mi.type === 'Beverage') return hasBeverages
        return false
      })
      // `elementId` doit correspondre au registryId du shop dans la
      // configuration (cf. floorElements ci-dessous : `shop-${idx+1}`),
      // car les composants EventPredict (MenusSection, StockUp, Timeline)
      // et useMetricsCalculator indexent par `record.elementId`.
      const shopElementId = `shop-${shopIdx + 1}`

      for (const item of shopItems) {
        const itemTotal = itemTargetRevenue[item.id] || 0
        // Variance per (event, shop, item) pour éviter records identiques
        const itemJitter = 0.7 + rand() * 0.6
        const revenue = itemTotal * shopShare * eventWeight * itemJitter
        if (revenue <= 0) continue
        const quantity = Math.max(1, Math.round(revenue / item.price))
        const transactions = Math.max(1, Math.round(quantity / 2.3))
        totalTransactions += transactions

        records.push({
          elementId: shopElementId,
          menuItemId: item.id,
          menuItemName: item.name,
          menuItemType: item.type,
          menuItemCategory: item.category,
          shopName: shop.name,
          shopType: shop.type,
          shopArea: shop.area,
          revenue: Math.round(revenue * 100) / 100,
          quantity,
          transactionCount: transactions,
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
        })
      }
    })
  }

  // ---- Rescale transactions to hit target (193 499) ----------------------
  const txFactor = TARGETS.transactions / totalTransactions
  for (const r of records) {
    r.transactionCount = Math.max(1, Math.round(r.transactionCount * txFactor))
  }

  // ---- Rescale revenue to hit exact target (1 517 025) -------------------
  const currentRevenue = records.reduce((a, r) => a + r.revenue, 0)
  const revFactor = TARGETS.revenue / currentRevenue
  for (const r of records) {
    r.revenue = Math.round(r.revenue * revFactor * 100) / 100
    r.quantity = Math.max(1, Math.round(r.quantity * revFactor))
  }

  // ---- Split records into per-minute buckets ----------------------------
  // Conversion 1:1 avec la version React : la timeline travaille \u00e0 la
  // r\u00e9solution **minute** (HH:MM), pas heure. On distribue chaque
  // record agr\u00e9g\u00e9 (shop \u00d7 menu \u00d7 event) sur une fen\u00eatre de 4 h \u00e0 partir
  // de `doorsOpening`, via une gaussienne centr\u00e9e 2 h apr\u00e8s l'ouverture
  // des portes (\u2248 60 min apr\u00e8s showTime). Les minutes o\u00f9 il ne reste
  // ni revenu ni quantit\u00e9 ni transaction sont skipp\u00e9es \u00e0 l'\u00e9mission
  // pour borner la taille m\u00e9moire du mock.
  const eventStartMinuteMap = new Map() // eventId -> minutes since midnight (doorsOpening)
  for (const ev of events) {
    const opening = ev?.sessions?.[0]?.doorsOpening || '18:00'
    const [h, m] = String(opening).split(':').map(Number)
    const sH = Number.isFinite(h) ? h : 18
    const sM = Number.isFinite(m) ? m : 0
    eventStartMinuteMap.set(ev.id, sH * 60 + sM)
  }
  const MINUTE_COUNT = 240 // fenetre 4h
  const MINUTE_PEAK = 120 // pic 2h apres doorsOpening
  const MINUTE_SIGMA = 35
  // Réduit de 60 → 24 pour limiter la taille du mock (~2.5x moins de records,
  // évite les OOM "Aïe aïe aïe" lors du switch toolbox sur des machines avec
  // peu de RAM disponible). Résolution timeline = 1 record toutes les ~10min,
  // toujours largement suffisante pour le rendu.
  const TOP_K = 24
  const MINUTE_WEIGHTS_RAW = (() => {
    const arr = new Array(MINUTE_COUNT)
    for (let i = 0; i < MINUTE_COUNT; i++) {
      const d = i - MINUTE_PEAK
      arr[i] = Math.exp(-(d * d) / (2 * MINUTE_SIGMA * MINUTE_SIGMA))
    }
    return arr
  })()
  // Top-K minutes: ne conserve que les plus ponderees, renormalise a 1.
  // Borne la taille du mock (~60 records par agregat).
  const TOP_MINUTES = (() => {
    const idx = MINUTE_WEIGHTS_RAW.map((w, i) => ({ i, w }))
      .sort((a, b) => b.w - a.w)
      .slice(0, TOP_K)
    const s = idx.reduce((a, x) => a + x.w, 0)
    return idx
      .map(({ i, w }) => ({ i, w: w / s }))
      .sort((a, b) => a.i - b.i)
  })()
  const formatMinute = (totalMinutes) => {
    const t = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440
    const hh = Math.floor(t / 60)
    const mm = t % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  // Snapshot des agregats avant tout split: utilise pour prior/predictive
  // (gain memoire: pas besoin de re-iterer les ~300k minute records).
  const aggregatedPastRecords = records.slice()
  records.length = 0

  // ---- Split past aggregates into per-minute (top-K renormalise) ---------
  for (const r of aggregatedPastRecords) {
    const startM = eventStartMinuteMap.get(r.eventId) ?? 18 * 60
    for (const { i, w } of TOP_MINUTES) {
      const rev = Math.round((r.revenue || 0) * w * 100) / 100
      const qty = Math.max(0, Math.round((r.quantity || 0) * w))
      const tx = Math.max(0, Math.round((r.transactionCount || 0) * w))
      if (rev <= 0 && qty <= 0 && tx <= 0) continue
      const totalM = startM + i
      records.push({
        ...r,
        revenue: rev,
        quantity: qty,
        transactionCount: tx,
        minute: formatMinute(totalM),
        // Conserve `hour` (0-23) pour le filtre Affluence du store Analyse.
        hour: Math.floor((totalM % 1440) / 60),
      })
    }
  }

  // Correction d'arrondi apr\u00e8s split minute
  const postSplitRevenue = records.reduce((a, r) => a + r.revenue, 0)
  if (postSplitRevenue > 0) {
    const correctFactor = TARGETS.revenue / postSplitRevenue
    for (const r of records) {
      r.revenue = Math.round(r.revenue * correctFactor * 100) / 100
    }
  }

  // ---- Build cost map aligned on TARGETS.cost ----------------------------
  const menuItemCostMap = {}
  for (const it of MENU_ITEMS) menuItemCostMap[it.id] = it.cost

  // Compute implied cost and rescale costs to hit 208 729 €
  const impliedCost = records.reduce(
    (acc, r) => acc + (menuItemCostMap[r.menuItemId] || 0) * r.quantity,
    0,
  )
  const costFactor = TARGETS.cost / impliedCost
  for (const id of Object.keys(menuItemCostMap)) {
    menuItemCostMap[id] = Math.round(menuItemCostMap[id] * costFactor * 100) / 100
  }

  // ---- Génération année N-1 (comparaisons Précédent + N-1, cf. §13.7) ----
  // On clone les events passés en décalant la date de -1 an et en appliquant
  // un facteur de croissance ~0.78 (revenu 2026 ≈ +28 % vs 2025).
  // Les records associés servent uniquement aux getters
  // `previousPeriodTotals` / `yearOverYearTotals` du store : ils ne polluent
  // PAS le mode Analyse courant (filtre `this_year` par défaut).
  const PRIOR_YEAR_FACTOR = 0.78
  const priorEvents = []
  const priorRecords = []
  for (const ev of events) {
    if (ev.isFuture) continue
    const [y, m, d] = ev.date.split('-').map(Number)
    const priorIsoDate = `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const priorDdmmyyyy = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y - 1}`
    const priorId = `${ev.id}-py`
    priorEvents.push({
      ...ev,
      id: priorId,
      name: ev.name,
      eventName: ev.eventName,
      date: priorIsoDate,
      eventDate: priorDdmmyyyy,
      attendees: Math.round(ev.attendees * PRIOR_YEAR_FACTOR),
      ticketsSold: Math.round((ev.ticketsSold || ev.attendees) * PRIOR_YEAR_FACTOR),
      ticketsScanned: Math.round((ev.ticketsScanned || ev.attendees) * PRIOR_YEAR_FACTOR),
      isFuture: false,
      isPriorYear: true,
    })
  }
  for (const r of aggregatedPastRecords) {
    const priorEventId = `${r.eventId}-py`
    const priorEv = priorEvents.find((e) => e.id === priorEventId)
    if (!priorEv) continue
    priorRecords.push({
      ...r,
      // `elementId` reste le registryId du shop (mêmes shops d'une année à l'autre).
      eventId: priorEventId,
      eventDate: priorEv.date,
      revenue: Math.round(r.revenue * PRIOR_YEAR_FACTOR * 100) / 100,
      quantity: Math.max(1, Math.round(r.quantity * PRIOR_YEAR_FACTOR)),
      transactionCount: Math.max(1, Math.round(r.transactionCount * PRIOR_YEAR_FACTOR)),
      isPriorYear: true,
    })
  }
  for (const ev of priorEvents) events.push(ev)
  for (const r of priorRecords) records.push(r)

  // ========================================================================
  // PREDICTIVE RECORDS for future events
  // ========================================================================
  // Pour chaque event futur on g\u00e9n\u00e8re des records `isPredictive: true`
  // directement calibr\u00e9s sur la moyenne des past events \u00d7 ratio d'affluence
  // (ticketsSold futur / moyenne attendees pass\u00e9s). Le composable
  // usePredictiveTimeline d\u00e9tecte ces records et bypasse le scoring /
  // scaling \u00e0 la vol\u00e9e \u2014 garantit que la pr\u00e9diction affich\u00e9e est
  // coh\u00e9rente avec les donn\u00e9es historiques quelle que soit la dispo de
  // l'API Supabase.
  const pastNonPriorEvents = events.filter((e) => !e.isFuture && !e.isPriorYear)
  const pastEventCount = pastNonPriorEvents.length || 1
  const avgPastAttendees =
    pastNonPriorEvents.reduce((a, e) => a + (e.attendees || 0), 0) /
      pastEventCount || 1

  // Agregat par (elementId, menuItemId) sur tous les past events non-prior.
  // Source: aggregatedPastRecords (avant minute split) -> plus rapide et
  // identique au resultat sur records post-split.
  const pastEventIdSet = new Set(pastNonPriorEvents.map((e) => e.id))
  const pastAggregates = new Map()
  for (const r of aggregatedPastRecords) {
    if (!pastEventIdSet.has(r.eventId)) continue
    const k = `${r.elementId}|${r.menuItemId}`
    let agg = pastAggregates.get(k)
    if (!agg) {
      agg = { qty: 0, rev: 0, tx: 0, sample: r }
      pastAggregates.set(k, agg)
    }
    agg.qty += r.quantity || 0
    agg.rev += r.revenue || 0
    agg.tx += r.transactionCount || 0
  }

  const futureEvents = events.filter((e) => e.isFuture)
  for (const fe of futureEvents) {
    const startM = eventStartMinuteMap.get(fe.id) ?? 18 * 60
    const futureAttendees = fe.ticketsSold || fe.attendees || avgPastAttendees
    const ratio = avgPastAttendees > 0 ? futureAttendees / avgPastAttendees : 1
    for (const [, agg] of pastAggregates) {
      const avgQty = agg.qty / pastEventCount
      const avgRev = agg.rev / pastEventCount
      const avgTx = agg.tx / pastEventCount
      const predictedQty = avgQty * ratio
      const predictedRev = avgRev * ratio
      const predictedTx = avgTx * ratio
      if (predictedQty < 0.5) continue
      for (const { i, w } of TOP_MINUTES) {
        const qty = Math.max(0, Math.round(predictedQty * w))
        const rev = Math.round(predictedRev * w * 100) / 100
        const tx = Math.max(0, Math.round(predictedTx * w))
        if (qty <= 0 && rev <= 0) continue
        const totalM = startM + i
        records.push({
          ...agg.sample,
          eventId: fe.id,
          eventName: fe.name,
          eventDate: fe.date,
          revenue: rev,
          quantity: qty,
          transactionCount: tx,
          minute: formatMinute(totalM),
          hour: Math.floor((totalM % 1440) / 60),
          isPredictive: true,
        })
      }
    }
  }

  // ========================================================================
  // Suppliers / Ingredients / Components / floors enrichis (cf. doc
  // EVENT_PREDICT_SECTIONS §2). Le tout reste calibré "Adidas Arena" et
  // suffit à faire fonctionner les sections « Configuration settings » et
  // « Stock up » en mode 1:1 avec la version React.
  // ========================================================================

  const SUPPLIERS = [
    { id: 'sup-france-food',     name: 'France Food Service',       email: 'orders@francefoodservice.fr', tel: '+33 1 40 00 00 01', address: '12 rue du Marché',  city: 'Paris',  postcode: '75001', sites: ['adidas-arena'] },
    { id: 'sup-paris-beverages', name: 'Paris Beverages Distribution', email: 'sales@parisbev.fr',       tel: '+33 1 40 00 00 02', address: '5 quai de Seine',   city: 'Paris',  postcode: '75010', sites: [] /* tous sites */ },
    { id: 'sup-craft-brewery',   name: 'Île-de-France Craft Brewery',  email: 'contact@idfcraft.fr',     tel: '+33 1 40 00 00 03', address: '88 av des Brasseurs', city: 'Pantin', postcode: '93500', sites: ['adidas-arena'] },
  ]

  // Packaging details (mirror React Market Price Storage details) :
  //   `[Item] is stored in [packagingType] of [packagingUnitNumber] [packagingUnit]`
  // Plus `purchaseUnitConversion` : combien de [packagingUnit] pour
  // produire 1 [recipeUnit] (conversion recipe → packaging).
  // Cf. user spec : packed = ceil((qty / packagingUnitNumber) * purchaseUnitConversion).
  const INGREDIENTS = [
    // Boulangerie / pâtes : pièces, vendues en sacs
    { id: 'ing-bun',        name: 'Bun',                ingredientCategory: 'Bread',     recipeUnit: 'piece', costPerRecipeUnit: 0.35, storageType: 'Dry',  supplierId: 'sup-france-food',
      packagingType: 'Plastic Bag', packagingUnitNumber: 12, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-pulled',     name: 'Pulled Chicken',     ingredientCategory: 'Meat',      recipeUnit: 'kg',    costPerRecipeUnit: 18,   storageType: 'Cold', supplierId: 'sup-france-food',
      packagingType: 'Sous-vide Pouch', packagingUnitNumber: 2, packagingUnit: 'kg', purchaseUnitConversion: 1 },
    { id: 'ing-cheddar',    name: 'Cheddar',            ingredientCategory: 'Cheese',    recipeUnit: 'kg',    costPerRecipeUnit: 10,   storageType: 'Cold', supplierId: 'sup-france-food',
      packagingType: 'Plastic Bag', packagingUnitNumber: 1, packagingUnit: 'kg', purchaseUnitConversion: 1 },
    { id: 'ing-saucisse',   name: 'Saucisse hot-dog',   ingredientCategory: 'Meat',      recipeUnit: 'piece', costPerRecipeUnit: 0.9,  storageType: 'Cold', supplierId: 'sup-france-food',
      packagingType: 'Pack', packagingUnitNumber: 20, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-pain-hd',    name: 'Pain hot-dog',       ingredientCategory: 'Bread',     recipeUnit: 'piece', costPerRecipeUnit: 0.3,  storageType: 'Dry',  supplierId: 'sup-france-food',
      packagingType: 'Plastic Bag', packagingUnitNumber: 24, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-pomme-frite',name: 'Pommes de terre',    ingredientCategory: 'Vegetable', recipeUnit: 'kg',    costPerRecipeUnit: 1.2,  storageType: 'Dry',  supplierId: 'sup-france-food',
      packagingType: 'Sac', packagingUnitNumber: 25, packagingUnit: 'kg', purchaseUnitConversion: 1 },
    { id: 'ing-nacho-chip', name: 'Chips nachos',       ingredientCategory: 'Vegetable', recipeUnit: 'kg',    costPerRecipeUnit: 3.5,  storageType: 'Dry',  supplierId: 'sup-france-food',
      packagingType: 'Carton', packagingUnitNumber: 5, packagingUnit: 'kg', purchaseUnitConversion: 1 },
    { id: 'ing-cheese-sauce',name: 'Sauce fromagère',   ingredientCategory: 'Condiment', recipeUnit: 'kg',    costPerRecipeUnit: 5,    storageType: 'Cold', supplierId: 'sup-france-food',
      packagingType: 'Pot', packagingUnitNumber: 3, packagingUnit: 'kg', purchaseUnitConversion: 1 },
    // Beverages
    { id: 'ing-coca',       name: 'Concentré Coca',     ingredientCategory: 'Soft Drink',recipeUnit: 'liter', costPerRecipeUnit: 1.4,  storageType: 'Dry',  supplierId: 'sup-paris-beverages',
      packagingType: 'BIB', packagingUnitNumber: 10, packagingUnit: 'liter', purchaseUnitConversion: 1 },
    { id: 'ing-water',      name: 'Eau plate 50cl PET', ingredientCategory: 'Water',     recipeUnit: 'piece', costPerRecipeUnit: 0.45, storageType: 'Dry',  supplierId: 'sup-paris-beverages',
      packagingType: 'Pack', packagingUnitNumber: 24, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-champagne',  name: 'Champagne brut 75cl',ingredientCategory: 'Champagne', recipeUnit: 'piece', costPerRecipeUnit: 18,   storageType: 'Cold', supplierId: 'sup-paris-beverages',
      packagingType: 'Carton', packagingUnitNumber: 6, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-rhum',       name: 'Rhum blanc',         ingredientCategory: 'Liquor',    recipeUnit: 'liter', costPerRecipeUnit: 12,   storageType: 'Dry',  supplierId: 'sup-paris-beverages',
      packagingType: 'Bottle', packagingUnitNumber: 1, packagingUnit: 'liter', purchaseUnitConversion: 1 },
    { id: 'ing-mint',       name: 'Menthe fraîche',     ingredientCategory: 'Vegetable', recipeUnit: 'kg',    costPerRecipeUnit: 8,    storageType: 'Cold', supplierId: 'sup-paris-beverages',
      packagingType: 'Bouquet', packagingUnitNumber: 0.2, packagingUnit: 'kg', purchaseUnitConversion: 1 },
    { id: 'ing-lime',       name: 'Citron vert',        ingredientCategory: 'Fruit',     recipeUnit: 'piece', costPerRecipeUnit: 0.4,  storageType: 'Cold', supplierId: 'sup-paris-beverages',
      packagingType: 'Cagette', packagingUnitNumber: 30, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    // Beers
    { id: 'ing-budweiser45',name: 'Bière Budweiser 45cl', ingredientCategory: 'Beer',    recipeUnit: 'piece', costPerRecipeUnit: 2.2, storageType: 'Cold', supplierId: 'sup-craft-brewery',
      packagingType: 'Carton', packagingUnitNumber: 24, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-heineken33', name: 'Bière Heineken 33cl',  ingredientCategory: 'Beer',    recipeUnit: 'piece', costPerRecipeUnit: 1.9, storageType: 'Cold', supplierId: 'sup-craft-brewery',
      packagingType: 'Carton', packagingUnitNumber: 24, packagingUnit: 'piece', purchaseUnitConversion: 1 },
    { id: 'ing-cup',        name: 'Gobelet réutilisable', ingredientCategory: 'Material',recipeUnit: 'piece', costPerRecipeUnit: 0.6, storageType: 'Dry',  supplierId: 'sup-paris-beverages',
      packagingType: 'Carton', packagingUnitNumber: 100, packagingUnit: 'piece', purchaseUnitConversion: 1 },
  ]

  const COMPONENTS = []
  // (Pas de composants intermédiaires pour ce mock — les menu items
  // référencent directement les ingrédients. Compatible avec la logique
  // récursive `expandMenuItem` qui traite alors chaque component comme une
  // feuille.)

  // Enrichissement des menu items avec readyForSale + components
  // (cf. React menu-types.ts §3 + EventPredictStockUpSection §6.2).
  const mkComp = (ing, units) => ({
    id: `c-${ing.id}`,
    sourceId: ing.id,
    name: ing.name,
    itemType: 'Ingredient',
    category: ing.ingredientCategory,
    unit: ing.recipeUnit,
    numberOfUnits: units,
    unitCost: ing.costPerRecipeUnit,
    totalCost: ing.costPerRecipeUnit * units,
    storageType: ing.storageType,
  })
  const ING = (id) => INGREDIENTS.find((i) => i.id === id)
  const MENU_ITEMS_ENRICHED = MENU_ITEMS.map((mi) => {
    let components = []
    let readyForSale = 'No'
    let numberOfPiecesRecipe = 1
    switch (mi.id) {
      case 'budweiser-45':
        readyForSale = 'Yes'
        components = [mkComp(ING('ing-budweiser45'), 1), mkComp(ING('ing-cup'), 1)]
        break
      case 'heineken-33':
        readyForSale = 'Yes'
        components = [mkComp(ING('ing-heineken33'), 1), mkComp(ING('ing-cup'), 1)]
        break
      case 'frites':
        components = [mkComp(ING('ing-pomme-frite'), 0.18)]
        break
      case 'burger-chick':
        components = [mkComp(ING('ing-bun'), 1), mkComp(ING('ing-pulled'), 0.12), mkComp(ING('ing-cheddar'), 0.03)]
        break
      case 'hot-dog':
        components = [mkComp(ING('ing-saucisse'), 1), mkComp(ING('ing-pain-hd'), 1)]
        break
      case 'nachos':
        components = [mkComp(ING('ing-nacho-chip'), 0.08), mkComp(ING('ing-cheese-sauce'), 0.05)]
        break
      case 'coca':
        readyForSale = 'Yes'
        components = [mkComp(ING('ing-coca'), 0.5), mkComp(ING('ing-cup'), 1)]
        break
      case 'water':
        readyForSale = 'Yes'
        components = [mkComp(ING('ing-water'), 1)]
        break
      case 'champagne':
        components = [mkComp(ING('ing-champagne'), 0.125), mkComp(ING('ing-cup'), 1)]
        numberOfPiecesRecipe = 1
        break
      case 'mojito':
        components = [mkComp(ING('ing-rhum'), 0.05), mkComp(ING('ing-mint'), 0.01), mkComp(ING('ing-lime'), 0.5), mkComp(ING('ing-cup'), 1)]
        break
      case 'glass':
        readyForSale = 'Yes'
        components = [mkComp(ING('ing-cup'), 1)]
        break
    }
    return {
      ...mi,
      readyForSale,
      comboItem: 'No',
      numberOfPiecesRecipe,
      components,
      basePrice: mi.price,
      spaceIds: ['adidas-arena'],
    }
  })

  // Construction d'une Configuration "Adidas Arena Default" 1:1 avec le
  // schéma React `Configuration.data.floors[].elements[]` (cf. React
  // ConfigurationManager.tsx + App.tsx FloorElement). Chaque shop est un
  // FloorElement avec `shopType[]`.
  const parseShopType = (typeStr) =>
    String(typeStr || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

  const floorElements = SHOPS.map((s, idx) => ({
    id: `shop-${idx + 1}`,
    registryId: `shop-${idx + 1}`,
    type: 'shop',
    name: s.name,
    shopType: parseShopType(s.type),
    x: (idx % 6) * 60,
    y: Math.floor(idx / 6) * 60,
    width: 40,
    depth: 40,
    height: 30,
  }))
  const groundFloorEls = floorElements.filter((_, idx) => SHOPS[idx].area === 'Ground Floor')
  const forecourtEls = floorElements.filter((_, idx) => SHOPS[idx].area === 'Forecourt')

  const arenaConfigData = {
    floors: [
      { id: 'ground-floor', name: 'Ground Floor', elements: groundFloorEls },
    ],
    forecourt: { id: 'forecourt', name: 'Forecourt', elements: forecourtEls },
    externalMerch: { id: 'external-merch', name: 'External Merch', elements: [] },
  }

  return {
    space: {
      id: 'adidas-arena',
      name: 'Adidas Arena',
      type: 'Arena',
      location: { city: 'Paris', country: 'FR' },
    },
    configurations: [
      {
        id: 'cfg-all',
        name: 'All Configurations',
        default: true,
        spaceId: 'adidas-arena',
        capacity: 7000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventIds: events.map((e) => e.id),
        data: arenaConfigData,
      },
      {
        id: 'cfg-basket',
        name: 'Basket',
        default: false,
        spaceId: 'adidas-arena',
        capacity: 7000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventIds: events.filter((e) => e.eventType === 'Basket').map((e) => e.id),
        data: arenaConfigData,
      },
      {
        id: 'cfg-concert',
        name: 'Concert',
        default: false,
        spaceId: 'adidas-arena',
        capacity: 7000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventIds: events.filter((e) => e.eventType === 'Concert').map((e) => e.id),
        data: arenaConfigData,
      },
      {
        id: 'cfg-sport',
        name: 'Sport (Basket + Volley + MMA)',
        default: false,
        spaceId: 'adidas-arena',
        capacity: 7000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventIds: events.filter((e) => e.category === 'Sport').map((e) => e.id),
        data: arenaConfigData,
      },
      {
        id: 'cfg-culture',
        name: 'Culture (Concert)',
        default: false,
        spaceId: 'adidas-arena',
        capacity: 7000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eventIds: events.filter((e) => e.category === 'Culture').map((e) => e.id),
        data: arenaConfigData,
      },
    ],
    events,
    shops: SHOPS.map((s, idx) => ({
      id: `shop-${idx + 1}`,
      name: s.name,
      type: s.type,
      area: s.area,
    })),
    suppliers: SUPPLIERS,
    ingredients: INGREDIENTS,
    components: COMPONENTS,
    menuItems: MENU_ITEMS_ENRICHED,
    shopGranularData: records,
    menuItemCostMap,
    // Top-level KPI snapshot (can be used for exact header values)
    summary: {
      totalRevenue: TARGETS.revenue,
      totalCost: TARGETS.cost,
      totalTransactions: TARGETS.transactions,
      totalAttendees: TARGETS.attendees,
      avgRevenuePerEvent: Math.round(TARGETS.revenue / TARGETS.events),
      avgPerTransaction: TARGETS.revenue / TARGETS.transactions,
      margin: (TARGETS.revenue - TARGETS.cost) / TARGETS.revenue,
      perCapita: TARGETS.revenue / TARGETS.attendees,
      transferRate: (TARGETS.transactions / TARGETS.attendees) * 100,
      variations: {
        revenue: 39.3,
        avgRevenuePerEvent: 14.0,
        cost: 36.9,
        transactions: 58.1,
        avgPerTransaction: -8.0,
        avgTransaction: -8.0,
        attendees: 14.8,
        transferRate: 29.0,
        perCapita: 21.3,
        avgCost: 23.4,
        margin: 16.3,
        transactionRate: 1.0,
      },
    },
  }
}

export const ADIDAS_ARENA_MOCK = buildAdidasArenaMock()
