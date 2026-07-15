/**
 * Mocks alignés sur les schémas de l'API DataFriday — module Analyse.
 *
 * Source OpenAPI : https://datafriday-api.onrender.com/docs (tag « Analyse »).
 *
 * Endpoints couverts :
 *   - GET /api/v1/analyse/dashboard       → DashboardPayload
 *   - GET /api/v1/analyse/kpis/menu       → MenuItemKpi[]
 *   - GET /api/v1/analyse/kpis/events     → EventKpi[]
 *   - GET /api/v1/analyse/cost-breakdown  → CostBreakdown[]
 *
 * Les payloads sont dérivés de `ADIDAS_ARENA_MOCK` (records granulaires
 * shop × menuItem × event) afin de garantir la cohérence inter-mocks
 * pour la démo et les tests.
 */

import { ADIDAS_ARENA_MOCK } from './adidasArenaMock.js'

const round2 = (n) => Math.round(n * 100) / 100
const marginPct = (revenue, cost) =>
  revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0

/**
 * Convertit `YYYY-MM-DD` → `YYYY-MM-DDTHH:MM:SS.sssZ` (format ISO complet
 * attendu par le schéma OpenAPI `format: date-time`).
 */
function toIsoDateTime(dateStr) {
  if (!dateStr) return null
  // Si déjà en ISO complet, on retourne tel quel.
  if (dateStr.includes('T')) return new Date(dateStr).toISOString()
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString()
}

function buildPayloads(mock = ADIDAS_ARENA_MOCK) {
  // On exclut les records/events N-1 du mock : l'API `/analyse/*` n'expose
  // que la période courante. Les events `isPriorYear` servent uniquement
  // au calcul des variations YoY côté store (cf. §13.7).
  const events = (mock.events || []).filter((e) => !e.isPriorYear)
  const eventIds = new Set(events.map((e) => e.id))
  const records = (mock.shopGranularData || []).filter((r) => eventIds.has(r.eventId))
  const menuItems = mock.menuItems || []
  const costMap = mock.menuItemCostMap || {}

  // ---- Agrégation par menu item ----------------------------------------
  /** @type {Record<string, { menuItemId: string, menuItemName: string, totalRevenue: number, quantitySold: number, totalCost: number }>} */
  const byItem = {}
  for (const r of records) {
    const id = r.menuItemId
    if (!byItem[id]) {
      byItem[id] = {
        menuItemId: id,
        menuItemName: r.menuItemName,
        totalRevenue: 0,
        quantitySold: 0,
        totalCost: 0,
      }
    }
    byItem[id].totalRevenue += r.revenue || 0
    byItem[id].quantitySold += r.quantity || 0
    byItem[id].totalCost += (costMap[id] || 0) * (r.quantity || 0)
  }

  const kpisMenu = Object.values(byItem).map((it) => ({
    menuItemId: it.menuItemId,
    menuItemName: it.menuItemName,
    totalRevenue: round2(it.totalRevenue),
    totalCost: round2(it.totalCost),
    margin: marginPct(it.totalRevenue, it.totalCost),
    quantitySold: it.quantitySold,
  }))

  // ---- Agrégation par événement ----------------------------------------
  /** @type {Record<string, { eventId: string, eventName: string, eventDate: string, totalRevenue: number, totalCost: number }>} */
  const byEvent = {}
  for (const r of records) {
    const id = r.eventId
    if (!byEvent[id]) {
      const ev = events.find((e) => e.id === id)
      byEvent[id] = {
        eventId: id,
        eventName: r.eventName || ev?.name || id,
        eventDate: toIsoDateTime(r.eventDate || ev?.date),
        totalRevenue: 0,
        totalCost: 0,
      }
    }
    byEvent[id].totalRevenue += r.revenue || 0
    byEvent[id].totalCost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)
  }

  const kpisEvents = Object.values(byEvent).map((e) => ({
    eventId: e.eventId,
    eventName: e.eventName,
    eventDate: e.eventDate,
    totalRevenue: round2(e.totalRevenue),
    totalCost: round2(e.totalCost),
    margin: marginPct(e.totalRevenue, e.totalCost),
  }))

  // ---- Dashboard global -------------------------------------------------
  const totalRevenue = round2(
    kpisEvents.reduce((acc, e) => acc + e.totalRevenue, 0),
  )
  const totalCost = round2(
    kpisEvents.reduce((acc, e) => acc + e.totalCost, 0),
  )
  const totalEvents = kpisEvents.length

  const topMenuItems = [...kpisMenu]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5)
    .map((it) => ({
      name: it.menuItemName,
      revenue: it.totalRevenue,
      quantity: it.quantitySold,
    }))

  const dashboard = {
    totalRevenue,
    totalEvents,
    totalCost,
    averageMargin: marginPct(totalRevenue, totalCost),
    topMenuItems,
  }

  // ---- Cost breakdown ---------------------------------------------------
  // Le mock Adidas n'a pas de ventilation ingrédients/packaging/composants
  // détaillée. On applique une répartition réaliste :
  //   - 60 % ingrédients
  //   - 25 % packaging
  //   - 15 % composants/assemblages
  // Reproduit fidèlement la somme `totalCost` exposée dans `kpisMenu`.
  const costBreakdown = menuItems.map((mi) => {
    const unitCost = costMap[mi.id] || mi.cost || 0
    const ingredientsCost = round2(unitCost * 0.6)
    const packagingCost = round2(unitCost * 0.25)
    const componentsCost = round2(unitCost - ingredientsCost - packagingCost)
    const total = round2(ingredientsCost + packagingCost + componentsCost)
    return {
      menuItemId: mi.id,
      menuItemName: mi.name,
      ingredientsCost,
      packagingCost,
      componentsCost,
      totalCost: total,
      basePrice: mi.price,
      margin: marginPct(mi.price, total),
    }
  })

  return { dashboard, kpisMenu, kpisEvents, costBreakdown }
}

