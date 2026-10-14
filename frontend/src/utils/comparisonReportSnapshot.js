/**
 * comparisonReportSnapshot : forme NORMALISÉE d'un rapport Analyse (principal ou
 * comparaison), identique des deux côtés, que computeReportDeltas consomme.
 *
 * Fonctions pures. Le principal l'alimente depuis les computed d'AnalyseView
 * (useMainReportSnapshot), la comparaison depuis useComparisonReport : même
 * constructeur, donc mêmes clés et mêmes unités.
 *
 * Forme (valeurs numériques ; null = « — », sans objet ou non calculable) :
 * {
 *   version: 1,
 *   isPredict: boolean,
 *   eventCount: number,
 *   chips:   { revenue, avgRevenuePerEvent, cost, transactions, avgTransaction,
 *              attendees, transferRate, perCapita },
 *   widgets: { revenuePerTpe, revenuePerCollaborator, margin, transactionRate, stockValue },
 *   categories: [{ key, value }],                       // CA par type d'article (cartes du haut)
 *   breakdowns: { revenue: Dims, quantity: Dims, supplierCost: Entries|null,
 *                 discount: { amount, withoutReference }|null },
 *                // Dims = { item, type, category, industrial, brand, promotion, promotionType }
 *                // Entries = [{ key, value }] triées par valeur décroissante ; null = pas chargé
 *   itemsByShop: [{ name, total, avg, events,
 *                   items: [{ key, name, avgQuantity, quantity, events }] }],
 *   sections: { shopChartRevenue, articleDistributionRevenue, itemsByShopRevenue },
 * }
 */
import { unref } from 'vue'
import { aggregateByShop } from '@/utils/analyseAggregations'
import { buildReportBreakdowns } from '@/utils/comparisonBreakdowns'

export const SNAPSHOT_VERSION = 1

/** Clés des 8 puces du haut, dans l'ordre d'affichage. */
export const CHIP_KEYS = [
  'revenue', 'avgRevenuePerEvent', 'cost', 'transactions',
  'avgTransaction', 'attendees', 'transferRate', 'perCapita',
]
/** Clés des 5 widgets. */
export const WIDGET_KEYS = ['revenuePerTpe', 'revenuePerCollaborator', 'margin', 'transactionRate', 'stockValue']

const num = (v) => {
  const n = unref(v)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Les 8 puces du haut depuis `metrics` (useMetricsCalculator), avec les formules du
 * header d'AnalyseView (headerKpis). En Predict, transactions / panier / transformation
 * n'ont pas d'objet (un scénario produit des quantités, jamais de tickets) : null.
 */
export function chipsFromMetrics(metrics, { isPredict = false } = {}) {
  const m = metrics || {}
  const rev = num(m.displayRevenue) ?? 0
  const trans = num(m.displayTransactions) ?? 0
  const att = num(m.displayAttendees) ?? 0
  return {
    revenue: rev,
    avgRevenuePerEvent: num(m.displayAvgRevenue) ?? 0,
    cost: num(m.displayCost) ?? 0,
    transactions: isPredict ? null : trans,
    avgTransaction: isPredict ? null : (trans ? rev / trans : 0),
    attendees: att,
    transferRate: isPredict || !att ? null : (trans / att) * 100,
    perCapita: num(m.displayPerCapita) ?? 0,
  }
}

/**
 * Les 5 widgets : marge et TX/MIN depuis `metrics`, CA/TPE, CA/COLLAB et VALO STOCK
 * depuis `rendementRaw` (useRendementWidgets().raw). TX/MIN et VALO STOCK valent null en Predict.
 */
export function widgetsFromMetrics(metrics, rendementRaw, { isPredict = false } = {}) {
  const m = metrics || {}
  const raw = unref(rendementRaw) || {}
  return {
    revenuePerTpe: num(raw.revenuePerTpe),
    revenuePerCollaborator: num(raw.revenuePerCollaborator),
    margin: num(m.displayMargin),
    transactionRate: isPredict ? null : num(m.displayTransactionRate),
    stockValue: isPredict ? null : num(raw.stockValue),
  }
}

const sumRevenue = (records) => (records || []).reduce((a, r) => a + (Number(r?.revenue) || 0), 0)

/** Tableau « Article par PdV » sous forme plate (sans Set, sans image). */
function normalizeItemsByShop(articleRecords) {
  return aggregateByShop(articleRecords).map((shop) => ({
    name: shop.name,
    total: shop.total,
    avg: shop.avg,
    events: shop.events,
    items: shop.items.map((it) => ({
      key: it.menuItemId != null && it.menuItemId !== '' ? `id:${it.menuItemId}` : `name:${it.name}`,
      name: it.name,
      avgQuantity: it.avgQuantity,
      quantity: it.quantity,
      events: it.events,
    })),
  }))
}

/**
 * @param {Object} p
 * @param {boolean} [p.isPredict]
 * @param {number} p.eventCount  nombre d'events du rapport
 * @param {object} p.chips  cf. chipsFromMetrics
 * @param {object} p.widgets  cf. widgetsFromMetrics
 * @param {Array} p.chartRecords  records du graphe CA par event par shop
 * @param {Array} p.articleRecords  records des cartes / répartitions / tableau article
 * @param {Map|null} [p.dimensionsIndex]  index des dimensions article (null = pas chargé)
 */
export function buildReportSnapshot({
  isPredict = false, eventCount = 0, chips, widgets, chartRecords, articleRecords, dimensionsIndex = null,
}) {
  const b = buildReportBreakdowns(articleRecords, dimensionsIndex)
  const articleRevenue = sumRevenue(articleRecords)
  const pick = (src, keys) => Object.fromEntries(keys.map((k) => [k, num(src?.[k])]))
  return {
    version: SNAPSHOT_VERSION,
    isPredict: !!isPredict,
    eventCount,
    chips: pick(chips, CHIP_KEYS),
    widgets: pick(widgets, WIDGET_KEYS),
    categories: b.categories,
    breakdowns: {
      revenue: b.revenue,
      quantity: b.quantity,
      supplierCost: b.supplierCost,
      discount: b.discount,
    },
    itemsByShop: normalizeItemsByShop(articleRecords),
    sections: {
      shopChartRevenue: sumRevenue(chartRecords),
      articleDistributionRevenue: articleRevenue,
      itemsByShopRevenue: articleRevenue,
    },
  }
}
