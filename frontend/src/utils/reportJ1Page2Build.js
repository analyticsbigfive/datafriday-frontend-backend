import { chipsFromMetrics, widgetsFromMetrics } from '@/utils/comparisonReportSnapshot'
import { buildShopDistributionGroups, shopTypeLabel } from '@/utils/shopDistribution'
import { groupBy, aggregateByShop } from '@/utils/analyseAggregations'
import { resolveItemType, resolveItemCategory } from '@/utils/analyseDimensions'
import { UNATTACHED_ITEM_KEY, UNATTACHED_SHOP_KEY } from '@/utils/analyseReconciliation'
import {
  NOT_SET_KEY,
  recordMetric,
  industrialBreakdown,
  brandBreakdown,
  supplierCostBreakdown,
  promotionBreakdown,
  promotionTypeBreakdown,
  entriesToDonut,
} from '@/utils/articleDimensionBreakdown'
import { groupBasketsByCombo } from '@/utils/transactionBaskets'
import { computeTopShops, computeTopEvents, computeTopItems } from '@/utils/reportJ1PerfTables'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { currentIntlLocale } from '@/composables/useNumberFormat'
import { SHOP_COLORS, SHOP_TYPE_COLORS, SHOP_AREA_COLORS } from '@/constants/analyseColors'

const NO_VALUE = 'n.d.'
const BASKET_TOP_N = 19
const DISPLAY_NAME_TOP_N = 10
const ITEM_TYPE_COLORS = { Food: '#FF8A65', Beverage: '#5B8DEF', Beer: '#FFB74D', Combo: '#66BB6A' }
const SHOP_TYPE_COLOR_MAP = { ...SHOP_TYPE_COLORS, [UNATTACHED_SHOP_KEY]: '#B0BEC5' }
const DIMENSION_VARIANTS = ['industrial', 'brand', 'supplier', 'promotion', 'promotionType']

const ok = (data) => ({ status: 'ok', data })
const empty = () => ({ status: 'empty', data: null })
const error = () => ({ status: 'error', data: null })

// Décimales localisées sans composable (la page 2 est construite hors setup).
function decimal(value, digits) {
  return new Intl.NumberFormat(currentIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value))
}
const hasValue = (v) => v != null && !Number.isNaN(Number(v))

function kpiBar(ctx) {
  const t = ctx.t
  const c = chipsFromMetrics(ctx.metrics)
  const att = c.attendees
  const items = [
    { label: t('anHeaderKpiRevenue'), value: formatCurrency(c.revenue), color: '#10B981' },
    { label: t('anHeaderKpiAvgPerEvent'), value: formatCurrency(c.avgRevenuePerEvent), color: '#F97316' },
    { label: t('anHeaderKpiCost'), value: formatCurrencyDetailed(c.cost), color: '#ff3131' },
    { label: t('anHeaderKpiTransactions'), value: formatNumber(c.transactions), color: '#3B82F6' },
    { label: t('anHeaderKpiBasket'), value: formatCurrencyDetailed(c.avgTransaction), color: '#A855F7' },
    { label: t('anHeaderKpiAttendees'), value: formatNumber(att), color: '#0EA5E9' },
    { label: t('anHeaderKpiTransformation'), value: att ? `${decimal(c.transferRate, 1)}%` : NO_VALUE, color: '#14B8A6' },
    { label: t('anHeaderKpiPerCap'), value: formatCurrencyDetailed(c.perCapita), color: '#EC4899' },
  ]
  return ok({ items })
}

function widgetBar(ctx) {
  const t = ctx.t
  const w = widgetsFromMetrics(ctx.metrics, ctx.rendementRaw)
  const items = [
    { label: t('anKpiCardRevenuePerTpe'), value: hasValue(w.revenuePerTpe) ? formatCurrency(w.revenuePerTpe) : NO_VALUE, color: '#0EA5E9' },
    { label: t('anKpiCardRevenuePerCollaborator'), value: hasValue(w.revenuePerCollaborator) ? formatCurrency(w.revenuePerCollaborator) : NO_VALUE, color: '#EC4899' },
    { label: t('anKpiCardMargin'), value: hasValue(w.margin) ? `${decimal(w.margin, 1)}%` : NO_VALUE, color: '#3B82F6' },
    { label: t('anKpiCardTransactionRate'), value: hasValue(w.transactionRate) ? `${decimal(w.transactionRate, 2)}/min` : NO_VALUE, color: '#A855F7' },
    { label: t('anKpiCardStockValue'), value: hasValue(w.stockValue) ? formatCurrency(w.stockValue) : NO_VALUE, color: '#10B981' },
  ]
  return ok({ items })
}