// ---- Buckets supplémentaires (cf. plan EventPredict / Predict / Analyse) ----
// Conservés sur le même mock root pour rester cohérents avec les agrégations
// dashboard/kpis/cost-breakdown.
function buildExtraBuckets(mock = ADIDAS_ARENA_MOCK) {
  const events = (mock.events || []).filter((e) => !e.isPriorYear)
  const eventIds = new Set(events.map((e) => e.id))
  const records = (mock.shopGranularData || []).filter((r) => eventIds.has(r.eventId))
  const menuItems = mock.menuItems || []
  const costMap = mock.menuItemCostMap || {}

  // ---- space summary (vue agrégée allégée pour first paint) ----
  const totalRevenue = records.reduce((s, r) => s + (r.revenue || 0), 0)
  const totalCost = records.reduce(
    (s, r) => s + (costMap[r.menuItemId] || 0) * (r.quantity || 0),
    0,
  )
  const totalAttendees = events.reduce(
    (s, e) => s + (e.ticketsScanned ?? e.attendees ?? 0),
    0,
  )
  const spaceSummary = {
    spaceId: mock.space?.id || null,
    spaceName: mock.space?.name || null,
    eventCount: events.length,
    totalRevenue: round2(totalRevenue),
    totalCost: round2(totalCost),
    margin: marginPct(totalRevenue, totalCost),
    totalAttendees,
    perCapita: totalAttendees ? round2(totalRevenue / totalAttendees) : 0,
  }

  // ---- shop summaries (1 entrée / shop, agrégée) ----
  const shopAggregate = {}
  for (const r of records) {
    const key = r.shopId || r.shopName
    if (!shopAggregate[key]) {
      shopAggregate[key] = {
        shopId: r.shopId || r.shopName,
        shopName: r.shopName,
        shopType: r.shopType || null,
        shopArea: r.shopArea || null,
        totalRevenue: 0,
        totalCost: 0,
        quantitySold: 0,
        transactions: 0,
      }
    }
    const agg = shopAggregate[key]
    agg.totalRevenue += r.revenue || 0
    agg.totalCost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)
    agg.quantitySold += r.quantity || 0
    agg.transactions += r.transactionCount || 0
  }
  const shopSummaries = Object.values(shopAggregate).map((s) => ({
    ...s,
    totalRevenue: round2(s.totalRevenue),
    totalCost: round2(s.totalCost),
    margin: marginPct(s.totalRevenue, s.totalCost),
  }))

  // ---- timelineByEvent (records groupés par heure) ----
  const timelineByEvent = {}
  for (const r of records) {
    if (!timelineByEvent[r.eventId]) timelineByEvent[r.eventId] = []
    timelineByEvent[r.eventId].push({
      eventId: r.eventId,
      shopId: r.shopId || r.shopName,
      shopName: r.shopName,
      menuItemId: r.menuItemId,
      menuItemName: r.menuItemName,
      hour: r.hour ?? null,
      quantity: r.quantity || 0,
      revenue: r.revenue || 0,
      transactionCount: r.transactionCount || 0,
    })
  }

  // ---- predictionMetricsByEventConfig ----
  // Clé : `${eventId}::${configId || 'default'}` → métriques agrégées.
  const predictionMetricsByEventConfig = {}
  for (const e of events) {
    const configId = e.configurationId || 'default'
    const evtRecords = records.filter((r) => r.eventId === e.id)
    const revenue = evtRecords.reduce((s, r) => s + (r.revenue || 0), 0)
    const cost = evtRecords.reduce(
      (s, r) => s + (costMap[r.menuItemId] || 0) * (r.quantity || 0),
      0,
    )
    const transactions = evtRecords.reduce((s, r) => s + (r.transactionCount || 0), 0)
    const attendees = e.ticketsScanned ?? e.attendees ?? 0
    predictionMetricsByEventConfig[`${e.id}::${configId}`] = {
      eventId: e.id,
      configurationId: configId,
      revenue: round2(revenue),
      cost: round2(cost),
      margin: marginPct(revenue, cost),
      transactions,
      attendees,
      perCapita: attendees ? round2(revenue / attendees) : 0,
      avgPerTransaction: transactions ? round2(revenue / transactions) : 0,
    }
  }

  // ---- stockupByShop / stockupByItem ----
  const stockupByShop = {}
  const stockupByItem = {}
  for (const r of records) {
    const shopKey = r.shopId || r.shopName
    if (!stockupByShop[shopKey]) {
      stockupByShop[shopKey] = {
        shopId: shopKey,
        shopName: r.shopName,
        items: {},
      }
    }
    const shopBucket = stockupByShop[shopKey].items
    if (!shopBucket[r.menuItemId]) {
      shopBucket[r.menuItemId] = {
        menuItemId: r.menuItemId,
        menuItemName: r.menuItemName,
        category: r.menuItemCategory || null,
        type: r.menuItemType || null,
        quantity: 0,
        revenue: 0,
      }
    }
    shopBucket[r.menuItemId].quantity += r.quantity || 0
    shopBucket[r.menuItemId].revenue += r.revenue || 0

    if (!stockupByItem[r.menuItemId]) {
      stockupByItem[r.menuItemId] = {
        menuItemId: r.menuItemId,
        menuItemName: r.menuItemName,
        category: r.menuItemCategory || null,
        type: r.menuItemType || null,
        totalQuantity: 0,
        totalRevenue: 0,
        byShop: {},
      }
    }
    const itemAgg = stockupByItem[r.menuItemId]
    itemAgg.totalQuantity += r.quantity || 0
    itemAgg.totalRevenue += r.revenue || 0
    if (!itemAgg.byShop[shopKey]) {
      itemAgg.byShop[shopKey] = { shopId: shopKey, shopName: r.shopName, quantity: 0, revenue: 0 }
    }
    itemAgg.byShop[shopKey].quantity += r.quantity || 0
    itemAgg.byShop[shopKey].revenue += r.revenue || 0
  }
  // Convert nested item maps to arrays for predictable JSON shape
  const stockupByShopArr = Object.values(stockupByShop).map((s) => ({
    ...s,
    items: Object.values(s.items).map((it) => ({
      ...it,
      quantity: Math.round(it.quantity),
      revenue: round2(it.revenue),
    })),
  }))
  const stockupByItemArr = Object.values(stockupByItem).map((it) => ({
    ...it,
    totalQuantity: Math.round(it.totalQuantity),
    totalRevenue: round2(it.totalRevenue),
    byShop: Object.values(it.byShop).map((bs) => ({
      ...bs,
      quantity: Math.round(bs.quantity),
      revenue: round2(bs.revenue),
    })),
  }))

  // ---- spaceMenu (SpaceMenu, per configuration) / shopMenus ----
  // Shape: { spaceId, configurationId, items: MenuItem[] } — items pull from
  // mock catalog so configuration screens see something even in mock mode.
  const spaceMenuByConfig = {}
  for (const cfg of mock.configurations || []) {
    spaceMenuByConfig[cfg.id] = {
      spaceId: mock.space?.id || null,
      configurationId: cfg.id,
      items: menuItems.map((mi) => ({
        menuItemId: mi.id,
        menuItemName: mi.name,
        price: mi.basePrice ?? mi.price ?? 0,
        cost: costMap[mi.id] || mi.cost || 0,
        category: mi.category || null,
        type: mi.type || null,
      })),
    }
  }

  const shopMenusByShop = {}
  for (const s of shopSummaries) {
    shopMenusByShop[s.shopId] = {
      shopId: s.shopId,
      shopName: s.shopName,
      menus: menuItems.map((mi) => ({
        menuItemId: mi.id,
        menuItemName: mi.name,
        price: mi.basePrice ?? mi.price ?? 0,
        category: mi.category || null,
      })),
    }
  }

  return {
    spaceSummary,
    shopSummaries,
    timelineByEvent,
    predictionMetricsByEventConfig,
    stockupByShop: stockupByShopArr,
    stockupByItem: stockupByItemArr,
    spaceMenuByConfig,
    shopMenusByShop,
  }
}