// { keys, labels, values, colors } -> entrées de donut, parts nulles retirées.
function entriesOf(group) {
  return group.keys
    .map((key, i) => ({ label: group.labels[i], value: group.values[i], color: group.colors[i] }))
    .filter((e) => e.value > 0)
}

function donutResult(entries, valueFormat, total = null) {
  const list = entries.filter((e) => e.value > 0)
  const sum = total ?? list.reduce((a, e) => a + e.value, 0)
  if (!list.length || !(sum > 0)) return empty()
  return ok({ entries: list, total: sum, valueFormat })
}

function donut(slot, ctx) {
  const variant = slot.variant
  const t = ctx.t
  const mode = slot.options?.metric === 'quantity' ? 'quantity' : 'revenue'
  const moneyFormat = mode === 'quantity' ? 'count' : 'currency'
  const valueFn = recordMetric(mode)
  const dimLabel = (key) => (key === UNATTACHED_ITEM_KEY ? t('anUnmatchedItems') : key)

  if (variant === 'shop' || variant === 'shopType' || variant === 'shopArea') {
    const g = buildShopDistributionGroups(ctx.chartRecords, mode, {
      palette: SHOP_COLORS,
      typeColors: SHOP_TYPE_COLOR_MAP,
      areaColors: SHOP_AREA_COLORS,
      typeLabel: (key) => shopTypeLabel(key, t),
    })
    const group = variant === 'shop' ? g.shop : variant === 'shopType' ? g.type : g.area
    return donutResult(entriesOf(group), moneyFormat)
  }

  if (variant === 'articleType' || variant === 'articleCategory') {
    const keyFn = variant === 'articleType' ? resolveItemType : resolveItemCategory
    const colorFn = (key, i) =>
      (key === UNATTACHED_ITEM_KEY ? '#B0BEC5' : null) || ITEM_TYPE_COLORS[key] || SHOP_COLORS[i % SHOP_COLORS.length]
    const g = groupBy(ctx.articleRecords, keyFn, valueFn, colorFn, dimLabel, SHOP_COLORS)
    return donutResult(entriesOf(g), moneyFormat)
  }

  if (variant === 'displayName') {
    const g = groupBy(ctx.articleRecords, (r) => r.menuItemName || r.itemName || r.productName || '', valueFn, null, null, SHOP_COLORS)
    const total = g.values.reduce((a, v) => a + v, 0)
    const top = entriesOf({
      keys: g.keys.slice(0, DISPLAY_NAME_TOP_N),
      labels: g.labels.slice(0, DISPLAY_NAME_TOP_N),
      values: g.values.slice(0, DISPLAY_NAME_TOP_N),
      colors: g.colors.slice(0, DISPLAY_NAME_TOP_N),
    })
    return donutResult(top, moneyFormat, total)
  }

  if (DIMENSION_VARIANTS.includes(variant)) {
    const index = ctx.dimensionsIndex
    if (ctx.dimensionsStatus !== 'ready' || !index) return error()
    const records = ctx.articleRecords
    let breakdown
    let labelOf
    let format = moneyFormat
    if (variant === 'industrial') breakdown = industrialBreakdown(records, index, valueFn)
    else if (variant === 'brand') breakdown = brandBreakdown(records, index, valueFn)
    else if (variant === 'supplier') {
      breakdown = supplierCostBreakdown(records, index)
      format = 'currency'
    } else if (variant === 'promotion') {
      breakdown = promotionBreakdown(records, index, valueFn)
      labelOf = (key) => (key === 'promo' ? t('anPromoYes') : t('anPromoNo'))
    } else breakdown = promotionTypeBreakdown(records, index, valueFn)
    const d = entriesToDonut(breakdown, labelOf || ((key) => (key === NOT_SET_KEY ? t('anNotSet') : key)), SHOP_COLORS)
    return donutResult(d.labels.map((label, i) => ({ label, value: d.values[i], color: d.colors[i] })), format)
  }

  if (variant === 'basketMix' || variant === 'basketMixItem') {
    const comboOf = variant === 'basketMix' ? (r) => r.categoryCombo : (r) => r.itemCombo
    const g = groupBasketsByCombo(ctx.baskets, comboOf, {
      topN: BASKET_TOP_N,
      unmatchedLabel: t('anUnmatchedItems'),
      othersLabel: (n) => `${t('anTxMixOthers')} (${n} ${t('anTxMixCombos')})`,
      palette: SHOP_COLORS,
    })
    return donutResult(entriesOf(g), 'count')
  }

  return error()
}