const PAYLOADS = buildPayloads()
const EXTRA = buildExtraBuckets()

export const ANALYSE_DASHBOARD_MOCK = PAYLOADS.dashboard
export const ANALYSE_KPIS_MENU_MOCK = PAYLOADS.kpisMenu
export const ANALYSE_KPIS_EVENTS_MOCK = PAYLOADS.kpisEvents
export const ANALYSE_COST_BREAKDOWN_MOCK = PAYLOADS.costBreakdown
export const ANALYSE_SPACE_SUMMARY_MOCK = EXTRA.spaceSummary
export const ANALYSE_SHOP_SUMMARIES_MOCK = EXTRA.shopSummaries
export const ANALYSE_TIMELINE_BY_EVENT_MOCK = EXTRA.timelineByEvent
export const ANALYSE_PREDICTION_METRICS_MOCK = EXTRA.predictionMetricsByEventConfig
export const ANALYSE_STOCKUP_BY_SHOP_MOCK = EXTRA.stockupByShop
export const ANALYSE_STOCKUP_BY_ITEM_MOCK = EXTRA.stockupByItem
export const ANALYSE_SPACE_MENU_MOCK = EXTRA.spaceMenuByConfig
export const ANALYSE_SHOP_MENUS_MOCK = EXTRA.shopMenusByShop

export function getSpaceMenuMock(spaceId, configId) {
  const found = EXTRA.spaceMenuByConfig[configId]
  if (found) return found
  const first = Object.values(EXTRA.spaceMenuByConfig)[0]
  return first || { spaceId, configurationId: configId, items: [] }
}
export function getShopMenusMock(shopId) {
  return EXTRA.shopMenusByShop[shopId] || { shopId, shopName: null, menus: [] }
}
export function getTimelineByEventMock(eventId) {
  return EXTRA.timelineByEvent[eventId] || []
}
export function getPredictionMetricsMock(eventId, configId = 'default') {
  return EXTRA.predictionMetricsByEventConfig[`${eventId}::${configId}`] || null
}

/** Récupère le mock correspondant à un endpoint Analyse. */
export function getAnalyseMock(endpoint) {
  switch (endpoint) {
    case '/api/v1/analyse/dashboard':
      return ANALYSE_DASHBOARD_MOCK
    case '/api/v1/analyse/kpis/menu':
      return ANALYSE_KPIS_MENU_MOCK
    case '/api/v1/analyse/kpis/events':
      return ANALYSE_KPIS_EVENTS_MOCK
    case '/api/v1/analyse/cost-breakdown':
      return ANALYSE_COST_BREAKDOWN_MOCK
    default:
      return null
  }
}

export { buildPayloads as buildAnalyseApiPayloads, buildExtraBuckets as buildAnalyseExtraBuckets }