function perfTable(slot, ctx) {
  const t = ctx.t
  const variant = slot.variant
  if (variant === 'shops') {
    const list = computeTopShops(ctx.chartRecords, ctx.shopRates, 'total')
    if (!list.length) return empty()
    return ok({
      columns: [
        { key: 'name', label: t('anPieByShopTitle'), align: 'left' },
        { key: 'revenue', label: t('anRevenue'), align: 'right' },
        { key: 'units', label: t('anUnits'), align: 'right' },
        { key: 'rate', label: t('anPanelTxnPerMin'), align: 'right' },
      ],
      rows: list.map((s) => ({
        name: s.name,
        revenue: formatCurrencyDetailed(s.revenue),
        units: formatNumber(s.units),
        rate: s.transactionRate != null ? s.transactionRate.toFixed(2) : NO_VALUE,
      })),
    })
  }
  if (variant === 'events') {
    const list = computeTopEvents(ctx.chartRecords, ctx.events)
    if (!list.length) return empty()
    return ok({
      columns: [
        { key: 'name', label: t('anEvents'), align: 'left' },
        { key: 'revenue', label: t('anRevenue'), align: 'right' },
        { key: 'units', label: t('anUnits'), align: 'right' },
      ],
      rows: list.map((e) => ({ name: e.name, revenue: formatCurrencyDetailed(e.revenue), units: formatNumber(e.units) })),
    })
  }
  if (variant === 'items') {
    const source = ctx.itemRecords && ctx.itemRecords.length ? ctx.itemRecords : ctx.articleRecords
    const list = computeTopItems(source, { noDisplayNameLabel: t('anNoDisplayName') })
    if (!list.length) return empty()
    return ok({
      columns: [
        { key: 'name', label: t('anItem'), align: 'left' },
        { key: 'revenue', label: t('anRevenue'), align: 'right' },
        { key: 'units', label: t('anUnits'), align: 'right' },
      ],
      rows: list.map((i) => ({ name: i.name, revenue: formatCurrencyDetailed(i.revenue), units: formatNumber(i.units) })),
    })
  }
  return error()
}

function revenueBars(ctx) {
  const g = groupBy(ctx.chartRecords, (r) => r.shopName, (r) => r.revenue)
  const bars = g.keys.map((label, i) => ({ label, value: g.values[i] })).filter((b) => b.value > 0)
  return bars.length ? ok({ bars }) : empty()
}

function itemsByShop(ctx) {
  const shops = aggregateByShop(ctx.articleRecords)
    .filter((s) => s.items.length)
    .map((s) => ({
      shop: s.name,
      total: s.total,
      items: s.items.map((i) => ({ name: i.name, qty: i.quantity, revenue: i.revenue })),
    }))
  return shops.length ? ok({ shops }) : empty()
}

/**
 * Données d'un élément de la page 2, à partir des sources déjà chargées pour son groupe de filtres.
 * ctx = { metrics, rendementRaw, chartRecords, articleRecords, itemRecords, events, baskets,
 *         dimensionsIndex, dimensionsStatus, shopRates, t }
 * @returns {{ status: 'ok'|'empty'|'error', data: object|null }}
 */
export function buildSlotData(slot, ctx) {
  const c = { t: (k) => k, ...ctx }
  try {
    switch (slot?.kind) {
      case 'kpi-bar': return kpiBar(c)
      case 'widget-bar': return widgetBar(c)
      case 'donut': return donut(slot, c)
      case 'perf-table': return perfTable(slot, c)
      case 'revenue-bars': return revenueBars(c)
      case 'items-by-shop': return itemsByShop(c)
      default: return error()
    }
  } catch (e) {
    return error()
  }
}
